const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('devdocDesktop', {
  chooseWorkspaceFolder: () => ipcRenderer.invoke('devdoc:choose-workspace-folder'),
  chooseImages: () => ipcRenderer.invoke('devdoc:choose-images'),
  revealFolder: (folderPath) => ipcRenderer.invoke('devdoc:reveal-folder', folderPath),
  workspaceDefaults: () => ipcRenderer.invoke('devdoc:workspace-defaults'),
  ensureFolder: (folderPath) => ipcRenderer.invoke('devdoc:ensure-folder', folderPath),
  openAppData: () => ipcRenderer.invoke('devdoc:open-app-data'),
  userName: () => ipcRenderer.invoke('devdoc:user-name'),

  listApplications: () => ipcRenderer.invoke('devdoc:list-applications'),
  inspectApplications: (paths) => ipcRenderer.invoke('devdoc:inspect-applications', paths),
  applicationIcons: (paths) => ipcRenderer.invoke('devdoc:application-icons', paths),
  runningApplications: (paths) => ipcRenderer.invoke('devdoc:running-applications', paths),
  browseForApplication: () => ipcRenderer.invoke('devdoc:browse-for-application'),

  startSession: (payload) => ipcRenderer.invoke('devdoc:start-session', payload),
  stopSession: (payload) => ipcRenderer.invoke('devdoc:stop-session', payload),

  showItemMenu: (item) => ipcRenderer.send('devdoc:item-menu', item),
  onItemMenuAction: (listener) => {
    const wrapped = (_, payload) => listener(payload)
    ipcRenderer.on('devdoc:item-menu-action', wrapped)
    return () => ipcRenderer.removeListener('devdoc:item-menu-action', wrapped)
  },
  onAppCommand: (listener) => {
    const wrapped = (_, command) => listener(command)
    ipcRenderer.on('devdoc:app-command', wrapped)
    return () => ipcRenderer.removeListener('devdoc:app-command', wrapped)
  },
})
