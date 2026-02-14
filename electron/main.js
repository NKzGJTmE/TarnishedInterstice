import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { accessSync, constants as fsConstants } from 'fs'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import electronUpdater from 'electron-updater'
import koffi from 'koffi'

const { autoUpdater } = electronUpdater
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let GetWindowTextW = null
let GetForegroundWindow = null
let SetForegroundWindow = null

try {
  const user32 = koffi.load('user32.dll')
  GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'intptr', [])
  SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', 'bool', ['intptr'])
  GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int', ['intptr', 'uint16 *', 'int'])
} catch (error) {
  console.error('Failed to load Win32 APIs via koffi:', error)
}

let mainWindow = null
let tray = null
let watcherInterval = null
let lastWinData = null
let isAppVisible = true
let lastCheckTime = 0
let lastHwnd = 0
let lastWinTitle = ''
const isAutoStartLaunch = process.argv.includes('--autostart')
const isPortableBuild = Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}
if (process.platform === 'win32') {
  // Keep app fade logic, but disable native OS spawn animation.
  app.commandLine.appendSwitch('wm-window-animations-disabled')
}

function getTargetDisplayBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return screen.getPrimaryDisplay().bounds
  }

  const [x, y] = mainWindow.getPosition()
  const [width, height] = mainWindow.getSize()
  const centerPoint = {
    x: x + Math.floor(width / 2),
    y: y + Math.floor(height / 2)
  }
  const display = screen.getDisplayNearestPoint(centerPoint) || screen.getPrimaryDisplay()
  return display.bounds
}

function syncMainWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { x, y, width, height } = getTargetDisplayBounds()
  const current = mainWindow.getBounds()
  if (
    current.x === x &&
    current.y === y &&
    current.width === width &&
    current.height === height
  ) {
    return
  }

  mainWindow.setBounds({ x, y, width, height }, false)
}

function safeJson(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return '"[unserializable]"'
  }
}

function telemetry(level, event, payload = {}) {
  const line = `[${new Date().toISOString()}] [${level}] [${event}] ${safeJson(payload)}\n`
  if (level === 'error') console.error(line.trim())
  else console.warn(line.trim())

  if (!app.isReady()) return
  const telemetryPath = join(app.getPath('userData'), 'telemetry.log')
  fs.appendFile(telemetryPath, line).catch(() => {})
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject({ error, stdout, stderr })
      else resolve({ stdout, stderr })
    })
  })
}

async function cleanupLegacyElectronAutostart() {
  if (process.platform !== 'win32') return
  const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  const legacyNames = ['electron.app.Electron', 'Electron']
  for (const name of legacyNames) {
    try {
      await execFileAsync('reg', ['delete', runKey, '/v', name, '/f'])
      telemetry('warn', 'autostart.cleanup.legacy', { name, removed: true })
    } catch {
      // Ignore not-found errors.
    }
  }
}

function pathExists(path) {
  try {
    accessSync(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function getIconPath() {
  const iconName = 'icon.ico'
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, iconName), join(process.resourcesPath, 'resources', iconName), join(__dirname, '..', '..', 'resources', iconName)]
    : [join(process.cwd(), 'resources', iconName), join(__dirname, '..', 'resources', iconName)]

  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate
  }
  return candidates[0]
}

function getRendererPath() {
  return join(__dirname, '../out/renderer/index.html')
}

function loadRenderer(window, pageMode = '') {
  if (!app.isPackaged) {
    const devBase = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    const url = pageMode ? `${devBase}?page=${pageMode}` : devBase
    return window.loadURL(url)
  }

  const filePath = getRendererPath()
  if (pageMode) return window.loadFile(filePath, { search: `page=${pageMode}` })
  return window.loadFile(filePath)
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x, y, width, height } = primaryDisplay.bounds

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    type: 'toolbar',
    focusable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  })

  loadRenderer(mainWindow)
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  mainWindow.once('ready-to-show', () => {
    syncMainWindowBounds()
    mainWindow.setOpacity(0)
    mainWindow.show()
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1)
    }, 50)
    mainWindow.setFocusable(false)
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
    startSmartWatcher()
    updateTrayMenu()
    if (app.isPackaged) initUpdater()
  })
}

