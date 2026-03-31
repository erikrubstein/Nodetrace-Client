import path from 'node:path'
import process from 'node:process'
import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { getPanelInitialWidth, getPanelMinWidth } from '../../packages/shared/src/panelSizing.js'

const desktopDir = path.dirname(fileURLToPath(import.meta.url))
const repoRootDir = path.resolve(desktopDir, '../..')
const preloadPath = path.join(desktopDir, 'preload.cjs')
const desktopLogPath = path.join(repoRootDir, 'logs', 'desktop.log')
const appIconPath = path.join(repoRootDir, 'apps', 'renderer', 'public', 'nodetrace.svg')
const desktopHost = '127.0.0.1'
const configuredServerUrl = String(process.env.NODETRACE_SERVER_URL || '')
  .trim()
  .replace(/\/+$/, '')
const desktopBaseUrl = configuredServerUrl || `http://${desktopHost}:3001`
const rendererDevUrl = process.argv.find((arg) => arg.startsWith('--dev-url='))?.slice('--dev-url='.length) || ''

let mainWindow = null
const panelWindows = new Map()

function logDesktop(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    fs.mkdirSync(path.dirname(desktopLogPath), { recursive: true })
    fs.appendFileSync(desktopLogPath, line)
  } catch {
    // Ignore log write failures and continue with console output.
  }
  console.log(message)
}

function buildWindowOptions(overrides = {}) {
  return {
    show: false,
    frame: false,
    width: 1600,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#1f1f1f',
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...overrides,
  }
}

function getRendererUrl(windowPath = '') {
  if (rendererDevUrl) {
    return `${rendererDevUrl}${windowPath}`
  }
  return `${desktopBaseUrl}${windowPath}`
}

function attachWindowStateListeners(window, label) {
  const emitWindowState = () => {
    window.webContents.send('desktop:window-state', { maximized: window.isMaximized() })
  }
  window.once('ready-to-show', () => {
    logDesktop(`${label} ready-to-show`)
    window.show()
    window.focus()
    emitWindowState()
  })
  window.on('maximize', emitWindowState)
  window.on('unmaximize', emitWindowState)
  window.webContents.on('did-finish-load', () => {
    logDesktop(`${label} finished load`)
    emitWindowState()
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logDesktop(`${label} failed load: ${errorCode} ${errorDescription}`)
  })
}

async function waitForServerReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${desktopBaseUrl}/api/auth/me`, { method: 'GET' })
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until the local server is ready.
    }
    await delay(250)
  }

  throw new Error(`Timed out waiting for Nodetrace server at ${desktopBaseUrl}`)
}

async function loadWindow(window, windowPath = '') {
  if (!rendererDevUrl) {
    await waitForServerReady()
  }
  logDesktop(`Desktop loading ${getRendererUrl(windowPath)}`)
  await window.loadURL(getRendererUrl(windowPath))
}

function createMainWindow() {
  mainWindow = new BrowserWindow(buildWindowOptions({ title: 'Nodetrace' }))
  logDesktop('Created main BrowserWindow')
  attachWindowStateListeners(mainWindow, 'Main window')
  mainWindow.on('closed', () => {
    logDesktop('Main window closed')
    mainWindow = null
  })
  loadWindow(mainWindow).catch((error) => {
    logDesktop(`Main window load error: ${error.message}`)
    mainWindow.loadURL(`data:text/plain,${encodeURIComponent(error.message)}`).catch(() => {})
  })
  return mainWindow
}

function openPanelWindow(options = {}) {
  const panelId = String(options.panelId || '').trim()
  if (!panelId) {
    throw new Error('panelId is required')
  }

  const existing = panelWindows.get(panelId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return { ok: true, panelId }
  }

  const panelWindow = new BrowserWindow(
    buildWindowOptions({
      title: `Nodetrace - ${panelId}`,
      width: getPanelInitialWidth(panelId),
      height: 760,
      minWidth: getPanelMinWidth(panelId),
      minHeight: 360,
    }),
  )
  panelWindows.set(panelId, panelWindow)
  attachWindowStateListeners(panelWindow, `Panel window ${panelId}`)
  panelWindow.on('closed', () => {
    panelWindows.delete(panelId)
  })

  const windowUrl = new URL(getRendererUrl('/'))
  windowUrl.searchParams.set('panelWindow', panelId)
  if (options.projectId) {
    windowUrl.searchParams.set('project', String(options.projectId))
  }
  if (options.nodeId) {
    windowUrl.searchParams.set('node', String(options.nodeId))
  }

  panelWindow.loadURL(windowUrl.toString()).catch((error) => {
    console.error(error)
    panelWindow.loadURL(`data:text/plain,${encodeURIComponent(error.message)}`).catch(() => {})
  })

  return { ok: true, panelId }
}

function getEventWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

ipcMain.handle('desktop:open-window', (_event, options) => openPanelWindow(options))
ipcMain.handle('desktop:close-window', (event) => {
  getEventWindow(event)?.close()
})
ipcMain.handle('desktop:minimize-window', (event) => {
  getEventWindow(event)?.minimize()
})
ipcMain.handle('desktop:toggle-maximize-window', (event) => {
  const window = getEventWindow(event)
  if (!window) {
    return { maximized: false }
  }
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
  return { maximized: window.isMaximized() }
})
ipcMain.handle('desktop:get-window-state', (event) => {
  const window = getEventWindow(event)
  return { maximized: Boolean(window?.isMaximized()) }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

await app.whenReady()
logDesktop(`Desktop shell starting${rendererDevUrl ? ` with renderer ${rendererDevUrl}` : ''} against ${desktopBaseUrl}`)
createMainWindow()
