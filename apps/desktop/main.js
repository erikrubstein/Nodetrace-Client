import path from 'node:path'
import process from 'node:process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, safeStorage, session } from 'electron'
import { getPanelInitialWidth, getPanelMinWidth } from '../../packages/shared/src/panelSizing.js'
import { resolveDesktopIconPaths } from './main/icons.js'
import { buildApplicationMenu } from './main/menu.js'
import { createSplashWindow } from './main/splash.js'
import { registerIpcHandlers } from './main/ipcHandlers.js'
import {
  clearPersistedWorkspaceState,
  getPersistedWorkspaceState,
  normalizeWorkspaceSnapshot,
  persistLastClosedWorkspaceState,
} from './main/workspacePersistence.js'
import { attachWindowStateListeners, buildWindowOptions } from './main/windowing.js'

const desktopDir = path.dirname(fileURLToPath(import.meta.url))
const repoRootDir = path.resolve(desktopDir, '../..')
const preloadPath = path.join(desktopDir, 'preload.cjs')
const desktopLogPath = path.join(repoRootDir, 'logs', 'desktop.log')
const desktopStatePath = path.join(app.getPath('userData'), 'desktop-state.json')
const rendererEntryPath = path.join(repoRootDir, 'dist', 'index.html')
const rendererDevUrl = process.argv.find((arg) => arg.startsWith('--dev-url='))?.slice('--dev-url='.length) || ''
const devDesktopPlatformOverride =
  process.argv.find((arg) => arg.startsWith('--dev-platform='))?.slice('--dev-platform='.length).trim().toLowerCase() || ''
const isMac = process.platform === 'darwin'
const { appIconPath, dockIconPath, svgLogoPath } = resolveDesktopIconPaths(repoRootDir, process.platform)
const rendererAdditionalArguments =
  devDesktopPlatformOverride === 'darwin' || devDesktopPlatformOverride === 'win32'
    ? [`--nodetrace-dev-platform=${devDesktopPlatformOverride}`]
    : []

const mainWindows = new Set()
const pendingSplashWindows = new Map()
const pendingSplashFallbackTimers = new Map()
const panelWindows = new Map()
let desktopProxyServer = null
let desktopProxyBaseUrl = ''
let profileStatusPollTimer = null
let profileStatusPollInFlight = false
let lastBroadcastDesktopServerStateSignature = ''
let desktopState = {
  profiles: [],
  selectedProfileId: null,
  sessionCookiesByProfileId: {},
  lastClosedWorkspaceByScopeKey: {},
}
let desktopProfileAuthStateById = {}
const latestWorkspaceStateByWindowId = new Map()
const PROFILE_STATUS_POLL_INTERVAL_MS = 5000
const DEFAULT_REQUEST_TIMEOUT_MS = 3500

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

function getPreferredMenuWindow() {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow && mainWindows.has(focusedWindow) && !focusedWindow.isDestroyed()) {
    return focusedWindow
  }
  return Array.from(mainWindows).find((window) => !window.isDestroyed()) || null
}

function sendMenuCommand(command) {
  const targetWindow = getPreferredMenuWindow()
  targetWindow?.webContents?.send('desktop:menu-command', { command })
}

function broadcastPanelWindowState(payload) {
  for (const window of mainWindows) {
    if (!window.isDestroyed()) {
      window.webContents.send('desktop:panel-window-state', payload)
    }
  }
}

function encryptStoredSecret(secret) {
  const normalized = String(secret || '')
  if (!normalized) {
    return ''
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Desktop credential encryption is unavailable on this system')
  }
  return safeStorage.encryptString(normalized).toString('base64')
}

function decryptStoredSecret(secret) {
  const normalized = String(secret || '').trim()
  if (!normalized) {
    return ''
  }
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(normalized, 'base64'))
    }
  } catch {
    return ''
  }
  return ''
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
  const username = String(profile?.username || '').trim().toLowerCase()
  const providedPassword = typeof profile?.password === 'string' ? profile.password : ''
  const passwordEncrypted = providedPassword ? encryptStoredSecret(providedPassword) : String(profile?.passwordEncrypted || '').trim()

  return {
    id,
    baseUrl,
    username,
    passwordEncrypted,
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
      lastClosedWorkspaceByScopeKey:
        parsed?.lastClosedWorkspaceByScopeKey && typeof parsed.lastClosedWorkspaceByScopeKey === 'object'
          ? { ...parsed.lastClosedWorkspaceByScopeKey }
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
          lastClosedWorkspaceByScopeKey: desktopState.lastClosedWorkspaceByScopeKey,
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
    connectionStatus: 'disconnected',
    error: '',
  }
}

