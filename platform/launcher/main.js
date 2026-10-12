// UNTESTED SHELL: thin Electron wrapper around core.js (which is tested). Run `npm i && npm start` in launcher/.
// Packaging/code-signing (electron-builder) and unzip-on-install are still to do — see docs/ROADMAP.md.
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Launcher } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.PLATFORM_URL || 'http://localhost:3000';
const platform = { win32: 'win64', darwin: 'mac', linux: 'linux' }[process.platform];
let L;

app.whenReady().then(() => {
  L = new Launcher({ server: SERVER, platform, version: app.getVersion(), installDir: path.join(app.getPath('userData'), 'game') });
  const win = new BrowserWindow({ width: 900, height: 600, webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true } });
  win.loadFile(path.join(here, 'index.html'));
  ipcMain.handle('branding', () => L.branding());
  ipcMain.handle('login', (_e, u, p) => L.login(u, p));
  ipcMain.handle('status', async () => ({ game: await L.gameStatus(), launcherUpdate: await L.launcherUpdate() }));
  ipcMain.handle('install', () => L.installGame((got, total) => win.webContents.send('progress', got / total)));
  ipcMain.handle('play', (_e, exe) => L.launch(exe));
});
app.on('window-all-closed', () => app.quit());
