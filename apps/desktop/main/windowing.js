export function buildWindowOptions({ appIconPath, isMac, preloadPath, overrides = {} }) {
  return {
    show: false,
    width: 1600,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#1f1f1f',
    icon: appIconPath,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 14 },
          autoHideMenuBar: false,
        }
      : {
          frame: false,
          autoHideMenuBar: true,
        }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...overrides,
  }
}

export function attachWindowStateListeners(window, label, logDesktop, options = {}) {
  const { onReadyToShow = null, autoShow = true } = options
  const emitWindowState = () => {
    window.webContents.send('desktop:window-state', { maximized: window.isMaximized() })
  }
  window.once('ready-to-show', () => {
    logDesktop(`${label} ready-to-show`)
    onReadyToShow?.()
    if (autoShow) {
      window.show()
      window.focus()
    }
    emitWindowState()
  })
  window.on('maximize', emitWindowState)
  window.on('unmaximize', emitWindowState)
  window.webContents.on('did-finish-load', () => {
    logDesktop(`${label} finished load`)
    emitWindowState()
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logDesktop(`${label} failed load: ${errorCode} ${errorDescription}`)
  })
}
