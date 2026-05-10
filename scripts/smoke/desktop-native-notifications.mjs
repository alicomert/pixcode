import fs from 'node:fs';

const mainPath = 'desktop/electron/main.cjs';
const preloadPath = 'desktop/electron/preload.cjs';
const localNotificationsPath = 'src/utils/localNotifications.ts';
const globalsPath = 'src/types/global.d.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const main = fs.readFileSync(mainPath, 'utf8');
const localNotifications = fs.readFileSync(localNotificationsPath, 'utf8');
const globals = fs.readFileSync(globalsPath, 'utf8');

assert(fs.existsSync(preloadPath), 'desktop preload bridge exists');
const preload = fs.readFileSync(preloadPath, 'utf8');

assert(main.includes("preload: path.join(__dirname, 'preload.cjs')"), 'BrowserWindow loads the desktop preload');
assert(main.includes("ipcMain.handle('pixcode:desktop-notification'"), 'main process handles desktop notification IPC');
assert(preload.includes('contextBridge.exposeInMainWorld'), 'preload exposes a safe renderer bridge');
assert(preload.includes('pixcodeDesktop'), 'preload exposes window.pixcodeDesktop');
assert(preload.includes("ipcRenderer.invoke('pixcode:desktop-notification'"), 'preload invokes desktop notification IPC');
assert(localNotifications.includes('window.pixcodeDesktop?.notify'), 'local notifications try the desktop native bridge first');
assert(globals.includes('pixcodeDesktop?:'), 'global window type declares the desktop bridge');

console.log('desktop native notification bridge smoke passed');
