const ID_FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateShortId() {
  let value = ID_FIRST_CHARS[Math.floor(Math.random() * ID_FIRST_CHARS.length)]
  for (let index = 1; index < 5; index += 1) {
    value += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  }
  return value
}

export function getOrCreateSessionId() {
  const storedValue = String(localStorage.getItem('desktop-session-id') || '').trim().toLowerCase()
  if (/^[a-z][a-z0-9]{4}$/.test(storedValue)) {
    return storedValue
  }

  const generated = generateShortId()
  localStorage.setItem('desktop-session-id', generated)
  return generated
}

export function readStoredBoolean(key, fallback) {
  const value = localStorage.getItem(key)
  if (value == null) {
    return fallback
  }
  return value === 'true'
}

export function readStoredNumber(key, fallback) {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}