function initUpdater() {
  if (!app.isPackaged || isPortableBuild) return
  autoUpdater.checkForUpdatesAndNotify()
  autoUpdater.on('update-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', 'available')
  })
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', 'downloaded')
  })
}

function createTray() {
  if (tray) return
  try {
    const icon = nativeImage.createFromPath(getIconPath())
    tray = new Tray(icon)
    tray.setToolTip('前有建言')
    updateTrayMenu()
    tray.on('click', () => toggleWindow())
  } catch (error) {
    console.error('Failed to create tray:', error)
  }
}

function openAuxWindow(pageMode) {
  const win = new BrowserWindow({
    width: 500,
    height: 500,
    minWidth: 400,
    minHeight: 400,
    title: pageMode === 'settings' ? '设置' : '我的建言',
    icon: getIconPath(),
    autoHideMenuBar: true,
    resizable: true,
    minimizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  })

  loadRenderer(win, pageMode)
}

function toggleHibernate() {
  if (watcherInterval) {
    stopSmartWatcher()
    if (mainWindow && isAppVisible) {
      mainWindow.setOpacity(0)
      mainWindow.setIgnoreMouseEvents(true, { forward: false })
      isAppVisible = false
    }
  } else {
    if (mainWindow && !isAppVisible) {
      isAppVisible = true
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1)
      }, 50)
    }
    startSmartWatcher()
  }
  updateTrayMenu()
}

function toggleWindow() {
  if (!mainWindow) return
  isAppVisible = !isAppVisible
  if (isAppVisible) {
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
    startSmartWatcher()
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1)
    }, 50)
  } else {
    mainWindow.setOpacity(0)
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
    stopSmartWatcher()
  }
  updateTrayMenu()
}

function restartApp() {
  const execPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  const args = process.argv.slice(1).filter((arg) => arg !== '--autostart')
  app.relaunch({ execPath, args })
  app.quit()
}

