import path from 'node:path'
import process from 'node:process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { getPanelInitialWidth, getPanelMinWidth } from '../../packages/shared/src/panelSizing.js'

const desktopDir = path.dirname(fileURLToPath(import.meta.url))
const repoRootDir = path.resolve(desktopDir, '../..')
const preloadPath = path.join(desktopDir, 'preload.cjs')
const desktopLogPath = path.join(repoRootDir, 'logs', 'desktop.log')
const desktopStatePath = path.join(app.getPath('userData'), 'desktop-state.json')
const rendererEntryPath = path.join(repoRootDir, 'dist', 'index.html')
const appIconPath = path.join(repoRootDir, 'apps', 'renderer', 'public', 'nodetrace.svg')
const rendererDevUrl = process.argv.find((arg) => arg.startsWith('--dev-url='))?.slice('--dev-url='.length) || ''

let mainWindow = null
const panelWindows = new Map()
let desktopProxyServer = null
let desktopProxyBaseUrl = ''
let desktopState = {
  profiles: [],
  selectedProfileId: null,
  sessionCookiesByProfileId: {},
}
let desktopProfileAuthStateById = {}

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

function normalizeServerProfile(profile, fallbackId = randomUUID()) {
  const id = String(profile?.id || fallbackId).trim()
  const baseUrlRaw = String(profile?.baseUrl || '').trim()
  if (!id || !baseUrlRaw) {
    return null
  }

  let parsedUrl = null
  try {
    parsedUrl = new URL(baseUrlRaw)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return null
  }

  parsedUrl.hash = ''
  parsedUrl.search = ''
  const baseUrl = parsedUrl.toString().replace(/\/+$/, '')
  const fallbackName = parsedUrl.host
  const name = String(profile?.name || fallbackName).trim() || fallbackName

  return {
    id,
    name,
    baseUrl,
  }
}

function readDesktopState() {
  try {
    if (!fs.existsSync(desktopStatePath)) {
      return
    }

    const parsed = JSON.parse(fs.readFileSync(desktopStatePath, 'utf8'))
    const profiles = Array.isArray(parsed?.profiles)
      ? parsed.profiles
          .map((profile) => normalizeServerProfile(profile, profile?.id || randomUUID()))
          .filter(Boolean)
      : []
    const selectedProfileId =
      profiles.some((profile) => profile.id === parsed?.selectedProfileId) ? parsed.selectedProfileId : profiles[0]?.id || null

    desktopState = {
      profiles,
      selectedProfileId,
      sessionCookiesByProfileId:
        parsed?.sessionCookiesByProfileId && typeof parsed.sessionCookiesByProfileId === 'object'
          ? { ...parsed.sessionCookiesByProfileId }
          : {},
    }
  } catch (error) {
    logDesktop(`Failed to read desktop state: ${error.message}`)
  }
}

function writeDesktopState() {
  try {
    fs.mkdirSync(path.dirname(desktopStatePath), { recursive: true })
    fs.writeFileSync(
      desktopStatePath,
      JSON.stringify(
        {
          profiles: desktopState.profiles,
          selectedProfileId: desktopState.selectedProfileId,
          sessionCookiesByProfileId: desktopState.sessionCookiesByProfileId,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    logDesktop(`Failed to write desktop state: ${error.message}`)
  }
}

function getSelectedServerProfile() {
  return desktopState.profiles.find((profile) => profile.id === desktopState.selectedProfileId) || null
}

function getProfileAuthState(profileId) {
  return desktopProfileAuthStateById[profileId] || {
    authenticated: false,
    userId: null,
    username: '',
    captureSessionId: '',
    error: '',
  }
}

function getDesktopServerState() {
  return {
    profiles: desktopState.profiles.map((profile) => ({
      ...profile,
      ...getProfileAuthState(profile.id),
    })),
    selectedProfileId: desktopState.selectedProfileId,
    proxyBaseUrl: desktopProxyBaseUrl,
  }
}

function broadcastDesktopServerState() {
  const payload = getDesktopServerState()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('desktop:server-state', payload)
    }
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
}

function getStoredCookieHeader(profileId) {
  return String(desktopState.sessionCookiesByProfileId?.[profileId] || '').trim()
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8')
          let payload = null
          try {
            payload = rawBody ? JSON.parse(rawBody) : null
          } catch {
            payload = null
          }
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode || 0,
            payload,
          })
        })
      },
    )

    request.on('error', reject)
    request.end(options.body || null)
  })
}