function getDesktopServerState() {
  return {
    profiles: desktopState.profiles.map((profile) => {
      const authState = getProfileAuthState(profile.id)
      return {
        ...profile,
        ...authState,
        username: authState.username || profile.username || '',
      }
    }),
    selectedProfileId: desktopState.selectedProfileId,
    proxyBaseUrl: desktopProxyBaseUrl,
  }
}

function getDesktopServerStateSignature(payload) {
  return JSON.stringify(payload)
}

function broadcastDesktopServerState(options = {}) {
  const payload = getDesktopServerState()
  const signature = getDesktopServerStateSignature(payload)
  if (!options.force && signature === lastBroadcastDesktopServerStateSignature) {
    return false
  }
  lastBroadcastDesktopServerStateSignature = signature
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('desktop:server-state', payload)
    }
  }
  return true
}

async function refreshAndBroadcastDesktopServerState() {
  await refreshAllProfileAuthStates()
  broadcastDesktopServerState()
}

function startProfileStatusPolling() {
  if (profileStatusPollTimer) {
    return
  }

  profileStatusPollTimer = setInterval(() => {
    if (profileStatusPollInFlight) {
      return
    }
    profileStatusPollInFlight = true
    refreshAndBroadcastDesktopServerState()
      .catch((error) => {
        logDesktop(`Profile status poll failed: ${error.message}`)
      })
      .finally(() => {
        profileStatusPollInFlight = false
      })
  }, PROFILE_STATUS_POLL_INTERVAL_MS)
}

