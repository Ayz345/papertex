/* Render the link-preview picture: tools/og-card.html → img/og-card.png (1200×630).

     npm run og-image

   Run it again after changing og-card.html; the PNG is committed, so the web
   build does not need Electron. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const W = 1200, H = 630;
const out = path.join(__dirname, '..', 'img', 'og-card.png');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, show: false, useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: 1 }
  });
  await win.loadFile(path.join(__dirname, 'og-card.html'));
  /* fonts are data: URLs in a 400 KB stylesheet; wait until they are in use */
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))');
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
  const png = img.resize({ width: W, height: H }).toPNG();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log('img/og-card.png  ' + (png.length / 1024).toFixed(0) + ' KB');
  app.quit();
});
