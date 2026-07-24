export const panelIds = [
  'preview',
  'camera',
  'search',
  'templates',
  'inspector',
  'fields',
  'locations',
  'floorPlan',
  'settings',
  'collaborators',
]

export const defaultPanelDock = {
  preview: 'left',
  camera: 'left',
  search: 'left',
  templates: 'left',
  inspector: 'right',
  fields: 'right',
  locations: 'right',
  floorPlan: 'right',
  settings: 'right',
  collaborators: 'right',
}

export const defaultProjectSettings = {
  orientation: 'horizontal',
  horizontalGap: 72,
  verticalGap: 44,
  imageMode: 'square',
  layoutMode: 'compact',
  floorPlanEnabled: false,
}

export const defaultUserProjectUi = {
  theme: 'dark',
  workspaceMode: 'tree',
  showGrid: true,
  canvasTransform: null,
  activeFloorPlanId: null,
  floorPlanTransforms: {},
  floorPlanExpandedNodeIds: {},
  floorPlanSelectedPlacementRootIds: {},
  selectedNodeIds: [],
  treeSelectedNodeIds: [],
  floorPlanSelectedNodeIds: [],
  leftSidebarOpen: false,
  rightSidebarOpen: true,
  leftSidebarWidth: 340,
  rightSidebarWidth: 320,
  leftActivePanel: 'preview',
  rightActivePanel: 'inspector',
  panelDock: defaultPanelDock,
}