async function fetchProfileAuthState(profile) {
  try {
    const targetUrl = new URL('/api/auth/me', `${profile.baseUrl}/`)
    const cookieHeader = getStoredCookieHeader(profile.id)
    const headers = {
      accept: 'application/json',
    }
    if (cookieHeader) {
      headers.cookie = cookieHeader
    }

    const response = await requestJson(targetUrl, { headers })
    const payload = response.payload
    if (!response.ok || !payload?.authenticated || !payload.user) {
      return {
        authenticated: false,
        userId: null,
        username: '',
        captureSessionId: '',
        error: response.ok ? '' : `HTTP ${response.statusCode}`,
      }
    }

    return {
      authenticated: true,
      userId: String(payload.user.id || ''),
      username: String(payload.user.username || ''),
      captureSessionId: String(payload.user.captureSessionId || ''),
      error: '',
    }
  } catch (error) {
    return {
      authenticated: false,
      userId: null,
      username: '',
      captureSessionId: '',
      error: error.message || 'Unable to reach server',
    }
  }
}

async function refreshProfileAuthState(profileId) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    delete desktopProfileAuthStateById[profileId]
    return null
  }

  const nextState = await fetchProfileAuthState(profile)
  desktopProfileAuthStateById[profileId] = nextState
  return nextState
}

async function refreshAllProfileAuthStates() {
  await Promise.all(desktopState.profiles.map((profile) => refreshProfileAuthState(profile.id)))
  for (const profileId of Object.keys(desktopProfileAuthStateById)) {
    if (!desktopState.profiles.some((profile) => profile.id === profileId)) {
      delete desktopProfileAuthStateById[profileId]
    }
  }
}

function captureSessionCookie(profileId, setCookieHeader) {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : []
  let changed = false

  for (const header of headers) {
    const [cookiePair = '', ...attributes] = String(header).split(';')
    const [cookieName = '', cookieValue = ''] = cookiePair.split('=')
    if (cookieName.trim() !== 'session') {
      continue
    }

    const expired = attributes.some((attribute) => {
      const [name = '', value = ''] = String(attribute).split('=')
      return name.trim().toLowerCase() === 'max-age' && Number.parseInt(String(value).trim(), 10) <= 0
    })

    if (expired || !cookieValue.trim()) {
      if (desktopState.sessionCookiesByProfileId?.[profileId]) {
        delete desktopState.sessionCookiesByProfileId[profileId]
        changed = true
      }
      continue
    }

    desktopState.sessionCookiesByProfileId[profileId] = `session=${cookieValue.trim()}`
    changed = true
  }

  if (changed) {
    writeDesktopState()
    void refreshProfileAuthState(profileId).then(() => {
      broadcastDesktopServerState()
    })
  }
}

function createDesktopProxyServer() {
  return http.createServer((req, res) => {
    let responseCompleted = false
    let upstreamResponse = null

    function markResponseCompleted() {
      responseCompleted = true
    }

    function writeProxyError(statusCode, message) {
      if (responseCompleted || res.headersSent || res.writableEnded || res.destroyed) {
        return
      }
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
      responseCompleted = true
    }

    res.once('finish', markResponseCompleted)
    res.once('close', markResponseCompleted)

    setCorsHeaders(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      responseCompleted = true
      return
    }

    const selectedProfile = getSelectedServerProfile()
    if (!selectedProfile) {
      writeProxyError(503, 'No desktop server selected')
      return
    }

    let targetUrl = null
    try {
      targetUrl = new URL(req.url || '/', `${selectedProfile.baseUrl}/`)
    } catch {
      writeProxyError(400, 'Invalid desktop proxy request URL')
      return
    }

    const proxyHeaders = { ...req.headers }
    delete proxyHeaders.host
    delete proxyHeaders.origin
    delete proxyHeaders.referer
    delete proxyHeaders.connection
    delete proxyHeaders['accept-encoding']
    proxyHeaders.cookie = getStoredCookieHeader(selectedProfile.id)

    const transport = targetUrl.protocol === 'https:' ? https : http
    const upstreamRequest = transport.request(
      targetUrl,
      {
        method: req.method,
        headers: proxyHeaders,
      },
      (nextUpstreamResponse) => {
        upstreamResponse = nextUpstreamResponse
        captureSessionCookie(selectedProfile.id, upstreamResponse.headers['set-cookie'])

        for (const [headerName, headerValue] of Object.entries(upstreamResponse.headers)) {
          if (headerValue != null && headerName.toLowerCase() !== 'set-cookie') {
            res.setHeader(headerName, headerValue)
          }
        }
        setCorsHeaders(req, res)
        res.writeHead(upstreamResponse.statusCode || 502)
        upstreamResponse.pipe(res)
      },
    )

    upstreamRequest.on('error', (error) => {
      if (responseCompleted || res.headersSent || res.writableEnded || res.destroyed) {
        logDesktop(`Desktop proxy late error for ${targetUrl}: ${error.message}`)
        res.destroy()
        return
      }
      writeProxyError(502, `Desktop proxy request failed: ${error.message}`)
    })

    upstreamRequest.on('close', () => {
      if (upstreamResponse && !upstreamResponse.destroyed && (res.destroyed || res.writableEnded)) {
        upstreamResponse.destroy()
      }
    })

    req.on('aborted', () => {
      upstreamRequest.destroy()
      if (upstreamResponse && !upstreamResponse.destroyed) {
        upstreamResponse.destroy()
      }
    })

    req.pipe(upstreamRequest)
  })
}

