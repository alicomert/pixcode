/**
 * Pixcode desktop wrapper.
 *
 * Thin Electron shell that boots the Pixcode server as a background child
 * process, pins a tray icon, and opens the user's default browser at
 * http://localhost:3001. No BrowserWindow is created — the UI lives in
 * the real browser so we don't ship a second rendering engine users
 * don't need.
 *
 * Update strategy is two-tier:
 *   1. Product updates (95%+): a writable "runtime dir" under userData
 *      holds the live pixcode package. `POST /api/system/update` (in the
 *      server, not here) downloads the latest npm tarball and atomically
 *      swaps it into that dir, then exits with code 42. We respawn from
 *      the fresh files — ~4 MB, no full installer re-download.
 *   2. Wrapper updates (rare): electron-updater polls the GitHub feed
 *      and offers a normal full-installer update when the tray/Electron
 *      version itself needs changing.
 */
const { app, Tray, Menu, nativeImage, shell, dialog, Notification } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SERVER_PORT = Number(process.env.SERVER_PORT) || 3001;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const APP_ID = 'com.pixelbytesoftware.pixcode';
const PIXCODE_PKG = '@pixelbyte-software/pixcode';

// Exit code the pixcode server uses to signal "updated, please respawn".
// Kept in sync with the convention inside server/index.js → /api/system/update.
const RESTART_FOR_UPDATE_EXIT_CODE = 42;

let tray = null;
let serverProcess = null;
let serverReady = false;
let intentionalQuit = false;

// Single-instance lock so double-clicks don't spawn rival servers.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId(APP_ID);
app.on('second-instance', () => {
  shell.openExternal(SERVER_URL).catch(() => {});
});

// ---------------------------------------------------------------------------
// Runtime directory — the writable copy of the pixcode npm package.
// ---------------------------------------------------------------------------
//   userData/pixcode-runtime/                   ← our writable copy
//     package.json                              ← version source of truth
//     dist-server/, dist/, server/, shared/, …  ← pixcode files
//     .staging/                                 ← server extracts updates here
//     .previous/                                ← rollback copy after swap
//
// On first launch we seed this dir from the bundled pixcode package that
// electron-builder ships inside the installer (asarUnpack keeps it writable
// on disk so the seed is a straightforward directory copy, not an asar-fs
// read). On every launch after that we compare versions: if the bundled
// seed is newer than the runtime (e.g. user upgraded the wrapper itself)
// we re-seed; otherwise the runtime wins because it already has any npm
// updates applied on top.
// ---------------------------------------------------------------------------

function resolveBundledPixcodeRoot() {
  // require.resolve gives us the package.json path; its dirname is the
  // package root, which is what we need to copy recursively.
  //
  // Electron's ASAR shim transparently redirects READS of unpacked paths
  // but `fs.readdirSync` inside app.asar/... returns an empty listing for
  // anything we asarUnpack'd — so the bootstrap copy loop later would
  // find zero entries and the runtime dir would look "seeded" but empty.
  // When the resolved path lives under app.asar, we explicitly pivot to
  // the .unpacked sibling so every fs call operates on the real files.
  try {
    const resolved = path.dirname(require.resolve(`${PIXCODE_PKG}/package.json`));
    const asarFragment = `app.asar${path.sep}`;
    if (resolved.includes(asarFragment)) {
      const unpacked = resolved.replace(asarFragment, `app.asar.unpacked${path.sep}`);
      if (fs.existsSync(unpacked)) return unpacked;
    }
    return resolved;
  } catch (err) {
    console.error('Could not resolve bundled pixcode package:', err);
    return null;
  }
}

function readVersion(dirOrPkg) {
  try {
    const pkgPath = dirOrPkg.endsWith('package.json')
      ? dirOrPkg
      : path.join(dirOrPkg, 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw)?.version || null;
  } catch (_) {
    return null;
  }
}

