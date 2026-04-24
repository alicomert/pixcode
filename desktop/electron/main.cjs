/**
 * Pixcode desktop wrapper.
 *
 * Renders the full Pixcode UI inside an Electron `BrowserWindow` rather
 * than shelling out to the user's default browser. The window shows an
 * embedded loading screen while the local server boots, then swaps to
 * `http://localhost:3001` as soon as the port is live. On boot failure
 * we render an inline error page with a Retry button instead of a dead
 * "Offline" screen.
 *
 * Lifecycle:
 *   - Spawns the Pixcode server as a fork() child against the copy in
 *     userData/pixcode-runtime/ (seeded from the ASAR-unpacked bundled
 *     package on first launch / version bump).
 *   - Tray icon stays resident; closing the window hides-to-tray so the
 *     server keeps running in the background (Windows "close minimizes
 *     to tray" convention).
 *   - "Start at Login" is opt-in from the tray menu and persists to
 *     userData/settings.json so the choice survives restarts.
 *
 * Two-tier update story is unchanged: the server's /api/system/update
 * endpoint writes into userData/pixcode-runtime/ and exits with code 42,
 * which we catch and respawn silently.
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, Notification, ipcMain } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SERVER_PORT = Number(process.env.SERVER_PORT) || 3001;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const APP_ID = 'com.pixelbytesoftware.pixcode';
const PIXCODE_PKG = '@pixelbyte-software/pixcode';
const RESTART_FOR_UPDATE_EXIT_CODE = 42;
const SERVER_START_TIMEOUT_MS = 45_000;

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;
let intentionalQuit = false;
let userRequestedClose = false;

// ---------------------------------------------------------------------------
// Single-instance lock — the second double-click just refocuses the window.
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId(APP_ID);
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ---------------------------------------------------------------------------
// Settings persistence (userData/settings.json)
// ---------------------------------------------------------------------------
const defaultSettings = () => ({
  startAtLogin: true,
  minimizeToTray: true,
  notificationsEnabled: true,
});

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...parsed };
  } catch (_) {
    return defaultSettings();
  }
}
function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8');
  } catch (err) {
    console.warn('[settings] write failed:', err?.message || err);
  }
}
let settings = loadSettings();

// ---------------------------------------------------------------------------
// Runtime directory (writable copy of the pixcode npm package).
// ---------------------------------------------------------------------------
function resolveBundledPixcodeRoot() {
  // Electron's asar shim transparently redirects READS of unpacked paths
  // but `fs.readdirSync(app.asar/...)` returns an empty listing for
  // anything we asarUnpack'd. Pivot to the .unpacked sibling explicitly
  // so every fs call operates on real files.
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
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))?.version || null;
  } catch (_) { return null; }
}

function semverGt(a, b) {
  if (!a || !b) return false;
  const parse = (v) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

function copyRecursive(src, dst) {
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(src, dst, { recursive: true, errorOnExist: false, force: true });
    return;
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Make sure `runtimeDir/node_modules` resolves to the bundled dependency
 * tree so the forked server can `import 'ws'` / `'express'` / etc. We try
 * strategies in priority order:
 *   1. Junction (Windows) / symlink (Unix) — instant, zero disk cost.
 *   2. Full recursive copy — ~150 MB but guaranteed to work on every
 *      filesystem. Used when the junction attempt is rejected (NTFS junctions
 *      on network paths, FUSE mounts without link support, restrictive
 *      group policy, etc.).
 *
 * NODE_PATH was the original plan but Node's ESM loader ignores it on
 * Windows in Electron-bundled installs — the server would still throw
 * `Cannot find package 'ws'` after a clean install. Pointing `node_modules`
 * directly at the bundled tree (via link or copy) keeps module resolution
 * on the fast path the runtime already understands.
 */
