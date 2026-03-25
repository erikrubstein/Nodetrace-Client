export function isDesktopEnvironment() {
  return Boolean(window.nodetraceDesktop?.isElectron)
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
