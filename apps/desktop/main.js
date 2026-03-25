import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const desktopDir = path.dirname(fileURLToPath(import.meta.url))
const repoRootDir = path.resolve(desktopDir, '../..')
const serverEntryPath = path.join(repoRootDir, 'apps/server/index.js')
const preloadPath = path.join(desktopDir, 'preload.js')
const desktopHost = '127.0.0.1'
const desktopPort = Number(process.env.PORT || 3001)
const desktopBaseUrl = `http://${desktopHost}:${desktopPort}`
const rendererDevUrl = process.argv.find((arg) => arg.startsWith('--dev-url='))?.slice('--dev-url='.length) || ''

let serverProcess = null
const panelWindows = new Map()

function buildWindowOptions(overrides = {}) {
  return {
    width: 1600,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#1f1f1f',
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

function pipeChildLogs(child) {
  child.stdout?.on('data', (chunk) => {
    process.stdout.write(String(chunk))
  })
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(String(chunk))
  })
}

function ensureServerProcess() {
  if (serverProcess && !serverProcess.killed) {
    return
  }

  serverProcess = spawn(process.execPath, [serverEntryPath], {
    cwd: repoRootDir,
    env: {
      ...process.env,
      HOST: desktopHost,
      PORT: String(desktopPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  pipeChildLogs(serverProcess)
  serverProcess.on('exit', () => {
    serverProcess = null
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
  await window.loadURL(getRendererUrl(windowPath))
}

function createMainWindow() {
  const mainWindow = new BrowserWindow(buildWindowOptions({ title: 'Nodetrace' }))
  loadWindow(mainWindow).catch((error) => {
    console.error(error)
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
      width: 960,
      height: 760,
    }),
  )
  panelWindows.set(panelId, panelWindow)
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

function stopServerProcess() {
  if (!serverProcess || serverProcess.killed) {
    return
  }
  serverProcess.kill()
  serverProcess = null
}

ipcMain.handle('desktop:open-window', (_event, options) => openPanelWindow(options))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopServerProcess()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

await app.whenReady()
ensureServerProcess()
createMainWindow()