function ensureBundledNodeModulesReachable(runtimeDir, bundledRoot) {
  const bundledNodeModules = path.resolve(bundledRoot, '..', '..');
  const runtimeNodeModules = path.join(runtimeDir, 'node_modules');

  if (!fs.existsSync(bundledNodeModules)) {
    throw new Error(`Bundled node_modules not found at ${bundledNodeModules}`);
  }

  // If we already have a usable node_modules (junction, real dir, or
  // symlink) and it resolves to ws, we're done.
  try {
    if (fs.existsSync(path.join(runtimeNodeModules, 'ws', 'package.json'))) {
      return;
    }
  } catch (_) { /* fall through to re-link */ }

  // Blow away whatever's there (stale junction, half-copied dir) so we
  // start clean. Use rmSync force:true which handles broken symlinks too.
  try { fs.rmSync(runtimeNodeModules, { recursive: true, force: true }); }
  catch (_) { /* ignore */ }

  // Strategy 1: junction / symlink.
  try {
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(bundledNodeModules, runtimeNodeModules, linkType);
    return;
  } catch (err) {
    console.warn('[bootstrap] node_modules symlink failed, falling back to copy:', err?.message || err);
  }

  // Strategy 2: full copy. Slow but bulletproof.
  copyRecursive(bundledNodeModules, runtimeNodeModules);
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
    fs.mkdirSync(runtimeDir, { recursive: true });
    for (const entry of fs.readdirSync(bundledRoot)) {
      if (entry.startsWith('.')) continue;
      // `node_modules` is handled separately below — we link / copy the
      // FULL bundled node_modules (including hoisted deps), not the
      // pixcode package's nested one (which is mostly empty after npm
      // deduped everything to the top level).
      if (entry === 'node_modules') continue;
      const src = path.join(bundledRoot, entry);
      const dst = path.join(runtimeDir, entry);
      if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
      copyRecursive(src, dst);
    }
  }

  // Always re-assert the node_modules link: the runtime version gate above
  // doesn't cover the case where an older install had a broken setup.
  ensureBundledNodeModulesReachable(runtimeDir, bundledRoot);
  return runtimeDir;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
function probePort(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => { if (settled) return; settled = true; try { socket.destroy(); } catch (_) {} resolve(ok); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForServer(port, deadlineMs) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await probePort(port)) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

let lastServerError = null;

function startServer(runtimeDir) {
  if (serverProcess) return;
  lastServerError = null;

  const entry = path.join(runtimeDir, 'dist-server', 'server', 'cli.js');
  if (!fs.existsSync(entry)) {
    lastServerError = `Server entry not found at ${entry}`;
    return;
  }

  // npm hoists the pixcode package's deps (ws, express, better-sqlite3, …)
  // up to the desktop wrapper's own node_modules/. When we seed the writable
  // runtime dir from ASAR we only copy the pixcode *package* files, not its
  // deps — so the forked server needs NODE_PATH to point back at the bundled
  // node_modules or every `import 'ws'` fails with ERR_MODULE_NOT_FOUND.
  //
  // Safe because the bundled tree is ASAR-unpacked (real files on disk) and
  // read-only — deps never drift between updates of the pixcode product
  // files in userData. If a future pixcode release adds a new dep, the
  // wrapper installer has to be re-downloaded anyway (electron-updater
  // handles that case separately).
  const bundledRoot = resolveBundledPixcodeRoot();
  const bundledNodeModules = bundledRoot
    ? path.resolve(bundledRoot, '..', '..')
    : null;
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const existingNodePath = process.env.NODE_PATH || '';
  const nodePath = bundledNodeModules
    ? (existingNodePath ? `${bundledNodeModules}${pathSep}${existingNodePath}` : bundledNodeModules)
    : existingNodePath;

  serverProcess = fork(entry, ['start', '--no-daemon'], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      PIXCODE_NO_DAEMON: '1',
      PIXCODE_RUNTIME_DIR: runtimeDir,
      SERVER_PORT: String(SERVER_PORT),
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
      NODE_PATH: nodePath,
    },
    silent: true,
  });

  let stderrBuffer = '';
  serverProcess.stdout?.on('data', (buf) => {
    process.stdout.write(`[pixcode] ${buf.toString()}`);
  });
  serverProcess.stderr?.on('data', (buf) => {
    const text = buf.toString();
    stderrBuffer += text;
    if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
    process.stderr.write(`[pixcode:err] ${text}`);
  });

  serverProcess.on('exit', (code, signal) => {
    const wasUpdate = code === RESTART_FOR_UPDATE_EXIT_CODE;
    serverProcess = null;
    serverReady = false;
    rebuildTrayMenu();

    if (wasUpdate) {
      try {
        const runtime = ensureRuntimeDir();
        startServer(runtime);
        waitForServer(SERVER_PORT, 30_000).then((ok) => {
          serverReady = ok;
          rebuildTrayMenu();
          if (ok && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(SERVER_URL).catch(() => {});
          }
          maybeNotify({
            title: 'Pixcode updated',
            body: `Now running ${readVersion(runtime) || 'new version'}.`,
          });
        });
      } catch (err) {
        maybeNotify({
          title: 'Pixcode update failed',
          body: `Could not restart after update: ${err?.message || err}`,
        });
      }
      return;
    }

    if (intentionalQuit) return;

    lastServerError = stderrBuffer.trim() || `Server exited (${signal ? `signal ${signal}` : `exit code ${code}`})`;
    if (mainWindow && !mainWindow.isDestroyed()) {
      loadErrorScreen(mainWindow, lastServerError);
    }
    maybeNotify({
      title: 'Pixcode server stopped',
      body: 'Click the tray icon or window to restart.',
    });
  });
}

