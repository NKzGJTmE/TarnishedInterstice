const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  onWindowUpdate: (callback) => {
    const subscription = (_event, value) => value && callback(value)
    ipcRenderer.on('window-update', subscription)
    return () => ipcRenderer.removeListener('window-update', subscription)
  },
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore)
  },
  startDrag: () => ipcRenderer.send('drag-start'),
  endDrag: () => ipcRenderer.send('drag-end'),

  requestFocus: () => ipcRenderer.send('request-focus'),
  relinquishFocus: () => ipcRenderer.send('relinquish-focus'),

  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),

  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onConfigUpdate: (cb) => {
    const subscription = (_, c) => cb(c)
    ipcRenderer.on('config-updated', subscription)
    return () => ipcRenderer.removeListener('config-updated', subscription)
  },
  
  openDataFolder: () => ipcRenderer.send('open-data-folder'),
  onAppWokeUp: (cb) => {
    const subscription = (_, data) => cb(data)
    ipcRenderer.on('app-woke-up', subscription)
    return () => ipcRenderer.removeListener('app-woke-up', subscription)
  }
})
