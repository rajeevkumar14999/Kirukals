/** Does the Google card open, and does closing it clean up? */
const { app, BrowserWindow } = require('electron');
const { signInWithGoogle } = require('C:/claude code/scriptwriter/electron/google-auth.cjs');

app.whenReady().then(async () => {
  const parent = new BrowserWindow({ show: true, width: 900, height: 600 });
  await parent.loadURL('data:text/html,<h1 style="font:20px sans-serif">the app</h1>');

  const before = BrowserWindow.getAllWindows().length;
  const attempt = signInWithGoogle({
    clientId: 'probe.apps.googleusercontent.com',
    clientSecret: 'probe',
    parentWindow: parent,
  }).catch((err) => ({ refused: err.message }));

  await new Promise((r) => setTimeout(r, 3500));
  const after = BrowserWindow.getAllWindows();
  const card = after.find((w) => w !== parent);

  console.log('windows before:', before, '· after:', after.length);
  console.log('card opened:', Boolean(card));
  if (card) {
    const size = card.getSize();
    console.log('card size:', size.join('x'), '· parented:', card.getParentWindow() === parent);
    console.log('card is showing:', card.getURL().slice(0, 60));
    card.close();
  }

  const outcome = await attempt;
  console.log('closing it reported:', JSON.stringify(outcome));
  console.log('windows left:', BrowserWindow.getAllWindows().length);
  app.exit(0);
});
