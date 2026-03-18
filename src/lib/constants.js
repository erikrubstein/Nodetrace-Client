export const NODE_WIDTH = 112
export const NODE_HEIGHT = 112
export const MIN_INSPECTOR_WIDTH = 240
export const SIDEBAR_RAIL_WIDTH = 38
export const VARIANT_VISUAL_SIZE = 78
export const VARIANT_VISUAL_OFFSET = Math.round((NODE_WIDTH - VARIANT_VISUAL_SIZE) / 2)

export const panelIds = ['preview', 'camera', 'inspector', 'settings', 'account']
export const defaultPanelDock = {
  preview: 'left',
  camera: 'left',
  inspector: 'right',
  settings: 'right',
  account: 'right',
}

export const defaultProjectSettings = {
  orientation: 'horizontal',
  horizontalGap: 72,
  verticalGap: 44,
  imageMode: 'square',
  layoutMode: 'compact',
}

export const defaultUserProjectUi = {
  theme: 'dark',
  showGrid: true,
  leftSidebarOpen: false,
  rightSidebarOpen: true,
  leftSidebarWidth: 340,
  rightSidebarWidth: 320,
  leftActivePanel: 'preview',
  rightActivePanel: 'inspector',
  panelDock: defaultPanelDock,
}

