import { defaultUserProjectUi, panelIds } from '../../lib/constants'

const CLIENT_THEME_STORAGE_KEY = 'nodetrace-client-theme'
const CLIENT_PROJECT_UI_STORAGE_KEY = 'nodetrace-client-project-ui'
const CLIENT_LAST_PROJECT_STORAGE_KEY = 'nodetrace-client-last-project'

export function getStoredClientTheme() {
  if (typeof window === 'undefined') {
    return defaultUserProjectUi.theme
  }

  const storedTheme = window.localStorage.getItem(CLIENT_THEME_STORAGE_KEY)
  return storedTheme === 'light' ? 'light' : storedTheme === 'dark' ? 'dark' : defaultUserProjectUi.theme
}

export function writeStoredClientTheme(theme) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(CLIENT_THEME_STORAGE_KEY, theme)
}

export function normalizeClientProjectUi(value) {
  const source = value && typeof value === 'object' ? value : {}
  const panelDock = { ...defaultUserProjectUi.panelDock }
  for (const panelId of panelIds) {
    const requestedSide = source.panelDock?.[panelId]
    if (requestedSide === 'left' || requestedSide === 'right') {
      panelDock[panelId] = requestedSide
    }
  }

  const canvasTransform =
    source.canvasTransform &&
    typeof source.canvasTransform === 'object' &&
    Number.isFinite(Number(source.canvasTransform.x)) &&
    Number.isFinite(Number(source.canvasTransform.y)) &&
    Number.isFinite(Number(source.canvasTransform.scale))
      ? {
          x: Number(source.canvasTransform.x),
          y: Number(source.canvasTransform.y),
          scale: Number(source.canvasTransform.scale),
        }
      : null

  return {
    showGrid: source.showGrid == null ? defaultUserProjectUi.showGrid : Boolean(source.showGrid),
    canvasTransform,
    selectedNodeIds: Array.isArray(source.selectedNodeIds) ? source.selectedNodeIds.filter(Boolean) : [],
    leftSidebarOpen: source.leftSidebarOpen == null ? defaultUserProjectUi.leftSidebarOpen : Boolean(source.leftSidebarOpen),
    rightSidebarOpen:
      source.rightSidebarOpen == null ? defaultUserProjectUi.rightSidebarOpen : Boolean(source.rightSidebarOpen),
    leftSidebarWidth: Math.max(
      220,
      Math.min(720, Number(source.leftSidebarWidth) || defaultUserProjectUi.leftSidebarWidth),
    ),
    rightSidebarWidth: Math.max(
      220,
      Math.min(720, Number(source.rightSidebarWidth) || defaultUserProjectUi.rightSidebarWidth),
    ),
    leftActivePanel: panelIds.includes(source.leftActivePanel) ? source.leftActivePanel : defaultUserProjectUi.leftActivePanel,
    rightActivePanel: panelIds.includes(source.rightActivePanel)
      ? source.rightActivePanel
      : defaultUserProjectUi.rightActivePanel,
    panelDock,
  }
}

export function buildClientProjectUiScopeKey({
  desktopEnvironment = false,
  currentUserId = '',
  currentUsername = '',
  serverBaseUrl = '',
}) {
  const userPart = String(currentUserId || currentUsername || 'anonymous').trim().toLowerCase()
  const scopeTarget =
    desktopEnvironment
      ? String(serverBaseUrl || 'desktop').trim().toLowerCase()
      : String(window.location.origin || 'web').trim().toLowerCase()
  return `${desktopEnvironment ? 'desktop' : 'web'}::${scopeTarget}::${userPart}`
}

export function getClientProjectUiStorageKey(scopeKey, projectId) {
  return `${CLIENT_PROJECT_UI_STORAGE_KEY}::${scopeKey}::${String(projectId || '').trim()}`
}

export function getClientLastProjectStorageKey(scopeKey) {
  return `${CLIENT_LAST_PROJECT_STORAGE_KEY}::${scopeKey}`
}

export function readStoredLastProjectEntry(scopeKey) {
  if (typeof window === 'undefined' || !scopeKey) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(getClientLastProjectStorageKey(scopeKey))
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)
    if (parsedValue && typeof parsedValue === 'object') {
      const projectId = String(parsedValue.projectId || '').trim()
      const closedAt = Number(parsedValue.closedAt || 0)
      if (!projectId) {
        return null
      }
      return {
        projectId,
        closedAt: Number.isFinite(closedAt) ? closedAt : 0,
      }
    }
  } catch {
    const legacyValue = String(window.localStorage.getItem(getClientLastProjectStorageKey(scopeKey)) || '').trim()
    if (legacyValue) {
      return { projectId: legacyValue, closedAt: 0 }
    }
  }

  return null
}

export function readStoredClientProjectUi(scopeKey, projectId) {
  if (typeof window === 'undefined' || !scopeKey || !projectId) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(getClientProjectUiStorageKey(scopeKey, projectId))
    if (!rawValue) {
      return null
    }
    return normalizeClientProjectUi(JSON.parse(rawValue))
  } catch {
    return null
  }
}

export function writeStoredClientProjectUi(scopeKey, projectId, snapshot) {
  if (typeof window === 'undefined' || !scopeKey || !projectId) {
    return
  }
  window.localStorage.setItem(
    getClientProjectUiStorageKey(scopeKey, projectId),
    JSON.stringify(normalizeClientProjectUi(snapshot)),
  )
}

export function readStoredLastProjectId(scopeKey) {
  return readStoredLastProjectEntry(scopeKey)?.projectId || null
}

export function writeStoredLastProjectId(scopeKey, projectId, closedAt = Date.now()) {
  if (typeof window === 'undefined' || !scopeKey) {
    return
  }
  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId) {
    window.localStorage.removeItem(getClientLastProjectStorageKey(scopeKey))
    return
  }

  const nextClosedAt = Number.isFinite(Number(closedAt)) ? Number(closedAt) : Date.now()
  const currentEntry = readStoredLastProjectEntry(scopeKey)
  if (currentEntry && Number(currentEntry.closedAt || 0) > nextClosedAt) {
    return
  }

  window.localStorage.setItem(
    getClientLastProjectStorageKey(scopeKey),
    JSON.stringify({
      projectId: normalizedProjectId,
      closedAt: nextClosedAt,
    }),
  )
}
