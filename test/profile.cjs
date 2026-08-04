/** Same harness, but records a CPU profile of the typing and prints the hotspots. */
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

// The built app, loaded the way the installed one loads it. For readable
// function names in the profile, point PERF_URL at a dev server instead.
const BUILT = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;

const URL = process.env.PERF_URL || BUILT;
const PAGES = Number(process.env.PERF_PAGES || 10);

app.disableHardwareAcceleration?.();

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

const type = (n) => `(async () => {
  const areas = [...document.querySelectorAll('.row__input')];
  if (!areas.length) return { error: 'no rows' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const area = areas[Math.floor(areas.length / 2)];
  area.focus();
  await frame();
  const times = [];
  for (let i = 0; i < ${n}; i++) {
    const t0 = performance.now();
    setter.call(area, area.value + 'x');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await frame();
    times.push(performance.now() - t0);
  }
  times.sort((a,b)=>a-b);
  return { rows: areas.length, median: +times[Math.floor(times.length/2)].toFixed(1) };
})()`;

process.on('unhandledRejection', (err) => {
  console.error('  FAIL the app did not load. Build it for file:// first:  npm run test:build');
  console.error('       ' + (err && err.message));
  app.exit(1);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 2500));
  await win.webContents.executeJavaScript(seed);
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 4000));

  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Profiler.enable');
  await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
  await dbg.sendCommand('Profiler.start');

  const summary = await win.webContents.executeJavaScript(type(12));

  const { profile } = await dbg.sendCommand('Profiler.stop');

  // Self time per function, from the sample counts.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const total = profile.samples.length;
  for (const id of profile.samples) {
    const n = byId.get(id);
    if (!n) continue;
    const f = n.callFrame;
    const key = `${f.functionName || '(anonymous)'}  ${(f.url || '').split('/').slice(-1)[0]}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + 1);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);

  console.log(JSON.stringify(summary));
  console.log(`samples: ${total}`);
  for (const [k, v] of top) console.log(`  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
  app.exit(0);
});
