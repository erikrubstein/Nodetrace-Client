const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nodetraceDesktop', {
  isElectron: true,
  platform: process.platform,
  openWindow: (options) => ipcRenderer.invoke('desktop:open-window', options),
  openMainWindow: () => ipcRenderer.invoke('desktop:open-main-window'),
  notifyRendererReady: () => ipcRenderer.send('desktop:renderer-ready'),
  closeWindow: () => ipcRenderer.invoke('desktop:close-window'),
  minimizeWindow: () => ipcRenderer.invoke('desktop:minimize-window'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('desktop:toggle-maximize-window'),
  getWindowState: () => ipcRenderer.invoke('desktop:get-window-state'),
  getServerState: () => ipcRenderer.invoke('desktop:get-server-state'),
  createServerProfile: (profile) => ipcRenderer.invoke('desktop:create-server-profile', profile),
  updateServerProfile: (id, profile) => ipcRenderer.invoke('desktop:update-server-profile', { id, profile }),
  deleteServerProfile: (id) => ipcRenderer.invoke('desktop:delete-server-profile', id),
  selectServerProfile: (id) => ipcRenderer.invoke('desktop:select-server-profile', id),
  createProjectForProfile: (id, name) => ipcRenderer.invoke('desktop:create-project-for-profile', { id, name }),
  listProjectsForProfile: (id) => ipcRenderer.invoke('desktop:list-projects-for-profile', id),
  changeProfileAccountUsername: (id, username) =>
    ipcRenderer.invoke('desktop:change-profile-account-username', { id, username }),
  changeProfileAccountPassword: (id, currentPassword, newPassword) =>
    ipcRenderer.invoke('desktop:change-profile-account-password', { id, currentPassword, newPassword }),
  deleteProfileAccount: (id, username) => ipcRenderer.invoke('desktop:delete-profile-account', { id, username }),
  clearCache: () => ipcRenderer.invoke('desktop:clear-cache'),
  copyImageToClipboard: (payload) => ipcRenderer.invoke('desktop:copy-image-to-clipboard', payload),
  getPersistedWorkspaceState: (scopeKey) => ipcRenderer.invoke('desktop:get-persisted-workspace-state', scopeKey),
  updateWorkspaceState: (payload) => ipcRenderer.invoke('desktop:update-workspace-state', payload),
  onMenuCommand: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('desktop:menu-command', listener)
    return () => {
      ipcRenderer.removeListener('desktop:menu-command', listener)
    }
  },
  onWindowStateChange: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('desktop:window-state', listener)
    return () => {
      ipcRenderer.removeListener('desktop:window-state', listener)
    }
  },
  onServerStateChange: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('desktop:server-state', listener)
    return () => {
      ipcRenderer.removeListener('desktop:server-state', listener)
    }
  },
})
