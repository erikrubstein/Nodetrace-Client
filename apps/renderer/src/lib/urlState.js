export function getUrlState() {
  const params = new URLSearchParams(window.location.search)
  const panelWindowId = String(params.get('panelWindow') || '').trim() || null
  const projectId = String(params.get('project') || '').trim() || null
  return {
    panelWindowId,
    projectId,
  }
}

export function updateUrlState(projectId) {
  const url = new URL(window.location.href)
  if (projectId) {
    url.searchParams.set('project', String(projectId))
  } else {
    url.searchParams.delete('project')
  }
  url.searchParams.delete('node')
  window.history.replaceState({}, '', url)
}

