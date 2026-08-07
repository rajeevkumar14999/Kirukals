/**
 * The PDF, measured rather than admired.
 *
 * This is the file a writer sends a producer, and the things that make it
 * right are geometry: a page really 11 inches tall, a character cue really 2.2
 * inches from the text margin, a folio in the corner from page two. None of
 * that can be checked through a print dialog, so the same HTML that goes to
 * the printer is rendered here and measured — and then actually printed to a
 * PDF, so the file itself is known to exist and to have the right number of
 * pages.
 *
 *     npx electron test/pdf.check.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kirukals-pdf-')));

// The app's own modules say `from './elements'` because Vite fills in the
// extension. Teach this process to do the same, so the page is built by the
// module the app ships rather than a copy.
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
register('./extensions-hook.mjs', pathToFileURL(path.join(__dirname, '/')));

let failed = 0;
const ok = (c, l) => { if (!c) failed++; console.log((c ? '  ok   ' : '  FAIL ') + l); };
const near = (a, b, tolerance, l) =>
  ok(Math.abs(a - b) <= tolerance, `${l}${Math.abs(a - b) <= tolerance ? '' : `  (got ${a}, wanted about ${b})`}`);

const el = (type, text) => ({ id: `e${Math.random().toString(36).slice(2, 8)}`, type, text, styles: [], comments: [] });

/* Two pages' worth, so there is a folio to find and a break to land. */
const elements = [el('scene_heading', 'INT. A ROOM - NIGHT')];
for (let i = 0; i < 130; i++) {
  elements.push(el('action', 'Someone crosses the room and stops at the window, looking out.'));
  elements.push(el('character', 'MEENA'));
  elements.push(el('dialogue', 'I have been here before, and I will be here again.'));
}

const doc = {
  id: 'pdf',
  name: 'The Test',
  titlePage: { title: 'THE TEST', credit: 'Written by', author: 'Rajeev Kumar' },
  elements,
};

// A failure in here must say what it was, not vanish.
process.on('unhandledRejection', (err) => {
  console.log('  FAIL ' + (err && err.stack ? err.stack.slice(0, 400) : err));
  app.exit(1);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800 });

  // The built app is loaded first, so the same module the app ships is the one
  // asked for the page — not a copy that has drifted.
  const built = require('node:url').pathToFileURL(
    path.join(__dirname, '..', 'dist', 'index.html'),
  ).href;
  await win.loadURL(built);
  await new Promise((r) => setTimeout(r, 2500));

  // Reaching into the bundle is fragile; render the page from source instead,
  // which is what the app builds from anyway.
  const { printHtml } = await import(
    require('node:url').pathToFileURL(path.join(__dirname, '..', 'src', 'screenplay', 'formats.js')).href
  ).catch(() => ({}));

  if (!printHtml) {
    console.log('  FAIL could not load printHtml — run with: node --import ./test/extensions.mjs');
    app.exit(1);
    return;
  }

  const page = new BrowserWindow({ show: false, width: 1000, height: 900 });
  await page.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(printHtml(doc, { paper: 'letter' })));
  await new Promise((r) => setTimeout(r, 1200));

  const seen = await page.webContents.executeJavaScript(`(() => {
    const inches = (px) => px / 96;
    const sheets = [...document.querySelectorAll('.sheet')];
    const body = sheets.filter((s) => !s.classList.contains('title-sheet'));
    const first = body[0];
    const rect = (el) => el.getBoundingClientRect();

    const char = first.querySelector('p.el.character');
    const dial = first.querySelector('p.el.dialogue');
    const action = first.querySelector('p.el.action');
    const folios = sheets.map((s) => s.querySelector('.folio')?.textContent || null);

    return {
      sheets: sheets.length,
      titleSheets: sheets.length - body.length,
      sheetWidth: inches(rect(first).width),
      sheetHeight: inches(rect(first).height),
      leftMargin: inches(rect(action).left - rect(first).left),
      characterIndent: inches(rect(char).left - rect(action).left),
      dialogueIndent: inches(rect(dial).left - rect(action).left),
      dialogueWidth: inches(rect(dial).width),
      folios,
      font: getComputedStyle(action).fontFamily,
      fontSize: getComputedStyle(action).fontSize,
      hasTitle: document.body.textContent.includes('THE TEST'),
      hasAuthor: document.body.textContent.includes('Rajeev Kumar'),
      overflowing: body.filter((s) => s.scrollHeight > s.clientHeight + 2).length,
    };
  })()`);

  console.log('');
  ok(seen.sheets > 1, `the script is more than one sheet (${seen.sheets})`);
  ok(seen.titleSheets === 1, 'and one of them is the title page');
  ok(seen.hasTitle && seen.hasAuthor, 'which carries the title and the author');

  near(seen.sheetWidth, 8.5, 0.02, 'a sheet is 8.5 inches wide');
  near(seen.sheetHeight, 11, 0.02, 'and 11 inches tall');
  near(seen.leftMargin, 1.5, 0.05, 'the text margin is 1.5in from the left, for the binding');

  near(seen.characterIndent, 2.2, 0.05, 'a character cue is 2.2in in from the text margin');
  near(seen.dialogueIndent, 1.0, 0.05, 'dialogue is 1in in');
  near(seen.dialogueWidth, 3.5, 0.05, 'and 3.5in wide, which is the measure the trade sets');

  ok(/Courier/i.test(seen.font), `it is set in Courier (${seen.font.split(',')[0]})`);
  ok(seen.fontSize === '16px' || seen.fontSize === '12pt', `at 12pt (${seen.fontSize})`);

  ok(seen.folios[0] === null, 'page one carries no number, as a script never does');
  const numbered = seen.folios.filter(Boolean);
  ok(numbered.length > 0 && numbered[0] === '2.', `and the next one is "2." (${numbered.slice(0, 3).join(' ')})`);

  ok(seen.overflowing === 0, `no sheet spills past its own page (${seen.overflowing} did)`);

  /* And the file itself. */
  const pdf = await page.webContents.printToPDF({
    pageSize: 'Letter',
    margins: { marginType: 'none' },
    printBackground: true,
  });
  const out = path.join(os.tmpdir(), 'kirukals-print-check.pdf');
  fs.writeFileSync(out, pdf);
  const text = pdf.toString('latin1');
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;

  ok(pdf.length > 10000, `a PDF is produced (${(pdf.length / 1024).toFixed(0)}KB)`);
  ok(pages === seen.sheets, `with one page per sheet (${pages} of ${seen.sheets})`);
  console.log(`\n  written to ${out} — worth opening once with your own eyes`);

  console.log(failed ? `\n${failed} failed` : '\nall good');
  app.exit(failed ? 1 : 0);
});
