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
  console.log((wrote ? '  ok   ' : '  FAIL ') + 'a file is written to disk');
  if (wrote) console.log('  ok   contents: ' + JSON.stringify(fs.readFileSync(out, 'utf8').slice(0, 40)));
  app.exit(wrote ? 0 : 1);
});
