function getRuntimeBaseUrl() {
  const baseUrl = String(import.meta.env.BASE_URL || '/').trim()
  if (typeof window === 'undefined') {
    return baseUrl
  }
  return new URL(baseUrl, window.location.href).toString()
}

export function resolvePublicAssetUrl(assetPath) {
  const normalizedPath = String(assetPath || '').replace(/^\/+/, '')
  if (!normalizedPath) {
    return ''
  }
  return new URL(normalizedPath, getRuntimeBaseUrl()).toString()
}

export function isCaptureRoute() {
  if (typeof window === 'undefined') {
    return false
  }
  const url = new URL(window.location.href)
  return url.pathname === '/capture' || url.searchParams.get('screen') === 'capture'
}

export function navigateToCapture() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (url.protocol === 'file:') {
    url.searchParams.set('screen', 'capture')
    window.location.assign(url.toString())
    return
  }

  window.location.assign('/capture')
}
