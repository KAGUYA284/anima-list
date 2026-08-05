const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('animaListDesktop', {
    fetchYucPage: season => ipcRenderer.invoke('yuc.fetch', season),
});
