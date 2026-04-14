const PRESENCE_COLORS = ['#6f9cff', '#5fc9a8', '#d48cff', '#f0a35b', '#58c5d8', '#d86f9f', '#a6c95b', '#c27cff']

export function getPresenceColor(id) {
  const value = String(id || '')
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

export function getPresenceInitials(username) {
  const parts = String(username || '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (!parts.length) {
    return '?'
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}
