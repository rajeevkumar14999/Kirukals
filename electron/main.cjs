const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

/**
 * Kirukals as a desktop application.
 *
 * The window is a browser window and nothing more: the app inside it is the
 * same one that runs on the web, so there is one codebase and no second
 * version to keep in step. What the desktop adds is a real installer, a real
 * icon, its own place in the Start menu, and storage that belongs to the app
 * rather than to a browser profile someone might clear.
 */

const isDev = !app.isPackaged;
const STATE = path.join(app.getPath('userData'), 'window.json');

/**
 * Where new versions are published.
 *
 * The folder holds the installer and the `latest.yml` electron-builder writes
 * beside it. Point this at wherever the site is served from — the same origin
 * that offers the download in the first place — or override it at build time.
 */
const UPDATE_URL = process.env.KIRUKALS_UPDATE_URL || 'http://localhost:4173/downloads/';

autoUpdater.autoDownload = false;      // ask first; a writer's connection may be metered
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL });

/** Tell the window what the updater is doing, in words it can show. */
function wire(win) {
  const say = (state, extra = {}) => {
    if (!win.isDestroyed()) win.webContents.send('update:state', { state, ...extra });
  };

  autoUpdater.on('checking-for-update', () => say('checking'));
  autoUpdater.on('update-available', (info) => say('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => say('current'));
  autoUpdater.on('download-progress', (p) => say('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => say('ready', { version: info.version }));
  autoUpdater.on('error', (err) => say('error', { message: String(err?.message || err) }));
}

/** Remember where the window was, so it opens where it was left. */
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { width: 1360, height: 900 };
  }
}

function saveState(win) {
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(STATE, JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch {
    /* a window that will not remember its size is not worth an error */
  }
}

function createWindow() {
  const state = readState();

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    show: false,
    title: 'Kirukals',
    autoHideMenuBar: true,
    webPreferences: {
      // The page is trusted but has no business reaching into the machine:
      // everything it needs is in the browser APIs it already uses.
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // A shipped copy has no developer tools. This is not real protection —
      // the code inside an asar can be extracted by anyone who means to — but
      // it keeps the app from being casually opened up and edited in place.
      devTools: isDev,
    },
  });

  if (state.maximized) win.maximize();
  wire(win);

  // The usual ways into the inspector, closed in a shipped build.
  if (!isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase();
      const devtools =
        key === 'f12' ||
        (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
        (input.control && key === 'u'); // view-source
      if (devtools) event.preventDefault();
    });
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
  }
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveState(win));

  // Links to maps, fonts and the like open in the real browser, not in here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Print windows are opened by the app itself and must stay inside it.
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#ffffff' },
    };
  });

  if (isDev) {
    win.loadURL(process.env.KIRUKALS_DEV_URL || 'http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

// One instance only: a second launch focuses the window already open, rather
// than starting a rival copy that would fight over the same saved scripts.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // The renderer asks; the main process does. Nothing updates behind anyone's
  // back — a download starts only when someone presses the button.
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:check', async () => {
    if (isDev) return { state: 'dev' };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { state: 'checked', version: result?.updateInfo?.version };
    } catch (e) {
      return { state: 'error', message: String(e?.message || e) };
    }
  });
  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { state: 'downloading' };
    } catch (e) {
      return { state: 'error', message: String(e?.message || e) };
    }
  });
  ipcMain.handle('update:install', () => {
    // Quit, run the installer, come back — the writer's scripts are on disk
    // and untouched by any of it.
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { state: 'installing' };
  });

  app.whenReady().then(() => {
    // The menu bar is hidden; the app has its own. Keep the accelerators that
    // a window needs — copy, paste, print, quit — and nothing else.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'File',
          submenu: [
            { role: 'reload' },
            ...(isDev ? [{ role: 'toggleDevTools' }] : []),
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
            { type: 'separator' }, { role: 'togglefullscreen' },
          ],
        },
      ]),
    );

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
