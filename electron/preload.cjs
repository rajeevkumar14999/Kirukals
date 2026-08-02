const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the page and the machine.
 *
 * The app is trusted, but it still gets no general access to Node — just the
 * four things updating needs, each a named call rather than an open door.
 */
contextBridge.exposeInMainWorld('kirukals', {
  desktop: true,
  version: () => ipcRenderer.invoke('app:version'),

  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),

    /** Progress and outcomes, pushed from the main process. */
    on: (fn) => {
      const relay = (_event, payload) => fn(payload);
      ipcRenderer.on('update:state', relay);
      return () => ipcRenderer.removeListener('update:state', relay);
    },
  },
});
