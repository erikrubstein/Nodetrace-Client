import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AppDialogs from './components/AppDialogs'
import AuthScreen from './components/AuthScreen'
import CameraPanel from './components/CameraPanel'
import CanvasWorkspace from './components/CanvasWorkspace'
import CaptureScreen from './components/CaptureScreen'
import CollaboratorsPanel from './components/CollaboratorsPanel'
import DesktopServerManager from './components/DesktopServerManager'
import DockedSidebar from './components/DockedSidebar'
import FieldsPanel from './components/FieldsPanel'
import InspectorPanel from './components/InspectorPanel'
import MobileEntryScreen from './components/MobileEntryScreen'
import PanelShell from './components/PanelShell'
import PreviewPanel from './components/PreviewPanel'
import SearchPanel from './components/SearchPanel'
import SidebarRail from './components/SidebarRail'
import SettingsPanel from './components/SettingsPanel'
import TemplatesPanel from './components/TemplatesPanel'
import TopBar from './components/TopBar'
import useNodeEditing from './hooks/useNodeEditing'
import useProjectSync from './hooks/useProjectSync'
import useUndoRedo from './hooks/useUndoRedo'
import useWorkspaceInteractions from './hooks/useWorkspaceInteractions'
import { ApiError, api, configureApiBaseUrl, uploadWithProgress } from './lib/api'
import { APP_UPDATE_REPO, APP_VERSION, compareSemanticVersions } from './lib/appInfo'
import { defaultProjectSettings, defaultUserProjectUi, getPanelMinWidth, panelIds, SIDEBAR_RAIL_WIDTH } from './lib/constants'
import {
  closeDesktopWindow,
  changeDesktopProfileAccountPassword,
  changeDesktopProfileAccountUsername,
  clearDesktopCache,
  createDesktopProjectForProfile,
  createDesktopServerProfile,
  deleteDesktopProfileAccount,
  deleteDesktopServerProfile,
  getDesktopServerState,
  getPersistedDesktopWorkspaceState,
  listDesktopProjectsForProfile,
  getDesktopWindowState,
  isDesktopEnvironment,
  minimizeDesktopWindow,
  openDesktopPanelWindow,
  openDesktopMainWindow,
  selectDesktopServerProfile,
  subscribeDesktopServerState,
  subscribeDesktopWindowState,
  toggleMaximizeDesktopWindow,
  updateDesktopWorkspaceState,
  updateDesktopServerProfile,
} from './lib/desktop'
import { blobFromUrl, createPreviewFile } from './lib/image'
import {
  buildClientTree,
  buildNodePathEntries,
  buildFocusPathContext,
  buildLayout,
  buildVisibleTree,
  collectDescendantIds,
  findNode,
  flattenSubtreeNodes,
  getSelectionRootIds,
  normalizeServerTree,
} from './lib/tree'
import { getUrlState, updateUrlState } from './lib/urlState'
import { debugEnabled, debugLog } from './lib/debug'
import { isCaptureRoute, navigateToCapture } from './lib/runtimePaths'
import {
  CameraIcon,
  GearIcon,
  IdentificationIcon,
  PencilIcon,
  PreviewIcon,
  SearchIcon,
  TemplatesIcon,
  UsersIcon,
  WrenchIcon,
} from './components/icons'

const PRESENCE_COLORS = ['#6f9cff', '#5fc9a8', '#d48cff', '#f0a35b', '#58c5d8', '#d86f9f', '#a6c95b', '#c27cff']
const DESKTOP_SELECTION_SYNC_CHANNEL = 'nodetrace-desktop-selection'
const DESKTOP_PANEL_SYNC_CHANNEL = 'nodetrace-desktop-panels'
const CLIENT_THEME_STORAGE_KEY = 'nodetrace-client-theme'
const CLIENT_PROJECT_UI_STORAGE_KEY = 'nodetrace-client-project-ui'
const CLIENT_LAST_PROJECT_STORAGE_KEY = 'nodetrace-client-last-project'
const DESKTOP_CONNECTION_ERROR_MESSAGE = 'Unable to reach the selected server profile.'

function getStoredClientTheme() {
  if (typeof window === 'undefined') {
    return defaultUserProjectUi.theme
  }

  const storedTheme = window.localStorage.getItem(CLIENT_THEME_STORAGE_KEY)
  return storedTheme === 'light' ? 'light' : storedTheme === 'dark' ? 'dark' : defaultUserProjectUi.theme
}

function normalizeClientProjectUi(value) {
  const source = value && typeof value === 'object' ? value : {}
  const panelDock = { ...defaultUserProjectUi.panelDock }
  for (const panelId of panelIds) {
    const requestedSide = source.panelDock?.[panelId]
    if (requestedSide === 'left' || requestedSide === 'right') {
      panelDock[panelId] = requestedSide
    }
  }

  const canvasTransform =
    source.canvasTransform &&
    typeof source.canvasTransform === 'object' &&
    Number.isFinite(Number(source.canvasTransform.x)) &&
    Number.isFinite(Number(source.canvasTransform.y)) &&
    Number.isFinite(Number(source.canvasTransform.scale))
      ? {
          x: Number(source.canvasTransform.x),
          y: Number(source.canvasTransform.y),
          scale: Number(source.canvasTransform.scale),
        }
      : null

  return {
    showGrid: source.showGrid == null ? defaultUserProjectUi.showGrid : Boolean(source.showGrid),
    canvasTransform,
    selectedNodeIds: Array.isArray(source.selectedNodeIds) ? source.selectedNodeIds.filter(Boolean) : [],
    leftSidebarOpen: source.leftSidebarOpen == null ? defaultUserProjectUi.leftSidebarOpen : Boolean(source.leftSidebarOpen),
    rightSidebarOpen:
      source.rightSidebarOpen == null ? defaultUserProjectUi.rightSidebarOpen : Boolean(source.rightSidebarOpen),
    leftSidebarWidth: Math.max(
      220,
      Math.min(720, Number(source.leftSidebarWidth) || defaultUserProjectUi.leftSidebarWidth),
    ),
    rightSidebarWidth: Math.max(
      220,
      Math.min(720, Number(source.rightSidebarWidth) || defaultUserProjectUi.rightSidebarWidth),
    ),
    leftActivePanel: panelIds.includes(source.leftActivePanel) ? source.leftActivePanel : defaultUserProjectUi.leftActivePanel,
    rightActivePanel: panelIds.includes(source.rightActivePanel)
      ? source.rightActivePanel
      : defaultUserProjectUi.rightActivePanel,
    panelDock,
  }
}

function buildClientProjectUiScopeKey({ desktopEnvironment = false, currentUserId = '', currentUsername = '', serverBaseUrl = '' }) {
  const userPart = String(currentUserId || currentUsername || 'anonymous').trim().toLowerCase()
  const scopeTarget =
    desktopEnvironment
      ? String(serverBaseUrl || 'desktop').trim().toLowerCase()
      : String(window.location.origin || 'web').trim().toLowerCase()
  return `${desktopEnvironment ? 'desktop' : 'web'}::${scopeTarget}::${userPart}`
}

function getClientProjectUiStorageKey(scopeKey, projectId) {
  return `${CLIENT_PROJECT_UI_STORAGE_KEY}::${scopeKey}::${String(projectId || '').trim()}`
}

function getClientLastProjectStorageKey(scopeKey) {
  return `${CLIENT_LAST_PROJECT_STORAGE_KEY}::${scopeKey}`
}

function readStoredLastProjectEntry(scopeKey) {
  if (typeof window === 'undefined' || !scopeKey) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(getClientLastProjectStorageKey(scopeKey))
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)
    if (parsedValue && typeof parsedValue === 'object') {
      const projectId = String(parsedValue.projectId || '').trim()
      const closedAt = Number(parsedValue.closedAt || 0)
      if (!projectId) {
        return null
      }
      return {
        projectId,
        closedAt: Number.isFinite(closedAt) ? closedAt : 0,
      }
    }
  } catch {
    const legacyValue = String(window.localStorage.getItem(getClientLastProjectStorageKey(scopeKey)) || '').trim()
    if (legacyValue) {
      return { projectId: legacyValue, closedAt: 0 }
    }
  }

  return null
}

function readStoredClientProjectUi(scopeKey, projectId) {
  if (typeof window === 'undefined' || !scopeKey || !projectId) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(getClientProjectUiStorageKey(scopeKey, projectId))
    if (!rawValue) {
      return null
    }
    return normalizeClientProjectUi(JSON.parse(rawValue))
  } catch {
    return null
  }
}

function writeStoredClientProjectUi(scopeKey, projectId, snapshot) {
  if (typeof window === 'undefined' || !scopeKey || !projectId) {
    return
  }
  window.localStorage.setItem(
    getClientProjectUiStorageKey(scopeKey, projectId),
    JSON.stringify(normalizeClientProjectUi(snapshot)),
  )
}

function readStoredLastProjectId(scopeKey) {
  return readStoredLastProjectEntry(scopeKey)?.projectId || null
}

function writeStoredLastProjectId(scopeKey, projectId, closedAt = Date.now()) {
  if (typeof window === 'undefined' || !scopeKey) {
    return
  }
  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId) {
    window.localStorage.removeItem(getClientLastProjectStorageKey(scopeKey))
    return
  }

  const nextClosedAt = Number.isFinite(Number(closedAt)) ? Number(closedAt) : Date.now()
  const currentEntry = readStoredLastProjectEntry(scopeKey)
  if (currentEntry && Number(currentEntry.closedAt || 0) > nextClosedAt) {
    return
  }

  window.localStorage.setItem(
    getClientLastProjectStorageKey(scopeKey),
    JSON.stringify({
      projectId: normalizedProjectId,
      closedAt: nextClosedAt,
    }),
  )
}

function shouldShowMobileEntryPrompt() {
  if (typeof window === 'undefined') {
    return false
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false
  const narrowViewport = window.matchMedia?.('(max-width: 920px)')?.matches ?? false
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent || '')

  return window.location.pathname === '/' && (mobileUserAgent || (coarsePointer && narrowViewport))
}

