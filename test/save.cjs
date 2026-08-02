/** What does one autosave of a long script cost? */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The built app, loaded the way the installed one loads it.
const BUILT = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const URL = process.env.PERF_URL || BUILT;
process.on('unhandledRejection', (err) => {
  console.error('  FAIL the app did not load. Build it for file:// first:  npm run test:build');
  console.error('       ' + (err && err.message));
  app.exit(1);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1200, height: 800 });
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 1500));
  const out = await win.webContents.executeJavaScript(`(() => {
    const uid = () => 'e' + Math.random().toString(36).slice(2, 10);
    const mk = (pages) => {
      const els = [];
      for (let i = 0; i < pages * 55; i++) els.push({ id: uid(), type: 'action', text: 'Someone crosses the room and stops at the window, looking out at nothing.', styles: [], comments: [] });
      return { id: 'x', name: 'x', titlePage: { title: 'x' }, elements: els, createdAt: Date.now(), updatedAt: Date.now() };
    };
    const r = {};
    for (const pages of [10, 60, 120]) {
      const doc = mk(pages);
      const t0 = performance.now();
      const json = JSON.stringify(doc);
      const t1 = performance.now();
      localStorage.setItem('kirukals.bench', json);
      const t2 = performance.now();
      r[pages + 'pp'] = { kb: Math.round(json.length / 1024), stringifyMs: +(t1 - t0).toFixed(1), writeMs: +(t2 - t1).toFixed(1) };
    }
    localStorage.removeItem('kirukals.bench');
    return r;
  })()`);
  console.log(JSON.stringify(out, null, 2));
  app.exit(0);
});
