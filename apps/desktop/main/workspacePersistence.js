import fs from 'node:fs'

export function readLastClosedWorkspaceMapFromDisk(desktopStatePath) {
  try {
    if (!fs.existsSync(desktopStatePath)) {
      return {}
    }
    const parsed = JSON.parse(fs.readFileSync(desktopStatePath, 'utf8'))
    return parsed?.lastClosedWorkspaceByScopeKey && typeof parsed.lastClosedWorkspaceByScopeKey === 'object'
      ? { ...parsed.lastClosedWorkspaceByScopeKey }
      : {}
  } catch {
    return {}
  }
}

export function normalizeWorkspaceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null
  }
  return {
    showGrid: snapshot.showGrid == null ? undefined : Boolean(snapshot.showGrid),
    canvasTransform:
      snapshot.canvasTransform &&
      typeof snapshot.canvasTransform === 'object' &&
      Number.isFinite(Number(snapshot.canvasTransform.x)) &&
      Number.isFinite(Number(snapshot.canvasTransform.y)) &&
      Number.isFinite(Number(snapshot.canvasTransform.scale))
        ? {
            x: Number(snapshot.canvasTransform.x),
            y: Number(snapshot.canvasTransform.y),
            scale: Number(snapshot.canvasTransform.scale),
          }
        : null,
    selectedNodeIds: Array.isArray(snapshot.selectedNodeIds) ? snapshot.selectedNodeIds.filter(Boolean) : [],
    leftSidebarOpen: snapshot.leftSidebarOpen == null ? undefined : Boolean(snapshot.leftSidebarOpen),
    rightSidebarOpen: snapshot.rightSidebarOpen == null ? undefined : Boolean(snapshot.rightSidebarOpen),
    leftSidebarWidth: Number.isFinite(Number(snapshot.leftSidebarWidth)) ? Number(snapshot.leftSidebarWidth) : undefined,
    rightSidebarWidth: Number.isFinite(Number(snapshot.rightSidebarWidth)) ? Number(snapshot.rightSidebarWidth) : undefined,
    leftActivePanel: typeof snapshot.leftActivePanel === 'string' ? snapshot.leftActivePanel : undefined,
    rightActivePanel: typeof snapshot.rightActivePanel === 'string' ? snapshot.rightActivePanel : undefined,
    panelDock: snapshot.panelDock && typeof snapshot.panelDock === 'object' ? { ...snapshot.panelDock } : undefined,
  }
}

export function getPersistedWorkspaceState(desktopStatePath, scopeKey) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  if (!normalizedScopeKey) {
    return null
  }
  const diskMap = readLastClosedWorkspaceMapFromDisk(desktopStatePath)
  const entry = diskMap[normalizedScopeKey]
  if (!entry || typeof entry !== 'object') {
    return null
  }
  const projectId = String(entry.projectId || '').trim()
  if (!projectId) {
    return null
  }
  return {
    projectId,
    closedAt: Number(entry.closedAt || 0) || 0,
    snapshot: normalizeWorkspaceSnapshot(entry.snapshot),
  }
}

export function clearPersistedWorkspaceState(desktopStatePath, desktopState, writeDesktopState, scopeKey) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  if (!normalizedScopeKey) {
    return
  }

  const diskMap = readLastClosedWorkspaceMapFromDisk(desktopStatePath)
  if (!Object.prototype.hasOwnProperty.call(diskMap, normalizedScopeKey)) {
    return
  }

  delete diskMap[normalizedScopeKey]
  desktopState.lastClosedWorkspaceByScopeKey = diskMap
  writeDesktopState()
}

export function persistLastClosedWorkspaceState(desktopStatePath, desktopState, writeDesktopState, scopeKey, payload) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const projectId = String(payload?.projectId || '').trim()
  if (!normalizedScopeKey || !projectId) {
    return
  }

  const closedAt = Number.isFinite(Number(payload?.closedAt)) ? Number(payload.closedAt) : Date.now()
  const snapshot = normalizeWorkspaceSnapshot(payload?.snapshot)
  const diskMap = readLastClosedWorkspaceMapFromDisk(desktopStatePath)
  const currentEntry = diskMap[normalizedScopeKey]
  if (currentEntry && Number(currentEntry.closedAt || 0) > closedAt) {
    return
  }

  diskMap[normalizedScopeKey] = {
    projectId,
    closedAt,
    snapshot,
  }
  desktopState.lastClosedWorkspaceByScopeKey = diskMap
  writeDesktopState()
}