function getPresenceColor(id) {
  const value = String(id || '')
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

function getPresenceInitials(username) {
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

function buildTemplateFormState(template) {
  if (!template) {
    return {
      name: '',
      aiInstructions: '',
      parentDepth: 0,
      childDepth: 0,
      fields: [],
    }
  }

  return {
    name: template.name || '',
    aiInstructions: template.aiInstructions || '',
    parentDepth: Number(template.parentDepth || 0),
    childDepth: Number(template.childDepth || 0),
    fields:
      template.fields?.map((field) => ({
        id: `${template.id}-${field.key}`,
        key: field.key,
        label: field.label,
        type: field.type,
        mode: field.mode || 'manual',
        parentDepth: Number(field.parentDepth || 0),
        childDepth: Number(field.childDepth || 0),
      })) || [],
  }
}

function MainApp() {
  const { panelWindowId } = getUrlState()
  const desktopEnvironment = isDesktopEnvironment()
  const isPanelWindow = Boolean(panelWindowId)
  const windowInstanceIdRef = useRef(`window-${Math.random().toString(36).slice(2, 10)}`)
  const applyingRemoteSelectionRef = useRef(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [desktopServerReady, setDesktopServerReady] = useState(() => !desktopEnvironment)
  const [desktopServerState, setDesktopServerState] = useState({
    profiles: [],
    selectedProfileId: null,
    proxyBaseUrl: '',
  })
  const [desktopServerDialogOpen, setDesktopServerDialogOpen] = useState(false)
  const [desktopAccountManagerFocusId, setDesktopAccountManagerFocusId] = useState(null)
  const [desktopServerDialogReturnTarget, setDesktopServerDialogReturnTarget] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectListLoading, setProjectListLoading] = useState(false)
  const [projectPickerProfileId, setProjectPickerProfileId] = useState(null)
  const [projectPickerProjects, setProjectPickerProjects] = useState([])
  const [projectPickerLoading, setProjectPickerLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [manualProjectSelectionRequired, setManualProjectSelectionRequired] = useState(false)
  const [pendingProjectTransitionId, setPendingProjectTransitionId] = useState(null)
  const [tree, setTree] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState([])
  const [theme, setTheme] = useState(() => getStoredClientTheme())
  const [showGrid, setShowGrid] = useState(defaultUserProjectUi.showGrid)
  const [status, setStatus] = useState('Loading projects...')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [desktopPersistedWorkspaceState, setDesktopPersistedWorkspaceState] = useState(null)
  const [desktopPersistedWorkspaceReady, setDesktopPersistedWorkspaceReady] = useState(false)
  const [desktopConnectionFaulted, setDesktopConnectionFaulted] = useState(false)
  const [desktopWindowMaximized, setDesktopWindowMaximized] = useState(false)
  const [poppedOutPanelIds, setPoppedOutPanelIds] = useState([])
  const [openMenu, setOpenMenu] = useState(null)
  const [showProjectDialog, setShowProjectDialog] = useState(null)
  const [appDialog, setAppDialog] = useState(null)
  const [templateDialog, setTemplateDialog] = useState(null)
  const [importTemplateDialog, setImportTemplateDialog] = useState(null)
  const [selectedTemplateEditorId, setSelectedTemplateEditorId] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [projectApiKeyInput, setProjectApiKeyInput] = useState('')
  const [newNodeDialog, setNewNodeDialog] = useState(null)
  const [newNodeName, setNewNodeName] = useState('New Node')
  const [exportFileName, setExportFileName] = useState('')
  const [importProjectName, setImportProjectName] = useState('')
  const [importArchiveFile, setImportArchiveFile] = useState(null)
  const [transferProgress, setTransferProgress] = useState(null)
  const [deleteProjectText, setDeleteProjectText] = useState('')
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false)
  const [identificationTemplateRemoval, setIdentificationTemplateRemoval] = useState(null)
  const [applyTemplateConfirmation, setApplyTemplateConfirmation] = useState(null)
  const [mergePhotoConfirmation, setMergePhotoConfirmation] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [sidebarContextMenu, setSidebarContextMenu] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [dragHoverNodeId, setDragHoverNodeId] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)
  const [transform, setTransform] = useState({ x: 80, y: 80, scale: 1 })
  const [previewTransform, setPreviewTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(defaultUserProjectUi.leftSidebarOpen)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(defaultUserProjectUi.rightSidebarOpen)
  const [leftActivePanel, setLeftActivePanel] = useState(defaultUserProjectUi.leftActivePanel)
  const [rightActivePanel, setRightActivePanel] = useState(defaultUserProjectUi.rightActivePanel)
  const [panelDock, setPanelDock] = useState(defaultUserProjectUi.panelDock)
  const [projectUiReady, setProjectUiReady] = useState(false)
  const [focusPathMode, setFocusPathMode] = useState(false)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(defaultUserProjectUi.leftSidebarWidth)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(defaultUserProjectUi.rightSidebarWidth)
  const [pendingUploadParentId, setPendingUploadParentId] = useState(null)
  const [pendingUploadMode, setPendingUploadMode] = useState('photo_node')
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedCameraTemplateId, setSelectedCameraTemplateId] = useState('')
  const [cameraNotice, setCameraNotice] = useState('')
  const [cameraSelection, setCameraSelection] = useState(null)
  const [loadedImages, setLoadedImages] = useState({})
  const [imageLoadRevision, setImageLoadRevision] = useState(0)
  const [projectPresenceUsers, setProjectPresenceUsers] = useState([])
  const [searchResultNodeIds, setSearchResultNodeIds] = useState([])
  const [searchResultsInitialized, setSearchResultsInitialized] = useState(false)
  const [canvasIsolationMode, setCanvasIsolationMode] = useState('none')
  const [draggingPanelId, setDraggingPanelId] = useState(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [serverDisconnectDialogOpen, setServerDisconnectDialogOpen] = useState(false)
  const [mobileConnectionCount, setMobileConnectionCount] = useState(0)
  const [collaboratorUsername, setCollaboratorUsername] = useState('')
  const [accountDialog, setAccountDialog] = useState(null)
  const [accountStatus, setAccountStatus] = useState('')
  const [updateStatus, setUpdateStatus] = useState('')
  const [aiFillNodeId, setAiFillNodeId] = useState(null)
  const [accountForm, setAccountForm] = useState({
    username: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    deleteConfirmation: '',
  })
  const [templateForm, setTemplateForm] = useState({
    name: '',
    aiInstructions: '',
    parentDepth: 0,
    childDepth: 0,
    fields: [],
  })
  const [showMobileEntryPrompt, setShowMobileEntryPrompt] = useState(
    () => !isPanelWindow && !desktopEnvironment && shouldShowMobileEntryPrompt(),
  )
  const fileInputRef = useRef(null)
  const importInputRef = useRef(null)
  const pendingLocalEventsRef = useRef(0)
  const pendingInitialCanvasFitRef = useRef(false)
  const treeRef = useRef(null)
  const previousDesktopConnectionStatusRef = useRef(null)
  const desktopReconnectStatusRef = useRef(null)
  const initializedAuthProfileIdRef = useRef(null)
  const currentUserRef = useRef(null)
  const selectedProjectIdRef = useRef(null)
  const selectedNodeIdRef = useRef(null)
  const sessionProjectUiByProjectIdRef = useRef(new Map())
  const loadedImagesRef = useRef({})
  const nodeImageEditSequenceRef = useRef(new Map())
  const loadedUiSignatureRef = useRef('')
  const pendingUiSignatureRef = useRef(null)
  const selectedLayoutAnchorRef = useRef({ nodeId: null, x: null, y: null })
  const pendingFocusNodeIdRef = useRef(null)
  const presenceRequestSequenceRef = useRef(0)
  const projectPresenceSignatureRef = useRef('[]')
  const webAuthBootstrapCompleteRef = useRef(false)
  const projectPickerRequestSequenceRef = useRef(0)
  const { clearHistory, historyState, pushHistory, undo, redo } = useUndoRedo({ busy, setBusy, setError })
  const setTemplateFormIfChanged = useCallback((nextValue) => {
    setTemplateForm((current) => {
      const resolvedNextValue = typeof nextValue === 'function' ? nextValue(current) : nextValue
      return JSON.stringify(current) === JSON.stringify(resolvedNextValue) ? current : resolvedNextValue
    })
  }, [])
  const applyTreePayload = useCallback((payload) => {
    setTree(normalizeServerTree(payload))
  }, [])
  const selectedDesktopServerProfile = useMemo(
    () => desktopServerState.profiles.find((profile) => profile.id === desktopServerState.selectedProfileId) || null,
    [desktopServerState.profiles, desktopServerState.selectedProfileId],
  )
  const clientProjectUiScopeKey = useMemo(
    () =>
      currentUser
        ? buildClientProjectUiScopeKey({
            desktopEnvironment,
            currentUserId: currentUser.id || '',
            currentUsername: currentUser.username || '',
            serverBaseUrl: selectedDesktopServerProfile?.baseUrl || '',
          })
        : '',
    [currentUser, desktopEnvironment, selectedDesktopServerProfile?.baseUrl],
  )
  const selectedProjectSummary = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  )
  const activeProjectDisplayName =
    selectedProjectId && tree?.project?.id !== selectedProjectId
      ? selectedProjectSummary?.name || tree?.project?.name || ''
      : tree?.project?.name || selectedProjectSummary?.name || ''
  const projectTreeLoading = Boolean(
    currentUser &&
    selectedProjectId &&
    (!tree?.project || tree.project.id !== selectedProjectId),
  )
  const projectTransitionVeilActive = Boolean(currentUser && pendingProjectTransitionId)
  const managedDesktopAccountProfile = useMemo(() => {
    if (!desktopEnvironment) {
      return null
    }
    const focusedId = String(desktopAccountManagerFocusId || '').trim()
    if (focusedId) {
      return desktopServerState.profiles.find((profile) => profile.id === focusedId) || null
    }
    return selectedDesktopServerProfile
  }, [desktopAccountManagerFocusId, desktopEnvironment, desktopServerState.profiles, selectedDesktopServerProfile])
  const selectedDesktopServerProfileId = selectedDesktopServerProfile?.id || null
  const selectedDesktopServerConnectionStatus = selectedDesktopServerProfile?.connectionStatus || null
  const effectiveDesktopServerConnectionStatus =
    desktopEnvironment && desktopConnectionFaulted && selectedDesktopServerConnectionStatus !== 'connected'
      ? selectedDesktopServerConnectionStatus === 'invalid_login'
        ? 'invalid_login'
        : 'disconnected'
      : selectedDesktopServerConnectionStatus
  const desktopServerSelectionRequired = desktopEnvironment && desktopServerReady && !selectedDesktopServerProfile
  const refreshDesktopServerState = useCallback(async () => {
    if (!desktopEnvironment) {
      return null
    }
    const nextState = await getDesktopServerState()
    setDesktopServerState(nextState)
    configureApiBaseUrl(nextState.proxyBaseUrl || '')
    return nextState
  }, [desktopEnvironment])

  const getPreferredProjectId = useCallback(
    () =>
      desktopEnvironment
        ? desktopPersistedWorkspaceState?.projectId || null
        : readStoredLastProjectId(clientProjectUiScopeKey),
    [clientProjectUiScopeKey, desktopEnvironment, desktopPersistedWorkspaceState?.projectId],
  )

  const clearRememberedProjectSelection = useCallback(() => {
    if (!clientProjectUiScopeKey) {
      return
    }
    if (desktopEnvironment) {
      setDesktopPersistedWorkspaceState(null)
      void updateDesktopWorkspaceState({
        scopeKey: clientProjectUiScopeKey,
        projectId: null,
        snapshot: null,
      }).catch(() => {})
      return
    }
    writeStoredLastProjectId(clientProjectUiScopeKey, null)
  }, [clientProjectUiScopeKey, desktopEnvironment])

  const closeDisconnectedProject = useCallback(() => {
    setPendingProjectTransitionId(null)
    setProjectListLoading(false)
    setSelectedProjectId(null)
    setTree(null)
    setSelectedNodeId(null)
    setProjectUiReady(false)
    setMobileConnectionCount(0)
    setManualProjectSelectionRequired(true)
    updateUrlState(null, null, getUrlState().transform)
    clearRememberedProjectSelection()
  }, [clearRememberedProjectSelection])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(CLIENT_THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.title = activeProjectDisplayName ? `Nodetrace | ${activeProjectDisplayName}` : 'Nodetrace'
  }, [activeProjectDisplayName])

  useEffect(() => {
    if (!desktopEnvironment) {
      return
    }
    window.nodetraceDesktop?.notifyRendererReady?.()
  }, [desktopEnvironment])

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  useEffect(() => {
    loadedImagesRef.current = loadedImages
  }, [loadedImages])

  useEffect(() => {
    sessionProjectUiByProjectIdRef.current = new Map()
    pendingUiSignatureRef.current = null
    loadedUiSignatureRef.current = ''
  }, [clientProjectUiScopeKey])

  useEffect(() => {
    if (!desktopEnvironment) {
      setDesktopPersistedWorkspaceState(null)
      setDesktopPersistedWorkspaceReady(true)
      return
    }
    if (!currentUser || !clientProjectUiScopeKey) {
      setDesktopPersistedWorkspaceState(null)
      setDesktopPersistedWorkspaceReady(false)
      return
    }

    let cancelled = false
    setDesktopPersistedWorkspaceReady(false)

    getPersistedDesktopWorkspaceState(clientProjectUiScopeKey)
      .then((value) => {
        if (cancelled) {
          return
        }
        setDesktopPersistedWorkspaceState(value || null)
        setDesktopPersistedWorkspaceReady(true)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setDesktopPersistedWorkspaceState(null)
        setDesktopPersistedWorkspaceReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [clientProjectUiScopeKey, currentUser, desktopEnvironment])

  useEffect(() => {
    if (!desktopEnvironment) {
      previousDesktopConnectionStatusRef.current = null
      return
    }
    const currentStatus = effectiveDesktopServerConnectionStatus
    const previousStatus = previousDesktopConnectionStatusRef.current
    const hasOpenProject = Boolean(selectedProjectId && tree?.project)
    const browsingProjectPicker = showProjectDialog === 'open'
    if (previousStatus === 'connected' && currentStatus && currentStatus !== 'connected' && hasOpenProject) {
      closeDisconnectedProject()
      setStatus('The active server profile disconnected.')
      if (!browsingProjectPicker) {
        setShowProjectDialog(null)
        setServerDisconnectDialogOpen(true)
      }
    }
    previousDesktopConnectionStatusRef.current = currentStatus
  }, [closeDisconnectedProject, desktopEnvironment, effectiveDesktopServerConnectionStatus, selectedProjectId, showProjectDialog, tree?.project])

  useEffect(() => {
    if (!desktopEnvironment) {
      setDesktopConnectionFaulted(false)
      return
    }
    if (selectedDesktopServerConnectionStatus === 'connected' || !selectedDesktopServerProfileId) {
      setDesktopConnectionFaulted(false)
    }
  }, [desktopEnvironment, selectedDesktopServerConnectionStatus, selectedDesktopServerProfileId])

  useEffect(() => {
    if (!desktopEnvironment) {
      return undefined
    }

    const handleDesktopConnectionError = () => {
      setDesktopConnectionFaulted(true)
      setError('')
      if (desktopServerDialogOpen || showProjectDialog === 'open') {
        if (selectedProjectId && tree?.project) {
          closeDisconnectedProject()
          setStatus('The active server profile disconnected.')
        }
        setProjectListLoading(false)
        return
      }

      if (selectedProjectId && tree?.project) {
        closeDisconnectedProject()
        setShowProjectDialog(null)
        setServerDisconnectDialogOpen(true)
        setStatus('The active server profile disconnected.')
        return
      }

      setProjectListLoading(false)
      setStatus('The selected server profile is disconnected.')
      setShowProjectDialog('open')
    }

    window.addEventListener('nodetrace:desktop-connection-error', handleDesktopConnectionError)
    return () => {
      window.removeEventListener('nodetrace:desktop-connection-error', handleDesktopConnectionError)
    }
  }, [closeDisconnectedProject, desktopEnvironment, desktopServerDialogOpen, selectedProjectId, showProjectDialog, tree?.project])

  useEffect(() => {
    if (
      !desktopEnvironment ||
      !authReady ||
      desktopServerSelectionRequired ||
      desktopServerDialogOpen ||
      serverDisconnectDialogOpen ||
      currentUser ||
      !desktopServerState.profiles.length
    ) {
      return
    }

    setShowProjectDialog((current) => current || 'open')
  }, [
    authReady,
    currentUser,
    desktopEnvironment,
    desktopServerDialogOpen,
    desktopServerSelectionRequired,
    desktopServerState.profiles.length,
    serverDisconnectDialogOpen,
  ])

  useEffect(() => {
    if (!desktopEnvironment) {
      configureApiBaseUrl('')
      setDesktopServerReady(true)
      return undefined
    }

    let cancelled = false
    refreshDesktopServerState()
      .then((state) => {
        if (cancelled) {
          return
        }
        if (!state) {
          return
        }
        setDesktopServerReady(true)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setError(error.message || 'Unable to load desktop server profiles.')
        setDesktopServerReady(true)
      })

    const unsubscribe = subscribeDesktopServerState((state) => {
      if (cancelled) {
        return
      }
      setDesktopServerState(state)
      configureApiBaseUrl(state.proxyBaseUrl || '')
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [desktopEnvironment, refreshDesktopServerState])

  useEffect(() => {
    if (!desktopEnvironment || showProjectDialog !== 'open') {
      return
    }

    const availableProfileIds = new Set(desktopServerState.profiles.map((profile) => profile.id))
    if (projectPickerProfileId && availableProfileIds.has(projectPickerProfileId)) {
      return
    }

    setProjectPickerProfileId(desktopServerState.selectedProfileId || desktopServerState.profiles[0]?.id || null)
  }, [desktopEnvironment, desktopServerState.profiles, desktopServerState.selectedProfileId, projectPickerProfileId, showProjectDialog])

  useEffect(() => {
    if (!desktopEnvironment || showProjectDialog !== 'open') {
      return
    }

    const selectedProfile =
      desktopServerState.profiles.find((profile) => profile.id === projectPickerProfileId) || null
    if (!selectedProfile || selectedProfile.connectionStatus !== 'connected') {
      setProjectPickerLoading(false)
      setProjectPickerProjects([])
      return
    }

    const requestSequence = ++projectPickerRequestSequenceRef.current
    setProjectPickerProjects([])
    setProjectPickerLoading(true)
    listDesktopProjectsForProfile(projectPickerProfileId)
      .then((projectList) => {
        if (requestSequence !== projectPickerRequestSequenceRef.current) {
          return
        }
        setProjectPickerProjects(Array.isArray(projectList) ? projectList : [])
      })
      .catch((loadError) => {
        if (requestSequence !== projectPickerRequestSequenceRef.current) {
          return
        }
        setProjectPickerProjects([])
        if (String(loadError.message || '').trim() !== DESKTOP_CONNECTION_ERROR_MESSAGE) {
          setError(loadError.message || 'Unable to load projects for that server profile.')
        }
      })
      .finally(() => {
        if (requestSequence === projectPickerRequestSequenceRef.current) {
          setProjectPickerLoading(false)
        }
      })
  }, [desktopEnvironment, desktopServerState.profiles, projectPickerProfileId, showProjectDialog])

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
    debugLog('selected node changed', { selectedNodeId })
  }, [selectedNodeId])

  useEffect(() => {
    if (!debugEnabled()) {
      return
    }
    debugLog('canvas transform changed', { transform })
  }, [transform])

  useEffect(() => {
    const activeUrls = new Set(
      (tree?.nodes || [])
        .map((node) => node.previewUrl || node.imageUrl)
        .filter(Boolean),
    )
    setLoadedImages((current) => {
      let changed = false
      const next = {}
      for (const [url, loaded] of Object.entries(current)) {
        if (activeUrls.has(url)) {
          next[url] = loaded
        } else {
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [tree])

  function handleDialogEnter(event, action, canRun = true) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    if (event.target instanceof HTMLTextAreaElement) {
      return
    }
    event.preventDefault()
    if (canRun) {
      action()
    }
  }


  function toggleSidebarPanel(panelId) {
    if (!isPanelWindow && isDesktopEnvironment() && poppedOutPanelIds.includes(panelId)) {
      void popoutPanel(panelId)
      return
    }

    const side = panelDock[panelId]
    const minWidth = getPanelMinWidth(panelId)
    if (side === 'left') {
      if (leftSidebarOpen && resolvedLeftActivePanel === panelId) {
        setLeftSidebarOpen(false)
        return
      }
      setLeftSidebarWidth((current) => Math.max(current, minWidth))
      setLeftActivePanel(panelId)
      setLeftSidebarOpen(true)
      return
    }

    if (rightSidebarOpen && resolvedRightActivePanel === panelId) {
      setRightSidebarOpen(false)
      return
    }
    setRightSidebarWidth((current) => Math.max(current, minWidth))
    setRightActivePanel(panelId)
    setRightSidebarOpen(true)
  }

  const dockPanelIntoSidebar = useCallback((panelId) => {
    if (!panelId) {
      return
    }

    setPoppedOutPanelIds((current) => current.filter((id) => id !== panelId))
    const side = panelDock[panelId]
    const minWidth = getPanelMinWidth(panelId)

    if (side === 'left') {
      setLeftSidebarWidth((current) => Math.max(current, minWidth))
      setLeftActivePanel(panelId)
      setLeftSidebarOpen(true)
      return
    }

    setRightSidebarWidth((current) => Math.max(current, minWidth))
    setRightActivePanel(panelId)
    setRightSidebarOpen(true)
  }, [panelDock])

  function openSidebarContextMenu(event) {
    setContextMenu(null)
    const estimatedMenuWidth = 220
    const estimatedMenuHeight = 56
    const padding = 12
    setSidebarContextMenu({
      x: Math.max(padding, Math.min(event.clientX, window.innerWidth - estimatedMenuWidth - padding)),
      y: Math.max(padding, Math.min(event.clientY, window.innerHeight - estimatedMenuHeight - padding)),
    })
  }

  function markPendingUiSignature(overrides = {}) {
    const nextUi = {
      showGrid: overrides.showGrid ?? showGrid,
      canvasTransform: overrides.canvasTransform ?? transform,
      leftSidebarOpen: overrides.leftSidebarOpen ?? leftSidebarOpen,
      rightSidebarOpen: overrides.rightSidebarOpen ?? rightSidebarOpen,
      leftSidebarWidth: overrides.leftSidebarWidth ?? leftSidebarWidth,
      rightSidebarWidth: overrides.rightSidebarWidth ?? rightSidebarWidth,
      leftActivePanel: overrides.leftActivePanel ?? resolvedLeftActivePanel,
      rightActivePanel: overrides.rightActivePanel ?? resolvedRightActivePanel,
      panelDock: overrides.panelDock ?? panelDock,
    }
    pendingUiSignatureRef.current = JSON.stringify(nextUi)
  }

  function applyThemePreference(nextTheme) {
    setTheme(nextTheme === 'light' ? 'light' : 'dark')
  }

  function toggleGridPreference() {
    setShowGrid((current) => {
      const nextValue = !current
      markPendingUiSignature({ showGrid: nextValue })
      return nextValue
    })
  }

  function resetPanelLayout() {
    const nextPanelDock = { ...defaultUserProjectUi.panelDock }
    markPendingUiSignature({
      leftSidebarOpen: defaultUserProjectUi.leftSidebarOpen,
      rightSidebarOpen: defaultUserProjectUi.rightSidebarOpen,
      leftSidebarWidth: defaultUserProjectUi.leftSidebarWidth,
      rightSidebarWidth: defaultUserProjectUi.rightSidebarWidth,
      leftActivePanel: defaultUserProjectUi.leftActivePanel,
      rightActivePanel: defaultUserProjectUi.rightActivePanel,
      panelDock: nextPanelDock,
    })
    setLeftSidebarOpen(defaultUserProjectUi.leftSidebarOpen)
    setRightSidebarOpen(defaultUserProjectUi.rightSidebarOpen)
    setLeftSidebarWidth(defaultUserProjectUi.leftSidebarWidth)
    setRightSidebarWidth(defaultUserProjectUi.rightSidebarWidth)
    setLeftActivePanel(defaultUserProjectUi.leftActivePanel)
    setRightActivePanel(defaultUserProjectUi.rightActivePanel)
    setPanelDock(nextPanelDock)
    setSidebarContextMenu(null)
  }

  function movePanelDock(panelId, side) {
    if (!panelIds.includes(panelId)) {
      return
    }
    setPanelDock((current) => ({
      ...current,
      [panelId]: side,
    }))
    if (side === 'left') {
      const nextRightPanel = rightDockedPanelIds.find((id) => id !== panelId) || null
      setLeftActivePanel(panelId)
      setLeftSidebarOpen(true)
      setRightActivePanel((current) => {
        if (current !== panelId) {
          return current
        }
        return nextRightPanel
      })
      if (!nextRightPanel && resolvedRightActivePanel === panelId) {
        setRightSidebarOpen(false)
      }
      return
    }

    const nextLeftPanel = leftDockedPanelIds.find((id) => id !== panelId) || null
    setRightActivePanel(panelId)
    setRightSidebarOpen(true)
    setLeftActivePanel((current) => {
      if (current !== panelId) {
        return current
      }
      return nextLeftPanel
    })
    if (!nextLeftPanel && resolvedLeftActivePanel === panelId) {
      setLeftSidebarOpen(false)
    }
  }

  function handleDropPanel(panelId, side) {
    if (!panelId || panelDock[panelId] === side) {
      setDraggingPanelId(null)
      return
    }
    movePanelDock(panelId, side)
    setDraggingPanelId(null)
  }

  const selectedNode = tree?.nodes.find((node) => node.id === selectedNodeId) || null
  const projectSettings = tree?.project?.settings || defaultProjectSettings
  const projectUi = tree?.project?.ui || defaultUserProjectUi
  const leftDockedPanelIds = useMemo(
    () => panelIds.filter((panelId) => (panelDock?.[panelId] || defaultUserProjectUi.panelDock[panelId]) === 'left'),
    [panelDock],
  )
  const rightDockedPanelIds = useMemo(
    () => panelIds.filter((panelId) => (panelDock?.[panelId] || defaultUserProjectUi.panelDock[panelId]) === 'right'),
    [panelDock],
  )
  const availableLeftDockedPanelIds = useMemo(
    () => leftDockedPanelIds.filter((panelId) => !poppedOutPanelIds.includes(panelId)),
    [leftDockedPanelIds, poppedOutPanelIds],
  )
  const availableRightDockedPanelIds = useMemo(
    () => rightDockedPanelIds.filter((panelId) => !poppedOutPanelIds.includes(panelId)),
    [poppedOutPanelIds, rightDockedPanelIds],
  )
  const resolvedLeftActivePanel = availableLeftDockedPanelIds.includes(leftActivePanel)
    ? leftActivePanel
    : availableLeftDockedPanelIds[0] || null
  const resolvedRightActivePanel = availableRightDockedPanelIds.includes(rightActivePanel)
    ? rightActivePanel
    : availableRightDockedPanelIds[0] || null
  const leftSidebarMinWidth = resolvedLeftActivePanel
    ? getPanelMinWidth(resolvedLeftActivePanel)
    : defaultUserProjectUi.leftSidebarWidth
  const rightSidebarMinWidth = resolvedRightActivePanel
    ? getPanelMinWidth(resolvedRightActivePanel)
    : defaultUserProjectUi.rightSidebarWidth
  const effectiveLeftSidebarWidth = Math.max(leftSidebarWidth, leftSidebarMinWidth)
  const effectiveRightSidebarWidth = Math.max(rightSidebarWidth, rightSidebarMinWidth)

  const setCanvasTransform = useCallback((nextTransformOrUpdater) => {
    setTransform((current) => {
      const nextTransform =
        typeof nextTransformOrUpdater === 'function' ? nextTransformOrUpdater(current) : nextTransformOrUpdater
      pendingUiSignatureRef.current = JSON.stringify({
        showGrid,
        canvasTransform: nextTransform,
        leftSidebarOpen,
        rightSidebarOpen,
        leftSidebarWidth,
        rightSidebarWidth,
        leftActivePanel: resolvedLeftActivePanel,
        rightActivePanel: resolvedRightActivePanel,
        panelDock,
      })
      return nextTransform
    })
  }, [
    leftSidebarOpen,
    leftSidebarWidth,
    panelDock,
    resolvedLeftActivePanel,
    resolvedRightActivePanel,
    rightSidebarOpen,
    rightSidebarWidth,
    showGrid,
  ])

  const previewVisible =
    (panelDock.preview === 'left' && leftSidebarOpen && resolvedLeftActivePanel === 'preview') ||
    (panelDock.preview === 'right' && rightSidebarOpen && resolvedRightActivePanel === 'preview')
  const cameraVisible =
    (panelDock.camera === 'left' && leftSidebarOpen && resolvedLeftActivePanel === 'camera') ||
    (panelDock.camera === 'right' && rightSidebarOpen && resolvedRightActivePanel === 'camera')
  const effectiveSelectedNodeIds = useMemo(
    () => [selectedNodeId, ...multiSelectedNodeIds].filter(Boolean),
    [multiSelectedNodeIds, selectedNodeId],
  )
  const explicitSelectedNodes = useMemo(
    () => effectiveSelectedNodeIds.map((nodeId) => tree?.nodes.find((node) => node.id === nodeId)).filter(Boolean),
    [effectiveSelectedNodeIds, tree?.nodes],
  )
  const treeNodeById = useMemo(
    () => new Map((tree?.nodes || []).map((node) => [node.id, node])),
    [tree?.nodes],
  )
  const effectiveSelectedRootIds = useMemo(
    () => getSelectionRootIds(tree?.root, effectiveSelectedNodeIds),
    [effectiveSelectedNodeIds, tree?.root],
  )
  const effectiveSelectedActionNodes = useMemo(
    () => effectiveSelectedRootIds.map((nodeId) => tree?.nodes.find((node) => node.id === nodeId)).filter(Boolean),
    [effectiveSelectedRootIds, tree?.nodes],
  )
  const bulkSelectionCount = effectiveSelectedNodeIds.length
  const hasBulkSelection = bulkSelectionCount > 1
  const hasLockedSelectionRoot = explicitSelectedNodes.some((node) => node.parent_id == null)
  const selectionNodesWithTemplates = useMemo(
    () => explicitSelectedNodes.filter((node) => node.identification),
    [explicitSelectedNodes],
  )
  const availableTags = useMemo(
    () =>
      Array.from(
        new Set(
          (tree?.nodes || [])
            .flatMap((node) => node.tags || [])
            .map((tag) => String(tag || '').trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [tree?.nodes],
  )
  const buildCurrentProjectUiSnapshot = useCallback(
    () =>
      normalizeClientProjectUi({
        showGrid,
        canvasTransform: transform,
        selectedNodeIds: effectiveSelectedNodeIds,
        leftSidebarOpen,
        rightSidebarOpen,
        leftSidebarWidth,
        rightSidebarWidth,
        leftActivePanel: resolvedLeftActivePanel,
        rightActivePanel: resolvedRightActivePanel,
        panelDock,
      }),
    [
      effectiveSelectedNodeIds,
      leftSidebarOpen,
      leftSidebarWidth,
      panelDock,
      resolvedLeftActivePanel,
      resolvedRightActivePanel,
      rightSidebarOpen,
      rightSidebarWidth,
      showGrid,
      transform,
    ],
  )
  const setEffectiveSelection = useCallback((nodeIds, preferredPrimaryId = null) => {
    const validIds = Array.from(new Set((nodeIds || []).filter(Boolean))).filter(
      (nodeId) => !tree?.nodes || tree.nodes.some((node) => node.id === nodeId),
    )
    const nextPrimaryId =
      preferredPrimaryId && validIds.includes(preferredPrimaryId)
        ? preferredPrimaryId
        : validIds[0] || null
    selectedNodeIdRef.current = nextPrimaryId
    setSelectedNodeId(nextPrimaryId)
    setMultiSelectedNodeIds(validIds.filter((nodeId) => nodeId !== nextPrimaryId))
  }, [tree?.nodes])
  const addToEffectiveSelection = useCallback((nodeIds, preferredPrimaryId = null) => {
    const mergedIds = Array.from(new Set([...effectiveSelectedNodeIds, ...(nodeIds || []).filter(Boolean)]))
    const nextPrimaryId =
      preferredPrimaryId && mergedIds.includes(preferredPrimaryId)
        ? preferredPrimaryId
        : selectedNodeId && mergedIds.includes(selectedNodeId)
          ? selectedNodeId
          : mergedIds[0] || null
    setEffectiveSelection(mergedIds, nextPrimaryId)
  }, [effectiveSelectedNodeIds, selectedNodeId, setEffectiveSelection])
  const toggleMultiSelection = useCallback((nodeId) => {
    if (!nodeId) {
      return
    }
    if (!effectiveSelectedNodeIds.includes(nodeId)) {
      addToEffectiveSelection([nodeId], selectedNodeId || nodeId)
      return
    }
    const remainingIds = effectiveSelectedNodeIds.filter((id) => id !== nodeId)
    const nextPrimaryId = nodeId === selectedNodeId ? remainingIds[0] || null : selectedNodeId
    setEffectiveSelection(remainingIds, nextPrimaryId)
  }, [addToEffectiveSelection, effectiveSelectedNodeIds, selectedNodeId, setEffectiveSelection])
  const findTreeNodeById = useCallback((nodeId) => tree?.nodes.find((node) => node.id === nodeId) || null, [tree?.nodes])
  const collectSelectionParentIds = useCallback((nodeIds) => {
    const ids = []
    for (const nodeId of nodeIds || []) {
      const node = findTreeNodeById(nodeId)
      const parentId = node?.parent_id ?? null
      if (parentId) {
        ids.push(parentId)
      }
    }
    return Array.from(new Set(ids))
  }, [findTreeNodeById])
  const collectSelectionChildIds = useCallback((nodeIds) => {
    const ids = []
    for (const nodeId of nodeIds || []) {
      const node = findTreeNodeById(nodeId)
      for (const child of node?.children || []) {
        ids.push(child.id)
      }
    }
    return Array.from(new Set(ids))
  }, [findTreeNodeById])
  const replaceSelectionWith = useCallback((nodeIds, preferredPrimaryId = null) => {
    setEffectiveSelection(nodeIds, preferredPrimaryId)
  }, [setEffectiveSelection])
  const appendSelectionWith = useCallback((nodeIds, preferredPrimaryId = null) => {
    addToEffectiveSelection(nodeIds, preferredPrimaryId)
  }, [addToEffectiveSelection])
  const invertEffectiveSelection = useCallback(() => {
    const allNodeIds = (tree?.nodes || []).map((node) => node.id)
    const selectedSet = new Set(effectiveSelectedNodeIds)
    const invertedIds = allNodeIds.filter((nodeId) => !selectedSet.has(nodeId))
    setEffectiveSelection(invertedIds, invertedIds[0] || null)
  }, [effectiveSelectedNodeIds, setEffectiveSelection, tree?.nodes])
  const defaultSearchResultNodeIds = useMemo(
    () => (tree?.nodes || []).filter((node) => node.type !== 'collapsed-group').map((node) => node.id),
    [tree?.nodes],
  )
  const effectiveSearchResultNodeIds = useMemo(
    () => (searchResultsInitialized ? searchResultNodeIds : defaultSearchResultNodeIds),
    [defaultSearchResultNodeIds, searchResultNodeIds, searchResultsInitialized],
  )
  const selectSearchResults = useCallback(() => {
    replaceSelectionWith(effectiveSearchResultNodeIds, effectiveSearchResultNodeIds[0] || null)
  }, [effectiveSearchResultNodeIds, replaceSelectionWith])
  const selectParents = useCallback(() => {
    const parentIds = collectSelectionParentIds(effectiveSelectedNodeIds)
    replaceSelectionWith(parentIds, parentIds[0] || null)
  }, [collectSelectionParentIds, effectiveSelectedNodeIds, replaceSelectionWith])
  const selectChildren = useCallback(() => {
    const childIds = collectSelectionChildIds(effectiveSelectedNodeIds)
    replaceSelectionWith(childIds, childIds[0] || null)
  }, [collectSelectionChildIds, effectiveSelectedNodeIds, replaceSelectionWith])
  const appendSearchResults = useCallback(() => {
    appendSelectionWith(
      effectiveSearchResultNodeIds,
      selectedNodeId || effectiveSearchResultNodeIds[0] || null,
    )
  }, [appendSelectionWith, effectiveSearchResultNodeIds, selectedNodeId])
  const appendParents = useCallback(() => {
    const parentIds = collectSelectionParentIds(effectiveSelectedNodeIds)
    appendSelectionWith(parentIds, selectedNodeId || parentIds[0] || null)
  }, [appendSelectionWith, collectSelectionParentIds, effectiveSelectedNodeIds, selectedNodeId])
  const appendChildren = useCallback(() => {
    const childIds = collectSelectionChildIds(effectiveSelectedNodeIds)
    appendSelectionWith(childIds, selectedNodeId || childIds[0] || null)
  }, [appendSelectionWith, collectSelectionChildIds, effectiveSelectedNodeIds, selectedNodeId])
  const focusPathContext = useMemo(
    () =>
      focusPathMode
        ? buildFocusPathContext(tree?.nodes, selectedNodeId)
        : { pathIds: null, nextById: null },
    [focusPathMode, selectedNodeId, tree?.nodes],
  )
  const visibleRoot = useMemo(
    () =>
      buildVisibleTree(tree?.root, {
        focusPathIds: focusPathContext.pathIds,
        focusNextById: focusPathContext.nextById,
        selectedNodeId,
      }),
    [focusPathContext.nextById, focusPathContext.pathIds, selectedNodeId, tree?.root],
  )
  const layout = useMemo(() => buildLayout(visibleRoot, projectSettings), [projectSettings, visibleRoot])
  const activeCanvasImageUrls = useMemo(() => {
    if (!selectedProjectId || tree?.project?.id !== selectedProjectId) {
      return []
    }

    const urls = new Set()
    for (const item of layout.nodes || []) {
      if (item.node.type === 'collapsed-group') {
        for (const preview of item.node.previewItems || []) {
          if (preview?.imageUrl) {
            urls.add(preview.imageUrl)
          }
        }
        continue
      }

      const nodeImageUrl = item.node.previewUrl || item.node.imageUrl
      if (nodeImageUrl) {
        urls.add(nodeImageUrl)
      }
    }

    return Array.from(urls)
  }, [layout.nodes, selectedProjectId, tree?.project?.id])
  const loadedCanvasImageCount = useMemo(
    () => activeCanvasImageUrls.filter((url) => loadedImages[url]).length,
    [activeCanvasImageUrls, loadedImages],
  )
  const projectLoadProgress = useMemo(() => {
    if (projectTreeLoading) {
      return 0
    }
    if (!activeCanvasImageUrls.length) {
      return 1
    }
    return Math.max(0, Math.min(1, loadedCanvasImageCount / activeCanvasImageUrls.length))
  }, [activeCanvasImageUrls.length, loadedCanvasImageCount, projectTreeLoading])
  const projectVisualLoading =
    !projectTreeLoading &&
    activeCanvasImageUrls.length > 0 &&
    loadedCanvasImageCount < activeCanvasImageUrls.length
  const projectLoading = projectTreeLoading || projectVisualLoading
  const contextMenuNode = tree?.nodes.find((node) => node.id === contextMenu?.nodeId) || null
  const identificationTemplateRemovalNodeIds = useMemo(
    () => identificationTemplateRemoval?.nodeIds || [],
    [identificationTemplateRemoval],
  )
  const identificationTemplateRemovalNodes = useMemo(
    () => identificationTemplateRemovalNodeIds
      .map((nodeId) => tree?.nodes.find((node) => node.id === nodeId))
      .filter(Boolean),
    [identificationTemplateRemovalNodeIds, tree?.nodes],
  )
  const identificationTemplateRemovalCount = identificationTemplateRemovalNodes.length
  const identificationTemplates = useMemo(() => tree?.project?.identificationTemplates || [], [tree?.project?.identificationTemplates])
  const remotePresenceUsers = useMemo(
    () =>
      (projectPresenceUsers || []).map((user) => ({
        ...user,
        color: getPresenceColor(user.userId || user.username),
        initials: getPresenceInitials(user.username),
      })),
    [projectPresenceUsers],
  )
  const remoteSelectionsByNodeId = useMemo(() => {
    const nextMap = new Map()
    for (const user of remotePresenceUsers) {
      if (!user.selectedNodeId) {
        continue
      }
      const items = nextMap.get(user.selectedNodeId) || []
      items.push(user)
      nextMap.set(user.selectedNodeId, items)
    }
    return nextMap
  }, [remotePresenceUsers])
  const canCollapseSelected = useMemo(
    () =>
      effectiveSelectedNodeIds.some((nodeId) => {
        const node = treeNodeById.get(nodeId)
        return Boolean(node?.children?.length && !node.collapsed)
      }),
    [effectiveSelectedNodeIds, treeNodeById],
  )
  const canExpandSelected = useMemo(
    () =>
      effectiveSelectedNodeIds.some((nodeId) => {
        const node = treeNodeById.get(nodeId)
        return Boolean(node?.collapsed)
      }),
    [effectiveSelectedNodeIds, treeNodeById],
  )
  const canCollapseRecursively = useMemo(
    () =>
      effectiveSelectedNodeIds.some((nodeId) => {
        let current = treeNodeById.get(nodeId) || null
        while (current?.parent_id) {
          current = treeNodeById.get(current.parent_id) || null
          if (current) {
            return true
          }
        }
        return false
      }),
    [effectiveSelectedNodeIds, treeNodeById],
  )
  const canExpandRecursively = useMemo(
    () =>
      effectiveSelectedNodeIds.some((nodeId) => {
        const subtreeNode = tree?.root ? findNode(tree.root, nodeId) : null
        return Boolean(subtreeNode?.children?.length)
      }),
    [effectiveSelectedNodeIds, tree?.root],
  )

  const resolveNearestVisibleSelectionId = useCallback((nodeId, nodes) => {
    if (!nodeId || !nodes?.length) {
      return null
    }

    const byId = new Map(nodes.map((node) => [node.id, node]))
    let current = byId.get(nodeId) || null

    while (current) {
      let ancestor = current.parent_id ? byId.get(current.parent_id) || null : null
      let hiddenByCollapsedAncestor = false

      while (ancestor) {
        if (ancestor.collapsed) {
          hiddenByCollapsedAncestor = true
          break
        }
        ancestor = ancestor.parent_id ? byId.get(ancestor.parent_id) || null : null
      }

      if (!hiddenByCollapsedAncestor) {
        return current.id
      }

      current = current.parent_id ? byId.get(current.parent_id) || null : null
    }

    return null
  }, [])

  const getCollapsedSelectionState = useCallback((nextNodes) => {
    if (!nextNodes?.length) {
      return {
        nextPrimaryId: null,
        nextSecondaryIds: [],
        primaryChanged: false,
        secondaryChanged: false,
        selectionChanged: false,
      }
    }

    const currentPrimaryId = selectedNodeIdRef.current || selectedNodeId
    const nextPrimaryId = resolveNearestVisibleSelectionId(currentPrimaryId, nextNodes)
    const nextSecondaryIds = multiSelectedNodeIds.filter(
      (nodeId) => nodeId !== nextPrimaryId && resolveNearestVisibleSelectionId(nodeId, nextNodes) === nodeId,
    )
    const primaryChanged = nextPrimaryId !== currentPrimaryId
    const secondaryChanged =
      nextSecondaryIds.length !== multiSelectedNodeIds.length ||
      nextSecondaryIds.some((nodeId, index) => nodeId !== multiSelectedNodeIds[index])

    return {
      nextPrimaryId,
      nextSecondaryIds,
      primaryChanged,
      secondaryChanged,
      selectionChanged: primaryChanged || secondaryChanged,
    }
  }, [multiSelectedNodeIds, resolveNearestVisibleSelectionId, selectedNodeId])

  const prepareCollapsedSelection = useCallback((nextNodes) => {
    const nextSelection = getCollapsedSelectionState(nextNodes)
    if (!nextSelection.selectionChanged) {
      return nextSelection
    }

    const {
      nextPrimaryId,
      nextSecondaryIds,
      primaryChanged,
      secondaryChanged,
    } = nextSelection

    if (primaryChanged) {
      const anchorNode = nextPrimaryId
        ? layout.nodes.find((item) => item.id === nextPrimaryId) || null
        : null
      selectedLayoutAnchorRef.current = {
        nodeId: nextPrimaryId,
        x: anchorNode?.x ?? null,
        y: anchorNode?.y ?? null,
      }
      selectedNodeIdRef.current = nextPrimaryId
      setSelectedNodeId(nextPrimaryId)
    }

    if (secondaryChanged) {
      setMultiSelectedNodeIds(nextSecondaryIds)
    }

    return nextSelection
  }, [getCollapsedSelectionState, layout.nodes])
  const selectedTemplateEditor =
    identificationTemplates.find((template) => template.id === selectedTemplateEditorId) || null
  const hasTemplateChanges = useMemo(() => {
    if (!selectedTemplateEditor) {
      return false
    }
    const currentSignature = JSON.stringify({
      name: templateForm.name,
      aiInstructions: templateForm.aiInstructions,
      parentDepth: templateForm.parentDepth,
      childDepth: templateForm.childDepth,
      fields: templateForm.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        mode: field.mode,
      })),
    })
    const originalSignature = JSON.stringify({
      name: selectedTemplateEditor.name,
      aiInstructions: selectedTemplateEditor.aiInstructions || '',
      parentDepth: Number(selectedTemplateEditor.parentDepth || 0),
      childDepth: Number(selectedTemplateEditor.childDepth || 0),
      fields: (selectedTemplateEditor.fields || []).map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        mode: field.mode,
      })),
    })
    return currentSignature !== originalSignature
  }, [selectedTemplateEditor, templateForm.aiInstructions, templateForm.childDepth, templateForm.fields, templateForm.name, templateForm.parentDepth])
  const selectedNodePath = useMemo(
    () => buildNodePathEntries(tree?.nodes, selectedNodeId),
    [selectedNodeId, tree?.nodes],
  )
  const selectedNodePathIds = useMemo(
    () => selectedNodePath.map((entry) => entry.id),
    [selectedNodePath],
  )

  useEffect(() => {
    setSearchResultNodeIds([])
    setSearchResultsInitialized(false)
  }, [selectedProjectId])

  useEffect(() => {
    if (canvasIsolationMode === 'search' && !effectiveSearchResultNodeIds.length) {
      setCanvasIsolationMode('none')
      return
    }
    if (canvasIsolationMode === 'path' && !selectedNodePathIds.length) {
      setCanvasIsolationMode('none')
    }
  }, [canvasIsolationMode, effectiveSearchResultNodeIds.length, selectedNodePathIds.length])

  useLayoutEffect(() => {
    const currentLayoutNode = selectedNodeId ? layout.nodes.find((item) => item.id === selectedNodeId) : null
    const previousAnchor = selectedLayoutAnchorRef.current

    if (!currentLayoutNode) {
      selectedLayoutAnchorRef.current = { nodeId: selectedNodeId, x: null, y: null }
      return
    }

    const shouldAnchorSelectedNode =
      previousAnchor.nodeId === selectedNodeId &&
      previousAnchor.x != null &&
      previousAnchor.y != null &&
      !pendingInitialCanvasFitRef.current &&
      (previousAnchor.x !== currentLayoutNode.x || previousAnchor.y !== currentLayoutNode.y)

    if (shouldAnchorSelectedNode) {
      setCanvasTransform((current) => ({
        ...current,
        x: current.x + (previousAnchor.x - currentLayoutNode.x) * current.scale,
        y: current.y + (previousAnchor.y - currentLayoutNode.y) * current.scale,
      }))
    }

    selectedLayoutAnchorRef.current = {
      nodeId: selectedNodeId,
      x: currentLayoutNode.x,
      y: currentLayoutNode.y,
    }
  }, [layout.nodes, selectedNodeId, setCanvasTransform])

  useEffect(() => {
    setProjectUiReady(false)
    pendingInitialCanvasFitRef.current = false
    loadedUiSignatureRef.current = ''
    pendingUiSignatureRef.current = null
  }, [selectedProjectId])

  useEffect(() => {
    if (!pendingProjectTransitionId) {
      return
    }

    if (!selectedProjectId || pendingProjectTransitionId !== selectedProjectId) {
      return
    }

    if (tree?.project?.id === pendingProjectTransitionId && projectUiReady) {
      setPendingProjectTransitionId(null)
    }
  }, [pendingProjectTransitionId, projectUiReady, selectedProjectId, tree?.project?.id])

  useEffect(() => {
    if (!selectedProjectId || !tree?.project || tree.project.id !== selectedProjectId) {
      return
    }

    const nextUi = normalizeClientProjectUi(
      sessionProjectUiByProjectIdRef.current.get(selectedProjectId) ||
        (desktopEnvironment &&
        desktopPersistedWorkspaceState?.projectId === selectedProjectId &&
        desktopPersistedWorkspaceState?.snapshot
          ? desktopPersistedWorkspaceState.snapshot
          : null) ||
        readStoredClientProjectUi(clientProjectUiScopeKey, selectedProjectId) ||
        projectUi,
    )
    const incomingSignature = JSON.stringify(nextUi)
    if (pendingUiSignatureRef.current && incomingSignature !== pendingUiSignatureRef.current) {
      return
    }
    pendingUiSignatureRef.current = null
    loadedUiSignatureRef.current = incomingSignature
    sessionProjectUiByProjectIdRef.current.set(selectedProjectId, nextUi)
    if (isPanelWindow) {
      setProjectUiReady(true)
      return
    }
    setShowGrid(nextUi.showGrid)
    setTransform(nextUi.canvasTransform || { x: 80, y: 80, scale: 1 })
    pendingInitialCanvasFitRef.current = !nextUi.canvasTransform
    const nextSelectionIds = Array.isArray(nextUi.selectedNodeIds)
      ? nextUi.selectedNodeIds.filter((nodeId) => (tree?.nodes || []).some((node) => node.id === nodeId))
      : []
    if (nextSelectionIds.length) {
      setEffectiveSelection(nextSelectionIds, nextSelectionIds[0])
    }
    setLeftSidebarOpen(nextUi.leftSidebarOpen)
    setRightSidebarOpen(nextUi.rightSidebarOpen)
    setLeftSidebarWidth(nextUi.leftSidebarWidth)
    setRightSidebarWidth(nextUi.rightSidebarWidth)
    setLeftActivePanel(nextUi.leftActivePanel)
    setRightActivePanel(nextUi.rightActivePanel)
    setPanelDock(nextUi.panelDock)
    setProjectUiReady(true)
  }, [clientProjectUiScopeKey, desktopEnvironment, desktopPersistedWorkspaceState, isPanelWindow, projectUi, projectUi.canvasTransform, projectUi.leftActivePanel, projectUi.leftSidebarOpen, projectUi.leftSidebarWidth, projectUi.panelDock, projectUi.rightActivePanel, projectUi.rightSidebarOpen, projectUi.rightSidebarWidth, projectUi.selectedNodeIds, projectUi.showGrid, selectedProjectId, setEffectiveSelection, tree?.nodes, tree?.project])

  const handleAuthLost = useCallback(() => {
    initializedAuthProfileIdRef.current = null
    setPendingProjectTransitionId(null)
    setManualProjectSelectionRequired(false)
    setCurrentUser(null)
    setAuthReady(true)
    setProjects([])
    setProjectListLoading(false)
    setSelectedProjectId(null)
    setTree(null)
    setSelectedNodeId(null)
    setMobileConnectionCount(0)
    setAccountStatus('')
    setAccountDialog(null)
    setProjectUiReady(false)
    setAccountForm({
      username: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      deleteConfirmation: '',
    })
    setStatus(desktopEnvironment ? 'Select or repair a desktop server profile to continue.' : 'Sign in to access your projects.')
  }, [desktopEnvironment])

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
  }, [desktopEnvironment, refreshDesktopServerState, showProjectDialog])

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
  }, [])

  const closeDesktopServerManager = useCallback(() => {
    const returnTarget = desktopServerDialogReturnTarget
    setDesktopAccountManagerFocusId(null)
    setDesktopServerDialogOpen(false)
    setDesktopServerDialogReturnTarget(null)
    if (returnTarget === 'open') {
      setShowProjectDialog('open')
    }
  }, [desktopServerDialogReturnTarget])

  const openAccountDialog = useCallback((dialog, profileId = null) => {
    setError('')
    setAccountStatus('')
    if (desktopEnvironment) {
      setDesktopAccountManagerFocusId(String(profileId || '').trim() || desktopAccountManagerFocusId || null)
    }
    setAccountDialog(dialog)
  }, [desktopAccountManagerFocusId, desktopEnvironment])

  const openCacheResetDialog = useCallback(() => {
    setError('')
    setAppDialog('clear-cache')
  }, [])

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
  }, [desktopEnvironment, refreshDesktopServerState])

  async function syncSelectedDesktopAccount(updates) {
    if (!desktopEnvironment || !selectedDesktopServerProfile?.id) {
      return null
    }
    const nextState = await updateDesktopServerProfile(selectedDesktopServerProfile.id, updates)
    if (nextState) {
      setDesktopServerState(nextState)
      configureApiBaseUrl(nextState.proxyBaseUrl || '')
    }
    return nextState
  }

  const loadCurrentUser = useCallback(async () => {
    const hasOpenProject = Boolean(selectedProjectId && tree?.project)

    if (desktopEnvironment && !desktopServerReady) {
      return
    }

    if (desktopEnvironment && !selectedDesktopServerProfileId) {
      initializedAuthProfileIdRef.current = null
      handleAuthLost()
      setStatus('Add a server profile to continue.')
      return
    }

    if (desktopEnvironment && effectiveDesktopServerConnectionStatus !== 'connected') {
      if (showProjectDialog === 'open') {
        if (hasOpenProject) {
          closeDisconnectedProject()
        }
        setError('')
        setProjectListLoading(false)
        setStatus(
          effectiveDesktopServerConnectionStatus === 'invalid_login'
            ? 'The selected server profile has invalid login credentials.'
            : 'The selected server profile is disconnected.',
        )
        return
      }
      if (hasOpenProject || serverDisconnectDialogOpen) {
        closeDisconnectedProject()
        setShowProjectDialog(null)
        setServerDisconnectDialogOpen(true)
        setStatus('The active server profile disconnected.')
        return
      }
      initializedAuthProfileIdRef.current = null
      setCurrentUser(null)
      setAuthReady(true)
      setProjectListLoading(false)
      setProjects([])
      closeDisconnectedProject()
      setStatus(
        effectiveDesktopServerConnectionStatus === 'invalid_login'
          ? 'The selected server profile has invalid login credentials.'
          : 'The selected server profile is disconnected.',
      )
      setShowProjectDialog('open')
      return
    }

    const shouldResetDesktopWorkspace = desktopEnvironment
      ? initializedAuthProfileIdRef.current !== selectedDesktopServerProfileId || !currentUserRef.current
      : !currentUserRef.current

    if (shouldResetDesktopWorkspace) {
      setCurrentUser(null)
      setSelectedProjectId(null)
      setTree(null)
      setSelectedNodeId(null)
      setProjectUiReady(false)
      setMobileConnectionCount(0)
      setAuthReady(false)
      setProjectListLoading(true)
    }

    try {
      const payload = await api('/api/auth/me')
      if (!payload?.authenticated || !payload.user) {
        initializedAuthProfileIdRef.current = null
        handleAuthLost()
        return
      }
      initializedAuthProfileIdRef.current = desktopEnvironment ? selectedDesktopServerProfileId : '__web__'
      const nextUser = payload.user
      const previousUser = currentUserRef.current
      if (
        !previousUser ||
        previousUser.id !== nextUser.id ||
        previousUser.username !== nextUser.username ||
        previousUser.captureSessionId !== nextUser.captureSessionId
      ) {
        setCurrentUser(nextUser)
      }
      setStatus('')
    } finally {
      setAuthReady(true)
    }
  }, [
    closeDisconnectedProject,
    desktopEnvironment,
    desktopServerReady,
    handleAuthLost,
    selectedProjectId,
    effectiveDesktopServerConnectionStatus,
    selectedDesktopServerProfileId,
    showProjectDialog,
    serverDisconnectDialogOpen,
    tree?.project,
  ])

  useEffect(() => {
    if (desktopEnvironment) {
      return
    }
    if (webAuthBootstrapCompleteRef.current) {
      return
    }
    webAuthBootstrapCompleteRef.current = true
    loadCurrentUser().catch((loadError) => {
      handleAuthLost()
      setError(loadError.message)
      setStatus('Unable to initialize authentication.')
    })
  }, [desktopEnvironment, handleAuthLost, loadCurrentUser])

  useEffect(() => {
    if (!desktopEnvironment || !desktopServerReady) {
      return
    }
    loadCurrentUser().catch((loadError) => {
      handleAuthLost()
      setError(loadError.message)
      setStatus('Unable to initialize authentication.')
    })
  }, [desktopEnvironment, desktopServerReady, handleAuthLost, loadCurrentUser])

  async function createServerProfile(payload) {
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
  }

  async function updateServerProfile(id, payload) {
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
  }

  async function deleteServerProfile(id) {
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
  }

  function browseProjectPickerProfile(id) {
    const normalizedId = String(id || '').trim() || null
    if (normalizedId === projectPickerProfileId) {
      return
    }
    setError('')
    setProjectPickerProjects([])
    setProjectPickerLoading(Boolean(normalizedId))
    setProjectPickerProfileId(normalizedId)
  }

  function beginProjectTransition(projectId) {
    const normalizedProjectId = String(projectId || '').trim()
    setPendingProjectTransitionId(normalizedProjectId || null)
  }

  const handleSearchResultsChange = useCallback((nodeIds) => {
    const nextNodeIds = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : []
    setSearchResultsInitialized(true)
    setSearchResultNodeIds((current) => {
      if (current.length === nextNodeIds.length && current.every((nodeId, index) => nodeId === nextNodeIds[index])) {
        return current
      }
      return nextNodeIds
    })
  }, [])

  async function openDesktopProjectFromPicker(profileId, projectId) {
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
  }

  function dismissServerDisconnectDialog() {
    setServerDisconnectDialogOpen(false)
    closeDisconnectedProject()
    setProjects([])
    setStatus('Select a project from another server profile.')
    setShowProjectDialog('open')
  }

  const { loadProjects, loadTree } = useProjectSync({
    clearHistory,
    captureSessionId: currentUser?.captureSessionId || '',
    currentUser,
    desktopEnvironment,
    desktopConnectionStatus: effectiveDesktopServerConnectionStatus,
    getPreferredProjectId,
    projectBootstrapReady: desktopEnvironment ? desktopPersistedWorkspaceReady : true,
    requireManualProjectSelection: manualProjectSelectionRequired,
    onAuthLost: handleAuthLost,
    pendingLocalEventsRef,
    selectedNode,
    selectedNodeIdRef,
    selectedProjectId,
    treeProjectId: tree?.project?.id || null,
    setError,
    setMobileConnectionCount,
    setProjectListLoading,
    setProjects,
    setSelectedNodeId,
    setSelectedProjectId,
    setStatus,
    setTree,
  })

  useEffect(() => {
    if (!desktopEnvironment) {
      desktopReconnectStatusRef.current = null
      return
    }

    const currentStatus = effectiveDesktopServerConnectionStatus || null
    const previousStatus = desktopReconnectStatusRef.current
    desktopReconnectStatusRef.current = currentStatus

    if (currentStatus !== 'connected' || !previousStatus || previousStatus === 'connected' || !currentUser) {
      return
    }

    void loadProjects(manualProjectSelectionRequired ? null : selectedProjectId || getUrlState().projectId || null, {
      silent: showProjectDialog === 'open',
    })
      .then(() => {
        if (!manualProjectSelectionRequired && selectedProjectId) {
          return loadTree(selectedProjectId, selectedNodeIdRef.current)
        }
        return null
      })
      .catch(() => {})
  }, [
    currentUser,
    desktopEnvironment,
    loadProjects,
    loadTree,
    manualProjectSelectionRequired,
    getPreferredProjectId,
    effectiveDesktopServerConnectionStatus,
    selectedProjectId,
    showProjectDialog,
  ])

  useEffect(() => {
    if (!desktopEnvironment || isPanelWindow || !currentUser || !clientProjectUiScopeKey || !selectedProjectId || !projectUiReady) {
      return
    }

    const snapshot = buildCurrentProjectUiSnapshot()
    sessionProjectUiByProjectIdRef.current.set(selectedProjectId, snapshot)
    void updateDesktopWorkspaceState({
      scopeKey: clientProjectUiScopeKey,
      projectId: selectedProjectId,
      snapshot,
    }).catch(() => {})
  }, [
    buildCurrentProjectUiSnapshot,
    clientProjectUiScopeKey,
    currentUser,
    desktopEnvironment,
    isPanelWindow,
    projectUiReady,
    selectedProjectId,
  ])

  useEffect(() => {
    if (desktopEnvironment || isPanelWindow || !currentUser || !clientProjectUiScopeKey || !selectedProjectId || !projectUiReady) {
      return undefined
    }

    const persistCurrentProjectUi = () => {
      const closedAt = Date.now()
      const snapshot = buildCurrentProjectUiSnapshot()
      writeStoredClientProjectUi(clientProjectUiScopeKey, selectedProjectId, snapshot)
      writeStoredLastProjectId(clientProjectUiScopeKey, selectedProjectId, closedAt)
    }

    const handleBeforeUnload = () => {
      persistCurrentProjectUi()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
    }
  }, [buildCurrentProjectUiSnapshot, clientProjectUiScopeKey, currentUser, desktopEnvironment, isPanelWindow, projectUiReady, selectedProjectId])

  const resetClientCache = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      if (desktopEnvironment) {
        await clearDesktopCache()
      } else if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await window.caches.keys()
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)))
      }

      setLoadedImages({})
      setImageLoadRevision((current) => current + 1)
      if (selectedProjectId) {
        await loadTree(selectedProjectId, selectedNodeIdRef.current)
      }
      setStatus('Local cache cleared.')
      setAppDialog(null)
    } catch (cacheError) {
      setError(cacheError.message || 'Unable to reset cache.')
    } finally {
      setBusy(false)
    }
  }, [desktopEnvironment, loadTree, selectedProjectId])

  function markImageLoaded(url) {
    const normalizedUrl = String(url || '').trim()
    if (!normalizedUrl || loadedImagesRef.current[normalizedUrl]) {
      return
    }
    setLoadedImages((current) => (current[normalizedUrl] ? current : { ...current, [normalizedUrl]: true }))
  }

  useEffect(() => {
    if (!authReady) {
      return
    }
    if (currentUser && !selectedProjectId && !tree && !manualProjectSelectionRequired) {
      return
    }
    if (currentUser && selectedProjectId && !tree) {
      return
    }
    updateUrlState(selectedProjectId, selectedNodeId || getUrlState().nodeId)
  }, [authReady, currentUser, manualProjectSelectionRequired, selectedNodeId, selectedProjectId, tree])

  useEffect(() => {
    if (!isDesktopEnvironment() || typeof BroadcastChannel === 'undefined') {
      return undefined
    }

    const channel = new BroadcastChannel(DESKTOP_SELECTION_SYNC_CHANNEL)
    const handleMessage = (event) => {
      const payload = event.data || {}
      if (payload.sourceId === windowInstanceIdRef.current) {
        return
      }

      const nextProjectId = payload.projectId || null
      const nextNodeId = payload.nodeId || null
      const shouldFocus = Boolean(payload.focusNode)
      if (!nextProjectId) {
        return
      }

      const currentProjectId = selectedProjectIdRef.current
      const currentNodeId = selectedNodeIdRef.current
      applyingRemoteSelectionRef.current = true
      updateUrlState(nextProjectId, nextNodeId)
      if (nextProjectId !== currentProjectId) {
        selectedProjectIdRef.current = nextProjectId
        selectedNodeIdRef.current = nextNodeId
        setSelectedProjectId(nextProjectId)
        setSelectedNodeId(nextNodeId)
      } else if (nextNodeId !== currentNodeId) {
        selectedNodeIdRef.current = nextNodeId
        setSelectedNodeId(nextNodeId)
      }
      if (shouldFocus && nextNodeId) {
        pendingFocusNodeIdRef.current = nextNodeId
      }
    }

    channel.addEventListener('message', handleMessage)
    return () => {
      channel.removeEventListener('message', handleMessage)
      channel.close()
    }
  }, [])

  useEffect(() => {
    if (!isDesktopEnvironment() || isPanelWindow || typeof BroadcastChannel === 'undefined' || !selectedProjectId) {
      return
    }
    if (applyingRemoteSelectionRef.current) {
      applyingRemoteSelectionRef.current = false
      return
    }

    const channel = new BroadcastChannel(DESKTOP_SELECTION_SYNC_CHANNEL)
    channel.postMessage({
      sourceId: windowInstanceIdRef.current,
      projectId: selectedProjectId,
      nodeId: selectedNodeId || null,
    })
    channel.close()
  }, [isPanelWindow, selectedNodeId, selectedProjectId])

  useEffect(() => {
    if (!isDesktopEnvironment()) {
      return
    }

    let cancelled = false
    getDesktopWindowState().then((state) => {
      if (!cancelled) {
        setDesktopWindowMaximized(Boolean(state?.maximized))
      }
    })
    const unsubscribe = subscribeDesktopWindowState((state) => {
      setDesktopWindowMaximized(Boolean(state?.maximized))
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    setMultiSelectedNodeIds([])
    setSearchResultNodeIds([])
    setCanvasIsolationMode('none')
    pendingUiSignatureRef.current = null
    loadedUiSignatureRef.current = ''
  }, [selectedProjectId])

  useEffect(() => {
    setMultiSelectedNodeIds((current) =>
      current.filter((nodeId) => nodeId !== selectedNodeId && tree?.nodes.some((node) => node.id === nodeId)),
    )
  }, [selectedNodeId, tree?.nodes])

  useEffect(() => {
    if (!identificationTemplateRemovalNodeIds.length) {
      return
    }
    const validIds = identificationTemplateRemovalNodeIds.filter((nodeId) =>
      (tree?.nodes || []).some((node) => node.id === nodeId),
    )
    if (!validIds.length) {
      setIdentificationTemplateRemoval(null)
      return
    }
    if (validIds.length !== identificationTemplateRemovalNodeIds.length) {
      setIdentificationTemplateRemoval({ nodeIds: validIds })
    }
  }, [identificationTemplateRemovalNodeIds, tree?.nodes])

  useEffect(() => {
    if (!identificationTemplates.length) {
      setSelectedTemplateEditorId((current) => (current == null ? current : null))
      setTemplateFormIfChanged(buildTemplateFormState(null))
      return
    }

    const currentTemplate = identificationTemplates.find((template) => template.id === selectedTemplateEditorId)
    if (currentTemplate) {
      if (hasTemplateChanges) {
        return
      }
      setTemplateFormIfChanged(buildTemplateFormState(currentTemplate))
      return
    }

    const firstTemplate = identificationTemplates[0]
    setSelectedTemplateEditorId((current) => (current === firstTemplate.id ? current : firstTemplate.id))
    setTemplateFormIfChanged(buildTemplateFormState(firstTemplate))
  }, [hasTemplateChanges, identificationTemplates, selectedTemplateEditorId, setTemplateFormIfChanged])


  useEffect(() => {
    if (mobileConnectionCount > 0) {
      setSessionDialogOpen(false)
    }
  }, [mobileConnectionCount])

  useEffect(() => {
    if (!currentUser || !selectedProjectId || (desktopEnvironment && effectiveDesktopServerConnectionStatus !== 'connected')) {
      presenceRequestSequenceRef.current += 1
      projectPresenceSignatureRef.current = '[]'
      setProjectPresenceUsers((current) => (current.length ? [] : current))
      return undefined
    }

    let cancelled = false

    async function refreshPresence() {
      const requestSequence = ++presenceRequestSequenceRef.current
      try {
        const payload = await api(`/api/projects/${selectedProjectId}/presence`)
        if (cancelled || requestSequence !== presenceRequestSequenceRef.current) {
          return
        }
        const nextUsers = Array.isArray(payload.users) ? payload.users : []
        const nextSignature = JSON.stringify(
          nextUsers.map((user) => ({
            userId: user?.userId || '',
            username: user?.username || '',
            selectedNodeId: user?.selectedNodeId || '',
            selectedNodeName: user?.selectedNodeName || '',
          })),
        )
        if (nextSignature === projectPresenceSignatureRef.current) {
          return
        }
        projectPresenceSignatureRef.current = nextSignature
        setProjectPresenceUsers(nextUsers)
      } catch (presenceError) {
        if (presenceError instanceof ApiError && presenceError.status === 401) {
          handleAuthLost()
          return
        }
        if (!cancelled) {
          projectPresenceSignatureRef.current = '[]'
          setProjectPresenceUsers((current) => (current.length ? [] : current))
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshPresence()
      }
    }

    const refreshIntervalMs = desktopEnvironment ? 2500 : 10000

    void refreshPresence()
    const intervalHandle = window.setInterval(() => {
      void refreshPresence()
    }, refreshIntervalMs)
    window.addEventListener('focus', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalHandle)
      window.removeEventListener('focus', handleVisibilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser, desktopEnvironment, effectiveDesktopServerConnectionStatus, handleAuthLost, selectedProjectId])

  useEffect(() => {
    if (resolvedLeftActivePanel !== leftActivePanel) {
      setLeftActivePanel(resolvedLeftActivePanel)
    }
  }, [leftActivePanel, resolvedLeftActivePanel])

  useEffect(() => {
    if (resolvedRightActivePanel !== rightActivePanel) {
      setRightActivePanel(resolvedRightActivePanel)
    }
  }, [resolvedRightActivePanel, rightActivePanel])

  useEffect(() => {
    if (leftSidebarOpen && !resolvedLeftActivePanel) {
      setLeftSidebarOpen(false)
    }
  }, [leftSidebarOpen, resolvedLeftActivePanel])

  useEffect(() => {
    if (rightSidebarOpen && !resolvedRightActivePanel) {
      setRightSidebarOpen(false)
    }
  }, [resolvedRightActivePanel, rightSidebarOpen])

  const applyNodeUpdate = useCallback((updatedNode) => {
    setTree((current) => {
      if (!current) {
        return current
      }

      const nextNodes = current.nodes.map((node) => (node.id === updatedNode.id ? { ...node, ...updatedNode } : node))
      return buildClientTree(current.project, nextNodes)
    })
  }, [])

  function appendNodesToTree(newNodes) {
    setTree((current) => {
      if (!current) {
        return current
      }
      return buildClientTree(current.project, [...current.nodes, ...newNodes])
    })
  }

  function removeNodesFromTree(nodeIds) {
    const removeSet = new Set(nodeIds)
    setTree((current) => {
      if (!current) {
        return current
      }
      return buildClientTree(
        current.project,
        current.nodes.filter((node) => !removeSet.has(node.id)),
      )
    })
  }

  function updateProjectListNodeCount(delta) {
    if (!selectedProjectId || delta === 0) {
      return
    }
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId
          ? { ...project, node_count: Math.max(0, Number(project.node_count || 0) + delta) }
          : project,
        ),
    )
  }

  const applyProjectUpdate = useCallback((updatedProject) => {
    setTree((current) => (current ? { ...current, project: updatedProject } : current))
    setProjects((current) =>
      current.map((project) => (project.id === updatedProject.id ? { ...project, ...updatedProject } : project)),
    )
  }, [])

  const beginLocalEventExpectation = useCallback(() => {
    pendingLocalEventsRef.current += 1
    return () => {
      pendingLocalEventsRef.current = Math.max(0, pendingLocalEventsRef.current - 1)
    }
  }, [])

  const patchNodeRequest = useCallback(async (nodeId, payload, options = {}) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedNode = await api(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!options.skipApply) {
        applyNodeUpdate(updatedNode)
      }
      return updatedNode
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyNodeUpdate, beginLocalEventExpectation])

  async function patchProjectSettingsRequest(projectId, nextSettings) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedProject = await api(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })

      applyProjectUpdate(updatedProject)
      return updatedProject
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }

  const saveNodeMediaEdits = useCallback(async (nodeId, mediaId, imageEdits) => {
    if (!nodeId || !mediaId) {
      return null
    }
    const sequenceKey = `${nodeId}:${mediaId}`
    const saveSequence = (nodeImageEditSequenceRef.current.get(sequenceKey) || 0) + 1
    nodeImageEditSequenceRef.current.set(sequenceKey, saveSequence)
    const rollbackLocalEvent = beginLocalEventExpectation()
    let updatedNode = null
    try {
      updatedNode = await api(`/api/nodes/${nodeId}/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageEdits }),
      })
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
    if (nodeImageEditSequenceRef.current.get(sequenceKey) === saveSequence) {
      applyNodeUpdate(updatedNode)
    }
    return updatedNode
  }, [applyNodeUpdate, beginLocalEventExpectation])

  const setPrimaryMediaRequest = useCallback(async (nodeId, mediaId) => {
    if (!nodeId || !mediaId) {
      return null
    }
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedNode = await api(`/api/nodes/${nodeId}/media/${mediaId}/primary`, {
        method: 'POST',
      })
      applyNodeUpdate(updatedNode)
      return updatedNode
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyNodeUpdate, beginLocalEventExpectation])

  const removeNodeMediaRequest = useCallback(async (nodeId, mediaId) => {
    if (!nodeId || !mediaId) {
      return null
    }
    const performDelete = async () => {
      const rollbackLocalEvent = beginLocalEventExpectation()
      try {
        return await api(`/api/nodes/${nodeId}/media/${mediaId}`, {
          method: 'DELETE',
        })
      } catch (error) {
        rollbackLocalEvent()
        throw error
      }
    }

    try {
      const updatedNode = await performDelete()
      applyNodeUpdate(updatedNode)
      return updatedNode
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && selectedProjectId) {
        const refreshedTree = await loadTree(selectedProjectId, selectedNodeIdRef.current)
        const refreshedNode = refreshedTree?.nodes?.find((item) => item.id === nodeId) || null
        const mediaStillExists = refreshedNode?.media?.some((item) => item.id === mediaId)
        if (!mediaStillExists) {
          return refreshedNode
        }
        const updatedNode = await performDelete()
        applyNodeUpdate(updatedNode)
        return updatedNode
      }
      throw error
    }
  }, [applyNodeUpdate, beginLocalEventExpectation, loadTree, selectedProjectId])

  const mergeNodeIntoPhotoRequest = useCallback(async (sourceNodeId, targetNodeId) => {
    if (!sourceNodeId || !targetNodeId || !selectedProjectId) {
      return null
    }

    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const payload = await api(`/api/nodes/${sourceNodeId}/merge-into-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetNodeId }),
      })
      applyTreePayload(payload.tree)
      setSelectedNodeId(payload.targetNodeId || targetNodeId)
      return payload
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyTreePayload, beginLocalEventExpectation, selectedProjectId])

  const extractNodeMediaToChildRequest = useCallback(async (nodeId, mediaId) => {
    if (!nodeId || !mediaId || !selectedProjectId) {
      return null
    }

    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const payload = await api(`/api/nodes/${nodeId}/media/${mediaId}/extract`, {
        method: 'POST',
      })
      applyTreePayload(payload.tree)
      setSelectedNodeId(payload.newNodeId || null)
      return payload
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyTreePayload, beginLocalEventExpectation, selectedProjectId])

  useEffect(() => {
    if (
      isPanelWindow ||
      !currentUser ||
      !selectedProjectId ||
      !tree?.project ||
      tree.project.id !== selectedProjectId ||
      !projectUiReady
    ) {
      return undefined
    }

    const nextUi = buildCurrentProjectUiSnapshot()
    const signature = JSON.stringify(nextUi)
    if (signature === loadedUiSignatureRef.current) {
      return undefined
    }
    sessionProjectUiByProjectIdRef.current.set(selectedProjectId, nextUi)
    pendingUiSignatureRef.current = signature
    return undefined
  }, [
    buildCurrentProjectUiSnapshot,
    currentUser,
    isPanelWindow,
    selectedProjectId,
    tree?.project,
    projectUiReady,
  ])

  async function setProjectCollapsedStateRequest(projectId, collapsed) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      return await api(`/api/projects/${projectId}/collapse-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collapsed }),
      })
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }

  async function createNodeRequest(projectId, parentId, payload = {}) {
    return api(`/api/projects/${projectId}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentId,
        name: payload.name ?? 'New Node',
        notes: payload.notes ?? '',
        tags: payload.tags ?? '',
      }),
    })
  }

  const moveNodeRequest = useCallback(async (nodeId, payload) => {
    return api(`/api/nodes/${nodeId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }, [])

  const setCollapsedRequest = useCallback(async (nodeId, collapsed) => {
    return api(`/api/nodes/${nodeId}/collapse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collapsed }),
    })
  }, [])

  const buildCollapsedNodes = useCallback((sourceNodes, updatedNode, updatedIds, collapsed) => {
    const updatedIdSet = new Set(updatedIds || [updatedNode.id])
    return (sourceNodes || []).map((node) => {
      if (node.id === updatedNode.id) {
        return { ...node, ...updatedNode }
      }
      if (updatedIdSet.has(node.id)) {
        return { ...node, collapsed }
      }
      return node
    })
  }, [])

  const applyCollapsedState = useCallback((updatedNode, updatedIds, collapsed, options = {}) => {
    const nextNodes = buildCollapsedNodes(tree?.nodes, updatedNode, updatedIds, collapsed)
    if (!options.skipSelectionPreparation) {
      prepareCollapsedSelection(nextNodes)
    }
    setTree((current) => {
      if (!current) {
        return current
      }

      return buildClientTree(current.project, buildCollapsedNodes(current.nodes, updatedNode, updatedIds, collapsed))
    })
  }, [buildCollapsedNodes, prepareCollapsedSelection, tree?.nodes])

  async function deleteNodeRequest(nodeId) {
    return api(`/api/nodes/${nodeId}`, { method: 'DELETE' })
  }

  async function uploadPhotoFilesRequest(projectId, files, targetNodeId, mode = 'photo_node', options = {}) {
    const createdEntries = []

    for (const file of files) {
      const previewFile = await createPreviewFile(file)
      const formData = new FormData()
      if (mode === 'additional_photo') {
        formData.append('additionalPhotoOfId', targetNodeId)
        formData.append('additionalPhoto', 'true')
        formData.append('uploadMode', 'additional_photo')
      } else {
        formData.append('parentId', targetNodeId)
        formData.append('uploadMode', 'photo_node')
      }
      formData.append('name', '<untitled>')
      formData.append('notes', '')
      formData.append('tags', '')
      if (options.imageEdits) {
        formData.append('imageEdits', JSON.stringify(options.imageEdits))
      }
      if (options.templateId) {
        formData.append('templateId', options.templateId)
      }
      formData.append('file', file)
      if (previewFile) {
        formData.append('preview', previewFile)
      }

      const payload = await api(`/api/projects/${projectId}/photos`, {
        method: 'POST',
        body: formData,
      })
      const node = payload?.node || payload
      createdEntries.push({
        mode: payload?.mode || mode,
        node,
        createdNodeId: payload?.createdNodeId || (payload?.node ? null : node?.id) || null,
        mediaId: payload?.mediaId || null,
      })
    }

    return createdEntries
  }

  async function createDeleteSnapshot(node) {
    const nodes = []
    const files = []
    let fileIndex = 0

    async function walk(current) {
      const mediaEntries = []
      for (const mediaItem of current.media || []) {
        const imageFileKey = mediaItem.imageUrl ? `image-${fileIndex++}` : null
        const previewFileKey = mediaItem.previewUrl ? `preview-${fileIndex++}` : null

        if (imageFileKey) {
          const imageBlob = await blobFromUrl(mediaItem.imageUrl)
          files.push({
            key: imageFileKey,
            file: new File([imageBlob], mediaItem.originalFilename || `${current.name}.jpg`, {
              type: imageBlob.type || 'image/jpeg',
            }),
          })
        }

        if (previewFileKey) {
          const previewBlob = await blobFromUrl(mediaItem.previewUrl)
          files.push({
            key: previewFileKey,
            file: new File([previewBlob], `${current.name}-preview.jpg`, {
              type: previewBlob.type || 'image/jpeg',
            }),
          })
        }

        mediaEntries.push({
          id: mediaItem.id,
          is_primary: Boolean(mediaItem.isPrimary),
          sort_order: Number(mediaItem.sortOrder || 0),
          original_filename: mediaItem.originalFilename || null,
          image_edits: mediaItem.imageEdits || null,
          image_file_key: imageFileKey,
          preview_file_key: previewFileKey,
        })
      }

      nodes.push({
        id: current.id,
        owner_user_id: current.ownerUserId || null,
        parent_id: current.childrenParentOverride ?? current.parent_id,
        name: current.name,
        notes: current.notes || '',
        tags: current.tags || [],
        review_status: current.reviewStatus || 'new',
        added_at: current.added_at || current.created_at || null,
        media: mediaEntries,
        identification: current.identification
          ? {
              template_id: current.identification.templateId,
              fields: (current.identification.fields || []).map((field) => ({
                key: field.key,
                value: field.value,
                reviewed: Boolean(field.reviewed),
                reviewed_by_user_id: field.reviewedByUserId || null,
                reviewed_at: field.reviewedAt || null,
                source: field.source || 'manual',
                ai_suggestion: field.aiSuggestion || null,
              })),
            }
          : null,
      })

      for (const child of current.children || []) {
        await walk(child)
      }
    }

    await walk(node)
    return {
      manifest: {
        version: 2,
        root_id: node.id,
        root_parent_id: node.parent_id,
        nodes,
      },
      files,
    }
  }

  async function restoreDeletedSubtree(projectId, snapshot) {
    const formData = new FormData()
    formData.append('manifest', JSON.stringify(snapshot.manifest))
    for (const item of snapshot.files) {
      formData.append(item.key, item.file)
    }

    return api(`/api/projects/${projectId}/subtree-restore`, {
      method: 'POST',
      body: formData,
    })
  }

  async function setAllNodesCollapsed(collapsed) {
    if (!selectedProjectId || !tree?.nodes?.length) {
      return
    }

    const collapsibleIds = tree.nodes
      .filter((node) => node.children?.length || node.collapsed)
      .map((node) => node.id)

    if (collapsibleIds.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const previousById = new Map(
        tree.nodes.filter((node) => collapsibleIds.includes(node.id)).map((node) => [node.id, Boolean(node.collapsed)]),
      )

      const nextNodes = tree.nodes.map((node) =>
        collapsibleIds.includes(node.id) ? { ...node, collapsed } : node,
      )
      prepareCollapsedSelection(nextNodes)
      setTree((current) =>
        current
          ? buildClientTree(current.project, nextNodes)
          : current,
      )

      try {
        await setProjectCollapsedStateRequest(selectedProjectId, collapsed)
      } catch (error) {
        setTree((current) =>
          current
            ? buildClientTree(
                current.project,
                current.nodes.map((node) =>
                  previousById.has(node.id)
                    ? { ...node, collapsed: previousById.get(node.id) }
                    : node,
                ),
              )
            : current,
        )
        throw error
      }

    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
      setOpenMenu(null)
    }
  }

  const moveDraggedNode = useCallback(
    async (nodeId, parentId, asAdditionalPhoto = false) => {
      setBusy(true)
      setError('')

      try {
        const node = tree?.nodes.find((item) => item.id === nodeId)
        if (!node) {
          return
        }

        if (asAdditionalPhoto) {
          const targetNode = tree?.nodes.find((item) => item.id === parentId)
          setMergePhotoConfirmation({
            sourceNodeId: nodeId,
            sourceNodeName: node.name,
            targetNodeId: parentId,
            targetNodeName: targetNode?.name || 'the target node',
          })
          return
        }

        const beforePayload = { parentId: node.parent_id, additionalPhotoOfId: null }
        const afterPayload = { parentId, additionalPhotoOfId: null }
        const rollbackLocalEvent = beginLocalEventExpectation()
        let updatedNode = null
        try {
          updatedNode = await moveNodeRequest(nodeId, afterPayload)
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
        applyNodeUpdate(updatedNode)
        setSelectedNodeId(nodeId)
        pushHistory({
          undo: async () => {
            const rollbackUndoEvent = beginLocalEventExpectation()
            let revertedNode = null
            try {
              revertedNode = await moveNodeRequest(nodeId, beforePayload)
            } catch (error) {
              rollbackUndoEvent()
              throw error
            }
            applyNodeUpdate(revertedNode)
            setSelectedNodeId(nodeId)
          },
          redo: async () => {
            const rollbackRedoEvent = beginLocalEventExpectation()
            let redoneNode = null
            try {
              redoneNode = await moveNodeRequest(nodeId, afterPayload)
            } catch (error) {
              rollbackRedoEvent()
              throw error
            }
            applyNodeUpdate(redoneNode)
            setSelectedNodeId(nodeId)
          },
        })
      } catch (submitError) {
        setError(submitError.message)
      } finally {
        setBusy(false)
      }
    },
    [applyNodeUpdate, beginLocalEventExpectation, moveNodeRequest, pushHistory, tree?.nodes],
  )

  async function confirmMergeNodeIntoPhoto() {
    if (!mergePhotoConfirmation) {
      return
    }

    setError('')
    setBusy(true)
    try {
      await mergeNodeIntoPhotoRequest(
        mergePhotoConfirmation.sourceNodeId,
        mergePhotoConfirmation.targetNodeId,
      )
      setSelectedNodeId(mergePhotoConfirmation.targetNodeId)
      setMergePhotoConfirmation(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  const {
    editForm,
    editTargetId,
    editTargetNode,
    nameInputRef,
    saveNodeDraft,
    setEditForm,
    setEditTargetId,
  } = useNodeEditing({
    applyNodeUpdate,
    patchNodeRequest,
    pushHistory,
    selectedNode,
    setError,
    setSelectedNodeId,
    tree,
  })

  useEffect(() => {
    setError('')
  }, [selectedNodeId, selectedProjectId])

  useEffect(() => {
    if (!selectedNode) {
      setEditTargetId(null)
      setEditForm({ name: '', notes: '', tags: [] })
      return
    }

    if (selectedNode.id === editTargetId) {
      return
    }

    setEditTargetId(selectedNode.id)
    setEditForm({
      name: selectedNode.name,
      notes: selectedNode.notes || '',
      tags: selectedNode.tags || [],
    })
  }, [editTargetId, selectedNode, setEditForm, setEditTargetId])

  useEffect(() => {
    function closeContextMenu(event) {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.node-context-menu, .sidebar-context-menu')) {
        return
      }
      setContextMenu(null)
      setSidebarContextMenu(null)
    }

    window.addEventListener('pointerdown', closeContextMenu)
    return () => {
      window.removeEventListener('pointerdown', closeContextMenu)
    }
  }, [])

  useEffect(() => {
    function closeMenus(event) {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.menu-wrap')) {
        return
      }
      setOpenMenu(null)
    }

    window.addEventListener('pointerdown', closeMenus)
    return () => {
      window.removeEventListener('pointerdown', closeMenus)
    }
  }, [])

  useEffect(() => {
    if (!error) {
      return undefined
    }

    function clearTransientError(event) {
      if (event.type === 'keydown') {
        const key = event.key
        if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
          return
        }
      }
      setError('')
    }

    window.addEventListener('pointerdown', clearTransientError, true)
    window.addEventListener('keydown', clearTransientError, true)

    return () => {
      window.removeEventListener('pointerdown', clearTransientError, true)
      window.removeEventListener('keydown', clearTransientError, true)
    }
  }, [error])

  async function handleAuthSubmit(endpoint, payload) {
    setBusy(true)
    setError('')
    try {
      const user = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (user?.ok === false) {
        setError(user.error || 'Request failed')
        return
      }
      setCurrentUser(user)
      setAuthReady(true)
      if (desktopEnvironment) {
        await refreshDesktopServerState()
      }
      await loadProjects(getUrlState().projectId)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function loginUser(payload) {
    await handleAuthSubmit('/api/auth/login', payload)
  }

  async function registerUser(payload) {
    await handleAuthSubmit('/api/auth/register', payload)
  }

  async function logoutUser() {
    setBusy(true)
    setError('')
    setAccountStatus('')
    try {
      await api('/api/auth/logout', { method: 'POST' })
      handleAuthLost()
      if (desktopEnvironment) {
        await refreshDesktopServerState()
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function createProject() {
    if (!projectName.trim()) {
      return
    }

    setBusy(true)
    setError('')

    try {
      if (desktopEnvironment) {
        const targetProfileId = String(projectPickerProfileId || desktopServerState.selectedProfileId || '').trim()
        const targetProfile =
          desktopServerState.profiles.find((profile) => profile.id === targetProfileId) || null

        if (!targetProfile || targetProfile.connectionStatus !== 'connected') {
          setError('Choose a connected server profile before creating a project.')
          return
        }

        const created = await createDesktopProjectForProfile(targetProfileId, projectName.trim())
        let nextDesktopState = desktopServerState

        if (desktopServerState.selectedProfileId !== targetProfileId) {
          const updatedState = await selectDesktopServerProfile(targetProfileId)
          if (updatedState) {
            nextDesktopState = updatedState
            setDesktopServerState(updatedState)
            configureApiBaseUrl(updatedState.proxyBaseUrl || '')
          }
        }

        const activeProfile =
          nextDesktopState.profiles.find((profile) => profile.id === targetProfileId) || targetProfile

        if (activeProfile?.authenticated) {
          setCurrentUser({
            id: activeProfile.userId,
            username: activeProfile.username,
            captureSessionId: activeProfile.captureSessionId,
          })
        }

        initializedAuthProfileIdRef.current = targetProfileId
        beginProjectTransition(created.project.id)
        setManualProjectSelectionRequired(false)
        updateUrlState(created.project.id, created.root?.id || null, getUrlState().transform)
        setProjectName('')
        setShowProjectDialog(null)
        setOpenMenu(null)
        setStatus('')
        setProjectListLoading(false)
        setSelectedProjectId(created.project.id)
        applyTreePayload(created)
        setSelectedNodeId(created.root?.id || null)
        await loadProjects(created.project.id, { silent: true })
        return
      }

      const created = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim(), description: '' }),
      })

      beginProjectTransition(created.project.id)
      setManualProjectSelectionRequired(false)
      setProjectName('')
      setShowProjectDialog(null)
      setOpenMenu(null)
      applyTreePayload(created)
      await loadProjects(created.project.id)
      setSelectedNodeId(created.root.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function applyIdentificationTemplateRequest(nodeId, templateId) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedNode = await api(`/api/nodes/${nodeId}/identification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      })
      applyNodeUpdate(updatedNode)
      return updatedNode
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }

  async function applyIdentificationTemplateToSelection(templateId) {
    if (!templateId || !explicitSelectedNodes.length) {
      return
    }

    setError('')
    setBusy(true)
    try {
      const response = await api(`/api/projects/${selectedProjectId}/identification/apply-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          nodeIds: explicitSelectedNodes.map((node) => node.id),
        }),
      })
      applyTreePayload(response.tree)
      setProjects((current) =>
        current.map((project) =>
          project.id === response.tree.project.id
            ? { ...project, ...response.tree.project, node_count: response.tree.nodes.length }
            : project,
        ),
      )
      setShowProjectDialog(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmApplyTemplateSelection() {
    if (!applyTemplateConfirmation) {
      return
    }

    setError('')
    setBusy(true)
    try {
      if (applyTemplateConfirmation.nodeId) {
        await applyIdentificationTemplateRequest(
          applyTemplateConfirmation.nodeId,
          applyTemplateConfirmation.templateId,
        )
      } else {
        await applyIdentificationTemplateToSelection(applyTemplateConfirmation.templateId)
      }
      setApplyTemplateConfirmation(null)
      setShowProjectDialog(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  function requestRemoveIdentificationTemplates(nodeIds) {
    const targetIds = Array.from(new Set((nodeIds || []).filter(Boolean))).filter(
      (nodeId) => (tree?.nodes || []).some((node) => node.id === nodeId && node.identification),
    )
    if (!targetIds.length) {
      return
    }
    setIdentificationTemplateRemoval({ nodeIds: targetIds })
  }

  async function confirmRemoveIdentificationTemplate() {
    if (!identificationTemplateRemovalNodeIds.length) {
      return
    }
    setError('')
    setBusy(true)
    try {
      const response = await api(`/api/projects/${selectedProjectId}/identification/remove-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeIds: identificationTemplateRemovalNodeIds,
        }),
      })
      applyTreePayload(response.tree)
      setProjects((current) =>
        current.map((project) =>
          project.id === response.tree.project.id
            ? { ...project, ...response.tree.project, node_count: response.tree.nodes.length }
            : project,
        ),
      )
      setIdentificationTemplateRemoval(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  function createEmptyTemplateField() {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key: '',
      label: '',
      type: 'text',
      mode: 'manual',
    }
  }

  async function createOrUpdateTemplateRequest(projectId, payload, templateId = null) {
    const response = await api(
      templateId ? `/api/projects/${projectId}/templates/${templateId}` : `/api/projects/${projectId}/templates`,
      {
        method: templateId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    if (response?.ok === false) {
      throw new Error(response.error || 'Unable to save template')
    }
    applyTreePayload(response.tree)
    applyProjectUpdate(response.tree.project)
    return response.tree
  }

  async function deleteTemplateRequest(projectId, templateId) {
    const response = await api(`/api/projects/${projectId}/templates/${templateId}`, {
      method: 'DELETE',
    })
    if (response?.ok === false) {
      throw new Error(response.error || 'Unable to delete template')
    }
    applyTreePayload(response.tree)
    applyProjectUpdate(response.tree.project)
    return response.tree
  }

  async function submitTemplateDialog(modeOverride = null) {
    const effectiveMode = modeOverride || templateDialog?.mode || 'create'
    const effectiveTemplateId = effectiveMode === 'confirm-save' ? templateDialog?.templateId || selectedTemplateEditorId : null
    if (!selectedProjectId || (effectiveMode === 'confirm-save' && !effectiveTemplateId)) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const nextTree = await createOrUpdateTemplateRequest(
        selectedProjectId,
        {
          name: templateForm.name,
          aiInstructions: templateForm.aiInstructions,
          parentDepth: templateForm.parentDepth,
          childDepth: templateForm.childDepth,
          fields: templateForm.fields,
        },
        effectiveMode === 'confirm-save' ? effectiveTemplateId : null,
      )
      if (effectiveMode === 'confirm-save' && effectiveTemplateId) {
        setSelectedTemplateEditorId(effectiveTemplateId)
      } else if (effectiveMode === 'create') {
        setSelectedTemplateEditorId(nextTree?.project?.identificationTemplates?.at(-1)?.id || null)
      }
      setTemplateDialog(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteTemplate() {
    if (!selectedProjectId || !templateDialog?.templateId) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await deleteTemplateRequest(selectedProjectId, templateDialog.templateId)
      setSelectedTemplateEditorId(null)
      setTemplateDialog(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function patchIdentificationFieldRequest(nodeId, fieldKey, payload) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    const currentNode = treeRef.current?.nodes?.find((node) => node.id === nodeId) || null
    const previousNode = currentNode ? { ...currentNode, identification: currentNode.identification ? JSON.parse(JSON.stringify(currentNode.identification)) : null } : null
    try {
      if (currentNode?.identification) {
        const nextFields = currentNode.identification.fields.map((field) => {
          if (field.key !== fieldKey) {
            return field
          }
          const nextValue = Object.prototype.hasOwnProperty.call(payload || {}, 'value')
            ? field.type === 'list'
              ? Array.isArray(payload.value)
                ? payload.value
                : String(payload.value || '')
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
              : String(payload.value ?? '')
            : field.value
          const nextReviewed = Object.prototype.hasOwnProperty.call(payload || {}, 'reviewed')
            ? Boolean(payload.reviewed)
            : field.reviewed
          return {
            ...field,
            value: nextValue,
            reviewed: nextReviewed,
          }
        })
        const reviewedFieldCount = nextFields.filter((field) => field.reviewed).length
        const totalReviewFieldCount = nextFields.length
        applyNodeUpdate({
          ...currentNode,
          identification: {
            ...currentNode.identification,
            fields: nextFields,
            reviewedFieldCount,
            totalReviewFieldCount,
            missingRequiredCount: Math.max(0, totalReviewFieldCount - reviewedFieldCount),
            status: totalReviewFieldCount > 0 && reviewedFieldCount === totalReviewFieldCount ? 'reviewed' : 'incomplete',
          },
        })
      }
      const response = await api(`/api/nodes/${nodeId}/identification/fields/${encodeURIComponent(fieldKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response?.ok === false) {
        throw new Error(response.error || 'Unable to update identification field')
      }
      applyNodeUpdate(response.node)
      return response.node
    } catch (error) {
      if (previousNode) {
        applyNodeUpdate(previousNode)
      }
      rollbackLocalEvent()
      throw error
    }
  }

  async function patchNodeReviewStatusRequest(nodeId, reviewStatus) {
    if (!nodeId) {
      return null
    }
    const currentNode = treeRef.current?.nodes?.find((node) => node.id === nodeId) || null
    if (currentNode) {
      applyNodeUpdate({
        ...currentNode,
        reviewStatus,
        needsAttention: reviewStatus === 'needs_attention',
      })
    }
    try {
      return await patchNodeRequest(nodeId, { reviewStatus })
    } catch (error) {
      if (currentNode) {
        applyNodeUpdate(currentNode)
      }
      throw error
    }
  }

  async function runIdentificationAiFillRequest(nodeId) {
    if (!nodeId) {
      return
    }
    setAiFillNodeId(nodeId)
    setBusy(true)
    setError('')
    try {
      const response = await api(`/api/nodes/${nodeId}/identification/ai-fill`, {
        method: 'POST',
      })
      if (response?.ok === false) {
        throw new Error(response.error || 'Unable to run AI fill')
      }
      if (response?.node) {
        applyNodeUpdate(response.node)
      }
      if (response?.message) {
        setStatus(response.message)
      }
    } catch (runError) {
      setError(runError.message)
    } finally {
      setAiFillNodeId(null)
      setBusy(false)
    }
  }

  function selectTemplateEditor(templateId) {
    const template = identificationTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }
    setSelectedTemplateEditorId(template.id)
    setTemplateForm({
      name: template.name || '',
      aiInstructions: template.aiInstructions || '',
      parentDepth: Number(template.parentDepth || 0),
      childDepth: Number(template.childDepth || 0),
      fields:
        template.fields?.map((field) => ({
          id: `${template.id}-${field.key}`,
          key: field.key,
          label: field.label,
          type: field.type,
          mode: field.mode || 'manual',
        })) || [],
    })
  }

  async function createNewTemplate() {
    if (!selectedProjectId) {
      return
    }
    setError('')
    setBusy(true)
    try {
      const nextTree = await createOrUpdateTemplateRequest(selectedProjectId, {
        name: 'New Template',
        aiInstructions: '',
        parentDepth: 0,
        childDepth: 0,
        fields: [],
      })
      const nextTemplate = nextTree?.project?.identificationTemplates?.at(-1) || null
      if (nextTemplate) {
        setSelectedTemplateEditorId(nextTemplate.id)
        setTemplateForm({
          name: nextTemplate.name || '',
          aiInstructions: nextTemplate.aiInstructions || '',
          parentDepth: Number(nextTemplate.parentDepth || 0),
          childDepth: Number(nextTemplate.childDepth || 0),
          fields: (nextTemplate.fields || []).map((field) => ({
            id: `${nextTemplate.id}-${field.key || Math.random().toString(36).slice(2, 8)}`,
            key: field.key,
            label: field.label,
            type: field.type,
            mode: field.mode || 'manual',
          })),
        })
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function duplicateTemplate() {
    if (!selectedTemplateEditor || !selectedProjectId) {
      return
    }
    setError('')
    setBusy(true)
    try {
      const nextTree = await createOrUpdateTemplateRequest(selectedProjectId, {
        name: `${selectedTemplateEditor.name} Copy`,
        aiInstructions: templateForm.aiInstructions,
        parentDepth: templateForm.parentDepth,
        childDepth: templateForm.childDepth,
        fields: templateForm.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          mode: field.mode,
        })),
      })
      const nextTemplate = nextTree?.project?.identificationTemplates?.at(-1) || null
      if (nextTemplate) {
        setSelectedTemplateEditorId(nextTemplate.id)
        setTemplateForm({
          name: nextTemplate.name || '',
          aiInstructions: nextTemplate.aiInstructions || '',
          parentDepth: Number(nextTemplate.parentDepth || 0),
          childDepth: Number(nextTemplate.childDepth || 0),
          fields: (nextTemplate.fields || []).map((field) => ({
            id: `${nextTemplate.id}-${field.key || Math.random().toString(36).slice(2, 8)}`,
            key: field.key,
            label: field.label,
            type: field.type,
            mode: field.mode || 'manual',
          })),
        })
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function importTemplateFromProject(sourceProjectId, sourceTemplateId) {
    if (!selectedProjectId || !sourceProjectId || !sourceTemplateId) {
      return
    }

    setError('')
    setBusy(true)
    try {
      const sourceProject = projects.find((project) => project.id === sourceProjectId) || null
      const sourceTemplate = sourceProject?.identificationTemplates?.find((template) => template.id === sourceTemplateId) || null
      if (!sourceTemplate) {
        throw new Error('Template not found in the selected project')
      }

      const nextTree = await createOrUpdateTemplateRequest(selectedProjectId, {
        name: sourceTemplate.name,
        aiInstructions: sourceTemplate.aiInstructions || '',
        parentDepth: Number(sourceTemplate.parentDepth || 0),
        childDepth: Number(sourceTemplate.childDepth || 0),
        fields: (sourceTemplate.fields || []).map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          mode: field.mode || 'manual',
        })),
      })
      const nextTemplate = nextTree?.project?.identificationTemplates?.at(-1) || null
      if (nextTemplate) {
        setSelectedTemplateEditorId(nextTemplate.id)
        setTemplateForm({
          name: nextTemplate.name || '',
          aiInstructions: nextTemplate.aiInstructions || '',
          parentDepth: Number(nextTemplate.parentDepth || 0),
          childDepth: Number(nextTemplate.childDepth || 0),
          fields: (nextTemplate.fields || []).map((field) => ({
            id: `${nextTemplate.id}-${field.key || Math.random().toString(36).slice(2, 8)}`,
            key: field.key,
            label: field.label,
            type: field.type,
            mode: field.mode || 'manual',
          })),
        })
      }
      setImportTemplateDialog(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  function updateTemplateField(action, index = null, value = null) {
    if (action === 'name') {
      setTemplateForm((current) => ({ ...current, name: String(value || '') }))
      return
    }
    if (action === 'aiInstructions') {
      setTemplateForm((current) => ({ ...current, aiInstructions: String(value || '') }))
      return
    }
    if (action === 'parentDepth' || action === 'childDepth') {
      setTemplateForm((current) => ({
        ...current,
        [action]: Math.max(0, Math.min(5, Number.parseInt(value, 10) || 0)),
      }))
      return
    }
    if (action === 'add') {
      setTemplateForm((current) => ({ ...current, fields: [...current.fields, createEmptyTemplateField()] }))
      return
    }
    if (action === 'remove') {
      setTemplateForm((current) => ({
        ...current,
        fields: current.fields.filter((_, currentIndex) => currentIndex !== index),
      }))
      return
    }

    setTemplateForm((current) => ({
      ...current,
      fields: current.fields.map((field, currentIndex) =>
        currentIndex === index
          ? {
              ...field,
              [action]: value,
            }
          : field,
      ),
    }))
  }

  function requestSaveTemplate() {
    setError('')
    if (!selectedTemplateEditor) {
      return
    }
    const originalFields = (selectedTemplateEditor.fields || []).map((field) => ({
      key: String(field.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
      label: String(field.label || '').trim(),
      type: field.type || 'text',
      mode: field.mode || 'manual',
    }))
    const nextFields = templateForm.fields.map((field) => ({
      key: String(field.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
      label: String(field.label || '').trim(),
      type: field.type || 'text',
      mode: field.mode || 'manual',
    }))
    const modifiesExistingField = originalFields.some((field, index) => {
      const nextField = nextFields[index]
      if (!nextField) {
        return true
      }
      return (
        field.key !== nextField.key ||
        field.label !== nextField.label ||
        field.type !== nextField.type ||
        field.mode !== nextField.mode
      )
    })
    const affectsData = Number(selectedTemplateEditor.usageCount || 0) > 0 && modifiesExistingField
    if (!affectsData) {
      void submitTemplateDialog('confirm-save')
      return
    }
    setTemplateDialog({
      mode: 'confirm-save',
      templateId: selectedTemplateEditor.id,
      templateName: selectedTemplateEditor.name,
      usageCount: Number(selectedTemplateEditor.usageCount || 0),
      systemKey: selectedTemplateEditor.systemKey || null,
      affectsData: true,
    })
  }

  function requestDeleteTemplate() {
    if (!selectedTemplateEditor) {
      return
    }
    setError('')
    setTemplateDialog({
      mode: 'delete',
      templateId: selectedTemplateEditor.id,
      templateName: selectedTemplateEditor.name,
      usageCount: Number(selectedTemplateEditor.usageCount || 0),
      systemKey: selectedTemplateEditor.systemKey || null,
      affectsData: Number(selectedTemplateEditor.usageCount || 0) > 0,
    })
  }

  async function renameProject() {
    if (!selectedProjectId || !projectName.trim()) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const updatedTree = await patchProjectNameRequest(selectedProjectId, projectName.trim())
      if (selectedNodeId && updatedTree?.nodes) {
        const refreshedSelectedNode = updatedTree.nodes.find((node) => node.id === selectedNodeId)
        if (refreshedSelectedNode) {
          setEditForm({
            name: refreshedSelectedNode.name,
            notes: refreshedSelectedNode.notes || '',
            tags: refreshedSelectedNode.tags || [],
          })
        }
      }
      setShowProjectDialog(null)
      setProjectName('')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject() {
    if (!tree?.project) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await api(`/api/projects/${tree.project.id}`, { method: 'DELETE' })
      setOpenMenu(null)
      setShowProjectDialog(null)
      setDeleteProjectText('')
      await loadProjects()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function persistProjectSettings(nextSettings) {
    if (!selectedProjectId) {
      return
    }

    try {
      const previousSettings = { ...(tree?.project?.settings || defaultProjectSettings) }
      setTree((current) =>
        current ? { ...current, project: { ...current.project, settings: nextSettings } } : current,
      )
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProjectId ? { ...project, settings: nextSettings } : project,
        ),
      )

      try {
        await patchProjectSettingsRequest(selectedProjectId, nextSettings)
      } catch (error) {
        setTree((current) =>
          current ? { ...current, project: { ...current.project, settings: previousSettings } } : current,
        )
        setProjects((current) =>
          current.map((project) =>
            project.id === selectedProjectId ? { ...project, settings: previousSettings } : project,
          ),
        )
        throw error
      }
      pushHistory({
        undo: async () => patchProjectSettingsRequest(selectedProjectId, previousSettings),
        redo: async () => patchProjectSettingsRequest(selectedProjectId, nextSettings),
      })
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function resetProjectSettings() {
    await persistProjectSettings(defaultProjectSettings)
  }

  async function saveProjectOpenAiKey() {
    if (!selectedProjectId || !projectApiKeyInput.trim()) {
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = await api(`/api/projects/${selectedProjectId}/openai-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: projectApiKeyInput.trim() }),
      })
      if (payload?.ok === false) {
        setError(payload.error || 'Unable to save API key')
        return
      }
      applyProjectUpdate(payload)
      setProjectApiKeyInput('')
      setShowProjectDialog(null)
      setStatus('Project OpenAI API key updated.')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function clearProjectOpenAiKey() {
    if (!selectedProjectId) {
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = await api(`/api/projects/${selectedProjectId}/openai-key`, {
        method: 'DELETE',
      })
      if (payload?.ok === false) {
        setError(payload.error || 'Unable to clear API key')
        return
      }
      applyProjectUpdate(payload)
      setStatus('Project OpenAI API key removed.')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function addCollaborator() {
    if (!selectedProjectId || !collaboratorUsername.trim()) {
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = await api(`/api/projects/${selectedProjectId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: collaboratorUsername.trim().toLowerCase() }),
      })
      if (payload?.ok === false) {
        setError(payload.error || 'Unable to add collaborator')
        return
      }
      setTree((current) =>
        current
          ? {
              ...current,
              project: {
                ...current.project,
                ownerUsername: payload.owner?.username || current.project.ownerUsername,
                isPublic: Boolean(payload.isPublic),
                collaborators: payload.collaborators || [],
                canManageUsers: payload.canManageUsers,
              },
            }
          : current,
      )
      setCollaboratorUsername('')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeCollaborator(userId) {
    if (!selectedProjectId || !userId) {
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = await api(`/api/projects/${selectedProjectId}/collaborators/${userId}`, {
        method: 'DELETE',
      })
      setTree((current) =>
        current
          ? {
              ...current,
              project: {
                ...current.project,
                ownerUsername: payload.owner?.username || current.project.ownerUsername,
                isPublic: Boolean(payload.isPublic),
                collaborators: payload.collaborators || [],
                canManageUsers: payload.canManageUsers,
              },
            }
          : current,
      )
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function persistProjectAccess(isPublic) {
    if (!selectedProjectId) {
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = await api(`/api/projects/${selectedProjectId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic }),
      })
      applyProjectUpdate(payload)
      setCollaboratorUsername('')
      setStatus(isPublic ? 'Project is now public.' : 'Project is now private.')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function exportProject() {
    await downloadProjectExport(`/api/projects/${selectedProjectId}/export`, exportFileName.trim() || tree?.project?.name || 'project')
  }

  async function exportMediaTree() {
    await downloadProjectExport(
      `/api/projects/${selectedProjectId}/export-media`,
      exportFileName.trim() || `${tree?.project?.name || 'project'}-media`,
    )
  }

  async function downloadProjectExport(url, downloadName) {
    if (!selectedProjectId) {
      return
    }

    setBusy(true)
    setError('')
    setTransferProgress(0)

    try {
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Export failed')
      }

      const total = Number(response.headers.get('content-length')) || 0
      const reader = response.body?.getReader()
      const chunks = []
      let loaded = 0

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          chunks.push(value)
          loaded += value.length
          setTransferProgress(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null)
        }
      }

      const blob = new Blob(chunks, { type: 'application/zip' })
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${downloadName}.zip`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
      setTransferProgress(100)
      setShowProjectDialog(null)
      setOpenMenu(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
      window.setTimeout(() => setTransferProgress(null), 400)
    }
  }

  async function patchProjectNameRequest(projectId, name) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedTree = await api(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      applyTreePayload(updatedTree)
      setProjects((current) =>
        current.map((project) => (project.id === updatedTree.project.id ? updatedTree.project : project)),
      )
      return updatedTree
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }

  async function changeUsername() {
    if (!accountForm.username.trim()) {
      return
    }

    setBusy(true)
    setError('')
    setAccountStatus('')
    try {
      if (desktopEnvironment && managedDesktopAccountProfile?.id) {
        const response = await changeDesktopProfileAccountUsername(managedDesktopAccountProfile.id, accountForm.username.trim())
        if (response?.desktopState) {
          setDesktopServerState(response.desktopState)
          configureApiBaseUrl(response.desktopState.proxyBaseUrl || '')
        }
        if (managedDesktopAccountProfile.id === desktopServerState.selectedProfileId && response?.user) {
          setCurrentUser(response.user)
        }
        setAccountForm((current) => ({ ...current, username: '', deleteConfirmation: '' }))
        setAccountStatus('Username updated.')
        setAccountDialog(null)
        return
      }

      const user = await api('/api/account/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: accountForm.username.trim() }),
      })
      if (user?.ok === false) {
        setError(user.error || 'Unable to change username')
        return
      }
      setCurrentUser(user)
      setAccountForm((current) => ({ ...current, username: '', deleteConfirmation: '' }))
      setAccountStatus('Username updated.')
      setAccountDialog(null)
      if (desktopEnvironment) {
        await syncSelectedDesktopAccount({ username: accountForm.username.trim() })
        await refreshDesktopServerState()
      }
      await loadProjects(selectedProjectId)
      if (selectedProjectId) {
        await loadTree(selectedProjectId, selectedNodeIdRef.current)
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword() {
    if (!accountForm.currentPassword || !accountForm.newPassword || accountForm.newPassword !== accountForm.confirmPassword) {
      return
    }

    setBusy(true)
    setError('')
    setAccountStatus('')
    try {
      if (desktopEnvironment && managedDesktopAccountProfile?.id) {
        const response = await changeDesktopProfileAccountPassword(
          managedDesktopAccountProfile.id,
          accountForm.currentPassword,
          accountForm.newPassword,
        )
        if (response?.desktopState) {
          setDesktopServerState(response.desktopState)
          configureApiBaseUrl(response.desktopState.proxyBaseUrl || '')
        }
        setAccountForm((current) => ({ ...current, currentPassword: '', newPassword: '', confirmPassword: '' }))
        setAccountStatus('Password updated.')
        setAccountDialog(null)
        return
      }

      const payload = await api('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: accountForm.currentPassword,
          newPassword: accountForm.newPassword,
        }),
      })
      if (payload?.ok === false) {
        setError(payload.error || 'Unable to change password')
        return
      }
      setAccountForm((current) => ({ ...current, currentPassword: '', newPassword: '', confirmPassword: '' }))
      setAccountStatus('Password updated.')
      setAccountDialog(null)
      if (desktopEnvironment) {
        await syncSelectedDesktopAccount({ password: accountForm.newPassword })
        await refreshDesktopServerState()
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    const accountDialogUsername = managedDesktopAccountProfile?.username || currentUser?.username || ''
    if (accountForm.deleteConfirmation !== accountDialogUsername) {
      return
    }

    setBusy(true)
    setError('')
    setAccountStatus('')
    try {
      if (desktopEnvironment && managedDesktopAccountProfile?.id) {
        const response = await deleteDesktopProfileAccount(managedDesktopAccountProfile.id, accountForm.deleteConfirmation)
        if (response?.desktopState) {
          setDesktopServerState(response.desktopState)
          configureApiBaseUrl(response.desktopState.proxyBaseUrl || '')
        }
        if (managedDesktopAccountProfile.id === desktopServerState.selectedProfileId) {
          handleAuthLost()
        }
        setAccountDialog(null)
        setAccountForm({
          username: '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
          deleteConfirmation: '',
        })
        return
      }

      const payload = await api('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: accountForm.deleteConfirmation }),
      })
      if (payload?.ok === false) {
        setError(payload.error || 'Unable to delete account')
        return
      }
      handleAuthLost()
      setAccountDialog(null)
      setAccountForm({
        username: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        deleteConfirmation: '',
      })
      if (desktopEnvironment) {
        await refreshDesktopServerState()
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function importProject() {
    if (!importArchiveFile) {
      return
    }

    setBusy(true)
    setError('')
    setTransferProgress(0)

    try {
      const formData = new FormData()
      formData.append('archive', importArchiveFile)
      formData.append('projectName', importProjectName.trim())

      const importedTree = await uploadWithProgress('/api/projects/import', formData, setTransferProgress)

      beginProjectTransition(importedTree.project.id)
      setManualProjectSelectionRequired(false)
      applyTreePayload(importedTree)
      setSelectedProjectId(importedTree.project.id)
      setSelectedNodeId(importedTree.root?.id ?? null)
      setImportArchiveFile(null)
      setImportProjectName('')
      setOpenMenu(null)
      setShowProjectDialog(null)
      setTransferProgress(100)
      await loadProjects(importedTree.project.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
      window.setTimeout(() => setTransferProgress(null), 400)
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    }
  }

  async function addNode(parentId = selectedNode?.id) {
    if (!parentId || !selectedProjectId) {
      return
    }

    setBusy(true)
    setError('')

    try {
      let createdNodeId = null
      const createNode = async () => {
        const rollbackLocalEvent = beginLocalEventExpectation()
        let created = null
        try {
          created = await createNodeRequest(selectedProjectId, parentId, { name: newNodeName.trim() || 'New Node' })
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
        createdNodeId = created.id
        appendNodesToTree([created])
        updateProjectListNodeCount(1)
        setSelectedNodeId(parentId)
        return created
      }

      await createNode()
      pushHistory({
        undo: async () => {
          if (createdNodeId != null) {
            const rollbackUndoEvent = beginLocalEventExpectation()
            try {
              await deleteNodeRequest(createdNodeId)
            } catch (error) {
              rollbackUndoEvent()
              throw error
            }
            removeNodesFromTree([createdNodeId])
            updateProjectListNodeCount(-1)
            setSelectedNodeId(parentId)
          }
        },
        redo: async () => {
          await createNode()
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  function openNewNodeDialog(parentId = selectedNode?.id) {
    if (!parentId || !selectedProjectId) {
      return
    }

    setNewNodeName('New Node')
    setNewNodeDialog({ parentId })
  }

  async function submitNewNode() {
    if (!newNodeDialog?.parentId) {
      return
    }

    await addNode(newNodeDialog.parentId)
    setNewNodeDialog(null)
    setNewNodeName('New Node')
  }

  function triggerAddPhotoNode() {
    if (!selectedNode || busy) {
      return
    }
    setPendingUploadParentId(selectedNode.id)
    setPendingUploadMode('photo_node')
    fileInputRef.current?.click()
  }

  function triggerAddPhoto() {
    if (!selectedNode || busy) {
      return
    }
    setPendingUploadParentId(selectedNode.id)
    setPendingUploadMode('additional_photo')
    fileInputRef.current?.click()
  }

  async function uploadFiles(files, targetNodeId = selectedNode?.id, mode = 'photo_node', options = {}) {
    if (!targetNodeId || files.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
      let createdNodeIds = []
      let createdMediaEntries = []
      const performUpload = async () => {
        const rollbackLocalEvent = beginLocalEventExpectation()
        let createdEntries = []
        try {
          createdEntries = await uploadPhotoFilesRequest(selectedProjectId, files, targetNodeId, mode, options)
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
        createdNodeIds = createdEntries.map((entry) => entry.createdNodeId).filter(Boolean)
        createdMediaEntries = createdEntries
          .filter((entry) => entry.mediaId && entry.node?.id)
          .map((entry) => ({ mediaId: entry.mediaId, nodeId: entry.node.id }))
        if (mode === 'additional_photo') {
          await loadTree(selectedProjectId, targetNodeId)
        } else {
          const createdNodes = createdEntries.map((entry) => entry.node).filter(Boolean)
          appendNodesToTree(createdNodes)
          updateProjectListNodeCount(createdNodes.length)
        }
        setSelectedNodeId(selectedNodeId)
      }

      await performUpload()
      pushHistory({
        undo: async () => {
          const rollbackUndoEvent = beginLocalEventExpectation()
          try {
            if (mode === 'additional_photo') {
              for (const entry of [...createdMediaEntries].reverse()) {
                await api(`/api/nodes/${entry.nodeId}/media/${entry.mediaId}`, {
                  method: 'DELETE',
                })
              }
            } else {
              for (const nodeId of [...createdNodeIds].reverse()) {
                await deleteNodeRequest(nodeId)
              }
            }
          } catch (error) {
            rollbackUndoEvent()
            throw error
          }
          if (mode === 'additional_photo') {
            await loadTree(selectedProjectId, targetNodeId)
          } else {
            removeNodesFromTree(createdNodeIds)
            updateProjectListNodeCount(-createdNodeIds.length)
          }
          setSelectedNodeId(selectedNodeId)
        },
        redo: async () => {
          await performUpload()
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
      setPendingUploadParentId(null)
      setPendingUploadMode('photo_node')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const setCollapsed = useCallback(async (nodeId, collapsed) => {
    setBusy(true)
    setError('')

    try {
      const previousValue = Boolean(tree?.nodes.find((node) => node.id === nodeId)?.collapsed)
      const rollbackLocalEvent = beginLocalEventExpectation()
      let payload = null
      try {
        payload = await setCollapsedRequest(nodeId, collapsed)
      } catch (error) {
        rollbackLocalEvent()
        throw error
      }
      const nextNodes = buildCollapsedNodes(tree?.nodes, payload.node, payload.updatedIds, collapsed)
      prepareCollapsedSelection(nextNodes)
      applyCollapsedState(payload.node, payload.updatedIds, collapsed, { skipSelectionPreparation: true })
      pushHistory({
        undo: async () => {
          const rollbackUndoEvent = beginLocalEventExpectation()
          let revertedPayload = null
          try {
            revertedPayload = await setCollapsedRequest(nodeId, previousValue)
          } catch (error) {
            rollbackUndoEvent()
            throw error
          }
          const revertedNodes = buildCollapsedNodes(tree?.nodes, revertedPayload.node, revertedPayload.updatedIds, previousValue)
          prepareCollapsedSelection(revertedNodes)
          applyCollapsedState(revertedPayload.node, revertedPayload.updatedIds, previousValue, { skipSelectionPreparation: true })
        },
        redo: async () => {
          const rollbackRedoEvent = beginLocalEventExpectation()
          let redonePayload = null
          try {
            redonePayload = await setCollapsedRequest(nodeId, collapsed)
          } catch (error) {
            rollbackRedoEvent()
            throw error
          }
          const redoneNodes = buildCollapsedNodes(tree?.nodes, redonePayload.node, redonePayload.updatedIds, collapsed)
          prepareCollapsedSelection(redoneNodes)
          applyCollapsedState(redonePayload.node, redonePayload.updatedIds, collapsed, { skipSelectionPreparation: true })
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }, [applyCollapsedState, beginLocalEventExpectation, buildCollapsedNodes, prepareCollapsedSelection, pushHistory, setCollapsedRequest, tree?.nodes])

  const setSelectedNodesCollapsed = useCallback(async (collapsed) => {
    if (!effectiveSelectedNodeIds.length || !tree?.nodes?.length) {
      return
    }

    const targetIds = Array.from(
      new Set(
        effectiveSelectedNodeIds.filter((nodeId) => {
          const node = treeNodeById.get(nodeId)
          if (!node) {
            return false
          }
          return collapsed ? Boolean(node.children?.length && !node.collapsed) : Boolean(node.collapsed)
        }),
      ),
    )

    if (!targetIds.length) {
      return
    }

    for (const nodeId of targetIds) {
      await setCollapsed(nodeId, collapsed)
    }
  }, [effectiveSelectedNodeIds, setCollapsed, tree?.nodes?.length, treeNodeById])

  const setSelectedNodesCollapsedRecursively = useCallback(async (collapsed) => {
    if (!effectiveSelectedNodeIds.length || !tree?.nodes?.length) {
      return
    }

    const targetIds = new Set()

    if (collapsed) {
      for (const nodeId of effectiveSelectedNodeIds) {
        const node = treeNodeById.get(nodeId) || null
        if (node?.children?.length && !node.collapsed) {
          targetIds.add(node.id)
        }
        let current = node
        while (current?.parent_id) {
          current = treeNodeById.get(current.parent_id) || null
          if (current?.children?.length && !current.collapsed) {
            targetIds.add(current.id)
          }
        }
      }
    } else {
      for (const nodeId of effectiveSelectedNodeIds) {
        const subtreeNode = tree?.root ? findNode(tree.root, nodeId) : null
        for (const descendantId of collectDescendantIds(subtreeNode)) {
          const node = treeNodeById.get(descendantId)
          if (node?.collapsed) {
            targetIds.add(descendantId)
          }
        }
      }
    }

    if (!targetIds.size) {
      return
    }

    for (const nodeId of targetIds) {
      await setCollapsed(nodeId, collapsed)
    }
  }, [effectiveSelectedNodeIds, setCollapsed, tree?.nodes?.length, tree?.root, treeNodeById])

  const selectNodeAndFocus = useCallback(async (nodeId) => {
    if (!nodeId || !tree?.nodes?.length) {
      return
    }

    setEffectiveSelection([nodeId], nodeId)
    void saveNodeDraft(editTargetNode, editForm)

    const nodeMap = new Map(tree.nodes.map((node) => [node.id, node]))
    const ancestorsToExpand = []
    let current = nodeMap.get(nodeId)
    while (current?.parent_id) {
      const parent = nodeMap.get(current.parent_id)
      if (!parent) {
        break
      }
      if (parent.collapsed) {
        ancestorsToExpand.unshift(parent.id)
      }
      current = parent
    }

    for (const ancestorId of ancestorsToExpand) {
      await setCollapsed(ancestorId, false)
    }

    pendingFocusNodeIdRef.current = nodeId
    if (isDesktopEnvironment() && typeof BroadcastChannel !== 'undefined' && selectedProjectId) {
      const channel = new BroadcastChannel(DESKTOP_SELECTION_SYNC_CHANNEL)
      channel.postMessage({
        sourceId: windowInstanceIdRef.current,
        projectId: selectedProjectId,
        nodeId,
        focusNode: true,
      })
      channel.close()
    }
  }, [editForm, editTargetNode, saveNodeDraft, selectedProjectId, setCollapsed, setEffectiveSelection, tree?.nodes])

  const bulkSelectSearchResults = useCallback((nodeIds) => {
    const uniqueIds = Array.from(new Set((nodeIds || []).filter(Boolean)))
    if (!uniqueIds.length) {
      setEffectiveSelection([], null)
      return
    }

    const nextPrimaryId =
      selectedNodeId && uniqueIds.includes(selectedNodeId)
        ? selectedNodeId
        : uniqueIds[0]

    setEffectiveSelection(uniqueIds, nextPrimaryId)
  }, [selectedNodeId, setEffectiveSelection])

  const selectRootNode = useCallback(async () => {
    if (!tree?.root?.id) {
      return
    }
    await saveNodeDraft(editTargetNode, editForm)
    setEffectiveSelection([tree.root.id], tree.root.id)
  }, [editForm, editTargetNode, saveNodeDraft, setEffectiveSelection, tree?.root?.id])

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable

      if (event.key === 'F2' && selectedNode) {
        event.preventDefault()
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isTypingTarget) {
        event.preventDefault()
        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
        return
      }

      if (event.key === 'Escape') {
        setContextMenu(null)
        return
      }

      if (event.key === ' ' && selectedNode && !isTypingTarget && !focusPathMode) {
        if (selectedNode.children?.length || selectedNode.collapsed) {
          event.preventDefault()
          void setCollapsed(selectedNode.id, !selectedNode.collapsed)
        }
        return
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedNode && !isTypingTarget) {
        if (selectedNode.parent_id == null) {
          return
        }
        event.preventDefault()
        setDeleteNodeOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [focusPathMode, nameInputRef, redo, selectedNode, setCollapsed, undo])

  async function deleteNode() {
    if (!selectedNode) {
      return
    }

    const deletableNodes = effectiveSelectedActionNodes.filter((node) => node.parent_id != null)
    if (deletableNodes.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const deleteEntries = []
      for (const node of deletableNodes) {
        const subtreeNode = findNode(tree?.root, node.id)
        const subtreeIds = Array.from(
          collectDescendantIds(subtreeNode || { id: node.id, children: [] }),
        )
        deleteEntries.push({
          node,
          fallbackId: node.parent_id,
          subtreeNode,
          subtreeIds,
          snapshot: subtreeNode ? await createDeleteSnapshot(subtreeNode) : null,
          currentRootId: node.id,
        })
      }

      const response = await api(`/api/projects/${selectedProjectId}/nodes/delete-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeIds: deleteEntries.map((entry) => entry.currentRootId),
        }),
      })
      setDeleteNodeOpen(false)
      applyTreePayload(response.tree)
      setProjects((current) =>
        current.map((project) =>
          project.id === response.tree.project.id
            ? { ...project, ...response.tree.project, node_count: response.tree.nodes.length }
            : project,
        ),
      )
      setMultiSelectedNodeIds([])
      setSelectedNodeId(selectedNode.parent_id ?? deleteEntries[0]?.fallbackId ?? null)

      if (deleteEntries.some((entry) => entry.snapshot)) {
        pushHistory({
          undo: async () => {
            const restoredNodeIds = []
            for (const entry of deleteEntries) {
              if (!entry.snapshot) {
                continue
              }
              const rollbackUndoEvent = beginLocalEventExpectation()
              let restoredRoot = null
              try {
                restoredRoot = await restoreDeletedSubtree(selectedProjectId, entry.snapshot)
              } catch (error) {
                rollbackUndoEvent()
                throw error
              }
              if (!restoredRoot) {
                rollbackUndoEvent()
                continue
              }

              const restoredNodes = flattenSubtreeNodes(restoredRoot)
              entry.currentRootId = restoredRoot.id
              restoredNodeIds.push(restoredRoot.id)
              appendNodesToTree(restoredNodes)
              updateProjectListNodeCount(restoredNodes.length)
            }
            setSelectedNodeId(restoredNodeIds[0] || selectedNodeId)
            setMultiSelectedNodeIds(restoredNodeIds.slice(1))
          },
          redo: async () => {
            const removedAgainIds = new Set()
            for (const entry of deleteEntries) {
              const currentTree = treeRef.current
              const currentSubtreeNode = findNode(currentTree?.root, entry.currentRootId)
              const currentSubtreeIds = Array.from(
                collectDescendantIds(currentSubtreeNode || { id: entry.currentRootId, children: [] }),
              )
              currentSubtreeIds.forEach((id) => removedAgainIds.add(id))
            }
            const redoResponse = await api(`/api/projects/${selectedProjectId}/nodes/delete-bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nodeIds: deleteEntries.map((entry) => entry.currentRootId),
              }),
            })
            applyTreePayload(redoResponse.tree)
            setProjects((current) =>
              current.map((project) =>
                project.id === redoResponse.tree.project.id
                  ? { ...project, ...redoResponse.tree.project, node_count: redoResponse.tree.nodes.length }
                  : project,
              ),
            )
            setMultiSelectedNodeIds([])
            setSelectedNodeId(selectedNode.parent_id ?? deleteEntries[0]?.fallbackId ?? null)
          },
        })
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  const {
    beginCameraSelection,
    beginCanvasPointerDown,
    beginNodeDrag,
    beginPreviewPan,
    canvasMarqueeRect,
    cameraVideoRef,
    cameraViewportRef,
    captureFullCameraFrame,
    focusSelectedNode,
    fitCanvasToView,
    handleCanvasContextMenu,
    handleCanvasPointerMove,
    previewViewportRef,
    resizeRef,
    stopPanning,
    stopPreviewPan,
    viewportRef,
  } = useWorkspaceInteractions({
    addToEffectiveSelection,
    cameraVisible,
    dragHoverNodeId,
    layout,
    moveDraggedNode,
    previewVisible,
    previewTransform,
    selectedCameraId,
    selectedNodeIds: effectiveSelectedNodeIds,
    selectedNode,
    setContextMenu,
    setCameraDevices,
    setCameraNotice,
    setCameraSelection,
    setDragHoverNodeId,
    setDragPreview,
    setEffectiveSelection,
    setLeftSidebarWidth,
    leftSidebarMinWidth,
    setPreviewTransform,
    setRightSidebarWidth,
    rightSidebarMinWidth,
    setSelectedCameraId,
    setTransform: setCanvasTransform,
    transform,
    uploadFiles,
  })

  useEffect(() => {
    if (!projectUiReady || !pendingInitialCanvasFitRef.current) {
      return
    }
    if (!tree?.project || !layout.width || !layout.height) {
      return
    }
    pendingInitialCanvasFitRef.current = false
    fitCanvasToView()
  }, [fitCanvasToView, layout.height, layout.width, projectUiReady, tree?.project])

  useEffect(() => {
    if (!resolvedLeftActivePanel) {
      return
    }
    setLeftSidebarWidth((current) => Math.max(current, leftSidebarMinWidth))
  }, [leftSidebarMinWidth, resolvedLeftActivePanel])

  useEffect(() => {
    if (!resolvedRightActivePanel) {
      return
    }
    setRightSidebarWidth((current) => Math.max(current, rightSidebarMinWidth))
  }, [resolvedRightActivePanel, rightSidebarMinWidth])

  useEffect(() => {
    if (!isDesktopEnvironment()) {
      return undefined
    }

    const channel = new BroadcastChannel(DESKTOP_PANEL_SYNC_CHANNEL)
    const syncPoppedPanel = (panelId, open) => {
      if (!panelId) {
        return
      }
      setPoppedOutPanelIds((current) => {
        if (open) {
          return current.includes(panelId) ? current : [...current, panelId]
        }
        return current.filter((id) => id !== panelId)
      })
    }

    channel.onmessage = (event) => {
      const message = event.data || {}
      if (message.type === 'panel-open') {
        syncPoppedPanel(message.panelId, true)
      }
      if (message.type === 'panel-close') {
        syncPoppedPanel(message.panelId, false)
      }
      if (message.type === 'panel-dock' && !isPanelWindow) {
        syncPoppedPanel(message.panelId, false)
        dockPanelIntoSidebar(message.panelId)
      }
    }

    if (isPanelWindow && panelWindowId) {
      channel.postMessage({ type: 'panel-open', panelId: panelWindowId })
      const notifyClose = () => {
        channel.postMessage({ type: 'panel-close', panelId: panelWindowId })
      }
      window.addEventListener('beforeunload', notifyClose)
      return () => {
        window.removeEventListener('beforeunload', notifyClose)
        notifyClose()
        channel.close()
      }
    }

    return () => {
      channel.close()
    }
  }, [dockPanelIntoSidebar, isPanelWindow, panelWindowId])

  useLayoutEffect(() => {
    if (!pendingFocusNodeIdRef.current || pendingFocusNodeIdRef.current !== selectedNodeId) {
      return
    }
    if (!layout.nodes.some((item) => item.id === selectedNodeId)) {
      return
    }
    pendingFocusNodeIdRef.current = null
    focusSelectedNode()
  }, [focusSelectedNode, layout.nodes, selectedNodeId])

  const panelDefinitions = {
      preview: {
        id: 'preview',
        title: 'Preview',
        icon: <PreviewIcon />,
        content: (
            <PreviewPanel
              beginPreviewPan={beginPreviewPan}
              busy={busy}
              extractNodeMediaToChild={extractNodeMediaToChildRequest}
              networkAvailable={!desktopEnvironment || effectiveDesktopServerConnectionStatus === 'connected'}
              patchNodeMediaEdits={saveNodeMediaEdits}
              previewTransform={previewTransform}
              previewViewportRef={previewViewportRef}
              removeNodeMedia={removeNodeMediaRequest}
              setPrimaryMedia={setPrimaryMediaRequest}
              setPreviewTransform={setPreviewTransform}
              selectedNode={selectedNode}
              setError={setError}
              stopPreviewPan={stopPreviewPan}
            />
        ),
      },
      camera: {
        id: 'camera',
        title: 'Camera',
        icon: <CameraIcon />,
        content: (
          <CameraPanel
            beginCameraSelection={beginCameraSelection}
            busy={busy}
            cameraDevices={cameraDevices}
            cameraNotice={cameraNotice}
            cameraSelection={cameraSelection}
            cameraVideoRef={cameraVideoRef}
            cameraViewportRef={cameraViewportRef}
            captureFullCameraFrame={captureFullCameraFrame}
            identificationTemplates={identificationTemplates}
            selectedCameraId={selectedCameraId}
            selectedCameraTemplateId={selectedCameraTemplateId}
            selectedNode={selectedNode}
            setCameraSelection={setCameraSelection}
            setSelectedCameraId={setSelectedCameraId}
            setSelectedCameraTemplateId={setSelectedCameraTemplateId}
          />
        ),
      },
      search: {
        id: 'search',
        title: 'Search',
        icon: <SearchIcon />,
        content: (
          <SearchPanel
            key={selectedProjectId || 'global'}
            bulkSelectNodeIds={bulkSelectSearchResults}
            onResultsChange={handleSearchResultsChange}
            onSelectNode={selectNodeAndFocus}
            projectId={selectedProjectId}
            selectedNodeId={selectedNodeId}
            selectedNodeIds={effectiveSelectedNodeIds}
            templates={identificationTemplates}
            tree={tree}
          />
        ),
      },
      inspector: {
        id: 'inspector',
        title: 'Inspector',
        icon: <WrenchIcon />,
        content: (
          <InspectorPanel
            availableTags={availableTags}
            busy={busy}
            bulkSelectionCount={bulkSelectionCount}
            editForm={editForm}
            editTargetNode={editTargetNode}
            error={error}
            hasBulkSelection={hasBulkSelection}
            hasLockedSelectionRoot={hasLockedSelectionRoot}
            nameInputRef={nameInputRef}
            patchNodeReviewStatus={patchNodeReviewStatusRequest}
            saveNodeDraft={saveNodeDraft}
            selectedNode={selectedNode}
            setDeleteNodeOpen={setDeleteNodeOpen}
            setEditForm={setEditForm}
            status={status}
          />
        ),
      },
      fields: {
        id: 'fields',
        title: 'Data',
        icon: <PencilIcon />,
        content: (
          <FieldsPanel
            key={`${selectedNode?.id || 'none'}:${selectedNode?.identification?.templateId || 'none'}`}
            aiFillRunning={aiFillNodeId === selectedNode?.id}
            busy={busy}
            bulkSelectionCount={bulkSelectionCount}
            bulkTemplateCount={selectionNodesWithTemplates.length}
            clearError={() => setError('')}
            hasIdentificationTemplates={identificationTemplates.length > 0}
            hasBulkSelection={hasBulkSelection}
            identification={selectedNode?.identification || null}
            patchIdentificationField={patchIdentificationFieldRequest}
            runIdentificationAiFill={runIdentificationAiFillRequest}
            openApplyTemplateDialog={() => {
              setError('')
              setShowProjectDialog('apply-template')
            }}
            openRemoveTemplateDialog={() =>
              requestRemoveIdentificationTemplates(
                hasBulkSelection ? explicitSelectedNodes.map((node) => node.id) : [selectedNode.id],
              )
            }
            selectedNode={selectedNode}
          />
        ),
      },
      templates: {
        id: 'templates',
        title: 'Templates',
        icon: <IdentificationIcon />,
        content: (
          <TemplatesPanel
            busy={busy}
            clearError={() => setError('')}
            createNewTemplate={createNewTemplate}
            duplicateTemplate={duplicateTemplate}
            hasTemplateChanges={hasTemplateChanges}
            error={error}
            openImportTemplateDialog={() => setImportTemplateDialog({ sourceProjectId: '', sourceTemplateId: '' })}
            requestDeleteTemplate={requestDeleteTemplate}
            requestSaveTemplate={requestSaveTemplate}
            selectedTemplateEditorId={selectedTemplateEditorId}
            selectTemplateEditor={selectTemplateEditor}
            templateForm={templateForm}
            templates={identificationTemplates}
            updateTemplateField={updateTemplateField}
          />
        ),
      },
      settings: {
        id: 'settings',
        title: 'Project Settings',
        icon: <GearIcon />,
        content: (
          <SettingsPanel
            busy={busy}
            canManageProjectSecrets={Boolean(tree?.project?.canManageUsers)}
            hasProjectOpenAiKey={Boolean(tree?.project?.openAiApiKeyConfigured)}
            openAiApiKeyMask={tree?.project?.openAiApiKeyMask || ''}
            openOpenAiKeyDialog={() => {
              setError('')
              setProjectApiKeyInput('')
              setShowProjectDialog('openai-key')
            }}
            openRenameProjectDialog={() => {
              setError('')
              setProjectName(tree?.project?.name || '')
              setShowProjectDialog('rename')
            }}
            openDeleteProjectDialog={() => {
              setError('')
              setDeleteProjectText('')
              setShowProjectDialog('delete')
            }}
            persistProjectSettings={persistProjectSettings}
            projectId={tree?.project?.id}
            projectSettings={projectSettings}
            resetProjectSettings={resetProjectSettings}
            clearProjectOpenAiKey={clearProjectOpenAiKey}
          />
        ),
      },
      collaborators: {
        id: 'collaborators',
        title: 'Project Access',
        icon: <UsersIcon />,
        content: (
          <CollaboratorsPanel
            collaboratorUsername={collaboratorUsername}
            addCollaborator={addCollaborator}
            busy={busy}
            canManageUsers={Boolean(tree?.project?.canManageUsers)}
            clearError={() => setError('')}
            collaborators={tree?.project?.collaborators || []}
            currentUsername={currentUser?.username || ''}
            error={error}
            isPublic={Boolean(tree?.project?.isPublic)}
            ownerUsername={tree?.project?.ownerUsername || ''}
            persistProjectAccess={persistProjectAccess}
            removeCollaborator={removeCollaborator}
            setCollaboratorUsername={setCollaboratorUsername}
          />
        ),
      },
    }
  const leftRailPanels = leftDockedPanelIds.map((panelId) => panelDefinitions[panelId]).filter(Boolean)
  const rightRailPanels = rightDockedPanelIds.map((panelId) => panelDefinitions[panelId]).filter(Boolean)
  const activeLeftPanel = resolvedLeftActivePanel ? panelDefinitions[resolvedLeftActivePanel] : null
  const activeRightPanel = resolvedRightActivePanel ? panelDefinitions[resolvedRightActivePanel] : null
  const windowPanel = panelWindowId ? panelDefinitions[panelWindowId] : null
  const effectiveLeftSidebarOpen = projectUiReady ? leftSidebarOpen && Boolean(activeLeftPanel) : false
  const effectiveRightSidebarOpen = projectUiReady ? rightSidebarOpen && Boolean(activeRightPanel) : false
  const canPopoutPanels = isDesktopEnvironment() && !isPanelWindow

  async function popoutPanel(panelId) {
    const preservedSelectionIds = effectiveSelectedNodeIds
    const preservedPrimaryId = selectedNodeId
    const result = await openDesktopPanelWindow({
      panelId,
      projectId: selectedProjectId,
      nodeId: selectedNodeId,
    })
    if (!result?.ok) {
      return
    }
    setPoppedOutPanelIds((current) => (current.includes(panelId) ? current : [...current, panelId]))
    if (panelDock[panelId] === 'left') {
      setLeftSidebarOpen(false)
      if (preservedSelectionIds.length || preservedPrimaryId) {
        setEffectiveSelection(preservedSelectionIds, preservedPrimaryId || preservedSelectionIds[0] || null)
      }
      return
    }
    setRightSidebarOpen(false)
    if (preservedSelectionIds.length || preservedPrimaryId) {
      setEffectiveSelection(preservedSelectionIds, preservedPrimaryId || preservedSelectionIds[0] || null)
    }
  }

  function renderDesktopServerManager(allowClose = true) {
    return (
      <DesktopServerManager
        busy={busy}
        desktopWindowMaximized={desktopWindowMaximized}
        error={error}
        focusProfileId={desktopAccountManagerFocusId}
        onClose={allowClose ? closeDesktopServerManager : null}
        onCreateProfile={createServerProfile}
        onDesktopClose={() => closeDesktopWindow()}
        onDesktopMinimize={() => minimizeDesktopWindow()}
        onDesktopToggleMaximize={() => toggleMaximizeDesktopWindow()}
        onDeleteProfile={deleteServerProfile}
        onOpenAccountDialog={openAccountDialog}
        onUpdateProfile={updateServerProfile}
        profiles={desktopServerState.profiles}
        selectedProfileId={desktopServerState.selectedProfileId}
        showDesktopControls={isDesktopEnvironment()}
      />
    )
  }

  function renderAppDialogs() {
    return (
      <AppDialogs
        accountDialog={accountDialog}
        accountDialogUsername={managedDesktopAccountProfile?.username || currentUser?.username || ''}
        accountForm={accountForm}
        accountStatus={accountStatus}
        appDialog={appDialog}
        appVersion={APP_VERSION}
        applyTemplateConfirmation={applyTemplateConfirmation}
        bulkSelectionCount={bulkSelectionCount}
        bulkTemplateCount={selectionNodesWithTemplates.length}
        busy={busy}
        canCloseProjectDialog={!manualProjectSelectionRequired && Boolean(selectedProjectId && tree?.project?.id === selectedProjectId)}
        changePassword={changePassword}
        changeUsername={changeUsername}
        confirmApplyTemplateSelection={confirmApplyTemplateSelection}
        confirmMergeNodeIntoPhoto={confirmMergeNodeIntoPhoto}
        confirmRemoveIdentificationTemplate={confirmRemoveIdentificationTemplate}
        createProject={createProject}
        currentUser={currentUser}
        desktopEnvironment={desktopEnvironment}
        desktopServerProfiles={desktopServerState.profiles}
        desktopProjectPickerLoading={desktopEnvironment ? projectPickerLoading : projectListLoading}
        desktopProjectPickerProjects={desktopEnvironment ? projectPickerProjects : projects}
        deleteNode={deleteNode}
        deleteAccount={deleteAccount}
        deleteTemplate={deleteTemplate}
        deleteNodeOpen={deleteNodeOpen}
        deleteProject={deleteProject}
        deleteProjectText={deleteProjectText}
        desktopClientId={currentUser?.captureSessionId || ''}
        error={error}
        exportFileName={exportFileName}
        exportMediaTree={exportMediaTree}
        exportProject={exportProject}
        handleDialogEnter={handleDialogEnter}
        hasBulkSelection={hasBulkSelection}
        identificationTemplates={identificationTemplates}
        importTemplateDialog={importTemplateDialog}
        importTemplateFromProject={importTemplateFromProject}
        importArchiveFile={importArchiveFile}
        importInputRef={importInputRef}
        importProject={importProject}
        importProjectName={importProjectName}
        projectApiKeyInput={projectApiKeyInput}
        projectName={projectName}
        identificationTemplateRemovalCount={identificationTemplateRemovalCount}
        identificationTemplateRemovalNodes={identificationTemplateRemovalNodes}
        mergePhotoConfirmation={mergePhotoConfirmation}
        mobileConnectionCount={mobileConnectionCount}
        newNodeDialog={newNodeDialog}
        newNodeName={newNodeName}
        onCheckForUpdates={checkForUpdates}
        onOpenManageAccounts={openAccountManager}
        onOpenDesktopProject={openDesktopProjectFromPicker}
        onSelectDesktopServerProfile={browseProjectPickerProfile}
        projects={projects}
        renameProject={renameProject}
        logoutUser={() => void logoutUser()}
        saveProjectOpenAiKey={saveProjectOpenAiKey}
        selectedNode={selectedNode}
        selectedDesktopServerProfileId={projectPickerProfileId}
        selectedProjectId={selectedProjectId}
        serverDisconnectDialogOpen={serverDisconnectDialogOpen}
        sessionDialogOpen={sessionDialogOpen}
        setAccountDialog={setAccountDialog}
        setAppDialog={setAppDialog}
        setAccountForm={setAccountForm}
        setApplyTemplateConfirmation={setApplyTemplateConfirmation}
        setDeleteNodeOpen={setDeleteNodeOpen}
        setDeleteProjectText={setDeleteProjectText}
        setExportFileName={setExportFileName}
        setIdentificationTemplateRemovalNodeId={(nodeId) => {
          if (!nodeId) {
            setIdentificationTemplateRemoval(null)
            return
          }
          requestRemoveIdentificationTemplates([nodeId])
        }}
        setImportProjectName={setImportProjectName}
        setImportTemplateDialog={setImportTemplateDialog}
        setNewNodeDialog={setNewNodeDialog}
        setNewNodeName={setNewNodeName}
        setProjectApiKeyInput={setProjectApiKeyInput}
        setProjectName={setProjectName}
        setSessionDialogOpen={setSessionDialogOpen}
        setShowProjectDialog={setShowProjectDialog}
        setShowProjectId={(projectId) => {
          beginProjectTransition(projectId)
          setManualProjectSelectionRequired(false)
          setSelectedProjectId(projectId)
        }}
        setTemplateDialog={setTemplateDialog}
        setMergePhotoConfirmation={setMergePhotoConfirmation}
        showProjectDialog={showProjectDialog}
        handleServerDisconnectDismiss={dismissServerDisconnectDialog}
        submitNewNode={submitNewNode}
        submitTemplateDialog={submitTemplateDialog}
        templateDialog={templateDialog}
        transferProgress={transferProgress}
        tree={tree}
        updateStatus={updateStatus}
        onConfirmClearCache={resetClientCache}
      />
    )
  }

  if (!authReady) {
    if (showMobileEntryPrompt) {
      return (
        <div className="app-shell app-shell--auth" data-theme={theme}>
          <MobileEntryScreen
            onContinueToProject={() => setShowMobileEntryPrompt(false)}
            onOpenCapture={navigateToCapture}
          />
        </div>
      )
    }
    if (desktopEnvironment && showProjectDialog === 'open') {
      return (
        <div className="app-shell" data-theme={theme}>
          {renderAppDialogs()}
        </div>
      )
    }
    return <div className="app-shell app-shell--loading" data-theme={theme}>Loading...</div>
  }

  if (showMobileEntryPrompt) {
    return (
      <div className="app-shell app-shell--auth" data-theme={theme}>
        <MobileEntryScreen
          onContinueToProject={() => setShowMobileEntryPrompt(false)}
          onOpenCapture={navigateToCapture}
        />
      </div>
    )
  }

  if (desktopServerSelectionRequired) {
    return (
      <div className="app-shell app-shell--auth" data-theme={theme}>
        {renderDesktopServerManager(false)}
        {renderAppDialogs()}
      </div>
    )
  }

  if (desktopEnvironment && desktopServerDialogOpen) {
    return (
      <div className="app-shell app-shell--auth" data-theme={theme}>
        {renderDesktopServerManager(true)}
        {renderAppDialogs()}
      </div>
    )
  }

  if (!currentUser) {
    if (desktopEnvironment) {
      return (
        <div className="app-shell" data-theme={theme}>
          {renderAppDialogs()}
        </div>
      )
    }
    return (
      <div className="app-shell app-shell--auth" data-theme={theme}>
        <AuthScreen
          busy={busy}
          clearError={() => setError('')}
          currentServerLabel={selectedDesktopServerProfile?.name || ''}
          currentServerUrl={selectedDesktopServerProfile?.baseUrl || ''}
          error={error}
          manageAccountsLabel={desktopEnvironment ? 'Manage Server Profiles' : 'Manage Account'}
          onLogin={loginUser}
          onManageServers={desktopEnvironment ? openAccountManager : null}
          onRegister={registerUser}
        />
      </div>
    )
  }

  if (isPanelWindow) {
    const dockBackIntoSidebar = () => {
      if (!panelWindowId || typeof BroadcastChannel === 'undefined') {
        void closeDesktopWindow()
        return
      }

      const channel = new BroadcastChannel(DESKTOP_PANEL_SYNC_CHANNEL)
      channel.postMessage({ type: 'panel-dock', panelId: panelWindowId })
      channel.close()
      void closeDesktopWindow()
    }

    return (
      <div className="app-shell app-shell--panel-window" data-theme={theme}>
        <PanelShell
          activePanel={windowPanel}
          canDockBack={Boolean(windowPanel)}
          desktopWindowMaximized={desktopWindowMaximized}
          onDesktopClose={() => void closeDesktopWindow()}
          onDesktopMinimize={() => void minimizeDesktopWindow()}
          onDesktopToggleMaximize={() => void toggleMaximizeDesktopWindow()}
          onDockBack={dockBackIntoSidebar}
          visible
          windowMode
        />
      </div>
    )
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <TopBar
        appVersion={APP_VERSION}
        appendChildren={appendChildren}
        appendParents={appendParents}
        appendSearchResults={appendSearchResults}
        busy={busy}
        canCollapseRecursively={canCollapseRecursively}
        canCollapseSelected={canCollapseSelected}
        canExpandRecursively={canExpandRecursively}
        canExpandSelected={canExpandSelected}
        fileInputRef={fileInputRef}
        focusSelectedNode={focusSelectedNode}
        fitCanvasToView={fitCanvasToView}
        focusPathMode={focusPathMode}
        historyState={historyState}
        importInputRef={importInputRef}
        importProjectName={importProjectName}
        leftSidebarOpen={effectiveLeftSidebarOpen}
        mobileConnectionCount={mobileConnectionCount}
        onPresenceSelect={selectNodeAndFocus}
        openMenu={openMenu}
        panelDock={panelDock}
        panelTitles={Object.fromEntries(panelIds.map((panelId) => [panelId, panelDefinitions[panelId]?.title || panelId]))}
        pendingUploadMode={pendingUploadMode}
        pendingUploadParentId={pendingUploadParentId}
        presenceUsers={remotePresenceUsers}
        projectLoading={projectLoading}
        projectLoadProgress={projectLoadProgress}
        projectName={activeProjectDisplayName}
        desktopWindowMaximized={desktopWindowMaximized}
        redo={redo}
        invertSelection={invertEffectiveSelection}
        canvasIsolationMode={canvasIsolationMode}
        rightSidebarOpen={effectiveRightSidebarOpen}
        selectedNode={selectedNode}
        selectedProjectId={selectedProjectId}
        selectionCount={effectiveSelectedNodeIds.length}
        openNewNodeDialog={openNewNodeDialog}
        setCollapsedRecursively={setSelectedNodesCollapsedRecursively}
        setCollapsedSelected={setSelectedNodesCollapsed}
        setAllNodesCollapsed={setAllNodesCollapsed}
        setDeleteNodeOpen={setDeleteNodeOpen}
        setDeleteProjectText={setDeleteProjectText}
        setExportFileName={setExportFileName}
        setFocusPathMode={setFocusPathMode}
        setImportArchiveFile={setImportArchiveFile}
        setImportProjectName={setImportProjectName}
        movePanelDock={movePanelDock}
          setOpenMenu={setOpenMenu}
          setSessionDialogOpen={setSessionDialogOpen}
          setShowProjectDialog={setShowProjectDialog}
        selectChildren={selectChildren}
        selectParents={selectParents}
        selectSearchResults={selectSearchResults}
        searchResultCount={effectiveSearchResultNodeIds.length}
        theme={theme}
        triggerAddPhoto={triggerAddPhoto}
        triggerAddPhotoNode={triggerAddPhotoNode}
        onCheckForUpdates={checkForUpdates}
        onOpenManageServerProfiles={desktopEnvironment ? () => openAccountManager() : null}
        onOpenNewWindow={desktopEnvironment ? () => openDesktopMainWindow() : null}
        onApplyTheme={applyThemePreference}
        onResetCache={openCacheResetDialog}
        onGenerateSessionCode={generateNewSessionCode}
        togglePathIsolation={() =>
          setCanvasIsolationMode((current) => (current === 'path' ? 'none' : 'path'))
        }
        toggleSearchIsolation={() =>
          setCanvasIsolationMode((current) => (current === 'search' ? 'none' : 'search'))
        }
        toggleSidebarPanel={toggleSidebarPanel}
        tree={tree}
        undo={undo}
        uploadFiles={uploadFiles}
        onDesktopClose={() => closeDesktopWindow()}
        onDesktopMinimize={() => minimizeDesktopWindow()}
        onDesktopToggleMaximize={() => toggleMaximizeDesktopWindow()}
        showDesktopControls={isDesktopEnvironment()}
        style={{
          gridColumn: '1 / -1',
          gridRow: '1 / 2',
        }}
      />
      <main
        className={`main-layout ${projectTransitionVeilActive ? 'main-layout--transitioning' : ''}`.trim()}
        style={{
          gridColumn: '1 / -1',
          gridRow: '2 / 3',
          gridTemplateColumns: `${SIDEBAR_RAIL_WIDTH}px ${effectiveLeftSidebarOpen ? `${effectiveLeftSidebarWidth}px` : '0px'} minmax(0, 1fr) ${effectiveRightSidebarOpen ? `${effectiveRightSidebarWidth}px` : '0px'} ${SIDEBAR_RAIL_WIDTH}px`,
        }}
      >
        <SidebarRail
          activePanelId={resolvedLeftActivePanel}
          dragOver={draggingPanelId != null && panelDock[draggingPanelId] !== 'left'}
          onDropPanel={handleDropPanel}
          onEndDrag={() => setDraggingPanelId(null)}
          onOpenContextMenu={openSidebarContextMenu}
          onStartDrag={setDraggingPanelId}
          open={effectiveLeftSidebarOpen}
          panels={leftRailPanels}
          side="left"
          togglePanel={toggleSidebarPanel}
        />
        <DockedSidebar
          activePanel={activeLeftPanel}
          canPopout={canPopoutPanels && Boolean(activeLeftPanel)}
          onClose={() => setLeftSidebarOpen(false)}
          onPopout={() => activeLeftPanel && void popoutPanel(activeLeftPanel.id)}
          onResizeStart={(event) => {
            resizeRef.current = { pointerId: event.pointerId, target: 'left' }
            document.body.classList.add('is-resizing')
            event.preventDefault()
          }}
          side="left"
          visible={effectiveLeftSidebarOpen && Boolean(activeLeftPanel)}
        />
        <CanvasWorkspace
          beginNodeDrag={beginNodeDrag}
          beginCanvasPointerDown={beginCanvasPointerDown}
          busy={busy}
          canvasIsolationMode={canvasIsolationMode}
          canvasMarqueeRect={canvasMarqueeRect}
          contextMenu={contextMenu}
          contextMenuNode={contextMenuNode}
          dragActive={dragActive}
          dragHoverNodeId={dragHoverNodeId}
          dragPreview={dragPreview}
          editForm={editForm}
          editTargetNode={editTargetNode}
          fileInputRef={fileInputRef}
          focusSelectedNode={focusSelectedNode}
          fitCanvasToView={fitCanvasToView}
          focusPathMode={focusPathMode}
          handleCanvasContextMenu={handleCanvasContextMenu}
          handleCanvasPointerMove={handleCanvasPointerMove}
          layout={layout}
          loadedImages={loadedImages}
          imageLoadRevision={imageLoadRevision}
          markImageLoaded={markImageLoaded}
          multiSelectedNodeIds={multiSelectedNodeIds}
          openNewNodeDialog={openNewNodeDialog}
          triggerAddPhoto={triggerAddPhoto}
          triggerAddPhotoNode={triggerAddPhotoNode}
          projectSettings={projectSettings}
          remoteSelectionsByNodeId={remoteSelectionsByNodeId}
          searchResultNodeIds={effectiveSearchResultNodeIds}
          selectRootNode={selectRootNode}
          selectedNodePath={selectedNodePath}
          selectedNodePathIds={selectedNodePathIds}
          selectNodeFromPath={selectNodeAndFocus}
          saveNodeDraft={saveNodeDraft}
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          setCollapsed={setCollapsed}
          setContextMenu={setContextMenu}
          setMergePhotoConfirmation={setMergePhotoConfirmation}
          setDeleteNodeOpen={setDeleteNodeOpen}
          setDragActive={setDragActive}
          setPendingUploadMode={setPendingUploadMode}
          setPendingUploadParentId={setPendingUploadParentId}
          setEffectiveSelection={setEffectiveSelection}
          showGrid={showGrid}
          stopPanning={stopPanning}
          togglePathIsolation={() =>
            setCanvasIsolationMode((current) => (current === 'path' ? 'none' : 'path'))
          }
          toggleSearchIsolation={() =>
            setCanvasIsolationMode((current) => (current === 'search' ? 'none' : 'search'))
          }
          toggleGrid={toggleGridPreference}
          toggleMultiSelection={toggleMultiSelection}
          transform={transform}
          tree={tree}
          uploadFiles={uploadFiles}
          viewportRef={viewportRef}
        />
        <DockedSidebar
          activePanel={activeRightPanel}
          canPopout={canPopoutPanels && Boolean(activeRightPanel)}
          onClose={() => setRightSidebarOpen(false)}
          onPopout={() => activeRightPanel && void popoutPanel(activeRightPanel.id)}
          onResizeStart={(event) => {
            resizeRef.current = { pointerId: event.pointerId, target: 'right' }
            document.body.classList.add('is-resizing')
            event.preventDefault()
          }}
          side="right"
          visible={effectiveRightSidebarOpen && Boolean(activeRightPanel)}
        />
        <SidebarRail
          activePanelId={resolvedRightActivePanel}
          dragOver={draggingPanelId != null && panelDock[draggingPanelId] !== 'right'}
          onDropPanel={handleDropPanel}
          onEndDrag={() => setDraggingPanelId(null)}
          onOpenContextMenu={openSidebarContextMenu}
          onStartDrag={setDraggingPanelId}
          open={effectiveRightSidebarOpen}
          panels={rightRailPanels}
          side="right"
          togglePanel={toggleSidebarPanel}
        />
        <div
          aria-hidden={!projectTransitionVeilActive}
          className={`main-layout__transition-veil ${projectTransitionVeilActive ? 'is-visible' : ''}`.trim()}
        >
          <div className="main-layout__transition-card">
            <div className="main-layout__transition-title">{activeProjectDisplayName || 'Opening Project'}</div>
            <div className="main-layout__transition-subtitle">Opening project...</div>
            <div className="main-layout__transition-bar" />
          </div>
        </div>
      </main>

      {sidebarContextMenu ? (
        <div
          className="sidebar-context-menu"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          style={{ left: `${sidebarContextMenu.x}px`, top: `${sidebarContextMenu.y}px` }}
        >
          <button
            onClick={() => {
              resetPanelLayout()
            }}
            type="button"
          >
            Reset Panel Layout
          </button>
        </div>
      ) : null}

      {renderAppDialogs()}
    </div>
  )
}

function App() {
  if (isCaptureRoute()) {
    return <CaptureScreen />
  }

  return <MainApp />
}

export default App
