'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mascotte', {
  invoke: (action, data) => ipcRenderer.invoke('mascotte', action, data),
  onState: callback => { ipcRenderer.on('mascotte-state', (_event, data) => callback(data)); },
  onChat: callback => { ipcRenderer.on('mascotte-chat', (_event, data) => callback(data)); }
});