function stopServer() {
  if (!serverProcess) return;
  intentionalQuit = true;
  try { serverProcess.kill(); } catch (_) {}
  serverProcess = null;
}

// ---------------------------------------------------------------------------
// Embedded splash / error screens (served as data: URIs so we never ship
// standalone html files inside the installer).
// ---------------------------------------------------------------------------
// Load the Pixcode logo from the real brand mark at runtime. build-resources
// ships with both icon.png (installer icon) and logo.svg (the SVG the rest
// of the product uses) — we read whichever is present and emit a data: URI
// so the splash HTML can reference it without file:// quirks on Windows.
function loadLogoDataUri() {
  const candidates = [
    { ext: 'svg', mime: 'image/svg+xml', files: ['logo.svg'] },
    { ext: 'png', mime: 'image/png', files: ['icon.png'] },
  ];
  for (const { mime, files } of candidates) {
    for (const f of files) {
      const full = path.join(__dirname, '..', 'build-resources', f);
      if (fs.existsSync(full)) {
        try {
          const buf = fs.readFileSync(full);
          return `data:${mime};base64,${buf.toString('base64')}`;
        } catch (_) { /* try next */ }
      }
    }
  }
  return null;
}

function splashHtml() {
  const logoUri = loadLogoDataUri();
  const logoMarkup = logoUri
    ? `<img src="${logoUri}" alt="Pixcode" />`
    : '<span class="fallback">P</span>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pixcode</title>
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    background: radial-gradient(1200px 800px at 50% 20%, #1a2140 0%, #0b0d1a 60%, #05060f 100%);
    color: #e8ecf7;
  }
  .wrap { text-align: center; }
  .logo {
    width: 88px; height: 88px; margin: 0 auto 24px;
    display: flex; align-items: center; justify-content: center;
    filter: drop-shadow(0 12px 40px rgba(79, 123, 255, 0.25));
  }
  .logo img { width: 100%; height: 100%; object-fit: contain; }
  .logo .fallback {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #4f7bff 0%, #8b5cf6 100%);
    border-radius: 20px;
    font-weight: 800; font-size: 46px; color: #fff;
    letter-spacing: -0.04em;
  }
  h1 { font-size: 17px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.01em; }
  p { color: #9aa3bf; font-size: 13px; }
  .spinner {
    margin: 26px auto 0;
    width: 24px; height: 24px;
    border: 2px solid rgba(255,255,255,0.14);
    border-top-color: #4f7bff;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head><body>
<div class="wrap">
  <div class="logo">${logoMarkup}</div>
  <h1>Starting Pixcode…</h1>
  <p>Setting up the local server on port ${SERVER_PORT}</p>
  <div class="spinner"></div>
</div>
</body></html>`;
}

function errorHtml(message, canRetry) {
  const escaped = String(message || 'Unknown error')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const logoUri = loadLogoDataUri();
  const brandMarkup = logoUri
    ? `<img src="${logoUri}" alt="Pixcode" class="brand" />`
    : '<div class="brand brand-fallback">P</div>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pixcode — Error</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0b0d1a;
    color: #e8ecf7;
    padding: 48px 32px;
  }
  .card {
    max-width: 560px; width: 100%;
    background: #14172a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 32px;
  }
  .brand {
    width: 36px; height: 36px; object-fit: contain;
    margin-bottom: 22px;
    filter: drop-shadow(0 6px 18px rgba(79, 123, 255, 0.25));
  }
  .brand-fallback {
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #4f7bff 0%, #8b5cf6 100%);
    border-radius: 9px;
    font-weight: 800; color: #fff; font-size: 20px;
  }
  .icon {
    width: 44px; height: 44px; border-radius: 10px;
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; margin-bottom: 18px;
  }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.01em; }
  p.lede { color: #9aa3bf; font-size: 14px; line-height: 1.55; margin-bottom: 20px; }
  pre {
    background: #0a0c18; padding: 14px; border-radius: 10px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 12px; line-height: 1.5;
    color: #cbd2e6;
    overflow-x: auto;
    white-space: pre-wrap; word-break: break-word;
    border: 1px solid rgba(255,255,255,0.06);
    max-height: 260px;
  }
  .row { display: flex; gap: 10px; margin-top: 18px; }
  button {
    background: #4f7bff; color: #fff; border: 0;
    padding: 10px 18px; border-radius: 8px;
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    transition: opacity .15s;
  }
  button:hover { opacity: 0.9; }
  button.secondary { background: #1e2338; color: #9aa3bf; }
</style>
</head><body>
<div class="card">
  ${brandMarkup}
  <div class="icon">!</div>
  <h1>Couldn't start Pixcode</h1>
  <p class="lede">The local server did not come up. Details below. Please copy these if you open a support ticket.</p>
  <pre>${escaped}</pre>
  <div class="row">
    ${canRetry ? '<button onclick="location.href=\'pixcode://retry\'">Retry</button>' : ''}
    <button class="secondary" onclick="location.href='pixcode://quit'">Quit</button>
  </div>
</div>
</body></html>`;
}

function loadSplash(win) {
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml())).catch(() => {});
}
function loadErrorScreen(win, message) {
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml(message, true))).catch(() => {});
}

