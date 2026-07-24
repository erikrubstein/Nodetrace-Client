import { defaultUserProjectUi, panelIds } from '../../lib/constants'

const CLIENT_THEME_STORAGE_KEY = 'nodetrace-client-theme'
const CLIENT_PANEL_LAYOUT_STORAGE_KEY = 'nodetrace-client-panel-layout'

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
  const workspaceMode = source.workspaceMode === 'floor-plan' ? 'floor-plan' : 'tree'
  const selectedNodeIds = Array.isArray(source.selectedNodeIds) ? source.selectedNodeIds.filter(Boolean) : []
  const hasTreeSelection = Array.isArray(source.treeSelectedNodeIds)
  const hasFloorPlanSelection = Array.isArray(source.floorPlanSelectedNodeIds)
  const treeSelectedNodeIds = hasTreeSelection
    ? source.treeSelectedNodeIds.filter(Boolean)
    : workspaceMode === 'tree'
      ? selectedNodeIds
      : []
  const floorPlanSelectedNodeIds = hasFloorPlanSelection
    ? source.floorPlanSelectedNodeIds.filter(Boolean)
    : workspaceMode === 'floor-plan'
      ? selectedNodeIds
      : []

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

  const floorPlanTransforms = {}
  if (source.floorPlanTransforms && typeof source.floorPlanTransforms === 'object') {
    for (const [floorPlanId, requestedTransform] of Object.entries(source.floorPlanTransforms)) {
      if (
        floorPlanId &&
        requestedTransform &&
        typeof requestedTransform === 'object' &&
        Number.isFinite(Number(requestedTransform.x)) &&
        Number.isFinite(Number(requestedTransform.y)) &&
        Number.isFinite(Number(requestedTransform.scale))
      ) {
        floorPlanTransforms[floorPlanId] = {
          x: Number(requestedTransform.x),
          y: Number(requestedTransform.y),
          scale: Math.max(0.12, Math.min(5, Number(requestedTransform.scale))),
          markerScale: Math.max(0.4, Math.min(3, Number(requestedTransform.markerScale) || 1)),
        }
      }
    }
  }

  const floorPlanExpandedNodeIds = {}
  if (source.floorPlanExpandedNodeIds && typeof source.floorPlanExpandedNodeIds === 'object') {
    for (const [floorPlanId, requestedNodeIds] of Object.entries(source.floorPlanExpandedNodeIds)) {
      if (!floorPlanId || !Array.isArray(requestedNodeIds)) {
        continue
      }
      floorPlanExpandedNodeIds[floorPlanId] = Array.from(
        new Set(requestedNodeIds.map((nodeId) => String(nodeId || '').trim()).filter(Boolean)),
      )
    }
  }

  const floorPlanSelectedPlacementRootIds = {}
  if (
    source.floorPlanSelectedPlacementRootIds &&
    typeof source.floorPlanSelectedPlacementRootIds === 'object'
  ) {
    for (const [requestedFloorPlanId, requestedRootNodeId] of Object.entries(
      source.floorPlanSelectedPlacementRootIds,
    )) {
      const floorPlanId = String(requestedFloorPlanId || '').trim()
      const rootNodeId = String(requestedRootNodeId || '').trim()
      if (floorPlanId && rootNodeId) {
        floorPlanSelectedPlacementRootIds[floorPlanId] = rootNodeId
      }
    }
  }

  return {
    workspaceMode,
    showGrid: source.showGrid == null ? defaultUserProjectUi.showGrid : Boolean(source.showGrid),
    canvasTransform,
    activeFloorPlanId: String(source.activeFloorPlanId || '').trim() || null,
    floorPlanTransforms,
    floorPlanExpandedNodeIds,
    floorPlanSelectedPlacementRootIds,
    selectedNodeIds,
    treeSelectedNodeIds,
    floorPlanSelectedNodeIds,
  }
}

export function normalizeClientPanelLayout(value) {
  const source = value && typeof value === 'object' ? value : {}
  const panelDock = { ...defaultUserProjectUi.panelDock }
  for (const panelId of panelIds) {
    const requestedSide = source.panelDock?.[panelId]
    if (requestedSide === 'left' || requestedSide === 'right') {
      panelDock[panelId] = requestedSide
    }
  }

  return {
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

export function readStoredClientPanelLayout() {
  if (typeof window === 'undefined') {
    return normalizeClientPanelLayout(defaultUserProjectUi)
  }

  try {
    const rawValue = window.localStorage.getItem(CLIENT_PANEL_LAYOUT_STORAGE_KEY)
    if (!rawValue) {
      return normalizeClientPanelLayout(defaultUserProjectUi)
    }
    return normalizeClientPanelLayout(JSON.parse(rawValue))
  } catch {
    return normalizeClientPanelLayout(defaultUserProjectUi)
  }
}

export function writeStoredClientPanelLayout(snapshot) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(
    CLIENT_PANEL_LAYOUT_STORAGE_KEY,
    JSON.stringify(normalizeClientPanelLayout(snapshot)),
  )
}
