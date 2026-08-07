const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs/promises')
const { execFile } = require('child_process')
const { promisify } = require('util')

const run = promisify(execFile)

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
        { label: 'Start / Stop Project', accelerator: 'CommandOrControl+Return', click: () => sendCommand('toggle-session') },
        { label: 'Project Apps…', accelerator: 'CommandOrControl+Shift+A', click: () => sendCommand('project-apps') },
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      // Everything DevDoc knows lives in localStorage. A file:// page in the
      // default session gets throwaway storage, so notes and projects vanish on
      // quit - a named persistent partition is what makes them survive.
      partition: 'persist:devdoc',
    },
  })
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

/* ------------------------------------------------------------------ *
 * Application discovery
 * ------------------------------------------------------------------ */

const APPLICATION_DIRECTORIES = [
  '/Applications',
  '/Applications/Utilities',
  '/System/Applications',
  '/System/Applications/Utilities',
  path.join(os.homedir(), 'Applications'),
]

// A bundle that declares any of these can be handed a directory on launch.
const FOLDER_CONTENT_TYPES = new Set(['public.folder', 'public.directory', 'public.item'])

// Tools that happily take a project directory but do not always advertise it
// in CFBundleDocumentTypes. Checked by bundle identifier as a second pass.
const FOLDER_FRIENDLY_BUNDLES = new Set([
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders',
  'com.visualstudio.code.oss',
  'com.todesktop.230313mzl4w4u92', // Cursor
  'dev.zed.Zed',
  'com.sublimetext.4',
  'com.sublimetext.3',
  'com.apple.dt.Xcode',
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'com.warp.Warp-Stable',
  'co.zeit.hyper',
  'com.github.wez.wezterm',
  'net.kovidgoyal.kitty',
  'com.mitchellh.ghostty',
  'com.panic.Nova',
  'com.jetbrains.intellij',
  'com.jetbrains.intellij.ce',
  'com.jetbrains.WebStorm',
  'com.jetbrains.pycharm',
  'com.jetbrains.rider',
  'org.vim.MacVim',
  'com.neovide.neovide',
  'com.apple.finder',
  'com.sourcetreeapp.SourceTree',
  'com.torusknot.SourceTreeNotMAS',
  'com.fournova.Tower3',
  'com.github.GitHubClient',
  'com.sublimemerge',
])

const isApplicationPath = (value) =>
  typeof value === 'string' && path.isAbsolute(value) && value.endsWith('.app')

// LaunchServices lookups can stall on a cold icon cache. Nothing the renderer
// waits on is allowed to hang, so every such call resolves within a deadline.
const withTimeout = (promise, ms, fallback) => new Promise(resolve => {
  let settled = false
  const finish = (value) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolve(value)
  }
  const timer = setTimeout(() => finish(fallback), ms)
  promise.then(finish, () => finish(fallback))
})

const ICON_PIXELS = 128

// Thumbnails come back at the size asked for, which keeps bundle icons sharp on
// a Retina display - getFileIcon tops out at 32px. Its `large` size crashes the
// process outright on macOS, so that option must not be used here.
const bundleIcon = async (appPath) => {
  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(appPath, { width: ICON_PIXELS, height: ICON_PIXELS })
    if (thumbnail && !thumbnail.isEmpty()) return thumbnail
  } catch {
    // Thumbnails are unavailable for some bundles - fall through to the icon API.
  }
  return app.getFileIcon(appPath, { size: 'normal' })
}

const readInfoPlist = async (appPath) => {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist')
  const { stdout } = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], { maxBuffer: 4 * 1024 * 1024 })
  return JSON.parse(stdout)
}

const plistOpensFolders = (plist) => {
  for (const type of plist?.CFBundleDocumentTypes || []) {
    if ((type.LSItemContentTypes || []).some(id => FOLDER_CONTENT_TYPES.has(id))) return true
    if ((type.CFBundleTypeOSTypes || []).includes('fold')) return true
    if (/folder|directory/i.test(type.CFBundleTypeName || '')) return true
  }
  return false
}