// Intercept our own `pixcode://` action links fired from the error HTML.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (url === 'pixcode://retry') {
      event.preventDefault();
      retryBoot();
    } else if (url === 'pixcode://quit') {
      event.preventDefault();
      stopServer();
      app.quit();
    }
  });
});

async function retryBoot() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  loadSplash(mainWindow);
  try {
    const runtime = ensureRuntimeDir();
    intentionalQuit = false;
    startServer(runtime);
    serverReady = await waitForServer(SERVER_PORT, SERVER_START_TIMEOUT_MS);
    rebuildTrayMenu();
    if (serverReady) {
      mainWindow.loadURL(SERVER_URL).catch(() => {});
    } else {
      loadErrorScreen(mainWindow, lastServerError || `Server did not come up within ${SERVER_START_TIMEOUT_MS / 1000}s.`);
    }
  } catch (err) {
    loadErrorScreen(mainWindow, err?.message || String(err));
  }
}

// ---------------------------------------------------------------------------
// Autostart
// ---------------------------------------------------------------------------
const LINUX_AUTOSTART_FILE = path.join(os.homedir(), '.config', 'autostart', 'pixcode.desktop');

function linuxAutostartEntry() {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Pixcode',
    'Comment=Pixcode — unified UI for coding agents',
    `Exec="${process.execPath}" --hidden`,
    'Terminal=false',
    'Icon=pixcode',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function applyAutostart(enabled) {
  if (process.platform === 'linux') {
    try {
      if (enabled) {
        fs.mkdirSync(path.dirname(LINUX_AUTOSTART_FILE), { recursive: true });
        fs.writeFileSync(LINUX_AUTOSTART_FILE, linuxAutostartEntry(), 'utf8');
      } else if (fs.existsSync(LINUX_AUTOSTART_FILE)) {
        fs.unlinkSync(LINUX_AUTOSTART_FILE);
      }
    } catch (err) { console.warn('[autostart] linux update failed:', err?.message || err); }
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // openAsHidden keeps the window closed on boot; user clicks tray when
      // they want it. Toggle this off if we ever ship "open window on login".
      openAsHidden: true,
      args: enabled ? ['--hidden'] : [],
    });
  } catch (err) { console.warn('[autostart] update failed:', err?.message || err); }
}

// ---------------------------------------------------------------------------
// Notifications (respects settings.notificationsEnabled)
// ---------------------------------------------------------------------------
function maybeNotify({ title, body }) {
  if (!settings.notificationsEnabled) return;
  try { new Notification({ title, body }).show(); }
  catch (err) { console.warn('[notify]', err?.message || err); }
}

