import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  setClickThrough: (enabled: boolean) => ipcRenderer.send('set-click-through', enabled),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  onServerStatus: (callback: (status: 'starting' | 'ready' | 'crashed') => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status));
  },
});
