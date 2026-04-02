export function isDesktopEnvironment() {
  return Boolean(window.nodetraceDesktop?.isElectron)
}

function normalizeDesktopError(error) {
  const rawMessage = String(error?.message || error || '').trim()
  let message = rawMessage
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (!message) {
    message = 'Desktop request failed'
  }

  if (!/[.!?]$/.test(message)) {
    message = `${message}.`
  }

  return new Error(message)
}

export function openDesktopPanelWindow({ panelId, projectId = null, nodeId = null }) {
  if (!isDesktopEnvironment()) {
    return Promise.resolve({ ok: false })
  }

  return window.nodetraceDesktop.openWindow({
    panelId,
    projectId,
    nodeId,
  })
}

export function closeDesktopWindow() {
  return window.nodetraceDesktop?.closeWindow?.()
}

export function minimizeDesktopWindow() {
  return window.nodetraceDesktop?.minimizeWindow?.()
}

export function toggleMaximizeDesktopWindow() {
  return window.nodetraceDesktop?.toggleMaximizeWindow?.()
}

export function getDesktopWindowState() {
  return window.nodetraceDesktop?.getWindowState?.() || Promise.resolve({ maximized: false })
}

export function subscribeDesktopWindowState(callback) {
  return window.nodetraceDesktop?.onWindowStateChange?.(callback) || (() => {})
}

export function getDesktopServerState() {
  return (
    window.nodetraceDesktop?.getServerState?.().catch((error) => {
      throw normalizeDesktopError(error)
    }) ||
    Promise.resolve({
      profiles: [],
      selectedProfileId: null,
      proxyBaseUrl: '',
    })
  )
}

export function createDesktopServerProfile(profile) {
  return (
    window.nodetraceDesktop?.createServerProfile?.(profile).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function updateDesktopServerProfile(id, profile) {
  return (
    window.nodetraceDesktop?.updateServerProfile?.(id, profile).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function deleteDesktopServerProfile(id) {
  return (
    window.nodetraceDesktop?.deleteServerProfile?.(id).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function selectDesktopServerProfile(id) {
  return (
    window.nodetraceDesktop?.selectServerProfile?.(id).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function createDesktopProjectForProfile(id, name) {
  return (
    window.nodetraceDesktop?.createProjectForProfile?.(id, name).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function listDesktopProjectsForProfile(id) {
  return (
    window.nodetraceDesktop?.listProjectsForProfile?.(id).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve([])
  )
}

export function changeDesktopProfileAccountUsername(id, username) {
  return (
    window.nodetraceDesktop?.changeProfileAccountUsername?.(id, username).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function changeDesktopProfileAccountPassword(id, currentPassword, newPassword) {
  return (
    window.nodetraceDesktop?.changeProfileAccountPassword?.(id, currentPassword, newPassword).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function deleteDesktopProfileAccount(id, username) {
  return (
    window.nodetraceDesktop?.deleteProfileAccount?.(id, username).catch((error) => {
      throw normalizeDesktopError(error)
    }) || Promise.resolve(null)
  )
}

export function subscribeDesktopServerState(callback) {
  return window.nodetraceDesktop?.onServerStateChange?.(callback) || (() => {})
}
