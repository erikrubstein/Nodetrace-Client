import { useCallback } from 'react'
import { api, configureApiBaseUrl } from '../../lib/api'
import { APP_UPDATE_REPO, APP_VERSION, compareSemanticVersions } from '../../lib/appInfo'
import {
  createDesktopServerProfile,
  deleteDesktopServerProfile,
  selectDesktopServerProfile,
  updateDesktopServerProfile,
} from '../../lib/desktop'
import { getUrlState, updateUrlState } from '../../lib/urlState'

export function useAppShellCommands({
  desktopAccountManagerFocusId,
  desktopEnvironment,
  desktopServerDialogReturnTarget,
  desktopServerState,
  refreshDesktopServerState,
  setAccountDialog,
  setAccountStatus,
  setAppDialog,
  setBusy,
  setCurrentUser,
  setDesktopAccountManagerFocusId,
  setDesktopServerDialogOpen,
  setDesktopServerDialogReturnTarget,
  setDesktopServerState,
  setError,
  setManualProjectSelectionRequired,
  setPendingProjectTransitionId,
  setProjectListLoading,
  setProjectPickerLoading,
  setProjectPickerProfileId,
  setProjectPickerProjects,
  setProjects,
  setSelectedProjectId,
  setSessionDialogOpen,
  setServerDisconnectDialogOpen,
  setShowProjectDialog,
  setStatus,
  setUpdateStatus,
  showProjectDialog,
  closeDisconnectedProject,
  beginProjectTransition: externalBeginProjectTransition,
  onCreateServerProfile,
  onDeleteServerProfile,
  onUpdateServerProfile,
}) {
  const beginProjectTransition = useCallback((projectId) => {
    if (typeof externalBeginProjectTransition === 'function') {
      externalBeginProjectTransition(projectId)
      return
    }
    const normalizedProjectId = String(projectId || '').trim()
    setPendingProjectTransitionId(normalizedProjectId || null)
  }, [externalBeginProjectTransition, setPendingProjectTransitionId])

  const openAccountManager = useCallback((focusProfileId = null) => {
    setError('')
    setAccountStatus('')
    if (desktopEnvironment) {
      if (showProjectDialog === 'open') {
        setDesktopServerDialogReturnTarget('open')
      } else {
        setDesktopServerDialogReturnTarget(null)
      }
      setDesktopAccountManagerFocusId(String(focusProfileId || '').trim() || null)
      void refreshDesktopServerState().catch((loadError) => {
        setError(loadError.message)
      })
      setDesktopServerDialogOpen(true)
      return
    }
    setAccountDialog('overview')
  }, [
    desktopEnvironment,
    refreshDesktopServerState,
    setAccountDialog,
    setAccountStatus,
    setDesktopAccountManagerFocusId,
    setDesktopServerDialogOpen,
    setDesktopServerDialogReturnTarget,
    setError,
    showProjectDialog,
  ])

  const checkForUpdates = useCallback(async () => {
    setError('')
    setUpdateStatus('Checking for updates...')
    setAppDialog('updates')
    try {
      const response = await fetch(`https://api.github.com/repos/${APP_UPDATE_REPO}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      })
      if (!response.ok) {
        throw new Error(response.status === 404 ? 'No published releases found.' : 'Unable to check for updates.')
      }
      const release = await response.json()
      const latestVersion = String(release?.tag_name || release?.name || '').trim().replace(/^v/i, '')
      if (!latestVersion) {
        throw new Error('Latest release version is unavailable.')
      }
      const comparison = compareSemanticVersions(latestVersion, APP_VERSION)
      if (comparison > 0) {
        setUpdateStatus(`Version ${latestVersion} is available.`)
      } else {
        setUpdateStatus(`You are up to date on version ${APP_VERSION}.`)
      }
    } catch (loadError) {
      setUpdateStatus(loadError.message || 'Unable to check for updates.')
    }
  }, [setAppDialog, setError, setUpdateStatus])

  const closeDesktopServerManager = useCallback(() => {
    const returnTarget = desktopServerDialogReturnTarget
    setDesktopAccountManagerFocusId(null)
    setDesktopServerDialogOpen(false)
    setDesktopServerDialogReturnTarget(null)
    if (returnTarget === 'open') {
      setShowProjectDialog('open')
    }
  }, [
    desktopServerDialogReturnTarget,
    setDesktopAccountManagerFocusId,
    setDesktopServerDialogOpen,
    setDesktopServerDialogReturnTarget,
    setShowProjectDialog,
  ])

  const openAccountDialog = useCallback((dialog, profileId = null) => {
    setError('')
    setAccountStatus('')
    if (desktopEnvironment) {
      setDesktopAccountManagerFocusId(String(profileId || '').trim() || desktopAccountManagerFocusId || null)
    }
    setAccountDialog(dialog)
  }, [
    desktopAccountManagerFocusId,
    desktopEnvironment,
    setAccountDialog,
    setAccountStatus,
    setDesktopAccountManagerFocusId,
    setError,
  ])

  const openCacheResetDialog = useCallback(() => {
    setError('')
    setAppDialog('clear-cache')
  }, [setAppDialog, setError])

  const generateNewSessionCode = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const payload = await api('/api/account/capture-session', {
        method: 'POST',
      })
      if (payload?.ok === false) {
        throw new Error(payload.error || 'Unable to generate a new session code.')
      }
      if (payload?.captureSessionId) {
        setCurrentUser((current) =>
          current
            ? {
                ...current,
                captureSessionId: payload.captureSessionId,
              }
            : current,
        )
      }
      if (desktopEnvironment) {
        await refreshDesktopServerState()
      }
      setSessionDialogOpen(true)
      setStatus('New session code generated.')
    } catch (sessionError) {
      setError(sessionError.message || 'Unable to generate a new session code.')
    } finally {
      setBusy(false)
    }
  }, [
    desktopEnvironment,
    refreshDesktopServerState,
    setBusy,
    setCurrentUser,
    setError,
    setSessionDialogOpen,
    setStatus,
  ])

  const createServerProfile = useCallback(async (payload) => {
    if (typeof onCreateServerProfile === 'function') {
      return onCreateServerProfile(payload)
    }
    setBusy(true)
    setError('')
    try {
      const nextState = await createDesktopServerProfile(payload)
      if (nextState) {
        setDesktopServerState(nextState)
        configureApiBaseUrl(nextState.proxyBaseUrl || '')
      }
      return true
    } catch (submitError) {
      setError(submitError.message)
      return false
    } finally {
      setBusy(false)
    }
  }, [onCreateServerProfile, setBusy, setDesktopServerState, setError])

  const updateServerProfile = useCallback(async (id, payload) => {
    if (typeof onUpdateServerProfile === 'function') {
      return onUpdateServerProfile(id, payload)
    }
    setBusy(true)
    setError('')
    try {
      const nextState = await updateDesktopServerProfile(id, payload)
      if (nextState) {
        setDesktopServerState(nextState)
        configureApiBaseUrl(nextState.proxyBaseUrl || '')
      }
      return true
    } catch (submitError) {
      setError(submitError.message)
      return false
    } finally {
      setBusy(false)
    }
  }, [onUpdateServerProfile, setBusy, setDesktopServerState, setError])

  const deleteServerProfile = useCallback(async (id) => {
    if (typeof onDeleteServerProfile === 'function') {
      return onDeleteServerProfile(id)
    }
    setBusy(true)
    setError('')
    try {
      const nextState = await deleteDesktopServerProfile(id)
      if (nextState) {
        setDesktopServerState(nextState)
        configureApiBaseUrl(nextState.proxyBaseUrl || '')
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }, [onDeleteServerProfile, setBusy, setDesktopServerState, setError])

  const browseProjectPickerProfile = useCallback((id) => {
    const normalizedId = String(id || '').trim() || null
    setError('')
    setProjectPickerProjects([])
    setProjectPickerLoading(Boolean(normalizedId))
    setProjectPickerProfileId((current) => {
      if (current === normalizedId) {
        setProjectPickerLoading(false)
        return current
      }
      return normalizedId
    })
  }, [setError, setProjectPickerLoading, setProjectPickerProfileId, setProjectPickerProjects])

  const openDesktopProjectFromPicker = useCallback(async (profileId, projectId) => {
    const normalizedProfileId = String(profileId || '').trim()
    const normalizedProjectId = String(projectId || '').trim()
    if (!normalizedProfileId || !normalizedProjectId) {
      return
    }

    setBusy(true)
    setError('')
    beginProjectTransition(normalizedProjectId)
    try {
      setManualProjectSelectionRequired(false)
      updateUrlState(normalizedProjectId, null, getUrlState().transform)
      if (desktopServerState.selectedProfileId !== normalizedProfileId) {
        const nextState = await selectDesktopServerProfile(normalizedProfileId)
        if (nextState) {
          setDesktopServerState(nextState)
          configureApiBaseUrl(nextState.proxyBaseUrl || '')
        }
      }
      setSelectedProjectId(normalizedProjectId)
      setShowProjectDialog(null)
      setProjectListLoading(false)
    } catch (submitError) {
      setPendingProjectTransitionId(null)
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }, [
    beginProjectTransition,
    desktopServerState.selectedProfileId,
    setBusy,
    setDesktopServerState,
    setError,
    setManualProjectSelectionRequired,
    setPendingProjectTransitionId,
    setProjectListLoading,
    setSelectedProjectId,
    setShowProjectDialog,
  ])

  const dismissServerDisconnectDialog = useCallback(() => {
    setServerDisconnectDialogOpen(false)
    closeDisconnectedProject()
    setProjects([])
    setStatus('Select a project from another server profile.')
    setShowProjectDialog('open')
  }, [closeDisconnectedProject, setProjects, setServerDisconnectDialogOpen, setShowProjectDialog, setStatus])

  return {
    beginProjectTransition,
    browseProjectPickerProfile,
    checkForUpdates,
    closeDesktopServerManager,
    createServerProfile,
    deleteServerProfile,
    dismissServerDisconnectDialog,
    generateNewSessionCode,
    openAccountDialog,
    openAccountManager,
    openCacheResetDialog,
    openDesktopProjectFromPicker,
    updateServerProfile,
  }
}
