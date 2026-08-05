const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('devdocDesktop', {
  chooseWorkspaceFolder: () => ipcRenderer.invoke('devdoc:choose-workspace-folder'),
  chooseImages: () => ipcRenderer.invoke('devdoc:choose-images'),
  revealFolder: (folderPath) => ipcRenderer.invoke('devdoc:reveal-folder', folderPath),
  openAppData: () => ipcRenderer.invoke('devdoc:open-app-data'),
  showProjectMenu: (project) => ipcRenderer.send('devdoc:project-menu', project),
  onProjectMenuAction: (listener) => {
    const wrapped = (_, payload) => listener(payload)
    ipcRenderer.on('devdoc:project-menu-action', wrapped)
    return () => ipcRenderer.removeListener('devdoc:project-menu-action', wrapped)
  },
  onAppCommand: (listener) => {
    const wrapped = (_, command) => listener(command)
    ipcRenderer.on('devdoc:app-command', wrapped)
    return () => ipcRenderer.removeListener('devdoc:app-command', wrapped)
  },
})