function semverGt(a, b) {
  // Light-weight semver comparison — enough for "is bundled newer than
  // runtime". Rejects prerelease tags rather than trying to order them.
  if (!a || !b) return false;
  const parse = (v) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

function copyRecursive(src, dst) {
  // Node 16+ has fs.cpSync; fall back to a manual walk for older runtimes.
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(src, dst, { recursive: true, errorOnExist: false, force: true });
    return;
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function ensureRuntimeDir() {
  const runtimeDir = path.join(app.getPath('userData'), 'pixcode-runtime');
  const bundledRoot = resolveBundledPixcodeRoot();
  if (!bundledRoot) {
    throw new Error(`Bundled ${PIXCODE_PKG} not found. Reinstall Pixcode.`);
  }

  const bundledVersion = readVersion(bundledRoot);
  const runtimeVersion = readVersion(runtimeDir);

  const runtimeMissing = !runtimeVersion;
  const bundledIsNewer = !runtimeMissing && semverGt(bundledVersion, runtimeVersion);

  if (runtimeMissing || bundledIsNewer) {
    console.log(
      runtimeMissing
        ? `[bootstrap] Seeding runtime dir with bundled ${bundledVersion}`
        : `[bootstrap] Bundled ${bundledVersion} > runtime ${runtimeVersion}; re-seeding`,
    );
    // We don't blow away .staging/.previous if they exist — the server's
    // update path owns those and might be mid-swap. But we DO replace the
    // product files (dist-server, dist, server, shared, package.json) so
    // fresh installer -> fresh version.
    fs.mkdirSync(runtimeDir, { recursive: true });
    for (const entry of fs.readdirSync(bundledRoot)) {
      // Skip the wrapper's own metadata and anything that starts with a
      // dot — npm never publishes those so the bundled package won't
      // contain them, but be defensive.
      if (entry.startsWith('.')) continue;
      const src = path.join(bundledRoot, entry);
      const dst = path.join(runtimeDir, entry);
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      copyRecursive(src, dst);
    }
    // Mirror the bundled package.json so readVersion() returns a fresh
    // value on the very next launch.
    fs.copyFileSync(
      path.join(bundledRoot, 'package.json'),
      path.join(runtimeDir, 'package.json'),
    );
  } else {
    console.log(`[bootstrap] Runtime ${runtimeVersion} ≥ bundled ${bundledVersion}; keeping runtime`);
  }

  return runtimeDir;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
function probePort(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) { /* noop */ }
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForServer(port, attempts = 40, interval = 250) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await probePort(port)) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

function startServer(runtimeDir) {
  if (serverProcess) return;

  const entry = path.join(runtimeDir, 'dist-server', 'server', 'cli.js');
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox(
      'Pixcode',
      `Could not find the Pixcode server at\n${entry}\n\nPlease reinstall Pixcode.`,
    );
    app.quit();
    return;
  }

  serverProcess = fork(entry, ['start', '--no-daemon'], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      PIXCODE_NO_DAEMON: '1',
      // Advertises the writable copy to the server's /api/system/update
      // endpoint so it extracts npm tarballs here instead of trying to
      // shell out to `npm install -g`.
      PIXCODE_RUNTIME_DIR: runtimeDir,
      SERVER_PORT: String(SERVER_PORT),
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
    },
    silent: true,
  });

  serverProcess.stdout?.on('data', (buf) => {
    process.stdout.write(`[pixcode] ${buf.toString()}`);
  });
  serverProcess.stderr?.on('data', (buf) => {
    process.stderr.write(`[pixcode:err] ${buf.toString()}`);
  });

  serverProcess.on('exit', (code, signal) => {
    const wasUpdate = code === RESTART_FOR_UPDATE_EXIT_CODE;
    serverProcess = null;
    serverReady = false;
    rebuildTrayMenu();

    if (wasUpdate) {
      // Update flow: re-seed if the freshly-extracted runtime happens to
      // be older than what we ship (shouldn't be, but belt-and-braces),
      // then immediately respawn. User never sees a tray "stopped" state.
      try {
        const runtime = ensureRuntimeDir();
        startServer(runtime);
        waitForServer(SERVER_PORT).then((ok) => {
          serverReady = ok;
          rebuildTrayMenu();
          new Notification({
            title: 'Pixcode updated',
            body: `Now running ${readVersion(runtime) || 'new version'}. Reload your browser tab to see the changes.`,
          }).show();
        });
      } catch (err) {
        console.error('[update] Failed to respawn after update:', err);
        new Notification({
          title: 'Pixcode update failed',
          body: `Could not restart after update: ${err?.message || err}`,
        }).show();
      }
      return;
    }

    if (intentionalQuit) return;

    new Notification({
      title: 'Pixcode stopped unexpectedly',
      body: `The Pixcode server exited (${signal ? `signal ${signal}` : `exit code ${code}`}). Click the tray icon to restart.`,
    }).show();
  });
}

function stopServer() {
  if (!serverProcess) return;
  intentionalQuit = true;
  try { serverProcess.kill(); } catch (_) { /* noop */ }
  serverProcess = null;
}

// ---------------------------------------------------------------------------
// Autostart — cross-platform. Electron's API covers Win/Mac; Linux wants
// a .desktop file under ~/.config/autostart, which we roll by hand.
// ---------------------------------------------------------------------------
const LINUX_AUTOSTART_FILE = path.join(
  os.homedir(),
  '.config',
  'autostart',
  'pixcode.desktop',
);

function linuxAutostartDesktopEntry() {
  const execPath = process.execPath;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Pixcode',
    'Comment=Pixcode — unified UI for coding agents',
    `Exec="${execPath}" --hidden`,
    'Terminal=false',
    'Icon=pixcode',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function isLinuxAutostartEnabled() {
  try { return fs.existsSync(LINUX_AUTOSTART_FILE); } catch (_) { return false; }
}

function setLinuxAutostart(enabled) {
  try {
    if (enabled) {
      fs.mkdirSync(path.dirname(LINUX_AUTOSTART_FILE), { recursive: true });
      fs.writeFileSync(LINUX_AUTOSTART_FILE, linuxAutostartDesktopEntry(), 'utf8');
    } else if (fs.existsSync(LINUX_AUTOSTART_FILE)) {
      fs.unlinkSync(LINUX_AUTOSTART_FILE);
    }
  } catch (err) {
    console.error('Failed to update Linux autostart:', err);
  }
}

function isAutostartEnabled() {
  if (process.platform === 'linux') return isLinuxAutostartEnabled();
  try { return app.getLoginItemSettings().openAtLogin === true; } catch (_) { return false; }
}

function setAutostart(enabled) {
  if (process.platform === 'linux') { setLinuxAutostart(enabled); return; }
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  } catch (err) {
    console.error('Failed to update autostart:', err);
  }
}

