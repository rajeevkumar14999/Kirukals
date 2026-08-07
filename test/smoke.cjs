/** Does the editor still work with only some of its pages built? */
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

// The built app, loaded the way the installed one loads it.
const BUILT = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const URL = process.env.PERF_URL || BUILT;

process.on('unhandledRejection', (err) => {
  console.error('  FAIL the app did not load. Build it for file:// first:  npm run test:build');
  console.error('       ' + (err && err.message));
  app.exit(1);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, alwaysOnTop: true, width: 1400, height: 900 });
  win.setAlwaysOnTop(true, 'screen-saver');
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 2000));
  await win.webContents.executeJavaScript(`(() => {
    const uid = () => 'e' + Math.random().toString(36).slice(2, 10);
    const types = ['scene_heading','action','character','dialogue'];
    const text = { scene_heading: 'INT. ROOM ' , action: 'Someone waits by the window for a long time.', character: 'RAJEEV', dialogue: 'We should go before it gets dark outside.' };
    const elements = [];
    for (let i = 0; i < 40 * 55; i++) { const t = types[i % 4]; elements.push({ id: uid(), type: t, text: t === 'scene_heading' ? text[t] + i + ' - DAY' : text[t], styles: [], comments: [] }); }
    const doc = { id: 'smoke', name: 'Smoke', titlePage: { title: 'Smoke' }, elements, createdAt: Date.now(), updatedAt: Date.now() };
    localStorage.setItem('kirukals.doc.u_perf.smoke', JSON.stringify(doc));
    localStorage.setItem('kirukals.index.u_perf', JSON.stringify([{ id: 'smoke', name: 'Smoke', updatedAt: Date.now(), pages: elements.length }]));
    localStorage.setItem('kirukals.migrated', '1');
    localStorage.setItem('kirukals.users', JSON.stringify([{ id: 'u_perf', name: 'Perf', email: 'perf@example.com', role: 'admin', createdAt: Date.now() }]));
    localStorage.setItem('kirukals.session', JSON.stringify({ uid: 'u_perf', name: 'Perf', email: 'perf@example.com', role: 'admin', provider: 'password', guest: false, startedAt: Date.now() }));
  })()`);
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 3500));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const log = [];
    const ok = (c, l) => log.push((c ? 'ok   ' : 'FAIL ') + l);
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    const rows = () => [...document.querySelectorAll('.row__input')];
    const pages = () => document.querySelectorAll('section.page').length;

    ok(pages() === 40 || pages() > 30, 'every page is in the document (' + pages() + ' sheets)');
    ok(rows().length > 0 && rows().length < 500, 'only the pages in view are built (' + rows().length + ' lines)');

    // Typing still works and the letter arrives.
    const a = rows()[3]; a.focus(); await frame();
    const before = a.value;
    setter.call(a, before + 'ZZ'); a.dispatchEvent(new Event('input', { bubbles: true }));
    await frame();
    ok(rows()[3].value.endsWith('ZZ'), 'a typed letter lands in the line');

    // Enter makes a new line.
    //
    // Counting every line in the document would be the obvious check and the
    // wrong one: pages build and release themselves as the observer notices
    // them, so that number moves on its own. What Enter promises is a new
    // empty line under the caret, so that is what is asked.
    const typed = rows()[3];
    const wasAfter = typed.closest('.row').nextElementSibling;
    typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await frame(); await wait(200);
    const nowAfter = typed.closest('.row').nextElementSibling;
    ok(
      nowAfter && nowAfter !== wasAfter && nowAfter.querySelector('.row__input')?.value === '',
      'Enter puts a new empty line under the caret',
    );

    // Scrolling deep into the script builds those pages. The observer is
    // asynchronous, so this waits for it rather than assuming a delay.
    const until = async (fn, ms = 4000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); }
      return false;
    };
    const target = document.querySelectorAll('section.page')[25];
    target.scrollIntoView();
    const built = await until(() => target.querySelectorAll('.row__input').length > 0);
    ok(built, 'page 26 builds itself when scrolled to (' + target.querySelectorAll('.row__input').length + ' lines)');

    // And the pages left behind are released again.
    document.querySelectorAll('section.page')[0].scrollIntoView();
    const released = await until(() => target.querySelectorAll('.row__input').length === 0);
    ok(released, 'page 26 is released once it is behind us (' + rows().length + ' lines still built)');

    // The scene list still jumps — including to a page nowhere near the view.
    const scenes = [...document.querySelectorAll('.scene-list__item')];
    if (!scenes.length) { log.push('FAIL no scene list on screen to test the jump with'); return log; }
    const far = scenes[Math.floor(scenes.length * 0.8)];
    const wanted = far.textContent.trim().slice(0, 24);
    far.click();
    await wait(900); await frame();
    const focused = document.activeElement;
    ok(focused && focused.classList.contains('row__input'), 'jumping to a far scene lands the caret in a line');
    // The button shows the heading with its page number; match on the room
    // number, which is unique in this seeded script.
    // Doubled, because this whole block is a template literal on its way into
    // the page: a single backslash would be eaten before the page ever sees it.
    const n = (wanted.match(/ROOM (\\d+)/) || [])[1];
    log.push('asked for: ' + JSON.stringify(wanted) + '  landed on: ' + JSON.stringify(focused ? focused.value : null));
    ok(n && focused && focused.value.includes('ROOM ' + n), 'and it is the scene that was asked for');
    return log;
  })()`);
  out.forEach((l) => console.log('  ' + l));
  app.exit(0);
});
