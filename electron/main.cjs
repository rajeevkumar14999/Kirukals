const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
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

/**
 * The window that appears while the app is still starting.
 *
 * An editor of this size takes a second or two to be ready, and a blank
 * rectangle in that gap reads as a program that has hung. The splash is shown
 * immediately, and closes the moment the real window has something to show —
 * it is never left up for effect longer than the loading actually takes,
 * beyond a short minimum that stops it flashing.
 */
let splash = null;

/** How long the splash is held, however quickly the app becomes ready. */
const SPLASH_HOLD_MS = 5000;

function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0e1013',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => {
    splash.show();
    splash.webContents.executeJavaScript(
      `window.postMessage({ version: ${JSON.stringify(app.getVersion())} }, '*')`,
    ).catch(() => {});
  });

  return splash;
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

function guardWindow(win) {
  let letGo = false;
  win.on('close', (event) => {
    if (letGo) return;
    event.preventDefault();
    (async () => {
      let dirty = false;
      try {
        dirty = await win.webContents.executeJavaScript(
          'typeof window.__kirukalsUnsaved === "function" ? window.__kirukalsUnsaved() : false',
        );
      } catch {
        // A page that cannot answer is not a reason to trap someone in it.
        dirty = false;
      }

      if (dirty) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Save and close', "Don't save", 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
          message: 'Save your script before closing?',
          detail: 'This script has changes that have not been written yet.',
        });
        if (response === 2) return; // stay open
        if (response === 0) {
          try {
            await win.webContents.executeJavaScript(
              'typeof window.__kirukalsSave === "function" ? window.__kirukalsSave() : false',
            );
            // Give the write a moment to reach the disk before the page dies.
            await new Promise((r) => setTimeout(r, 250));
          } catch {
            /* if it cannot be saved, closing anyway is what they chose */
          }
        }
      }

      letGo = true;
      win.close();
    })();
  });
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

  // Deliberately not maximised yet: maximize() makes a hidden window visible,
  // which put the app on screen behind the splash before it had finished.
  wire(win);

  // The splash is held for its full time even when the app is ready sooner —
  // the app waits for it, never the other way round. Whatever happens after
  // that — ready, failed, or a page that never reports itself — it comes down.
  const shownAt = Date.now();
  let handedOver = false;

  const handOver = () => {
    if (handedOver) return;
    handedOver = true;
    const waited = Date.now() - shownAt;
    setTimeout(() => {
      closeSplash();
      if (!win.isDestroyed()) {
        // Size it the way it was left, then show it — in that order.
        if (state.maximized) win.maximize();
        win.show();
        win.focus();
      }
    }, Math.max(0, SPLASH_HOLD_MS - waited));
  };

  win.once('ready-to-show', handOver);
  win.webContents.once('did-fail-load', handOver);
  // A page that never reports itself must not leave the splash up for ever.
  setTimeout(handOver, SPLASH_HOLD_MS + 8000);

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

  // Ask before closing on unwritten work.
  guardWindow(win);
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

  /**
   * Closing the window on unwritten work.
   *
   * The app autosaves, so nearly every close has nothing to lose and goes
   * straight through — a dialog that appears when there is nothing to save
   * only teaches people to dismiss it unread, and then the one that mattered
   * gets dismissed too. When there genuinely is unwritten work the writer is
   * given the three answers this question always has: save and go, discard and
   * go, or stay. Cancel is the default, because a window closed by accident
   * should cost nothing.
   */

  /**
   * Exporting, the way a desktop application does it.
   *
   * On the web an export is a blob and a hidden link, and the browser drops
   * the file into Downloads. In a packaged app that same trick fails silently
   * — there is no browser to catch the click — which is why export appeared to
   * do nothing. So the desktop asks the operating system for a save dialog,
   * the writer picks the folder and the name, and the file is written by the
   * main process. That is what Final Draft does, and it is what people expect:
   * they choose where their script goes.
   */
  ipcMain.handle('export:save', async (event, { filename, text, kind }) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const ext = String(filename || '').split('.').pop().toLowerCase();
    const names = {
      fountain: 'Fountain screenplay',
      fdx: 'Final Draft document',
      txt: 'Plain text',
      json: 'Kirukals backup',
      pdf: 'PDF document',
    };
    const filters = [
      { name: names[ext] || names[kind] || 'File', extensions: [ext || 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ];

    const { canceled, filePath } = await dialog.showSaveDialog(owner, {
      title: 'Export script',
      defaultPath: path.join(app.getPath('documents'), filename),
      filters,
      // Losing a draft to a mistyped name that matched an old file is the kind
      // of thing a writer never forgives, so the overwrite warning stays.
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (canceled || !filePath) return { ok: false, canceled: true };

    try {
      // Base64 is how binary (a PDF) survives the trip across IPC; text comes
      // through as itself so a script is never mangled by an encoding round.
      const data = typeof text === 'string' ? Buffer.from(text, 'utf8') : Buffer.from(text.base64, 'base64');
      fs.writeFileSync(filePath, data);
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * A PDF, as a file rather than a trip through the printer.
   *
   * Exporting a PDF used to mean opening the print dialog and asking the
   * writer to find "Save as PDF" in a printer list and set the margins to
   * None. That is a lot to ask for the format a script is most often sent in.
   * The page is rendered offscreen here and printed straight to a file, so
   * export gives back a PDF the same way it gives back a Fountain file.
   */
  ipcMain.handle('export:pdf', async (event, { html, paper }) => {
    const sheet = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, javascript: false },
    });
    try {
      await sheet.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      // Fonts and page breaks need a moment to settle, or the first sheet
      // comes out measured in whatever was on screen a frame earlier.
      await new Promise((r) => setTimeout(r, 400));
      const pdf = await sheet.webContents.printToPDF({
        pageSize: paper === 'a4' ? 'A4' : 'Letter',
        // The margins are already in the page itself — the 1.5in binding edge
        // a script is required to have. Letting the printer add its own on top
        // would push every line half an inch inwards.
        margins: { marginType: 'none' },
        printBackground: true,
      });
      return { ok: true, base64: pdf.toString('base64') };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      sheet.destroy();
    }
  });

  // "Show me where it went" — the file, selected, in Explorer or Finder.
  ipcMain.handle('export:reveal', (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // Open the sign-in page in the person's real browser, where they are
  // probably already signed in to Google.
  ipcMain.handle('auth:open', (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
    return true;
  });

  // The whole Google sign-in, run from here: the renderer gets a token to
  // trade, and never touches the browser or the loopback listener itself.
  ipcMain.handle('auth:google', async (event) => {
    try {
      return {
        ok: true,
        ...(await signInWithGoogle({
          clientId: process.env.KIRUKALS_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID,
          clientSecret: process.env.KIRUKALS_GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET,
          // The window that asked. Taken from the request rather than a
          // variable held somewhere, so the card belongs to whichever window
          // the person is actually sitting at.
          parentWindow: BrowserWindow.fromWebContents(event.sender),
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

    createSplash();
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