// ---------------------------------------------------------------------------
// Wrapper-level updates (Layer 2). electron-updater checks GitHub Releases
// for a NEWER installer (pixcode-desktop release) and prompts the user.
// This is independent of the in-app /api/system/update which only updates
// the pixcode npm package inside the runtime dir.
// ---------------------------------------------------------------------------
function setupAutoUpdater() {
  try {
    // Required lazily so development runs (unpacked) don't need the dep.
    // electron-updater reads publish config from package.json → build.publish,
    // which electron-builder mirrors from electron-builder.yml.
    // eslint-disable-next-line global-require
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Download now', 'Later'],
        defaultId: 0,
        title: 'Pixcode update available',
        message: `A new Pixcode installer is available (${info.version}).`,
        detail:
          'This update refreshes the app shell (tray, auto-start, installer). '
          + 'Your Pixcode workspace auto-updates separately and is not affected. '
          + 'Download now?',
      });
      if (choice === 0) {
        autoUpdater.downloadUpdate().catch((err) => {
          console.error('[auto-updater] download failed:', err);
        });
      }
    });

    autoUpdater.on('update-downloaded', () => {
      new Notification({
        title: 'Pixcode wrapper update ready',
        body: 'The new installer will be applied the next time you quit Pixcode.',
      }).show();
    });

    autoUpdater.on('error', (err) => {
      console.warn('[auto-updater]', err?.message || err);
    });

    // Quiet first check so we don't wake users up with dialogs the moment
    // they launch — check after 30 seconds, then every 6 hours.
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 6 * 60 * 60 * 1000);
    }, 30 * 1000);
  } catch (err) {
    // electron-updater only exists in packaged builds — swallow in dev.
    if (app.isPackaged) {
      console.warn('[auto-updater] disabled:', err?.message || err);
    }
  }
}

// ---------------------------------------------------------------------------
// Tray — the only persistent UI this wrapper owns.
// ---------------------------------------------------------------------------
function resolveTrayIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build-resources', 'icon.png'),
    path.join(process.resourcesPath || '', 'build-resources', 'icon.png'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return nativeImage.createFromPath(p);
  }
  return nativeImage.createEmpty();
}

function currentRuntimeVersion() {
  const runtimeDir = path.join(app.getPath('userData'), 'pixcode-runtime');
  return readVersion(runtimeDir) || 'unknown';
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: serverReady ? 'Open Pixcode' : 'Starting server…',
      enabled: serverReady,
      click: () => { shell.openExternal(SERVER_URL).catch(() => {}); },
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: isAutostartEnabled(),
      click: (item) => { setAutostart(item.checked); rebuildTrayMenu(); },
    },
    {
      label: 'Restart server',
      click: async () => {
        stopServer();
        intentionalQuit = false;
        const runtimeDir = path.join(app.getPath('userData'), 'pixcode-runtime');
        startServer(runtimeDir);
        rebuildTrayMenu();
        serverReady = await waitForServer(SERVER_PORT);
        rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: `Pixcode ${currentRuntimeVersion()}`, enabled: false },
    { label: `Wrapper ${app.getVersion()}`, enabled: false },
    { label: `Port ${SERVER_PORT}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Quit Pixcode',
      click: () => { stopServer(); app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Pixcode — ${serverReady ? 'running' : 'starting…'} on :${SERVER_PORT}`);
}

function createTray() {
  tray = new Tray(resolveTrayIcon());
  tray.on('click', () => { shell.openExternal(SERVER_URL).catch(() => {}); });
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const shouldStartHidden = process.argv.includes('--hidden');

app.whenReady().then(async () => {
  // macOS: hide from dock, we're tray-only.
  if (process.platform === 'darwin' && typeof app.dock?.hide === 'function') {
    app.dock.hide();
  }

  let runtimeDir;
  try {
    runtimeDir = ensureRuntimeDir();
  } catch (err) {
    dialog.showErrorBox('Pixcode', `Failed to set up runtime directory.\n\n${err?.message || err}`);
    app.quit();
    return;
  }

  startServer(runtimeDir);
  createTray();
  setupAutoUpdater();

  serverReady = await waitForServer(SERVER_PORT);
  rebuildTrayMenu();

  if (serverReady && !shouldStartHidden) {
    shell.openExternal(SERVER_URL).catch(() => {});
  }
});

app.on('window-all-closed', (event) => { event.preventDefault(); });
app.on('before-quit', () => { stopServer(); });

process.on('exit', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch (_) { /* noop */ }
  }
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => { stopServer(); app.quit(); });
});
