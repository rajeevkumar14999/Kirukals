/** Does an export actually write a file in the desktop app? */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kirukals-exp-')));

const out = path.join(os.tmpdir(), 'kirukals-export-check.fountain');
try { fs.unlinkSync(out); } catch {}

// The save dialog cannot be clicked by a test, so it answers itself.
dialog.showSaveDialog = async () => ({ canceled: false, filePath: out });

process.on('unhandledRejection', (e) => { console.log('  FAIL ' + e); app.exit(1); });

app.whenReady().then(async () => {
  require(path.join(__dirname, '..', 'electron', 'main.cjs'));
  await new Promise((r) => setTimeout(r, 3000));
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) { console.log('  FAIL no window'); return app.exit(1); }
  await new Promise((r) => setTimeout(r, 4000));
  const res = await win.webContents.executeJavaScript(`(async () => {
    try {
      if (!window.kirukals) return { ok: false, error: 'no window.kirukals at all' };
      if (!window.kirukals.files) return { ok: false, error: 'bridge keys: ' + Object.keys(window.kirukals).join(',') };
      return await window.kirukals.files.save('check.fountain', 'INT. A ROOM - NIGHT');
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  })()`);
  console.log('  bridge said: ' + JSON.stringify(res));
  const wrote = fs.existsSync(out);
  console.log((wrote ? '  ok   ' : '  FAIL ') + 'a text export is written to disk');
  if (wrote) console.log('  ok   contents: ' + JSON.stringify(fs.readFileSync(out, 'utf8').slice(0, 40)));

  /* And a PDF, which is made in the main process rather than by a printer. */
  const pdfOut = path.join(os.tmpdir(), 'kirukals-export-check.pdf');
  try { fs.unlinkSync(pdfOut); } catch {}
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdfOut });

  const made = await win.webContents.executeJavaScript(`(async () => {
    try {
      const html = '<html><body><div class="sheet">INT. A ROOM - NIGHT</div></body></html>';
      const pdf = await window.kirukals.files.pdf(html, 'letter');
      if (!pdf.ok) return pdf;
      return await window.kirukals.files.save('check.pdf', { base64: pdf.base64 }, 'pdf');
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  })()`);
  console.log('  pdf said: ' + JSON.stringify(made));
  const gotPdf = fs.existsSync(pdfOut) && fs.readFileSync(pdfOut).slice(0, 4).toString() === '%PDF';
  console.log((gotPdf ? '  ok   ' : '  FAIL ') + 'a real PDF is written to disk'
    + (fs.existsSync(pdfOut) ? ` (${(fs.statSync(pdfOut).size / 1024).toFixed(0)}KB)` : ''));

  app.exit(wrote && gotPdf ? 0 : 1);
});
