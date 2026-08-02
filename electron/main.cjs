const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');
const { signInWithGoogle } = require('./google-auth.cjs');

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

/**
 * Signing in with Google, from an app that has no web address.
 *
 * The page inside this window is loaded from disk, so there is no origin for
 * Google to redirect back to. The way round it is the way every desktop app
 * does it: send the person to their real browser, and register a URL scheme
 * that Windows will hand back to us when the browser is finished.
 */
const SCHEME = 'kirukals';

/**
 * The desktop OAuth client, written in at build time by
 * scripts/google-config.cjs. A desktop client's secret is not confidential —
 * Google says as much, and PKCE is what actually protects the exchange — but
 * it is generated rather than committed all the same.
 */
let GOOGLE_CLIENT_ID = '';
let GOOGLE_CLIENT_SECRET = '';
try {
  ({ clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } = require('./google-config.cjs'));
} catch {
  /* never generated: the app runs, and simply does not offer Google */
}
let pendingDeepLink = null;

if (isDev) {
  // In development the executable is Electron itself, so Windows needs to be
  // told which script to run when the scheme is opened.
  app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1] || '.')]);
} else {
  app.setAsDefaultProtocolClient(SCHEME);
}

const deepLinkFrom = (argv) => argv.find((arg) => arg.startsWith(`${SCHEME}://`)) || null;

function deliverDeepLink(url) {
  if (!url) return;
  const [win] = BrowserWindow.getAllWindows();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('deeplink', url);
  } else {
    // The window is not up yet; hold it until the renderer asks.
    pendingDeepLink = url;
  }
}

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
  // Windows delivers the callback by launching the app again with the URL in
  // its arguments; the running copy is the one that should receive it.
  app.on('second-instance', (_event, argv) => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    deliverDeepLink(deepLinkFrom(argv));
  });

  // macOS, and Windows when the app was cold-started by the callback.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
  });

  // The renderer asks; the main process does. Nothing updates behind anyone's
  // back — a download starts only when someone presses the button.
  ipcMain.handle('app:version', () => app.getVersion());

  // Open the sign-in page in the person's real browser, where they are
  // probably already signed in to Google.
  ipcMain.handle('auth:open', (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
    return true;
  });

  // The whole Google sign-in, run from here: the renderer gets a token to
  // trade, and never touches the browser or the loopback listener itself.
  ipcMain.handle('auth:google', async () => {
    try {
      return {
        ok: true,
        ...(await signInWithGoogle({
          clientId: process.env.KIRUKALS_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID,
          clientSecret: process.env.KIRUKALS_GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET,
        })),
      };
    } catch (err) {
      return { ok: false, message: String(err?.message || err) };
    }
  });

  // A callback that arrived before the window was listening.
  ipcMain.handle('auth:pending', () => {
    const url = pendingDeepLink;
    pendingDeepLink = null;
    return url;
  });
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
    // Started by the callback itself: hold the URL for the renderer.
    pendingDeepLink = deepLinkFrom(process.argv) || pendingDeepLink;

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
