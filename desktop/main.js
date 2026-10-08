/* PaperTeX desktop — Electron main process.

   The app is served over a custom `app://` protocol rather than loaded from
   file://. That matters: a file:// page has the opaque origin "null", and no
   browser engine will start a Web Worker there, which is exactly what the
   LaTeX compiler needs. A registered scheme gives it a real origin. */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const url = require('url');

const ROOT = path.join(__dirname, '..');
const DEV = !app.isPackaged;

/* Standard so it gets a normal secure origin: workers, fetch, storage. */
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let win = null;

function serveApp() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    /* never let a crafted path climb out of the app directory */
    const abs = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!abs.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    try {
      return await net.fetch(url.pathToFileURL(abs).toString());
    } catch (e) {
      return new Response('not found', { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#e4e2de',
    title: 'PaperTeX',
    icon: path.join(__dirname, 'papertex.ico'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadURL('app://papertex/app.html');
  win.on('closed', () => { win = null; });

  /* Links to the outside world open in the real browser, not in the app. */
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) { shell.openExternal(target); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}

/* ---- native file handling: this is what a desktop build buys you --------- */

const FILTERS = {
  '.tex': [{ name: 'LaTeX source', extensions: ['tex'] }],
  '.pdf': [{ name: 'PDF document', extensions: ['pdf'] }],
  '.json': [{ name: 'PaperTeX project', extensions: ['json'] }]
};

ipcMain.handle('papertex:save', async (_e, { filename, data }) => {
  const ext = path.extname(filename || '').toLowerCase();
  const res = await dialog.showSaveDialog(win, {
    title: 'Save',
    defaultPath: filename,
    filters: FILTERS[ext] || [{ name: 'All files', extensions: ['*'] }]
  });
  if (res.canceled || !res.filePath) return { status: 'declined' };
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  await fsp.writeFile(res.filePath, buf);
  return { status: 'saved', path: res.filePath };
});

/* Export writes the .tex and every figure into one folder, without asking
   about each image in turn the way a browser download has to. */
ipcMain.handle('papertex:exportProject', async (_e, { filename, tex, files }) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Export LaTeX',
    defaultPath: filename,
    filters: FILTERS['.tex']
  });
  if (res.canceled || !res.filePath) return { status: 'declined' };
  const dir = path.dirname(res.filePath);
  await fsp.writeFile(res.filePath, tex, 'utf8');
  for (const f of files || []) {
    await fsp.writeFile(path.join(dir, f.name), Buffer.from(f.data));
  }
  return { status: 'saved', path: res.filePath, count: (files || []).length };
});

ipcMain.handle('papertex:open', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Open PaperTeX project',
    filters: FILTERS['.json'],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { status: 'declined' };
  const text = await fsp.readFile(res.filePaths[0], 'utf8');
  return { status: 'ok', text: text, path: res.filePaths[0] };
});

ipcMain.handle('papertex:reveal', async (_e, p) => { shell.showItemInFolder(p); });

/* Does this install carry its own TeX Live, or must it use the network? */
ipcMain.handle('papertex:engineAssets', async () => {
  const local = path.join(ROOT, 'engine', 'texlive');
  try {
    await fsp.access(path.join(local, 'busytex.wasm'));
    await fsp.access(path.join(local, 'bundles', 'file-manifest.json'));
    return { local: true };
  } catch (e) {
    return { local: false };
  }
});

/* The page owns the keyboard: shortcuts are the user's to change, and the
   page dispatches them itself (js/keys.js). The menu only displays them —
   registerAccelerator: false — so a key is never handled twice, and a key
   the user has moved elsewhere no longer fires its old menu item. */
let menuKeys = {
  new: 'Ctrl+N', open: 'Ctrl+O', save: 'Ctrl+Shift+S', export: 'Ctrl+S',
  compile: 'Ctrl+R', print: 'Ctrl+P', undo: 'Ctrl+Z', redo: 'Ctrl+Y', help: '', keys: ''
};
const ACCEL_KEYS = { Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right', Esc: 'Escape', '+': 'Plus' };
function toAccelerator(combo) {
  if (!combo) return undefined;
  const parts = String(combo).split('+');
  let key = parts.pop();
  if (key === '' && parts[parts.length - 1] === '') { parts.pop(); key = '+'; }
  const m = /^Num([0-9])$/.exec(key);
  if (m) key = 'num' + m[1];
  else if (ACCEL_KEYS[key]) key = ACCEL_KEYS[key];
  /* Electron names only ASCII keys; a key like Ç is shown nowhere rather than wrongly */
  else if (key.length === 1 && !/^[A-Z0-9!@#$%^&*():;=<,_\->.?/~`{\][|\\}"']$/.test(key)) return undefined;
  const mods = { Ctrl: 'CmdOrCtrl', Alt: 'Alt', Shift: 'Shift' };
  return parts.map((p) => mods[p] || p).concat(key).join('+');
}

/* Spelling is checked in the document's language. Left alone, Chromium
   checks in the computer's language, so on a Turkish Windows every English
   word came up red. Each language names the dictionaries to try, best first. */
const SPELL = {
  en: ['en-US', 'en-GB', 'en'], de: ['de-DE', 'de'], fr: ['fr-FR', 'fr'],
  es: ['es-ES', 'es'], it: ['it-IT', 'it'], tr: ['tr-TR', 'tr'], pt: ['pt-PT', 'pt-BR', 'pt']
};
ipcMain.on('papertex:spellLang', (e, code) => {
  const ses = e.sender.session;
  const have = ses.availableSpellCheckerLanguages || [];
  const pick = (SPELL[code] || []).find((l) => have.includes(l));
  if (!pick) return;
  try { ses.setSpellCheckerLanguages([pick]); } catch (err) { /* keep the current one */ }
});

ipcMain.on('papertex:shortcuts', (_e, map) => {
  if (map && typeof map === 'object') { menuKeys = Object.assign({}, menuKeys, map); buildMenu(); }
});

function buildMenu() {
  const send = (channel) => () => win && win.webContents.send(channel);
  const item = (label, name) => {
    const it = { label: label, click: send('menu:' + name), registerAccelerator: false };
    const acc = toAccelerator(menuKeys[name]);
    if (acc) it.accelerator = acc;
    return it;
  };
  const template = [
    {
      label: 'File',
      submenu: [
        item('New', 'new'),
        item('Open…', 'open'),
        item('Save project…', 'save'),
        { type: 'separator' },
        item('Export LaTeX…', 'export'),
        item('Compile PDF', 'compile'),
        item('Print…', 'print'),
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'undo'),
        item('Redo', 'redo'),
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(DEV ? [{ role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: 'Help',
      submenu: [
        item('Tips and shortcuts', 'help'),
        item('Customize keyboard shortcuts…', 'keys'),
        {
          label: 'Engine and TeX Live',
          click: () => shell.openPath(path.join(ROOT, 'engine', 'README.md'))
        }
      ]
    }
  ];
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch (e) {
    /* an accelerator Electron would not accept: show the menu without keys */
    template.forEach((m) => (m.submenu || []).forEach((it) => { delete it.accelerator; }));
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}

app.whenReady().then(() => {
  serveApp();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
