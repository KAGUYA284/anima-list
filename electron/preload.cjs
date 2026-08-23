const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('animaListDesktop', {
    fetchYucPage: season => ipcRenderer.invoke('yuc.fetch', season),
    secureToken: {
        get: () => ipcRenderer.invoke('secure-token.get'),
        set: token => ipcRenderer.invoke('secure-token.set', token),
        remove: () => ipcRenderer.invoke('secure-token.remove'),
    },
    syncFetch: (url, options) => ipcRenderer.invoke('sync.fetch', url, options),
});
