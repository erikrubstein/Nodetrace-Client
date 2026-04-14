export function shouldShowMobileEntryPrompt() {
  if (typeof window === 'undefined') {
    return false
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
  const narrowViewport = window.matchMedia?.('(max-width: 920px)')?.matches ?? false
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent || '')

  return window.location.pathname === '/' && (mobileUserAgent || (coarsePointer && narrowViewport))
}
