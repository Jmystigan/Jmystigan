const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  branding: () => ipcRenderer.invoke('branding'), login: (u, p) => ipcRenderer.invoke('login', u, p),
  status: () => ipcRenderer.invoke('status'), install: () => ipcRenderer.invoke('install'), play: (exe) => ipcRenderer.invoke('play', exe),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, v) => cb(v)),
});