function stopProfileStatusPolling() {
  if (profileStatusPollTimer) {
    clearInterval(profileStatusPollTimer)
    profileStatusPollTimer = null
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

function getStoredPassword(profile) {
  return decryptStoredSecret(profile?.passwordEncrypted)
}

function updateStoredProfile(profileId, updates = {}) {
  const profileIndex = desktopState.profiles.findIndex((profile) => profile.id === profileId)
  if (profileIndex < 0) {
    return null
  }
  const nextProfile = normalizeServerProfile(
    {
      ...desktopState.profiles[profileIndex],
      ...updates,
    },
    profileId,
  )
  if (!nextProfile) {
    return null
  }
  desktopState.profiles[profileIndex] = nextProfile
  writeDesktopState()
  return nextProfile
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const body =
      typeof options.body === 'string' || Buffer.isBuffer(options.body)
        ? options.body
        : options.body == null
          ? null
          : String(options.body)
    const headers = { ...(options.headers || {}) }
    const timeoutMs =
      Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : DEFAULT_REQUEST_TIMEOUT_MS
    if (body != null && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
      headers['Content-Length'] = Buffer.byteLength(body)
    }
    const request = transport.request(
      url,
      {
        method: options.method || 'GET',
        headers,
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
            headers: response.headers || {},
          })
        })
      },
    )

    request.on('error', reject)
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`))
    })
    request.end(body)
  })
}

async function fetchProfileAuthState(profile) {
  const baseState = {
    authenticated: false,
    userId: null,
    username: '',
    captureSessionId: '',
    connectionStatus: 'disconnected',
    error: '',
  }

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
    if (response.ok && payload?.authenticated && payload.user) {
      const resolvedUsername = String(payload.user.username || profile.username || '').trim().toLowerCase()
      if (resolvedUsername && resolvedUsername !== profile.username) {
        updateStoredProfile(profile.id, { username: resolvedUsername })
      }
      return {
        authenticated: true,
        userId: String(payload.user.id || ''),
        username: String(payload.user.username || ''),
        captureSessionId: String(payload.user.captureSessionId || ''),
        connectionStatus: 'connected',
        error: '',
      }
    }

    if (!response.ok) {
      return {
        ...baseState,
        error: `HTTP ${response.statusCode}`,
      }
    }

    const savedUsername = String(profile.username || '').trim().toLowerCase()
    const savedPassword = getStoredPassword(profile)
    if (!savedUsername || !savedPassword) {
      return {
        ...baseState,
        connectionStatus: 'invalid_login',
        error: 'Saved credentials are incomplete',
      }
    }

    const loginResponse = await requestJson(new URL('/api/auth/login', `${profile.baseUrl}/`), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: savedUsername,
        password: savedPassword,
      }),
    })

    if (!loginResponse.ok) {
      return {
        ...baseState,
        error: `HTTP ${loginResponse.statusCode}`,
      }
    }

    if (loginResponse.payload?.ok === false) {
      return {
        ...baseState,
        connectionStatus: 'invalid_login',
        error: String(loginResponse.payload.error || 'Invalid username or password'),
      }
    }

    captureSessionCookie(profile.id, loginResponse.headers['set-cookie'], false)
    const resolvedUsername = String(loginResponse.payload?.username || savedUsername).trim().toLowerCase()
    if (resolvedUsername && resolvedUsername !== profile.username) {
      updateStoredProfile(profile.id, { username: resolvedUsername })
    }

    return {
      authenticated: true,
      userId: String(loginResponse.payload?.id || ''),
      username: String(loginResponse.payload?.username || savedUsername),
      captureSessionId: String(loginResponse.payload?.captureSessionId || ''),
      connectionStatus: 'connected',
      error: '',
    }
  } catch (error) {
    return {
      ...baseState,
      error: error.message || 'Unable to reach server',
    }
  }
}

async function refreshProfileAuthState(profileId, options = {}) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    delete desktopProfileAuthStateById[profileId]
    return null
  }

  if (options.showConnecting) {
    desktopProfileAuthStateById[profileId] = {
      authenticated: false,
      userId: null,
      username: String(profile.username || ''),
      captureSessionId: '',
      connectionStatus: 'connecting',
      error: '',
    }
    if (options.broadcastConnecting) {
      broadcastDesktopServerState({ force: true })
    }
  }

  const nextState = await fetchProfileAuthState(profile)
  desktopProfileAuthStateById[profileId] = nextState
  return nextState
}

async function refreshAllProfileAuthStates(options = {}) {
  await Promise.all(
    desktopState.profiles.map((profile) =>
      refreshProfileAuthState(profile.id, {
        showConnecting: options.showConnecting === true,
        broadcastConnecting: false,
      }),
    ),
  )
  for (const profileId of Object.keys(desktopProfileAuthStateById)) {
    if (!desktopState.profiles.some((profile) => profile.id === profileId)) {
      delete desktopProfileAuthStateById[profileId]
    }
  }
}

function captureSessionCookie(profileId, setCookieHeader, refresh = true) {
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
    if (refresh) {
      void refreshProfileAuthState(profileId).then(() => {
        broadcastDesktopServerState()
      })
    }
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
    if (!rendererAdditionalArguments.length) {
      return rendererDevUrl
    }
    const url = new URL(rendererDevUrl)
    const requestedPlatform = rendererAdditionalArguments[0]?.split('=').slice(1).join('=').trim()
    if (requestedPlatform) {
      url.searchParams.set('devPlatform', requestedPlatform)
    }
    return url.toString()
  }
  if (!fs.existsSync(rendererEntryPath)) {
    throw new Error(`Desktop renderer build not found at ${rendererEntryPath}. Run "npm run build".`)
  }
  const fileUrl = pathToFileURL(rendererEntryPath)
  const requestedPlatform = rendererAdditionalArguments[0]?.split('=').slice(1).join('=').trim()
  if (requestedPlatform) {
    fileUrl.searchParams.set('devPlatform', requestedPlatform)
  }
  return fileUrl.toString()
}

function resolvePendingSplash(window, contentsId, { showWindow = true } = {}) {
  const fallbackTimer = pendingSplashFallbackTimers.get(contentsId)
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    pendingSplashFallbackTimers.delete(contentsId)
  }

  if (window && !window.isDestroyed() && showWindow && !window.isVisible()) {
    window.show()
    window.focus()
  }

  const splashWindow = pendingSplashWindows.get(contentsId)
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy()
  }
  pendingSplashWindows.delete(contentsId)
}

async function loadWindow(window, url) {
  logDesktop(`Desktop loading ${url}`)
  await window.loadURL(url)
}

function closeAllPanelWindows() {
  for (const [panelId, panelWindow] of panelWindows.entries()) {
    if (!panelWindow.isDestroyed()) {
      panelWindow.destroy()
    }
    panelWindows.delete(panelId)
  }
}

function createMainWindow(options = {}) {
  const { showSplash = false } = options
  const splashWindow = showSplash ? createSplashWindow({ BrowserWindow, appIconPath, fs, svgLogoPath }) : null
  const mainWindow = new BrowserWindow(
    buildWindowOptions({
      appIconPath,
      isMac,
      preloadPath,
      additionalArguments: rendererAdditionalArguments,
      overrides: { title: 'Nodetrace' },
    }),
  )
  const mainContentsId = mainWindow.webContents.id
  mainWindows.add(mainWindow)
  if (splashWindow) {
    pendingSplashWindows.set(mainContentsId, splashWindow)
    const fallbackTimer = setTimeout(() => {
      logDesktop('Splash fallback resolved main window visibility')
      resolvePendingSplash(mainWindow, mainContentsId, { showWindow: true })
    }, 8000)
    pendingSplashFallbackTimers.set(mainContentsId, fallbackTimer)
  }
  logDesktop('Created main BrowserWindow')
  attachWindowStateListeners(mainWindow, 'Main window', logDesktop, {
    autoShow: !showSplash,
  })
  mainWindow.on('close', () => {
    closeAllPanelWindows()
  })
  mainWindow.on('closed', () => {
    logDesktop('Main window closed')
    const latestWorkspaceState = latestWorkspaceStateByWindowId.get(mainContentsId)
    if (latestWorkspaceState?.scopeKey && latestWorkspaceState?.projectId) {
      persistLastClosedWorkspaceState(desktopStatePath, desktopState, writeDesktopState, latestWorkspaceState.scopeKey, {
        projectId: latestWorkspaceState.projectId,
        closedAt: Date.now(),
        snapshot: latestWorkspaceState.snapshot,
      })
    }
    latestWorkspaceStateByWindowId.delete(mainContentsId)
    mainWindows.delete(mainWindow)
    closeAllPanelWindows()
    resolvePendingSplash(null, mainContentsId, { showWindow: false })
  })
  loadWindow(mainWindow, buildRendererUrl()).catch((error) => {
    logDesktop(`Main window load error: ${error.message}`)
    resolvePendingSplash(mainWindow, mainContentsId, { showWindow: true })
    mainWindow.loadURL(`data:text/plain,${encodeURIComponent(error.message)}`).catch(() => {})
  })
  return mainWindow
}

function launchDetachedMainProcess() {
  const childArgs = app.isPackaged ? [] : [path.join(repoRootDir, 'apps', 'desktop')]
  if (!app.isPackaged && rendererDevUrl) {
    childArgs.push(`--dev-url=${rendererDevUrl}`)
  }

  const child = spawn(process.execPath, childArgs, {
    cwd: app.isPackaged ? path.dirname(process.execPath) : repoRootDir,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return { ok: true }
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
      appIconPath,
      isMac,
      preloadPath,
      additionalArguments: rendererAdditionalArguments,
      overrides: {
        title: `Nodetrace - ${panelId}`,
        width: getPanelInitialWidth(panelId),
        height: 760,
        minWidth: getPanelMinWidth(panelId),
        minHeight: 360,
      },
    }),
  )
  panelWindows.set(panelId, panelWindow)
  attachWindowStateListeners(panelWindow, `Panel window ${panelId}`, logDesktop)
  panelWindow.on('closed', () => {
    panelWindows.delete(panelId)
    broadcastPanelWindowState({ panelId, open: false })
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

  broadcastPanelWindowState({ panelId, open: true })

  return { ok: true, panelId }
}

async function upsertServerProfile(id, payload) {
  const existingProfile = id ? desktopState.profiles.find((profile) => profile.id === id) || null : null
  const mergedProfile = {
    ...(existingProfile || {}),
    ...(payload || {}),
  }
  if (existingProfile && typeof payload?.password === 'string' && !payload.password) {
    delete mergedProfile.password
  }

  const nextProfile = normalizeServerProfile(mergedProfile, id || randomUUID())
  if (!nextProfile) {
    throw new Error('A valid server URL, username, and password are required')
  }

  if (!nextProfile.username || !nextProfile.passwordEncrypted) {
    throw new Error('A valid server URL, username, and password are required')
  }

  const duplicate = desktopState.profiles.find(
    (profile) =>
      profile.baseUrl === nextProfile.baseUrl &&
      profile.username === nextProfile.username &&
      profile.id !== nextProfile.id,
  )
  if (duplicate) {
    throw new Error('That account already exists for this server')
  }

  let registrationCookies = null

  if (payload?.authMode === 'register') {
    const registerResponse = await requestJson(new URL('/api/auth/register', `${nextProfile.baseUrl}/`), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: nextProfile.username,
        password: getStoredPassword(nextProfile),
      }),
    })

    if (!registerResponse.ok && !registerResponse.payload) {
      throw new Error(`Unable to register on that server (HTTP ${registerResponse.statusCode})`)
    }

    if (registerResponse.payload?.ok === false) {
      throw new Error(String(registerResponse.payload.error || 'Unable to register that account'))
    }

    registrationCookies = registerResponse.headers?.['set-cookie'] || null
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

  delete desktopState.sessionCookiesByProfileId[nextProfile.id]
  if (registrationCookies) {
    captureSessionCookie(nextProfile.id, registrationCookies, false)
  } else {
    writeDesktopState()
  }

  await refreshProfileAuthState(nextProfile.id, { showConnecting: true, broadcastConnecting: true })
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
  await refreshProfileAuthState(id, { showConnecting: true, broadcastConnecting: true })
  broadcastDesktopServerState()
  return getDesktopServerState()
}

async function listProjectsForProfile(profileId) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new Error('Server profile not found')
  }

  const targetUrl = new URL('/api/projects', `${profile.baseUrl}/`)
  const headers = {
    accept: 'application/json',
  }
  const cookieHeader = getStoredCookieHeader(profile.id)
  if (cookieHeader) {
    headers.cookie = cookieHeader
  }

  const response = await requestJson(targetUrl, { headers })
  if (!response.ok) {
    throw new Error(`Unable to load projects for that server profile (HTTP ${response.statusCode})`)
  }
  return Array.isArray(response.payload) ? response.payload : []
}

async function createProjectForProfile(profileId, name) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new Error('Server profile not found')
  }

  const projectName = String(name || '').trim()
  if (!projectName) {
    throw new Error('Project name is required')
  }

  const targetUrl = new URL('/api/projects', `${profile.baseUrl}/`)
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
  }
  const cookieHeader = getStoredCookieHeader(profile.id)
  if (cookieHeader) {
    headers.cookie = cookieHeader
  }

  const response = await requestJson(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectName,
      description: '',
    }),
  })

  if (!response.ok) {
    throw new Error(String(response.payload?.error || `Unable to create a project on that server (HTTP ${response.statusCode})`))
  }

  return response.payload
}

async function patchProjectPreferencesForProfile(profileId, projectId, projectUi) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new Error('Server profile not found')
  }

  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId) {
    throw new Error('Project id is required')
  }

  const targetUrl = new URL(`/api/projects/${normalizedProjectId}/preferences`, `${profile.baseUrl}/`)
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
  }
  const cookieHeader = getStoredCookieHeader(profile.id)
  if (cookieHeader) {
    headers.cookie = cookieHeader
  }

  const response = await requestJson(targetUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(projectUi || {}),
  })

  if (!response.ok) {
    throw new Error(String(response.payload?.error || `Unable to save project preferences (HTTP ${response.statusCode})`))
  }

  return response.payload
}

async function patchProfileAccountUsername(profileId, username) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new Error('Server profile not found')
  }

  const response = await requestJson(new URL('/api/account/username', `${profile.baseUrl}/`), {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: getStoredCookieHeader(profile.id),
    },
    body: JSON.stringify({ username }),
  })

  if (!response.ok && !response.payload) {
    throw new Error(`Unable to change username for that server profile (HTTP ${response.statusCode})`)
  }
  if (response.payload?.ok === false) {
    throw new Error(String(response.payload.error || 'Unable to change username'))
  }

  const resolvedUsername = String(response.payload?.username || username || '').trim().toLowerCase()
  if (resolvedUsername) {
    updateStoredProfile(profile.id, { username: resolvedUsername })
  }
  await refreshProfileAuthState(profile.id)
  broadcastDesktopServerState()
  return {
    ok: true,
    user: response.payload || null,
    desktopState: getDesktopServerState(),
  }
}

async function patchProfileAccountPassword(profileId, currentPassword, newPassword) {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new Error('Server profile not found')
  }

  const response = await requestJson(new URL('/api/account/password', `${profile.baseUrl}/`), {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: getStoredCookieHeader(profile.id),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  })

  if (!response.ok && response.statusCode !== 204 && !response.payload) {
    throw new Error(`Unable to change password for that server profile (HTTP ${response.statusCode})`)
  }
  if (response.payload?.ok === false) {
    throw new Error(String(response.payload.error || 'Unable to change password'))
  }

  updateStoredProfile(profile.id, { password: newPassword })
  await refreshProfileAuthState(profile.id)
  broadcastDesktopServerState()
  return {
    ok: true,
    desktopState: getDesktopServerState(),
  }
}

async function deleteProfileAccount(profileId, username, activeProfileId = '') {
  const profile = desktopState.profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    throw new Error('Server profile not found')
  }

  const savedPassword = getStoredPassword(profile)

  const response = await requestJson(new URL('/api/account', `${profile.baseUrl}/`), {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: getStoredCookieHeader(profile.id),
    },
    body: JSON.stringify({ username }),
  })

  if (!response.ok && response.statusCode !== 204 && !response.payload) {
    throw new Error(`Unable to delete that server account (HTTP ${response.statusCode})`)
  }
  if (response.payload?.ok === false) {
    throw new Error(String(response.payload.error || 'Unable to delete account'))
  }

  if (savedPassword) {
    const verificationResponse = await requestJson(new URL('/api/auth/login', `${profile.baseUrl}/`), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: profile.username,
        password: savedPassword,
      }),
    })

    if (verificationResponse.ok && verificationResponse.payload?.ok !== false) {
      throw new Error('The account still exists on the server.')
    }
  }

  delete desktopState.sessionCookiesByProfileId[profile.id]
  delete desktopProfileAuthStateById[profile.id]
  desktopState.profiles = desktopState.profiles.filter((entry) => entry.id !== profile.id)
  if (desktopState.selectedProfileId === profile.id) {
    const preferredSelectedProfileId =
      activeProfileId && desktopState.profiles.some((entry) => entry.id === activeProfileId)
        ? activeProfileId
        : desktopState.profiles[0]?.id || null
    desktopState.selectedProfileId = preferredSelectedProfileId
  }
  writeDesktopState()
  if (desktopState.selectedProfileId) {
    await refreshProfileAuthState(desktopState.selectedProfileId, { showConnecting: true, broadcastConnecting: true })
  }
  broadcastDesktopServerState()
  return {
    ok: true,
    desktopState: getDesktopServerState(),
  }
}

function getEventWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

registerIpcHandlers({
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  clearPersistedWorkspaceState: (scopeKey) =>
    clearPersistedWorkspaceState(desktopStatePath, desktopState, writeDesktopState, scopeKey),
  getDesktopServerState,
  getEventWindow,
  getPersistedWorkspaceState: (scopeKey) => getPersistedWorkspaceState(desktopStatePath, scopeKey),
  latestWorkspaceStateByWindowId,
  launchDetachedMainProcess,
  normalizeWorkspaceSnapshot,
  openPanelWindow,
  refreshAndBroadcastDesktopServerState,
  selectServerProfile,
  upsertServerProfile,
  deleteServerProfile,
  createProjectForProfile,
  patchProjectPreferencesForProfile,
  listProjectsForProfile,
  patchProfileAccountUsername,
  patchProfileAccountPassword,
  deleteProfileAccount,
  resolvePendingSplash,
  session,
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindows.size === 0) {
    createMainWindow()
  }
})

app.on('before-quit', () => {
  stopProfileStatusPolling()
  desktopProxyServer?.close()
})

await app.whenReady()
app.setName('Nodetrace')
if (isMac) {
  Menu.setApplicationMenu(
    buildApplicationMenu({
      Menu,
      isMac,
      appVersion: app.getVersion(),
      sendMenuCommand,
      launchDetachedMainProcess,
    }),
  )
  const dockIcon = nativeImage.createFromPath(dockIconPath)
  if (!dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon)
  }
}
readDesktopState()
await startDesktopProxy()
logDesktop(`Desktop shell starting${rendererDevUrl ? ` with renderer ${rendererDevUrl}` : ''}`)
createMainWindow({ showSplash: true })
void refreshAllProfileAuthStates({ showConnecting: true })
  .then(() => {
    broadcastDesktopServerState({ force: true })
  })
  .catch((error) => {
    logDesktop(`Initial desktop server refresh failed: ${error.message}`)
  })
startProfileStatusPolling()
