/**
 * Measure typing latency in the real editor, in the real runtime.
 *
 * Loads the dev server in an Electron window, seeds a long script, then types
 * into the active line and times how long the app takes to settle after each
 * keystroke. Prints the distribution rather than an average, because what a
 * writer notices is the worst keystroke, not the mean one.
 */
const { app, BrowserWindow } = require('electron');

/*
  A profile of its own.

  Every harness here seeds a script and then asks what the app did with it.
  Sharing one Electron profile means each one opens whatever the last run
  left behind — the smoke test was quietly checking a five-hundred-page
  document from a performance run rather than its own forty-page fixture,
  and passing anyway, which is worse than failing.
*/
const os = require('node:os');
const fsx = require('node:fs');
const pathx = require('node:path');
app.setPath('userData', fsx.mkdtempSync(pathx.join(os.tmpdir(), 'kirukals-check-')));

const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The built app, loaded the way the installed one loads it. Build it with
// `npm run test:build` — a bundle built for a web root will not load here.
const BUILT = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;

// Defaults to the built app, which is what the desktop software runs. Point
// PERF_URL at a dev server to measure that instead — expect it to be slower.
const URL = process.env.PERF_URL || BUILT;
const PAGES = Number(process.env.PERF_PAGES || 60);

app.disableHardwareAcceleration?.();

process.on('unhandledRejection', (err) => {
  console.error('  FAIL the app did not load. Build it for file:// first:  npm run test:build');
  console.error('       ' + (err && err.message));
  app.exit(1);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, alwaysOnTop: true, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.focus();
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 2500));

  // Seed a guest session and a long script, then reload into it.
  const seed = `(() => {
    const uid = () => 'e' + Math.random().toString(36).slice(2, 10);
    const LINES = ${PAGES} * 55;
    const types = ['scene_heading','action','character','dialogue','action','character','dialogue','parenthetical','dialogue'];
    const text = {
      scene_heading: 'INT. A ROOM SOMEWHERE - NIGHT',
      action: 'Someone crosses the room and stops at the window, looking out at nothing in particular.',
      character: 'RAJEEV',
      dialogue: 'I have been thinking about what you said, and I am not sure I agree with any of it.',
      parenthetical: '(quietly)',
    };
    const elements = [];
    for (let i = 0; i < LINES; i++) {
      const t = types[i % types.length];
      elements.push({ id: uid(), type: t, text: text[t], styles: [], comments: [] });
    }
    const doc = { id: 'perfdoc', name: 'Perf', titlePage: { title: 'Perf' }, elements, createdAt: Date.now(), updatedAt: Date.now() };
    localStorage.setItem('kirukals.doc.u_perf.perfdoc', JSON.stringify(doc));
    localStorage.setItem('kirukals.index.u_perf', JSON.stringify([{ id: 'perfdoc', name: 'Perf', updatedAt: Date.now(), pages: elements.length }]));
    localStorage.setItem('kirukals.migrated', '1');
    localStorage.setItem('kirukals.users', JSON.stringify([{ id: 'u_perf', name: 'Perf', email: 'perf@example.com', role: 'admin', createdAt: Date.now() }]));
    localStorage.setItem('kirukals.session', JSON.stringify({ uid: 'u_perf', name: 'Perf', email: 'perf@example.com', role: 'admin', provider: 'password', guest: false, startedAt: Date.now() }));
    return elements.length;
  })()`;
  const lines = await win.webContents.executeJavaScript(seed);
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 4000));

  // Measured without the frame clock, which stops whenever the window is not
  // the one being looked at. What is timed instead is the app's own work: the
  // keystroke goes in, and the clock stops when the styled mirror over the
  // line has caught up and layout has been forced. That is real work on the
  // main thread, and no amount of window management can fake it.
  const bench = `(async () => {
    const areas = [...document.querySelectorAll('.row__input')];
    if (!areas.length) return { error: 'no editor rows rendered', html: document.body.innerHTML.slice(0, 300) };

    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const area = areas[Math.floor(areas.length / 2)];
    const mirror = area.closest('.row').querySelector('.row__mirror');
    area.focus();
    await tick();

    const times = [];
    for (let i = 0; i < 30; i++) {
      const want = area.value + 'x';
      const t0 = performance.now();
      setter.call(area, want);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      // Wait for the app to put the same text under the caret.
      let guard = 0;
      while (mirror.textContent.length < want.length && guard++ < 400) await tick();
      document.body.offsetHeight; // force layout, so the cost of it is counted
      times.push(performance.now() - t0);
      await tick();
    }
    times.sort((a, b) => a - b);
    const at = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
    return {
      rowsInDom: areas.length,
      median: +at(0.5).toFixed(1),
      p90: +at(0.9).toFixed(1),
      worst: +times[times.length - 1].toFixed(1),
    };
  })()`;

  // The frame clock stops in a window that is not on screen, which turns every
  // number into the same 2000ms. Take the window back and try again.
  let result;
  for (let attempt = 0; attempt < 4; attempt++) {
    app.focus({ steal: true });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
    await new Promise((r) => setTimeout(r, 600));
    result = await win.webContents.executeJavaScript(bench);
    if (!result.error) break;
  }
  console.log(JSON.stringify({ pages: PAGES, lines, ...result }, null, 2));
  app.exit(0);
});
