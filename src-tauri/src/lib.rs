use std::{
    env,
    path::PathBuf,
    process::{Child, Command},
    sync::Mutex,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;

struct BackgroundServer(Mutex<Option<Child>>);

impl Default for BackgroundServer {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

/// Build the desktop shell around the web workbench.
///
/// The window is intentionally hide-on-close. The tray icon and the
/// autostart registration keep the app process alive so a server/agent that
/// was started by the companion daemon is not tied to the visible window.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackgroundServer::default())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--hidden"])
                .app_name("Pixcode")
                .build(),
        )
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            if env::args().any(|argument| argument == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Match the legacy desktop behaviour: Pixcode is available from
            // the tray after the first launch and starts hidden at login.
            if let Err(error) = app.autolaunch().enable() {
                eprintln!("pixcode autostart setup failed: {error}");
            }
            create_tray(app.handle())?;
            // The packaged desktop build can provide a bundled server entry.
            // In development this is absent and the separately started npm
            // process remains the source of truth.
            let _ = start_background_server(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Closing the window means “hide”, not “quit”. The explicit
                // Quit item in the tray is the only normal way to terminate
                // the desktop shell and its background companion.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Pixcode")
        .run(|_app, event| {
            // Keep the event loop alive while all windows are hidden. A tray
            // click can then restore the workbench at any time.
            if let RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                } else {
                    stop_background_server(_app);
                }
            }
        });
}

fn start_background_server<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let resource = app.path().resource_dir()?;
    // Resource layout differs slightly between bundler versions when a
    // directory is mapped to a target. Accept both possible nesting levels
    // so an installer can always find the staged server.
    let roots = [resource.join("pixcode"), resource.join("pixcode").join("pixcode"), resource.clone()];
    let Some((bundled_root, entry)) = roots.iter().find_map(|root| {
        let entry = root.join("server").join("cli.js");
        entry.is_file().then(|| (root.clone(), entry))
    }) else { return Ok(()); };
    let bundled_node = bundled_root.join(if cfg!(windows) { "node.exe" } else { "node" });
    let node = env::var_os("PIXCODE_NODE")
        .map(PathBuf::from)
        .or_else(|| bundled_node.is_file().then_some(bundled_node))
        .unwrap_or_else(|| PathBuf::from("node"));
    // Keep all paths owned: `Command::arg` consumes its `PathBuf`, while the
    // working directory must remain borrowed until the command is spawned.
    // Deriving it from the root also avoids borrowing `entry` across the
    // consuming `.arg(entry)` call.
    let working_dir = bundled_root.as_path();
    let child = Command::new(node)
        .arg(entry)
        .args(["start", "--port", "3001"])
        .current_dir(working_dir)
        .env("PIXCODE_DAEMON_CHILD", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    match child {
        Ok(child) => {
            if let Some(state) = app.try_state::<BackgroundServer>() {
                if let Ok(mut current) = state.0.lock() {
                    if let Some(mut previous) = current.take() {
                        let _ = previous.kill();
                    }
                    *current = Some(child);
                }
            }
        }
        Err(error) => eprintln!("pixcode background server unavailable: {error}"),
    }
    Ok(())
}

fn stop_background_server<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<BackgroundServer>() {
        if let Ok(mut current) = state.0.lock() {
            if let Some(mut child) = current.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn create_tray<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Pixcode", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start Pixcode at login",
        true,
        app.autolaunch().is_enabled().unwrap_or(true),
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Pixcode", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &autostart, &separator, &quit])?;

    let mut tray = TrayIconBuilder::with_id("pixcode-tray");
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray
        .tooltip("Pixcode — background server")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "autostart" => {
                let enabled = app.autolaunch().is_enabled().unwrap_or(false);
                let result = if enabled {
                    app.autolaunch().disable()
                } else {
                    app.autolaunch().enable()
                };
                if let Err(error) = result {
                    eprintln!("pixcode autostart toggle failed: {error}");
                } else {
                    let _ = autostart.set_checked(!enabled);
                }
            }
            "quit" => {
                stop_background_server(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } = event
            {
                show_window(&tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn show_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
