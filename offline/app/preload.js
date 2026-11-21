// The little the game page may ask of the Windows app: full screen and quitting. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  fullscreen: (on) => ipcRenderer.invoke('fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('isFullscreen'),
  quit: () => ipcRenderer.send('quit'),
});
