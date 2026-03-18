import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AccountPanel from './components/AccountPanel'
import AppDialogs from './components/AppDialogs'
import AuthScreen from './components/AuthScreen'
import CameraPanel from './components/CameraPanel'
import CanvasWorkspace from './components/CanvasWorkspace'
import DockedSidebar from './components/DockedSidebar'
import InspectorPanel from './components/InspectorPanel'
import PreviewPanel from './components/PreviewPanel'
import SidebarRail from './components/SidebarRail'
import SettingsPanel from './components/SettingsPanel'
import TopBar from './components/TopBar'
import useNodeEditing from './hooks/useNodeEditing'
import useProjectSync from './hooks/useProjectSync'
import useUndoRedo from './hooks/useUndoRedo'
import useWorkspaceInteractions from './hooks/useWorkspaceInteractions'
import { ApiError, api, uploadWithProgress } from './lib/api'
import { defaultProjectSettings, defaultUserProjectUi, panelIds, SIDEBAR_RAIL_WIDTH } from './lib/constants'
import { blobFromUrl, createPreviewFile } from './lib/image'
import {
  buildClientTree,
  buildNodePath,
  compactNodePath,
  buildFocusPathContext,
  buildLayout,
  buildVisibleTree,
  collectDescendantIds,
  findNode,
  flattenSubtreeNodes,
  getSelectionRootIds,
} from './lib/tree'
import { getUrlState, updateUrlState } from './lib/urlState'
import {
  CameraIcon,
  GearIcon,
  GridIcon,
  PreviewIcon,
  UserIcon,
  WrenchIcon,
} from './components/icons'

