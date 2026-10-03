/* The only bridge between the page and the machine. Nothing else is exposed:
   no fs, no child_process, no ipcRenderer — just these named operations. */
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, fn) => ipcRenderer.on(channel, () => fn());

contextBridge.exposeInMainWorld('papertexNative', {
  isDesktop: true,

  /* data: string | ArrayBuffer | Uint8Array */
  save: (filename, data) => ipcRenderer.invoke('papertex:save', {
    filename: filename,
    data: data instanceof Uint8Array ? data : data
  }),

  exportProject: (filename, tex, files) =>
    ipcRenderer.invoke('papertex:exportProject', { filename: filename, tex: tex, files: files }),

  open: () => ipcRenderer.invoke('papertex:open'),
  reveal: (p) => ipcRenderer.invoke('papertex:reveal', p),
  engineAssets: () => ipcRenderer.invoke('papertex:engineAssets'),

  /* the user's current keys, so the menu can show them: {menuName: "Ctrl+S"} */
  setShortcuts: (map) => ipcRenderer.send('papertex:shortcuts', map),

  onMenu: (handlers) => {
    Object.keys(handlers).forEach((k) => on('menu:' + k, handlers[k]));
  }
});
