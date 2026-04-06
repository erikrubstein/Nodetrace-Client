export const DEFAULT_PANEL_MIN_WIDTH = 320

export const panelMinWidths = {
  preview: 520,
  camera: 420,
  search: 340,
  templates: 520,
  inspector: 320,
  fields: 420,
  settings: 360,
  collaborators: 360,
}

export const panelInitialWidths = {
  preview: 820,
  camera: 720,
  search: 420,
  templates: 760,
  inspector: 420,
  fields: 620,
  settings: 460,
  collaborators: 460,
}

export function getPanelMinWidth(panelId) {
  return panelMinWidths[panelId] || DEFAULT_PANEL_MIN_WIDTH
}

export function getPanelInitialWidth(panelId) {
  return Math.max(getPanelMinWidth(panelId), panelInitialWidths[panelId] || 480)
}