function App() {
  const initialUrlState = useMemo(() => getUrlState(), [])
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [tree, setTree] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState([])
  const [theme, setTheme] = useState(defaultUserProjectUi.theme)
  const [showGrid, setShowGrid] = useState(defaultUserProjectUi.showGrid)
  const [status, setStatus] = useState('Loading projects...')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)
  const [showProjectDialog, setShowProjectDialog] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [newFolderDialog, setNewFolderDialog] = useState(null)
  const [newFolderName, setNewFolderName] = useState('New Folder')
  const [exportFileName, setExportFileName] = useState('')
  const [importProjectName, setImportProjectName] = useState('')
  const [importArchiveFile, setImportArchiveFile] = useState(null)
  const [transferProgress, setTransferProgress] = useState(null)
  const [deleteProjectText, setDeleteProjectText] = useState('')
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [sidebarContextMenu, setSidebarContextMenu] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [dragHoverNodeId, setDragHoverNodeId] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)
  const [transform, setTransform] = useState(initialUrlState.transform)
  const [previewTransform, setPreviewTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(defaultUserProjectUi.leftSidebarOpen)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(defaultUserProjectUi.rightSidebarOpen)
  const [leftActivePanel, setLeftActivePanel] = useState(defaultUserProjectUi.leftActivePanel)
  const [rightActivePanel, setRightActivePanel] = useState(defaultUserProjectUi.rightActivePanel)
  const [panelDock, setPanelDock] = useState(defaultUserProjectUi.panelDock)
  const [focusPathMode, setFocusPathMode] = useState(false)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(defaultUserProjectUi.leftSidebarWidth)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(defaultUserProjectUi.rightSidebarWidth)
  const [pendingUploadParentId, setPendingUploadParentId] = useState(null)
  const [pendingUploadMode, setPendingUploadMode] = useState('child')
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraNotice, setCameraNotice] = useState('')
  const [cameraSelection, setCameraSelection] = useState(null)
  const [loadedImages, setLoadedImages] = useState({})
  const [draggingPanelId, setDraggingPanelId] = useState(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [mobileConnectionCount, setMobileConnectionCount] = useState(0)
  const [collaboratorUsername, setCollaboratorUsername] = useState('')
  const [accountDialog, setAccountDialog] = useState(null)
  const [accountStatus, setAccountStatus] = useState('')
  const [accountForm, setAccountForm] = useState({
    username: '',
    currentPassword: '',
    newPassword: '',
    deleteConfirmation: '',
  })
  const fileInputRef = useRef(null)
  const importInputRef = useRef(null)
  const pendingLocalEventsRef = useRef(0)
  const treeRef = useRef(null)
  const selectedNodeIdRef = useRef(null)
  const loadedUiSignatureRef = useRef('')
  const pendingUiSignatureRef = useRef(null)
  const uiRequestSequenceRef = useRef(0)
  const { clearHistory, historyState, pushHistory, undo, redo } = useUndoRedo({ busy, setBusy, setError })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.title = tree?.project?.name ? `Nodetrace | ${tree.project.name}` : 'Nodetrace'
  }, [tree?.project?.name])

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

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

  function toggleMultiSelection(nodeId) {
    if (!nodeId || nodeId === selectedNodeId) {
      return
    }
    setMultiSelectedNodeIds((current) =>
      current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId],
    )
  }

  function toggleSidebarPanel(panelId) {
    const side = panelDock[panelId]
    if (side === 'left') {
      if (leftSidebarOpen && resolvedLeftActivePanel === panelId) {
        setLeftSidebarOpen(false)
        return
      }
      setLeftActivePanel(panelId)
      setLeftSidebarOpen(true)
      return
    }

    if (rightSidebarOpen && resolvedRightActivePanel === panelId) {
      setRightSidebarOpen(false)
      return
    }
    setRightActivePanel(panelId)
    setRightSidebarOpen(true)
  }

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
      theme: overrides.theme ?? theme,
      showGrid: overrides.showGrid ?? showGrid,
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

  function toggleThemePreference() {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark'
      markPendingUiSignature({ theme: nextTheme })
      return nextTheme
    })
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
  const resolvedLeftActivePanel = leftDockedPanelIds.includes(leftActivePanel) ? leftActivePanel : leftDockedPanelIds[0] || null
  const resolvedRightActivePanel = rightDockedPanelIds.includes(rightActivePanel)
    ? rightActivePanel
    : rightDockedPanelIds[0] || null
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
  const effectiveSelectedRootIds = useMemo(
    () => getSelectionRootIds(tree?.root, effectiveSelectedNodeIds),
    [effectiveSelectedNodeIds, tree?.root],
  )
  const effectiveSelectedNodes = useMemo(
    () => effectiveSelectedRootIds.map((nodeId) => tree?.nodes.find((node) => node.id === nodeId)).filter(Boolean),
    [effectiveSelectedRootIds, tree?.nodes],
  )
  const bulkSelectionCount = effectiveSelectedNodes.length
  const hasBulkSelection = bulkSelectionCount > 1
  const hasLockedSelectionRoot = effectiveSelectedNodes.some((node) => node.parent_id == null && !node.isVariant)
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
  const contextMenuNode = tree?.nodes.find((node) => node.id === contextMenu?.nodeId) || null
  const selectedNodePath = useMemo(
    () => compactNodePath(buildNodePath(tree?.nodes, selectedNodeId)),
    [selectedNodeId, tree?.nodes],
  )

  useEffect(() => {
    if (!selectedProjectId || !tree?.project) {
      return
    }

    const nextUi = {
      theme: projectUi.theme,
      showGrid: projectUi.showGrid,
      leftSidebarOpen: projectUi.leftSidebarOpen,
      rightSidebarOpen: projectUi.rightSidebarOpen,
      leftSidebarWidth: projectUi.leftSidebarWidth,
      rightSidebarWidth: projectUi.rightSidebarWidth,
      leftActivePanel: projectUi.leftActivePanel,
      rightActivePanel: projectUi.rightActivePanel,
      panelDock: projectUi.panelDock,
    }
    const incomingSignature = JSON.stringify(nextUi)
    if (pendingUiSignatureRef.current && incomingSignature !== pendingUiSignatureRef.current) {
      return
    }
    pendingUiSignatureRef.current = null
    loadedUiSignatureRef.current = incomingSignature
    setTheme(nextUi.theme)
    setShowGrid(nextUi.showGrid)
    setLeftSidebarOpen(nextUi.leftSidebarOpen)
    setRightSidebarOpen(nextUi.rightSidebarOpen)
    setLeftSidebarWidth(nextUi.leftSidebarWidth)
    setRightSidebarWidth(nextUi.rightSidebarWidth)
    setLeftActivePanel(nextUi.leftActivePanel)
    setRightActivePanel(nextUi.rightActivePanel)
    setPanelDock(nextUi.panelDock)
  }, [projectUi.leftActivePanel, projectUi.leftSidebarOpen, projectUi.leftSidebarWidth, projectUi.panelDock, projectUi.rightActivePanel, projectUi.rightSidebarOpen, projectUi.rightSidebarWidth, projectUi.showGrid, projectUi.theme, selectedProjectId, tree?.project])

  const handleAuthLost = useCallback(() => {
    setCurrentUser(null)
    setAuthReady(true)
    setProjects([])
    setSelectedProjectId(null)
    setTree(null)
    setSelectedNodeId(null)
    setMobileConnectionCount(0)
    setAccountStatus('')
    setAccountDialog(null)
    setAccountForm({
      username: '',
      currentPassword: '',
      newPassword: '',
      deleteConfirmation: '',
    })
    setStatus('Sign in to access your projects.')
  }, [])

  const loadCurrentUser = useCallback(async () => {
    try {
      const payload = await api('/api/auth/me')
      if (!payload?.authenticated || !payload.user) {
        handleAuthLost()
        return
      }
      setCurrentUser(payload.user)
      setStatus('')
    } finally {
      setAuthReady(true)
    }
  }, [handleAuthLost])

  useEffect(() => {
    loadCurrentUser().catch((loadError) => {
      setError(loadError.message)
      setStatus('Unable to initialize authentication.')
    })
  }, [loadCurrentUser])

  const { loadProjects, loadTree } = useProjectSync({
    clearHistory,
    captureSessionId: currentUser?.captureSessionId || '',
    currentUser,
    onAuthLost: handleAuthLost,
    pendingLocalEventsRef,
    selectedNode,
    selectedNodeIdRef,
    selectedProjectId,
    setError,
    setMobileConnectionCount,
    setProjects,
    setSelectedNodeId,
    setSelectedProjectId,
    setStatus,
    setTree,
  })

  function markImageLoaded(url) {
    if (!url) {
      return
    }
    setLoadedImages((current) => (current[url] ? current : { ...current, [url]: true }))
  }

  useEffect(() => {
    if (!authReady) {
      return
    }
    if (currentUser && !selectedProjectId && !tree) {
      return
    }
    if (currentUser && selectedProjectId && !tree) {
      return
    }
    updateUrlState(selectedProjectId, selectedNodeId || getUrlState().nodeId, transform)
  }, [authReady, currentUser, selectedNodeId, selectedProjectId, transform, tree])

  useEffect(() => {
    setMultiSelectedNodeIds([])
    pendingUiSignatureRef.current = null
    loadedUiSignatureRef.current = ''
  }, [selectedProjectId])

  useEffect(() => {
    setMultiSelectedNodeIds((current) =>
      current.filter((nodeId) => nodeId !== selectedNodeId && tree?.nodes.some((node) => node.id === nodeId)),
    )
  }, [selectedNodeId, tree?.nodes])


  useEffect(() => {
    if (mobileConnectionCount > 0) {
      setSessionDialogOpen(false)
    }
  }, [mobileConnectionCount])

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

  const beginLocalEventExpectation = useCallback(() => {
    pendingLocalEventsRef.current += 1
    return () => {
      pendingLocalEventsRef.current = Math.max(0, pendingLocalEventsRef.current - 1)
    }
  }, [])

  async function patchNodeRequest(nodeId, payload, options = {}) {
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
  }

  async function patchProjectSettingsRequest(projectId, nextSettings) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedProject = await api(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })

      setTree((current) => (current ? { ...current, project: updatedProject } : current))
      setProjects((current) =>
        current.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
      )
      return updatedProject
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }

  const patchProjectPreferencesRequest = useCallback(async (projectId, nextPreferences) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    const requestSignature = JSON.stringify(nextPreferences)
    const requestSequence = ++uiRequestSequenceRef.current
    try {
      const updatedProject = await api(`/api/projects/${projectId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPreferences),
      })

      if (requestSequence !== uiRequestSequenceRef.current) {
        return updatedProject
      }

      if (pendingUiSignatureRef.current && pendingUiSignatureRef.current !== requestSignature) {
        return updatedProject
      }

      setTree((current) => (current ? { ...current, project: updatedProject } : current))
      setProjects((current) =>
        current.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
      )
      return updatedProject
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [beginLocalEventExpectation])

  useEffect(() => {
    if (!currentUser || !selectedProjectId || !tree?.project) {
      return undefined
    }

    const nextUi = {
      theme,
      showGrid,
      leftSidebarOpen,
      rightSidebarOpen,
      leftSidebarWidth,
      rightSidebarWidth,
      leftActivePanel: resolvedLeftActivePanel,
      rightActivePanel: resolvedRightActivePanel,
      panelDock,
    }
    const signature = JSON.stringify(nextUi)
    if (signature === loadedUiSignatureRef.current) {
      return undefined
    }
    pendingUiSignatureRef.current = signature

    const handle = window.setTimeout(() => {
      patchProjectPreferencesRequest(selectedProjectId, nextUi).catch((saveError) => {
        pendingUiSignatureRef.current = null
        setError(saveError.message)
      })
    }, 180)

    return () => {
      window.clearTimeout(handle)
    }
  }, [
    currentUser,
    leftActivePanel,
    leftSidebarOpen,
    leftSidebarWidth,
    patchProjectPreferencesRequest,
    panelDock,
    resolvedLeftActivePanel,
    resolvedRightActivePanel,
    rightActivePanel,
    rightSidebarOpen,
    rightSidebarWidth,
    selectedProjectId,
    showGrid,
    theme,
    tree?.project,
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

  async function createFolderRequest(projectId, parentId, payload = {}) {
    return api(`/api/projects/${projectId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentId,
        name: payload.name ?? 'New Folder',
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

  const applyCollapsedState = useCallback((updatedNode, updatedIds, collapsed) => {
    const updatedIdSet = new Set(updatedIds || [updatedNode.id])
    setTree((current) => {
      if (!current) {
        return current
      }

      const nextNodes = current.nodes.map((node) => {
        if (node.id === updatedNode.id) {
          return { ...node, ...updatedNode }
        }
        if (updatedIdSet.has(node.id)) {
          return { ...node, collapsed }
        }
        return node
      })

      return buildClientTree(current.project, nextNodes)
    })
  }, [])

  async function deleteNodeRequest(nodeId) {
    return api(`/api/nodes/${nodeId}`, { method: 'DELETE' })
  }

  async function uploadPhotoFilesRequest(projectId, files, targetNodeId, mode = 'child') {
    const createdNodes = []

    for (const file of files) {
      const previewFile = await createPreviewFile(file)
      const formData = new FormData()
      if (mode === 'variant') {
        formData.append('variantOfId', targetNodeId)
        formData.append('variant', 'true')
      } else {
        formData.append('parentId', targetNodeId)
      }
      formData.append('name', '<untitled>')
      formData.append('notes', '')
      formData.append('tags', '')
      formData.append('file', file)
      if (previewFile) {
        formData.append('preview', previewFile)
      }

      const createdNode = await api(`/api/projects/${projectId}/photos`, {
        method: 'POST',
        body: formData,
      })
      createdNodes.push(createdNode)
    }

    return createdNodes
  }

  async function createDeleteSnapshot(node) {
    const nodes = []
    const files = []
    let fileIndex = 0

    async function walk(current) {
      const imageFileKey = current.imageUrl ? `image-${fileIndex++}` : null
      const previewFileKey = current.previewUrl ? `preview-${fileIndex++}` : null

      if (imageFileKey) {
        const imageBlob = await blobFromUrl(current.imageUrl)
        files.push({
          key: imageFileKey,
          file: new File([imageBlob], current.original_filename || `${current.name}.jpg`, {
            type: imageBlob.type || 'image/jpeg',
          }),
        })
      }

      if (previewFileKey) {
        const previewBlob = await blobFromUrl(current.previewUrl)
        files.push({
          key: previewFileKey,
          file: new File([previewBlob], `${current.name}-preview.jpg`, {
            type: previewBlob.type || 'image/jpeg',
          }),
        })
      }

      nodes.push({
        id: current.id,
        parent_id: current.childrenParentOverride ?? current.parent_id,
        variant_of_id: current.variant_of_id,
        type: current.type,
        name: current.name,
        notes: current.notes || '',
        tags: current.tags || [],
        original_filename: current.original_filename || null,
        image_file_key: imageFileKey,
        preview_file_key: previewFileKey,
      })

      for (const child of current.children || []) {
        await walk(child)
      }
      for (const variant of current.variants || []) {
        await walk(variant)
      }
    }

    await walk(node)
    return {
      manifest: {
        root_id: node.id,
        root_parent_id: node.parent_id,
        root_variant_of_id: node.variant_of_id,
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
      .filter((node) => !node.isVariant && (node.children?.length || node.collapsed))
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

      setTree((current) =>
        current
          ? buildClientTree(
              current.project,
              current.nodes.map((node) =>
                collapsibleIds.includes(node.id) ? { ...node, collapsed } : node,
              ),
            )
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
    async (nodeId, parentId, asVariant = false) => {
      setBusy(true)
      setError('')

      try {
        const node = tree?.nodes.find((item) => item.id === nodeId)
        if (!node) {
          return
        }

        const beforePayload =
          node.variant_of_id != null
            ? { variantOfId: node.variant_of_id }
            : { parentId: node.parent_id, variantOfId: null }
        const afterPayload = asVariant ? { variantOfId: parentId } : { parentId, variantOfId: null }
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
      setEditForm({ name: '', notes: '', tags: '' })
      setPreviewTransform({ x: 0, y: 0, scale: 1 })
      return
    }

    if (selectedNode.id === editTargetId) {
      return
    }

    setEditTargetId(selectedNode.id)
    setEditForm({
      name: selectedNode.name,
      notes: selectedNode.notes || '',
      tags: (selectedNode.tags || []).join(', '),
    })
    setPreviewTransform({ x: 0, y: 0, scale: 1 })
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
      const created = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim(), description: '' }),
      })

      setProjectName('')
      setShowProjectDialog(null)
      setOpenMenu(null)
      setTree(created)
      await loadProjects(created.project.id)
      setSelectedNodeId(created.root.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
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
            tags: (refreshedSelectedNode.tags || []).join(', '),
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

      setTree(updatedTree)
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
    if (!accountForm.currentPassword || !accountForm.newPassword) {
      return
    }

    setBusy(true)
    setError('')
    setAccountStatus('')
    try {
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
      setAccountForm((current) => ({ ...current, currentPassword: '', newPassword: '' }))
      setAccountStatus('Password updated.')
      setAccountDialog(null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    if (accountForm.deleteConfirmation !== currentUser?.username) {
      return
    }

    setBusy(true)
    setError('')
    setAccountStatus('')
    try {
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
        deleteConfirmation: '',
      })
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

      setTree(importedTree)
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

  async function addFolder(parentId = selectedNode?.id) {
    if (!parentId || !selectedProjectId) {
      return
    }

    setBusy(true)
    setError('')

    try {
      let folderId = null
      const createFolder = async () => {
        const rollbackLocalEvent = beginLocalEventExpectation()
        let created = null
        try {
          created = await createFolderRequest(selectedProjectId, parentId, { name: newFolderName.trim() || 'New Folder' })
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
        folderId = created.id
        appendNodesToTree([created])
        updateProjectListNodeCount(1)
        setSelectedNodeId(parentId)
        return created
      }

      await createFolder()
      pushHistory({
        undo: async () => {
          if (folderId != null) {
            const rollbackUndoEvent = beginLocalEventExpectation()
            try {
              await deleteNodeRequest(folderId)
            } catch (error) {
              rollbackUndoEvent()
              throw error
            }
            removeNodesFromTree([folderId])
            updateProjectListNodeCount(-1)
            setSelectedNodeId(parentId)
          }
        },
        redo: async () => {
          await createFolder()
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  function openNewFolderDialog(parentId = selectedNode?.id) {
    if (!parentId || !selectedProjectId) {
      return
    }

    setNewFolderName('New Folder')
    setNewFolderDialog({ parentId })
  }

  async function submitNewFolder() {
    if (!newFolderDialog?.parentId) {
      return
    }

    await addFolder(newFolderDialog.parentId)
    setNewFolderDialog(null)
    setNewFolderName('New Folder')
  }

  function triggerAddPhoto() {
    if (!selectedNode || selectedNode.isVariant || busy) {
      return
    }
    setPendingUploadParentId(selectedNode.id)
    setPendingUploadMode('child')
    fileInputRef.current?.click()
  }

  function triggerAddVariantPhoto() {
    if (!selectedNode || busy) {
      return
    }
    setPendingUploadParentId(selectedNode.id)
    setPendingUploadMode('variant')
    fileInputRef.current?.click()
  }

  async function uploadFiles(files, targetNodeId = selectedNode?.id, mode = 'child') {
    if (!targetNodeId || files.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
      let createdNodeIds = []
      const performUpload = async () => {
        const rollbackLocalEvent = beginLocalEventExpectation()
        let createdNodes = []
        try {
          createdNodes = await uploadPhotoFilesRequest(selectedProjectId, files, targetNodeId, mode)
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
        createdNodeIds = createdNodes.map((node) => node.id)
        appendNodesToTree(createdNodes)
        updateProjectListNodeCount(createdNodes.length)
        setSelectedNodeId(selectedNodeId)
      }

      await performUpload()
      pushHistory({
        undo: async () => {
          const rollbackUndoEvent = beginLocalEventExpectation()
          try {
          for (const nodeId of [...createdNodeIds].reverse()) {
            await deleteNodeRequest(nodeId)
          }
          } catch (error) {
            rollbackUndoEvent()
            throw error
          }
          removeNodesFromTree(createdNodeIds)
          updateProjectListNodeCount(-createdNodeIds.length)
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
      setPendingUploadMode('child')
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
      applyCollapsedState(payload.node, payload.updatedIds, collapsed)
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
          applyCollapsedState(revertedPayload.node, revertedPayload.updatedIds, previousValue)
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
          applyCollapsedState(redonePayload.node, redonePayload.updatedIds, collapsed)
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }, [applyCollapsedState, beginLocalEventExpectation, pushHistory, setCollapsedRequest, tree?.nodes])

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
        if (!selectedNode.isVariant && (selectedNode.children?.length || selectedNode.collapsed)) {
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

  async function convertNodeToVariant(node, anchorId = node?.parent_id) {
    if (!node || !anchorId) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const previousPayload =
        node.variant_of_id != null
          ? { variantOfId: node.variant_of_id }
          : { parentId: node.parent_id, variantOfId: null }
      const nextPayload = { variantOfId: anchorId }

      const rollbackLocalEvent = beginLocalEventExpectation()
      let updatedNode = null
      try {
        updatedNode = await moveNodeRequest(node.id, nextPayload)
      } catch (error) {
        rollbackLocalEvent()
        throw error
      }
      applyNodeUpdate(updatedNode)
      pushHistory({
        undo: async () => {
          const rollbackUndoEvent = beginLocalEventExpectation()
          let revertedNode = null
          try {
            revertedNode = await moveNodeRequest(node.id, previousPayload)
          } catch (error) {
            rollbackUndoEvent()
            throw error
          }
          applyNodeUpdate(revertedNode)
        },
        redo: async () => {
          const rollbackRedoEvent = beginLocalEventExpectation()
          let redoneNode = null
          try {
            redoneNode = await moveNodeRequest(node.id, nextPayload)
          } catch (error) {
            rollbackRedoEvent()
            throw error
          }
          applyNodeUpdate(redoneNode)
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function convertVariantToChild(node) {
    if (!node?.variant_of_id) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const previousPayload = { variantOfId: node.variant_of_id }
      const nextPayload = { parentId: node.variant_of_id, variantOfId: null }

      const rollbackLocalEvent = beginLocalEventExpectation()
      let updatedNode = null
      try {
        updatedNode = await moveNodeRequest(node.id, nextPayload)
      } catch (error) {
        rollbackLocalEvent()
        throw error
      }
      applyNodeUpdate(updatedNode)
      pushHistory({
        undo: async () => {
          const rollbackUndoEvent = beginLocalEventExpectation()
          let revertedNode = null
          try {
            revertedNode = await moveNodeRequest(node.id, previousPayload)
          } catch (error) {
            rollbackUndoEvent()
            throw error
          }
          applyNodeUpdate(revertedNode)
        },
        redo: async () => {
          const rollbackRedoEvent = beginLocalEventExpectation()
          let redoneNode = null
          try {
            redoneNode = await moveNodeRequest(node.id, nextPayload)
          } catch (error) {
            rollbackRedoEvent()
            throw error
          }
          applyNodeUpdate(redoneNode)
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteNode() {
    if (!selectedNode) {
      return
    }

    const deletableNodes = effectiveSelectedNodes.filter((node) => node.parent_id != null)
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
          collectDescendantIds(subtreeNode || { id: node.id, children: [], variants: [] }),
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

      for (const entry of [...deleteEntries].reverse()) {
        const rollbackLocalEvent = beginLocalEventExpectation()
        try {
          await deleteNodeRequest(entry.currentRootId)
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
      }
      setDeleteNodeOpen(false)
      const removedIds = new Set(deleteEntries.flatMap((entry) => entry.subtreeIds))
      removeNodesFromTree(Array.from(removedIds))
      updateProjectListNodeCount(-removedIds.size)
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
            for (const entry of [...deleteEntries].reverse()) {
              const rollbackRedoEvent = beginLocalEventExpectation()
              const currentTree = treeRef.current
              const currentSubtreeNode = findNode(currentTree?.root, entry.currentRootId)
              const currentSubtreeIds = Array.from(
                collectDescendantIds(currentSubtreeNode || { id: entry.currentRootId, children: [], variants: [] }),
              )
              try {
                await deleteNodeRequest(entry.currentRootId)
              } catch (error) {
                rollbackRedoEvent()
                throw error
              }
              currentSubtreeIds.forEach((id) => removedAgainIds.add(id))
            }
            removeNodesFromTree(Array.from(removedAgainIds))
            updateProjectListNodeCount(-removedAgainIds.size)
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
    beginNodeDrag,
    beginPan,
    beginPreviewPan,
    cameraVideoRef,
    cameraViewportRef,
    captureFullCameraFrame,
    fitCanvasToView,
    handleCanvasPointerMove,
    previewViewportRef,
    resizeRef,
    stopPanning,
    stopPreviewPan,
    viewportRef,
  } = useWorkspaceInteractions({
    cameraVisible,
    dragHoverNodeId,
    layout,
    moveDraggedNode,
    previewVisible,
    previewTransform,
    selectedCameraId,
    selectedNode,
    setCameraDevices,
    setCameraNotice,
    setCameraSelection,
    setDragHoverNodeId,
    setDragPreview,
    setLeftSidebarWidth,
    setPreviewTransform,
    setRightSidebarWidth,
    setSelectedCameraId,
    setTransform,
    transform,
    uploadFiles,
  })

  async function downloadSelectedImage() {
    if (!selectedNode?.imageUrl) {
      return
    }

    const response = await fetch(selectedNode.imageUrl)
    if (!response.ok) {
      throw new Error('Unable to download the selected image.')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const extension =
      blob.type === 'image/png'
        ? '.png'
        : blob.type === 'image/webp'
          ? '.webp'
          : blob.type === 'image/gif'
            ? '.gif'
            : '.jpg'
    link.download = `${selectedNode.name || 'image'}${extension}`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function copySelectedImage() {
    if (!selectedNode?.imageUrl) {
      return
    }

    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image copy is not supported in this browser.')
    }

    const response = await fetch(selectedNode.imageUrl)
    if (!response.ok) {
      throw new Error('Unable to copy the selected image.')
    }

    const blob = await response.blob()

    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/jpeg']: blob })])
      return
    } catch (error) {
      if (!blob.type.startsWith('image/')) {
        throw error
      }
    }

    const imageUrl = URL.createObjectURL(blob)
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = imageUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!pngBlob) {
        throw new Error('Unable to convert image for clipboard copy.')
      }

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  }

  const panelDefinitions = {
      preview: {
        id: 'preview',
        title: 'Preview',
        icon: <PreviewIcon />,
        content: (
          <PreviewPanel
            beginPreviewPan={beginPreviewPan}
            busy={busy}
            copySelectedImage={copySelectedImage}
            downloadSelectedImage={downloadSelectedImage}
            previewTransform={previewTransform}
            previewViewportRef={previewViewportRef}
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
            selectedCameraId={selectedCameraId}
            selectedNode={selectedNode}
            setSelectedCameraId={setSelectedCameraId}
          />
        ),
      },
      inspector: {
        id: 'inspector',
        title: 'Inspector',
        icon: <WrenchIcon />,
        content: (
          <InspectorPanel
            busy={busy}
            bulkSelectionCount={bulkSelectionCount}
            editForm={editForm}
            editTargetNode={editTargetNode}
            error={error}
            hasBulkSelection={hasBulkSelection}
            hasLockedSelectionRoot={hasLockedSelectionRoot}
            nameInputRef={nameInputRef}
            saveNodeDraft={saveNodeDraft}
            selectedNode={selectedNode}
            setDeleteNodeOpen={setDeleteNodeOpen}
            setEditForm={setEditForm}
            status={status}
          />
        ),
      },
      settings: {
        id: 'settings',
        title: 'Settings',
        icon: <GearIcon />,
        content: (
          <SettingsPanel
            collaboratorUsername={collaboratorUsername}
            addCollaborator={addCollaborator}
            busy={busy}
            canManageUsers={Boolean(tree?.project?.canManageUsers)}
            clearError={() => setError('')}
            collaborators={tree?.project?.collaborators || []}
            currentUsername={currentUser?.username || ''}
            error={error}
            ownerUsername={tree?.project?.ownerUsername || ''}
            openRenameProjectDialog={() => {
              setError('')
              setProjectName(tree?.project?.name || '')
              setShowProjectDialog('rename')
            }}
            persistProjectSettings={persistProjectSettings}
            projectId={tree?.project?.id}
            projectSettings={projectSettings}
            resetProjectSettings={resetProjectSettings}
            removeCollaborator={removeCollaborator}
            setCollaboratorUsername={setCollaboratorUsername}
          />
        ),
      },
      account: {
        id: 'account',
        title: 'Account',
        icon: <UserIcon />,
        content: (
          <AccountPanel
            currentUser={currentUser}
            openAccountDialog={(dialog) => {
              setError('')
              setAccountStatus('')
              setAccountDialog(dialog)
            }}
            logoutUser={() => void logoutUser()}
          />
        ),
      },
    }
  const leftRailPanels = leftDockedPanelIds.map((panelId) => panelDefinitions[panelId]).filter(Boolean)
  const rightRailPanels = rightDockedPanelIds.map((panelId) => panelDefinitions[panelId]).filter(Boolean)
  const activeLeftPanel = resolvedLeftActivePanel ? panelDefinitions[resolvedLeftActivePanel] : null
  const activeRightPanel = resolvedRightActivePanel ? panelDefinitions[resolvedRightActivePanel] : null

  if (!authReady) {
    return <div className="app-shell app-shell--loading" data-theme={theme}>Loading...</div>
  }

  if (!currentUser) {
    return (
      <div className="app-shell app-shell--auth" data-theme={theme}>
        <AuthScreen
          busy={busy}
          clearError={() => setError('')}
          error={error}
          onLogin={loginUser}
          onRegister={registerUser}
        />
      </div>
    )
  }

  return (
    <div
      className="app-shell"
      data-theme={theme}
    >
        <TopBar
          busy={busy}
        fileInputRef={fileInputRef}
        fitCanvasToView={fitCanvasToView}
        focusPathMode={focusPathMode}
        historyState={historyState}
        importInputRef={importInputRef}
        importProjectName={importProjectName}
        leftActivePanel={resolvedLeftActivePanel}
        leftSidebarOpen={leftSidebarOpen}
        mobileConnectionCount={mobileConnectionCount}
        openMenu={openMenu}
        panelDock={panelDock}
        panelTitles={Object.fromEntries(panelIds.map((panelId) => [panelId, panelDefinitions[panelId]?.title || panelId]))}
        pendingUploadMode={pendingUploadMode}
        pendingUploadParentId={pendingUploadParentId}
        projectName={tree?.project?.name}
        projects={projects}
        redo={redo}
        rightActivePanel={resolvedRightActivePanel}
        rightSidebarOpen={rightSidebarOpen}
        selectedNode={selectedNode}
        selectedProjectId={selectedProjectId}
        openNewFolderDialog={openNewFolderDialog}
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
        toggleTheme={toggleThemePreference}
        theme={theme}
        triggerAddPhoto={triggerAddPhoto}
        triggerAddVariantPhoto={triggerAddVariantPhoto}
        toggleSidebarPanel={toggleSidebarPanel}
        tree={tree}
        undo={undo}
        uploadFiles={uploadFiles}
        style={{
          gridColumn: '1 / -1',
          gridRow: '1 / 2',
        }}
      />
      <main
        className="main-layout"
        style={{
          gridColumn: '1 / -1',
          gridRow: '2 / 3',
          gridTemplateColumns: `${SIDEBAR_RAIL_WIDTH}px ${leftSidebarOpen ? `${leftSidebarWidth}px` : '0px'} minmax(0, 1fr) ${rightSidebarOpen ? `${rightSidebarWidth}px` : '0px'} ${SIDEBAR_RAIL_WIDTH}px`,
        }}
      >
        <SidebarRail
          activePanelId={resolvedLeftActivePanel}
          dragOver={draggingPanelId != null && panelDock[draggingPanelId] !== 'left'}
          onDropPanel={handleDropPanel}
          onEndDrag={() => setDraggingPanelId(null)}
          onOpenContextMenu={openSidebarContextMenu}
          onStartDrag={setDraggingPanelId}
          open={leftSidebarOpen}
          panels={leftRailPanels}
          side="left"
          togglePanel={toggleSidebarPanel}
        />
        <DockedSidebar
          activePanel={activeLeftPanel}
          onClose={() => setLeftSidebarOpen(false)}
          onResizeStart={(event) => {
            resizeRef.current = { pointerId: event.pointerId, target: 'left' }
            document.body.classList.add('is-resizing')
            event.preventDefault()
          }}
          side="left"
          visible={leftSidebarOpen && Boolean(activeLeftPanel)}
        />
        <CanvasWorkspace
          beginNodeDrag={beginNodeDrag}
          beginPan={beginPan}
          busy={busy}
          contextMenu={contextMenu}
          contextMenuNode={contextMenuNode}
          convertNodeToVariant={convertNodeToVariant}
          convertVariantToChild={convertVariantToChild}
          dragActive={dragActive}
          dragHoverNodeId={dragHoverNodeId}
          dragPreview={dragPreview}
          editForm={editForm}
          editTargetNode={editTargetNode}
          fileInputRef={fileInputRef}
          fitCanvasToView={fitCanvasToView}
          focusPathMode={focusPathMode}
          handleCanvasPointerMove={handleCanvasPointerMove}
          layout={layout}
          loadedImages={loadedImages}
          markImageLoaded={markImageLoaded}
          multiSelectedNodeIds={multiSelectedNodeIds}
          openNewFolderDialog={openNewFolderDialog}
          projectSettings={projectSettings}
          selectedNodePath={selectedNodePath}
          saveNodeDraft={saveNodeDraft}
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          setCollapsed={setCollapsed}
          setContextMenu={setContextMenu}
          setDeleteNodeOpen={setDeleteNodeOpen}
          setDragActive={setDragActive}
          setMultiSelectedNodeIds={setMultiSelectedNodeIds}
          setPendingUploadMode={setPendingUploadMode}
          setPendingUploadParentId={setPendingUploadParentId}
          setSelectedNodeId={setSelectedNodeId}
          showGrid={showGrid}
          stopPanning={stopPanning}
          toggleGrid={toggleGridPreference}
          toggleMultiSelection={toggleMultiSelection}
          transform={transform}
          tree={tree}
          uploadFiles={uploadFiles}
          viewportRef={viewportRef}
        />
        <DockedSidebar
          activePanel={activeRightPanel}
          onClose={() => setRightSidebarOpen(false)}
          onResizeStart={(event) => {
            resizeRef.current = { pointerId: event.pointerId, target: 'right' }
            document.body.classList.add('is-resizing')
            event.preventDefault()
          }}
          side="right"
          visible={rightSidebarOpen && Boolean(activeRightPanel)}
        />
        <SidebarRail
          activePanelId={resolvedRightActivePanel}
          dragOver={draggingPanelId != null && panelDock[draggingPanelId] !== 'right'}
          onDropPanel={handleDropPanel}
          onEndDrag={() => setDraggingPanelId(null)}
          onOpenContextMenu={openSidebarContextMenu}
          onStartDrag={setDraggingPanelId}
          open={rightSidebarOpen}
          panels={rightRailPanels}
          side="right"
          togglePanel={toggleSidebarPanel}
        />
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

      <AppDialogs
        accountDialog={accountDialog}
        accountForm={accountForm}
        accountStatus={accountStatus}
        bulkSelectionCount={bulkSelectionCount}
        busy={busy}
        changePassword={changePassword}
        changeUsername={changeUsername}
        createProject={createProject}
        currentUser={currentUser}
        deleteNode={deleteNode}
        deleteAccount={deleteAccount}
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
        importArchiveFile={importArchiveFile}
        importInputRef={importInputRef}
        importProject={importProject}
        importProjectName={importProjectName}
        mobileConnectionCount={mobileConnectionCount}
        newFolderDialog={newFolderDialog}
        newFolderName={newFolderName}
        projectName={projectName}
        projects={projects}
        renameProject={renameProject}
        selectedNode={selectedNode}
        selectedProjectId={selectedProjectId}
        sessionDialogOpen={sessionDialogOpen}
        setAccountDialog={setAccountDialog}
        setAccountForm={setAccountForm}
        setDeleteNodeOpen={setDeleteNodeOpen}
        setDeleteProjectText={setDeleteProjectText}
        setExportFileName={setExportFileName}
        setImportProjectName={setImportProjectName}
        setNewFolderDialog={setNewFolderDialog}
        setNewFolderName={setNewFolderName}
        setProjectName={setProjectName}
        setSessionDialogOpen={setSessionDialogOpen}
        setShowProjectDialog={setShowProjectDialog}
        setShowProjectId={setSelectedProjectId}
        showProjectDialog={showProjectDialog}
        submitNewFolder={submitNewFolder}
        transferProgress={transferProgress}
        tree={tree}
      />
    </div>
  )
}

export default App