// `name` is the Finder-visible name; `scriptName` is what AppleScript answers to.
const inspectApplication = async (appPath) => {
  const displayName = path.basename(appPath).replace(/\.app$/, '')
  try {
    const plist = await readInfoPlist(appPath)
    const bundleId = plist.CFBundleIdentifier || ''
    return {
      path: appPath,
      name: displayName,
      scriptName: plist.CFBundleName || displayName,
      bundleId,
      opensFolders: plistOpensFolders(plist) || FOLDER_FRIENDLY_BUNDLES.has(bundleId),
    }
  } catch {
    return { path: appPath, name: displayName, scriptName: displayName, bundleId: '', opensFolders: false }
  }
}

const listApplications = async () => {
  const found = new Map()
  for (const directory of APPLICATION_DIRECTORIES) {
    let entries = []
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      continue // Directory is optional - ~/Applications often does not exist.
    }
    for (const entry of entries) {
      if (!entry.name.endsWith('.app') || entry.name.startsWith('.')) continue
      const fullPath = path.join(directory, entry.name)
      if (found.has(fullPath)) continue
      found.set(fullPath, { path: fullPath, name: entry.name.replace(/\.app$/, '') })
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/* ------------------------------------------------------------------ *
 * Session control - launching and quitting
 * ------------------------------------------------------------------ */

// `ps -Ao comm=` prints the full executable path for GUI apps, so a bundle is
// running when some process lives inside its Contents/MacOS directory. This
// avoids needing Automation permission just to read state.
const runningProcessList = async () => {
  try {
    const { stdout } = await run('/bin/ps', ['-Ao', 'comm='], { maxBuffer: 16 * 1024 * 1024 })
    return stdout.split('\n')
  } catch {
    return []
  }
}

const isApplicationRunning = (processes, appPath) =>
  processes.some(line => line.startsWith(`${appPath}/Contents/MacOS/`))

const launchApplication = async (appPath, folderPath) => {
  if (folderPath) {
    try {
      await run('/usr/bin/open', ['-a', appPath, folderPath])
      return
    } catch {
      // Some bundles reject a directory argument - fall back to a plain launch.
    }
  }
  await run('/usr/bin/open', ['-a', appPath])
}

const quitApplication = async (appPath, scriptName) => {
  try {
    await run('/usr/bin/osascript', ['-e', `tell application ${JSON.stringify(scriptName)} to quit`], { timeout: 12000 })
    return true
  } catch {
    try {
      // Graceful AppleScript quit failed (no Automation permission, or the app
      // has no scripting support). SIGTERM still lets the app clean up.
      await run('/usr/bin/pkill', ['-f', `^${appPath}/Contents/MacOS/`], { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }
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

  // Where a brand new project is proposed to live. The renderer shows this
  // tilde-abbreviated, so the home directory travels with it.
  ipcMain.handle('devdoc:workspace-defaults', () => ({
    home: os.homedir(),
    root: path.join(os.homedir(), 'Dev', 'Projects'),
  }))

  ipcMain.handle('devdoc:ensure-folder', async (_, folderPath) => {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) return 'Invalid folder path'
    try {
      await fs.mkdir(folderPath, { recursive: true })
      return ''
    } catch (error) {
      return String(error?.message || error)
    }
  })

  ipcMain.handle('devdoc:open-app-data', () => shell.openPath(app.getPath('userData')))

  // One menu channel for both kinds. It used to be named for projects only,
  // which is how notes ended up being offered "Start Project" and "Project
  // Apps…" - a note now gets note verbs.
  ipcMain.on('devdoc:item-menu', (event, { id, kind, hasWorkspace, isRunning, isStarred }) => {
    if (typeof id !== 'string') return
    const send = (action) => () => event.sender.send('devdoc:item-menu-action', { id, action })

    const template = kind === 'note'
      ? [
        { label: 'Open Note', click: send('open') },
        { label: isStarred ? 'Remove from Starred' : 'Add to Starred', click: send('star') },
        { type: 'separator' },
        { label: 'Copy as Text', click: send('copy') },
        { label: 'Duplicate Note', click: send('duplicate') },
        { label: 'Convert to Project…', click: send('convert') },
        { type: 'separator' },
        { label: 'Delete Note…', click: send('delete') },
      ]
      : [
        { label: isRunning ? 'Stop Project' : 'Start Project', click: send(isRunning ? 'stop' : 'start') },
        { label: 'Open Project', click: send('open') },
        { type: 'separator' },
        { label: 'Project Apps…', click: send('apps') },
        {
          label: hasWorkspace ? 'Reveal in Finder' : 'Choose Workspace Folder…',
          click: send(hasWorkspace ? 'reveal' : 'choose-folder'),
        },
        { type: 'separator' },
        { label: 'Delete Project…', click: send('delete') },
      ]

    Menu.buildFromTemplate(template).popup({ window: mainWindow })
  })

  ipcMain.handle('devdoc:list-applications', () => listApplications())

  ipcMain.handle('devdoc:inspect-applications', async (_, paths) => {
    const targets = (Array.isArray(paths) ? paths : []).filter(isApplicationPath).slice(0, 64)
    return Promise.all(targets.map(inspectApplication))
  })

  ipcMain.handle('devdoc:application-icons', async (_, paths) => {
    const targets = (Array.isArray(paths) ? paths : []).filter(isApplicationPath).slice(0, 600)
    // Resolved in small batches with a yield between them: a cold LaunchServices
    // cache makes these slow, and asking for two hundred at once starves the
    // main thread while the picker is waiting to draw.
    const icons = {}
    for (let index = 0; index < targets.length; index += 12) {
      const batch = targets.slice(index, index + 12)
      await Promise.all(batch.map(async (target) => {
        try {
          const icon = await withTimeout(bundleIcon(target), 4000, null)
          icons[target] = icon && !icon.isEmpty() ? icon.toDataURL() : null
        } catch {
          icons[target] = null
        }
      }))
      await new Promise(resolve => setImmediate(resolve))
    }
    return icons
  })

  ipcMain.handle('devdoc:running-applications', async (_, paths) => {
    const targets = (Array.isArray(paths) ? paths : []).filter(isApplicationPath)
    if (!targets.length) return []
    const processes = await runningProcessList()
    return targets.filter(target => isApplicationRunning(processes, target))
  })

  ipcMain.handle('devdoc:browse-for-application', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Application',
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }],
    })
    if (result.canceled || !result.filePaths.length) return null
    return inspectApplication(result.filePaths[0])
  })

  ipcMain.handle('devdoc:start-session', async (_, payload) => {
    const apps = (Array.isArray(payload?.apps) ? payload.apps : []).filter(entry => isApplicationPath(entry?.path))
    const workspacePath = typeof payload?.workspacePath === 'string' && path.isAbsolute(payload.workspacePath)
      ? payload.workspacePath
      : ''

    const processes = await runningProcessList()
    const launched = []
    const alreadyRunning = []
    const failed = []

    for (const entry of apps) {
      const wasRunning = isApplicationRunning(processes, entry.path)
      const folder = entry.openWithFolder && workspacePath ? workspacePath : ''

      // An editor that is already open still needs the folder handed to it, so
      // only skip the launch when there is nothing extra to pass along.
      if (wasRunning && !folder) {
        alreadyRunning.push(entry.path)
        continue
      }

      try {
        await launchApplication(entry.path, folder)
        // Apps we found running stay off the launched list - Stop must not quit
        // something the user had open before the project started.
        if (wasRunning) alreadyRunning.push(entry.path)
        else launched.push(entry.path)
      } catch (error) {
        failed.push({ path: entry.path, message: String(error?.message || error) })
      }
    }

    return { launched, alreadyRunning, failed }
  })

  ipcMain.handle('devdoc:stop-session', async (_, payload) => {
    const apps = (Array.isArray(payload?.apps) ? payload.apps : []).filter(entry => isApplicationPath(entry?.path))
    const stopped = []
    const failed = []

    // Quit everything at once. Each app gets its own timeout, so one that sits
    // on a save prompt no longer holds up the rest of the session teardown.
    const results = await Promise.all(apps.map(async (entry) => {
      const scriptName = entry.scriptName || entry.name || path.basename(entry.path).replace(/\.app$/, '')
      return { path: entry.path, quit: await quitApplication(entry.path, scriptName) }
    }))

    for (const result of results) {
      if (result.quit) stopped.push(result.path)
      else failed.push(result.path)
    }

    return { stopped, failed }
  })

  ipcMain.handle('devdoc:user-name', async () => {
    try {
      const { stdout } = await run('/usr/bin/id', ['-F'], { timeout: 4000 })
      const fullName = stdout.trim()
      if (fullName) return fullName
    } catch {
      // `id -F` is macOS-only - fall back to the short user name.
    }
    try {
      return os.userInfo().username || ''
    } catch {
      return ''
    }
  })

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