function updateTrayMenu() {
  if (!tray || !mainWindow) return
  const contextMenu = Menu.buildFromTemplate([
    { label: `前有建言 v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: watcherInterval ? '休眠 (Hibernate)' : '唤醒 (Wake Up)', click: () => toggleHibernate() },
    { label: '我的建言 (History)', click: () => openAuxWindow('history') },
    { type: 'separator' },
    { label: '设置 (Settings)', click: () => openAuxWindow('settings') },
    ...(!isPortableBuild
      ? [
          { type: 'separator' },
          {
            label: '检查更新 (Check Updates)',
            click: () => {
              if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify()
            }
          }
        ]
      : []),
    {
      label: 'GitHub',
      click: async () => {
        const { shell } = await import('electron')
        shell.openExternal('https://github.com/NKzGJTmE/TarnishedInterstice')
      }
    },
    ...(app.isPackaged
      ? [
          {
            label: '重启 (Restart)',
            click: () => restartApp()
          }
        ]
      : []),
    { label: '退出 (Exit)', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
}

ipcMain.on('request-focus', () => {
  if (!mainWindow) return
  mainWindow.setFocusable(true)
  mainWindow.focus()
  stopSmartWatcher()
})

ipcMain.on('relinquish-focus', () => {
  if (!mainWindow) return
  mainWindow.blur()
  mainWindow.setFocusable(false)
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  if (lastWinData?.id && SetForegroundWindow) {
    try {
      SetForegroundWindow(lastWinData.id)
    } catch (error) {
      console.error('Failed to switch focus back:', error)
    }
  }
  startSmartWatcher()
})

ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (typeof ignore !== 'boolean') {
    telemetry('warn', 'ipc.invalid.set-ignore-mouse-events', { ignoreType: typeof ignore })
    return
  }
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (ignore === false) win.setIgnoreMouseEvents(false)
  else win.setIgnoreMouseEvents(true, { forward: true })
})

ipcMain.on('drag-start', () => stopSmartWatcher())
ipcMain.on('drag-end', () => startSmartWatcher())

ipcMain.handle('get-auto-launch', () => {
  const settings = app.getLoginItemSettings({
    path: process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'),
    args: ['--autostart']
  })
  return settings.openAtLogin
})

ipcMain.handle('set-auto-launch', (_event, enable) => {
  if (typeof enable !== 'boolean') {
    telemetry('warn', 'ipc.invalid.set-auto-launch', { enableType: typeof enable })
    return false
  }
  if (!app.isPackaged) return false
  const currentPath = process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe')

  // Clear legacy entries that may launch bare electron or wrong path.
  cleanupLegacyElectronAutostart().catch(() => {})
  app.setLoginItemSettings({ openAtLogin: false })
  app.setLoginItemSettings({ openAtLogin: false, path: app.getPath('exe') })
  app.setLoginItemSettings({ openAtLogin: false, path: currentPath })

  app.setLoginItemSettings({
    openAtLogin: enable,
    path: currentPath,
    args: ['--autostart']
  })
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.on('open-data-folder', async () => {
  const { shell } = await import('electron')
  shell.openPath(app.getPath('userData'))
})

const configPath = join(app.getPath('userData'), 'config.json')

ipcMain.handle('load-config', async () => {
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
})

ipcMain.handle('save-config', async (event, config) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    telemetry('warn', 'ipc.invalid.save-config', { configType: typeof config })
    return false
  }

  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
    BrowserWindow.getAllWindows().forEach((win) => {
      if (event.sender && win.webContents.id !== event.sender.id) {
        win.webContents.send('config-updated', config)
      }
    })
    return true
  } catch (error) {
    telemetry('error', 'ipc.error.save-config', { message: error?.message || String(error) })
    return false
  }
})

const startSmartWatcher = () => {
  if (watcherInterval) clearInterval(watcherInterval)
  watcherInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !isAppVisible) return
    if (mainWindow.isFocusable()) return

    const now = Date.now()
    if (now - lastCheckTime < 500) return
    lastCheckTime = now

    try {
      if (!globalThis.titleBuffer) globalThis.titleBuffer = Buffer.alloc(512)

      if (GetForegroundWindow && GetWindowTextW) {
        const currentHwnd = GetForegroundWindow()
        const len = GetWindowTextW(currentHwnd, globalThis.titleBuffer, 256)
        const currentTitle = globalThis.titleBuffer.toString('utf16le', 0, len * 2).replace(/\0/g, '')
        if (Number(currentHwnd) === lastHwnd && currentTitle === lastWinTitle) return
        lastHwnd = Number(currentHwnd)
        lastWinTitle = currentTitle
      }

      const activeWinModule = await import('active-win')
      const activeWin = activeWinModule.default || activeWinModule
      const result = await activeWin()
      if (!result) return

      if (result.id) lastHwnd = result.id
      if (result.title) lastWinTitle = result.title

      const processName = (result.owner?.name || '').toLowerCase()
      if (processName.includes('electron') || processName.includes('tarnished') || result.title === '前有建言') return

      const newSignature = `${result.owner?.name || 'unknown'}-${result.title || ''}`
      const oldSignature = lastWinData ? `${lastWinData.owner?.name || 'unknown'}-${lastWinData.title || ''}` : ''
      if (newSignature === oldSignature) return

      lastWinData = result
      mainWindow.webContents.send('window-update', result)
    } catch (error) {
      if (!app.isPackaged) console.error(error)
    }
  }, 1500)
}

const stopSmartWatcher = () => {
  if (watcherInterval) clearInterval(watcherInterval)
  watcherInterval = null
}

app.whenReady().then(() => {
  cleanupLegacyElectronAutostart().catch(() => {})
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    syncMainWindowBounds()
    isAppVisible = true
    mainWindow.setOpacity(1)
    mainWindow.show()
    mainWindow.focus()
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
    startSmartWatcher()
    updateTrayMenu()
  })

  createTray()
  createWindow()

  const handleDisplayMetricsChange = () => {
    syncMainWindowBounds()
  }
  screen.on('display-metrics-changed', handleDisplayMetricsChange)
  screen.on('display-added', handleDisplayMetricsChange)
  screen.on('display-removed', handleDisplayMetricsChange)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  powerMonitor.on('unlock-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed() && isAppVisible) {
      syncMainWindowBounds()
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  })

  powerMonitor.on('resume', () => {
    if (mainWindow && !mainWindow.isDestroyed() && isAppVisible) {
      syncMainWindowBounds()
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIgnoreMouseEvents(true, { forward: true })
      }, 1000)
    }
  })

  if (isAutoStartLaunch) telemetry('warn', 'app.autostart.launch', { argv: process.argv })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
