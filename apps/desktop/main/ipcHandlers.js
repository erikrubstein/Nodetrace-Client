export function registerIpcHandlers({
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  clearPersistedWorkspaceState,
  getDesktopServerState,
  getEventWindow,
  getPersistedWorkspaceState,
  latestWorkspaceStateByWindowId,
  launchDetachedMainProcess,
  normalizeWorkspaceSnapshot,
  openPanelWindow,
  refreshAndBroadcastDesktopServerState,
  selectServerProfile,
  upsertServerProfile,
  deleteServerProfile,
  createProjectForProfile,
  listProjectsForProfile,
  patchProfileAccountUsername,
  patchProfileAccountPassword,
  deleteProfileAccount,
  resolvePendingSplash,
  session,
}) {
  ipcMain.handle('desktop:open-window', (_event, options) => openPanelWindow(options))
  ipcMain.handle('desktop:open-main-window', () => launchDetachedMainProcess())
  ipcMain.on('desktop:renderer-ready', (event) => {
    const contentsId = event.sender.id
    const window = BrowserWindow.fromWebContents(event.sender)
    resolvePendingSplash(window, contentsId, { showWindow: true })
  })
  ipcMain.handle('desktop:close-window', (event) => {
    getEventWindow(event)?.close()
  })
  ipcMain.handle('desktop:minimize-window', (event) => {
    getEventWindow(event)?.minimize()
  })
  ipcMain.handle('desktop:toggle-maximize-window', (event) => {
    const window = getEventWindow(event)
    if (!window) {
      return { maximized: false }
    }
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
    return { maximized: window.isMaximized() }
  })
  ipcMain.handle('desktop:get-window-state', (event) => {
    const window = getEventWindow(event)
    return { maximized: Boolean(window?.isMaximized()) }
  })
  ipcMain.handle('desktop:get-persisted-workspace-state', (_event, scopeKey) => getPersistedWorkspaceState(scopeKey))
  ipcMain.handle('desktop:update-workspace-state', (event, payload) => {
    const scopeKey = String(payload?.scopeKey || '').trim()
    const projectId = String(payload?.projectId || '').trim()
    if (!scopeKey) {
      latestWorkspaceStateByWindowId.delete(event.sender.id)
      return { ok: false }
    }
    if (!projectId) {
      latestWorkspaceStateByWindowId.delete(event.sender.id)
      clearPersistedWorkspaceState(scopeKey)
      return { ok: true }
    }
    latestWorkspaceStateByWindowId.set(event.sender.id, {
      scopeKey,
      projectId,
      snapshot: normalizeWorkspaceSnapshot(payload?.snapshot),
    })
    return { ok: true }
  })
  ipcMain.handle('desktop:get-server-state', async () => {
    await refreshAndBroadcastDesktopServerState()
    return getDesktopServerState()
  })
  ipcMain.handle('desktop:create-server-profile', (_event, profile) => upsertServerProfile(null, profile))
  ipcMain.handle('desktop:update-server-profile', (_event, payload) =>
    upsertServerProfile(String(payload?.id || '').trim(), payload?.profile || {}),
  )
  ipcMain.handle('desktop:delete-server-profile', (_event, id) => deleteServerProfile(String(id || '').trim()))
  ipcMain.handle('desktop:select-server-profile', (_event, id) => selectServerProfile(String(id || '').trim()))
  ipcMain.handle('desktop:create-project-for-profile', (_event, payload) =>
    createProjectForProfile(String(payload?.id || '').trim(), String(payload?.name || '')),
  )
  ipcMain.handle('desktop:list-projects-for-profile', (_event, id) => listProjectsForProfile(String(id || '').trim()))
  ipcMain.handle('desktop:change-profile-account-username', (_event, payload) =>
    patchProfileAccountUsername(String(payload?.id || '').trim(), String(payload?.username || '').trim()),
  )
  ipcMain.handle('desktop:change-profile-account-password', (_event, payload) =>
    patchProfileAccountPassword(
      String(payload?.id || '').trim(),
      String(payload?.currentPassword || ''),
      String(payload?.newPassword || ''),
    ),
  )
  ipcMain.handle('desktop:delete-profile-account', (_event, payload) =>
    deleteProfileAccount(
      String(payload?.id || '').trim(),
      String(payload?.username || '').trim(),
      String(payload?.activeProfileId || '').trim(),
    ),
  )
  ipcMain.handle('desktop:clear-cache', async () => {
    await session.defaultSession.clearCache()
    return { ok: true }
  })
  ipcMain.handle('desktop:copy-image-to-clipboard', (_event, payload) => {
    const base64 = String(payload?.base64 || '').trim()
    if (!base64) {
      throw new Error('No image data was provided for clipboard copy')
    }

    const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'))
    if (image.isEmpty()) {
      throw new Error('Unable to convert image for clipboard copy')
    }

    clipboard.writeImage(image)
    return { ok: true }
  })
}