async function startDesktopProxy() {
  if (desktopProxyServer) {
    return
  }

  desktopProxyServer = createDesktopProxyServer()
  await new Promise((resolve, reject) => {
    desktopProxyServer.once('error', reject)
    desktopProxyServer.listen(0, '127.0.0.1', () => {
      const address = desktopProxyServer.address()
      desktopProxyBaseUrl = `http://127.0.0.1:${address.port}`
      desktopProxyServer.off('error', reject)
      resolve()
    })
  })
  logDesktop(`Desktop proxy listening at ${desktopProxyBaseUrl}`)
}

function buildRendererUrl() {
  if (rendererDevUrl) {
    return rendererDevUrl
  }
  if (!fs.existsSync(rendererEntryPath)) {
    throw new Error(`Desktop renderer build not found at ${rendererEntryPath}. Run "npm run build".`)
  }
  return pathToFileURL(rendererEntryPath).toString()
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

async function loadWindow(window, url) {
  logDesktop(`Desktop loading ${url}`)
  await window.loadURL(url)
}

function createMainWindow() {
  mainWindow = new BrowserWindow(buildWindowOptions({ title: 'Nodetrace' }))
  logDesktop('Created main BrowserWindow')
  attachWindowStateListeners(mainWindow, 'Main window')
  mainWindow.on('closed', () => {
    logDesktop('Main window closed')
    mainWindow = null
  })
  loadWindow(mainWindow, buildRendererUrl()).catch((error) => {
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

  const windowUrl = new URL(buildRendererUrl())
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

async function upsertServerProfile(id, payload) {
  const nextProfile = normalizeServerProfile(payload, id || randomUUID())
  if (!nextProfile) {
    throw new Error('A valid server name and base URL are required')
  }

  const duplicate = desktopState.profiles.find(
    (profile) => profile.baseUrl === nextProfile.baseUrl && profile.id !== nextProfile.id,
  )
  if (duplicate) {
    throw new Error('A server with that base URL already exists')
  }

  const existingIndex = desktopState.profiles.findIndex((profile) => profile.id === nextProfile.id)
  if (existingIndex >= 0) {
    desktopState.profiles[existingIndex] = nextProfile
  } else {
    desktopState.profiles.push(nextProfile)
  }

  if (!desktopState.selectedProfileId) {
    desktopState.selectedProfileId = nextProfile.id
  }

  writeDesktopState()
  await refreshProfileAuthState(nextProfile.id)
  broadcastDesktopServerState()
  return getDesktopServerState()
}

async function deleteServerProfile(id) {
  desktopState.profiles = desktopState.profiles.filter((profile) => profile.id !== id)
  delete desktopState.sessionCookiesByProfileId[id]
  delete desktopProfileAuthStateById[id]
  if (desktopState.selectedProfileId === id) {
    desktopState.selectedProfileId = desktopState.profiles[0]?.id || null
  }
  writeDesktopState()
  broadcastDesktopServerState()
  return getDesktopServerState()
}

async function selectServerProfile(id) {
  if (!desktopState.profiles.some((profile) => profile.id === id)) {
    throw new Error('Server profile not found')
  }
  desktopState.selectedProfileId = id
  writeDesktopState()
  await refreshProfileAuthState(id)
  broadcastDesktopServerState()
  return getDesktopServerState()
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
ipcMain.handle('desktop:get-server-state', async () => {
  await refreshAllProfileAuthStates()
  return getDesktopServerState()
})
ipcMain.handle('desktop:create-server-profile', (_event, profile) => upsertServerProfile(null, profile))
ipcMain.handle('desktop:update-server-profile', (_event, payload) =>
  upsertServerProfile(String(payload?.id || '').trim(), payload?.profile || {}),
)
ipcMain.handle('desktop:delete-server-profile', (_event, id) => deleteServerProfile(String(id || '').trim()))
ipcMain.handle('desktop:select-server-profile', (_event, id) => selectServerProfile(String(id || '').trim()))

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

app.on('before-quit', () => {
  desktopProxyServer?.close()
})

await app.whenReady()
readDesktopState()
await startDesktopProxy()
await refreshAllProfileAuthStates()
logDesktop(`Desktop shell starting${rendererDevUrl ? ` with renderer ${rendererDevUrl}` : ''}`)
createMainWindow()
