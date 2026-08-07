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

  /** Saving a script out, through a real save dialog. */
  files: {
    save: (filename, text, kind) => ipcRenderer.invoke('export:save', { filename, text, kind }),
    reveal: (filePath) => ipcRenderer.invoke('export:reveal', filePath),
    pdf: (html, paper) => ipcRenderer.invoke('export:pdf', { html, paper }),
  },

  /** Signing in through the system browser, and the callback coming back. */
  auth: {
    /** Sign in with Google and hand back a token to trade for a session. */
    google: () => ipcRenderer.invoke('auth:google'),
    open: (url) => ipcRenderer.invoke('auth:open', url),
    pending: () => ipcRenderer.invoke('auth:pending'),
    onCallback: (fn) => {
      const relay = (_event, url) => fn(url);
      ipcRenderer.on('deeplink', relay);
      return () => ipcRenderer.removeListener('deeplink', relay);
    },
  },

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
