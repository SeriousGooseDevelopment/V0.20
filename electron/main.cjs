const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')
const path = require('path')

let mainWindow

const sendCommand = (command) => {
  mainWindow?.webContents.send('devdoc:app-command', command)
}

const installApplicationMenu = () => {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'DevDoc',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => sendCommand('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CommandOrControl+N', click: () => sendCommand('new-note') },
        { label: 'New Project', accelerator: 'CommandOrControl+Shift+N', click: () => sendCommand('new-project') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { label: 'Find', accelerator: 'CommandOrControl+F', click: () => sendCommand('find') },
        { label: 'Command Palette…', accelerator: 'CommandOrControl+K', click: () => sendCommand('command') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(process.platform === 'darwin' ? [{ type: 'separator' }, { role: 'front' }] : [])] },
    { label: 'Help', submenu: [{ label: 'DevDoc Help', click: () => sendCommand('help') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1536,
    height: 1080,
    minWidth: 1024,
    minHeight: 720,
    title: 'DevDoc',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#111214',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  })
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

app.whenReady().then(() => {
  installApplicationMenu()
  ipcMain.handle('devdoc:choose-workspace-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose Workspace Folder', properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('devdoc:choose-images', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add Images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'svg'] }],
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('devdoc:reveal-folder', (_, folderPath) => {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) return 'Invalid folder path'
    return shell.openPath(folderPath)
  })
  ipcMain.handle('devdoc:open-app-data', () => shell.openPath(app.getPath('userData')))
  ipcMain.on('devdoc:project-menu', (event, { id, hasWorkspace }) => {
    if (typeof id !== 'string') return
    const menu = Menu.buildFromTemplate([
      { label: 'Open Project', click: () => event.sender.send('devdoc:project-menu-action', { id, action: 'open' }) },
      { type: 'separator' },
      { label: hasWorkspace ? 'Reveal in Finder' : 'Choose Workspace Folder…', click: () => event.sender.send('devdoc:project-menu-action', { id, action: hasWorkspace ? 'reveal' : 'choose-folder' }) },
    ])
    menu.popup({ window: mainWindow })
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