// ---------------------------------------------------------------------------
// Tray
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
  return readVersion(path.join(app.getPath('userData'), 'pixcode-runtime')) || 'unknown';
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow && mainWindow.isVisible() ? 'Hide Pixcode' : 'Show Pixcode',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: settings.startAtLogin,
      click: (item) => {
        settings.startAtLogin = item.checked;
        saveSettings(settings);
        applyAutostart(item.checked);
        rebuildTrayMenu();
      },
    },
    {
      label: 'Minimize to Tray on Close',
      type: 'checkbox',
      checked: settings.minimizeToTray,
      click: (item) => {
        settings.minimizeToTray = item.checked;
        saveSettings(settings);
        rebuildTrayMenu();
      },
    },
    {
      label: 'Show Notifications',
      type: 'checkbox',
      checked: settings.notificationsEnabled,
      click: (item) => {
        settings.notificationsEnabled = item.checked;
        saveSettings(settings);
        rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: serverReady ? `Running on :${SERVER_PORT}` : 'Starting server…',
      enabled: false,
    },
    {
      label: 'Restart server',
      click: () => { retryBoot(); },
    },
    { type: 'separator' },
    { label: `Pixcode ${currentRuntimeVersion()}`, enabled: false },
    { label: `Wrapper ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Quit Pixcode',
      click: () => { userRequestedClose = true; stopServer(); app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Pixcode — ${serverReady ? 'running' : 'starting…'} on :${SERVER_PORT}`);
}

function createTray() {
  tray = new Tray(resolveTrayIcon());
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createMainWindow() {
  const iconPath = path.join(__dirname, '..', 'build-resources', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0b0d1a',
    // Hidden until first paint so the "grey flash" during BrowserWindow
    // bootstrap doesn't show before the splash HTML renders.
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Allow loading http://localhost for our own server — without this
      // Electron blocks the navigation on newer versions by default.
      webSecurity: true,
    },
  });

  loadSplash(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (userRequestedClose || !settings.minimizeToTray) return;
    event.preventDefault();
    mainWindow.hide();
    rebuildTrayMenu();
  });

  mainWindow.on('show', () => rebuildTrayMenu());
  mainWindow.on('hide', () => rebuildTrayMenu());

  // External links (e.g. <a href="https://…" target="_blank">) go to the
  // user's real browser, not a new Electron window. Matches Chrome-shell
  // apps' expected behaviour.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  // Apply persisted autostart preference every boot so external tools
  // (group policy, user edits) don't drift from what we last saved.
  applyAutostart(settings.startAtLogin);

  createTray();
  createMainWindow();

  let runtimeDir;
  try {
    runtimeDir = ensureRuntimeDir();
  } catch (err) {
    loadErrorScreen(mainWindow, err?.message || String(err));
    return;
  }

  startServer(runtimeDir);
  serverReady = await waitForServer(SERVER_PORT, SERVER_START_TIMEOUT_MS);
  rebuildTrayMenu();

  if (serverReady) {
    mainWindow.loadURL(SERVER_URL).catch((err) => {
      loadErrorScreen(mainWindow, `Failed to load ${SERVER_URL}: ${err?.message || err}`);
    });
  } else {
    loadErrorScreen(mainWindow, lastServerError || `Server did not come up within ${SERVER_START_TIMEOUT_MS / 1000}s.`);
  }
});

app.on('window-all-closed', () => {
  // On macOS it's standard to keep the app running when all windows close;
  // on Windows/Linux we follow the "minimize to tray" contract only if the
  // user hasn't asked to quit. Default-behaviour apps would `app.quit()`
  // here, but our server is the whole point of staying alive.
  if (process.platform !== 'darwin' && userRequestedClose) {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => {
  userRequestedClose = true;
  stopServer();
});

process.on('exit', () => {
  if (serverProcess) { try { serverProcess.kill(); } catch (_) {} }
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => { userRequestedClose = true; stopServer(); app.quit(); });
});

// ---------------------------------------------------------------------------
// IPC (reserved for future in-window settings UI)
// ---------------------------------------------------------------------------
ipcMain.handle('pixcode:settings:get', () => ({ ...settings }));
ipcMain.handle('pixcode:settings:set', (_evt, next) => {
  settings = { ...settings, ...next };
  saveSettings(settings);
  if ('startAtLogin' in next) applyAutostart(settings.startAtLogin);
  rebuildTrayMenu();
  return { ...settings };
});
