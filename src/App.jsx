import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AppDialogs from './components/AppDialogs'
import CameraPanel from './components/CameraPanel'
import CanvasWorkspace from './components/CanvasWorkspace'
import InspectorPanel from './components/InspectorPanel'
import PreviewPanel from './components/PreviewPanel'
import SettingsPanel from './components/SettingsPanel'
import TopBar from './components/TopBar'
import useNodeEditing from './hooks/useNodeEditing'
import useProjectSync from './hooks/useProjectSync'
import useUndoRedo from './hooks/useUndoRedo'
import useWorkspaceInteractions from './hooks/useWorkspaceInteractions'
import { api, uploadWithProgress } from './lib/api'
import { defaultProjectSettings } from './lib/constants'
import { blobFromUrl, createPreviewFile } from './lib/image'
import { getOrCreateSessionId, readStoredBoolean, readStoredNumber } from './lib/storage'
import {
  buildClientTree,
  buildFocusPathContext,
  buildLayout,
  buildVisibleTree,
  collectBlockedIdsForSelection,
  collectDescendantIds,
  collectParentOptions,
  findNode,
  flattenSubtreeNodes,
  getSelectionRootIds,
} from './lib/tree'
import { getUrlState, updateUrlState } from './lib/urlState'

function App() {
  const initialUrlState = useMemo(() => getUrlState(), [])
  const desktopClientId = getOrCreateSessionId()
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [tree, setTree] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState([])
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
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
  const [dragActive, setDragActive] = useState(false)
  const [dragHoverNodeId, setDragHoverNodeId] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)
  const [transform, setTransform] = useState(initialUrlState.transform)
  const [previewTransform, setPreviewTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [previewOpen, setPreviewOpen] = useState(() => readStoredBoolean('preview-open', false))
  const [inspectorOpen, setInspectorOpen] = useState(() => readStoredBoolean('inspector-open', true))
  const [settingsOpen, setSettingsOpen] = useState(() => readStoredBoolean('settings-open', false))
  const [cameraOpen, setCameraOpen] = useState(() => readStoredBoolean('camera-open', false))
  const [focusPathMode, setFocusPathMode] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(() => readStoredNumber('preview-width', 340))
  const [inspectorWidth, setInspectorWidth] = useState(() => readStoredNumber('inspector-width', 320))
  const [settingsWidth, setSettingsWidth] = useState(() => readStoredNumber('settings-width', 280))
  const [cameraWidth, setCameraWidth] = useState(() => readStoredNumber('camera-width', 360))
  const [pendingUploadParentId, setPendingUploadParentId] = useState(null)
  const [pendingUploadMode, setPendingUploadMode] = useState('child')
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraNotice, setCameraNotice] = useState('')
  const [cameraSelection, setCameraSelection] = useState(null)
  const [loadedImages, setLoadedImages] = useState({})
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [mobileConnectionCount, setMobileConnectionCount] = useState(0)
  const fileInputRef = useRef(null)
  const importInputRef = useRef(null)
  const pendingLocalEventsRef = useRef(0)
  const treeRef = useRef(null)
  const selectedNodeIdRef = useRef(null)
  const { clearHistory, historyState, pushHistory, undo, redo } = useUndoRedo({ busy, setBusy, setError })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.title = tree?.project?.name ? `Nodetrace | ${tree.project.name}` : 'Nodetrace'
  }, [tree?.project?.name])

  useEffect(() => {
    localStorage.setItem('preview-open', String(previewOpen))
  }, [previewOpen])

  useEffect(() => {
    localStorage.setItem('inspector-open', String(inspectorOpen))
  }, [inspectorOpen])

  useEffect(() => {
    localStorage.setItem('settings-open', String(settingsOpen))
  }, [settingsOpen])

  useEffect(() => {
    localStorage.setItem('camera-open', String(cameraOpen))
  }, [cameraOpen])

  useEffect(() => {
    localStorage.setItem('preview-width', String(previewWidth))
  }, [previewWidth])

  useEffect(() => {
    localStorage.setItem('inspector-width', String(inspectorWidth))
  }, [inspectorWidth])

  useEffect(() => {
    localStorage.setItem('settings-width', String(settingsWidth))
  }, [settingsWidth])

  useEffect(() => {
    localStorage.setItem('camera-width', String(cameraWidth))
  }, [cameraWidth])

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

  const selectedNode = tree?.nodes.find((node) => node.id === selectedNodeId) || null
  const projectSettings = tree?.project?.settings || defaultProjectSettings
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
  const blockedParentIds = collectBlockedIdsForSelection(tree?.root, effectiveSelectedRootIds)
  const parentOptions = collectParentOptions(tree?.root, blockedParentIds)
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

  const { loadProjects } = useProjectSync({
    clearHistory,
    desktopClientId,
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
    updateUrlState(selectedProjectId, selectedNodeId || getUrlState().nodeId, transform)
  }, [selectedNodeId, selectedProjectId, transform])

  useEffect(() => {
    setMultiSelectedNodeIds([])
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
        collapsed: Boolean(current.collapsed),
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
    moveParentId,
    nameInputRef,
    saveNodeDraft,
    setEditForm,
    setEditTargetId,
    setMoveParentId,
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
      setMoveParentId('')
      setPreviewTransform({ x: 0, y: 0, scale: 1 })
      return
    }

    if (selectedNode.id === editTargetId) {
      setMoveParentId(selectedNode.parent_id ?? '')
      return
    }

    setEditTargetId(selectedNode.id)
    setEditForm({
      name: selectedNode.name,
      notes: selectedNode.notes || '',
      tags: (selectedNode.tags || []).join(', '),
    })
    setMoveParentId(selectedNode.parent_id ?? '')
    setPreviewTransform({ x: 0, y: 0, scale: 1 })
  }, [editTargetId, selectedNode, setEditForm, setEditTargetId, setMoveParentId])

  useEffect(() => {
    function closeContextMenu(event) {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.node-context-menu')) {
        return
      }
      setContextMenu(null)
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
      const response = await fetch(url)
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

  async function moveNodeTo(parentId) {
    if (!parentId || effectiveSelectedNodes.length === 0) {
      return
    }

    const movableNodes = effectiveSelectedNodes.filter((node) => node.parent_id != null || node.isVariant)
    if (movableNodes.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const moveEntries = movableNodes.map((node) => ({
        nodeId: node.id,
        previousPayload:
          node.variant_of_id != null
            ? { variantOfId: node.variant_of_id }
            : { parentId: node.parent_id, variantOfId: null },
        nextPayload: { parentId, variantOfId: null },
      }))

      const updatedNodes = []
      for (const entry of moveEntries) {
        const rollbackLocalEvent = beginLocalEventExpectation()
        try {
          const updatedNode = await moveNodeRequest(entry.nodeId, entry.nextPayload)
          updatedNodes.push(updatedNode)
          applyNodeUpdate(updatedNode)
        } catch (error) {
          rollbackLocalEvent()
          throw error
        }
      }

      pushHistory({
        undo: async () => {
          for (const entry of moveEntries) {
            const rollbackUndoEvent = beginLocalEventExpectation()
            let revertedNode = null
            try {
              revertedNode = await moveNodeRequest(entry.nodeId, entry.previousPayload)
            } catch (error) {
              rollbackUndoEvent()
              throw error
            }
            applyNodeUpdate(revertedNode)
          }
        },
        redo: async () => {
          for (const entry of moveEntries) {
            const rollbackRedoEvent = beginLocalEventExpectation()
            let redoneNode = null
            try {
              redoneNode = await moveNodeRequest(entry.nodeId, entry.nextPayload)
            } catch (error) {
              rollbackRedoEvent()
              throw error
            }
            applyNodeUpdate(redoneNode)
          }
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
    cameraOpen,
    dragHoverNodeId,
    layout,
    moveDraggedNode,
    previewOpen,
    previewTransform,
    selectedCameraId,
    selectedNode,
    setCameraDevices,
    setCameraNotice,
    setCameraSelection,
    setCameraWidth,
    setDragHoverNodeId,
    setDragPreview,
    setInspectorWidth,
    setPreviewTransform,
    setPreviewWidth,
    setSelectedCameraId,
    setSettingsWidth,
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

  return (
    <div className="app-shell" data-theme={theme}>
      <TopBar
        busy={busy}
        cameraOpen={cameraOpen}
        fileInputRef={fileInputRef}
        fitCanvasToView={fitCanvasToView}
        focusPathMode={focusPathMode}
        historyState={historyState}
        importInputRef={importInputRef}
        importProjectName={importProjectName}
        inspectorOpen={inspectorOpen}
        mobileConnectionCount={mobileConnectionCount}
        openMenu={openMenu}
        pendingUploadMode={pendingUploadMode}
        pendingUploadParentId={pendingUploadParentId}
        previewOpen={previewOpen}
        projectName={tree?.project?.name}
        redo={redo}
        selectedNode={selectedNode}
        selectedProjectId={selectedProjectId}
        setAllNodesCollapsed={setAllNodesCollapsed}
        setCameraOpen={setCameraOpen}
        setDeleteNodeOpen={setDeleteNodeOpen}
        setDeleteProjectText={setDeleteProjectText}
        setExportFileName={setExportFileName}
        setFocusPathMode={setFocusPathMode}
        setImportArchiveFile={setImportArchiveFile}
        setImportProjectName={setImportProjectName}
        setInspectorOpen={setInspectorOpen}
        setOpenMenu={setOpenMenu}
        setPreviewOpen={setPreviewOpen}
        setSessionDialogOpen={setSessionDialogOpen}
        setSettingsOpen={setSettingsOpen}
        setShowProjectDialog={setShowProjectDialog}
        settingsOpen={settingsOpen}
        setTheme={setTheme}
        theme={theme}
        tree={tree}
        undo={undo}
        uploadFiles={uploadFiles}
      />

      <main
        className="main-layout"
        style={{
          gridTemplateColumns: [
            previewOpen ? `${previewWidth}px 3px` : '',
            cameraOpen ? `${cameraWidth}px 3px` : '',
            'minmax(0, 1fr)',
            inspectorOpen ? `3px ${inspectorWidth}px` : '',
            settingsOpen ? `3px ${settingsWidth}px` : '',
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >
        {previewOpen ? (
          <PreviewPanel
            beginPreviewPan={beginPreviewPan}
            busy={busy}
            copySelectedImage={copySelectedImage}
            downloadSelectedImage={downloadSelectedImage}
            onResizeStart={(event) => {
              resizeRef.current = { pointerId: event.pointerId, target: 'preview' }
              document.body.classList.add('is-resizing')
              event.preventDefault()
            }}
            previewTransform={previewTransform}
            previewViewportRef={previewViewportRef}
            selectedNode={selectedNode}
            setError={setError}
            stopPreviewPan={stopPreviewPan}
          />
        ) : null}
        {cameraOpen ? (
          <CameraPanel
            beginCameraSelection={beginCameraSelection}
            busy={busy}
            cameraDevices={cameraDevices}
            cameraNotice={cameraNotice}
            cameraSelection={cameraSelection}
            cameraVideoRef={cameraVideoRef}
            cameraViewportRef={cameraViewportRef}
            captureFullCameraFrame={captureFullCameraFrame}
            onResizeStart={(event) => {
              resizeRef.current = { pointerId: event.pointerId, target: 'camera' }
              document.body.classList.add('is-resizing')
              event.preventDefault()
            }}
            selectedCameraId={selectedCameraId}
            selectedNode={selectedNode}
            setSelectedCameraId={setSelectedCameraId}
          />
        ) : null}
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
          stopPanning={stopPanning}
          toggleMultiSelection={toggleMultiSelection}
          transform={transform}
          tree={tree}
          uploadFiles={uploadFiles}
          viewportRef={viewportRef}
        />

        {inspectorOpen ? (
          <InspectorPanel
            busy={busy}
            bulkSelectionCount={bulkSelectionCount}
            editForm={editForm}
            editTargetNode={editTargetNode}
            error={error}
            hasBulkSelection={hasBulkSelection}
            hasLockedSelectionRoot={hasLockedSelectionRoot}
            moveNodeTo={moveNodeTo}
            moveParentId={moveParentId}
            nameInputRef={nameInputRef}
            onResizeStart={(event) => {
              resizeRef.current = { pointerId: event.pointerId, target: 'inspector' }
              document.body.classList.add('is-resizing')
              event.preventDefault()
            }}
            parentOptions={parentOptions}
            saveNodeDraft={saveNodeDraft}
            selectedNode={selectedNode}
            setDeleteNodeOpen={setDeleteNodeOpen}
            setEditForm={setEditForm}
            setMoveParentId={setMoveParentId}
            status={status}
          />
        ) : null}
        {settingsOpen ? (
          <SettingsPanel
            busy={busy}
            onResizeStart={(event) => {
              resizeRef.current = { pointerId: event.pointerId, target: 'settings' }
              document.body.classList.add('is-resizing')
              event.preventDefault()
            }}
            persistProjectSettings={persistProjectSettings}
            projectId={tree?.project?.id}
            projectSettings={projectSettings}
            resetProjectSettings={resetProjectSettings}
          />
        ) : null}
      </main>

      <AppDialogs
        bulkSelectionCount={bulkSelectionCount}
        busy={busy}
        createProject={createProject}
        deleteNode={deleteNode}
        deleteNodeOpen={deleteNodeOpen}
        deleteProject={deleteProject}
        deleteProjectText={deleteProjectText}
        desktopClientId={desktopClientId}
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
        selectedNode={selectedNode}
        selectedProjectId={selectedProjectId}
        sessionDialogOpen={sessionDialogOpen}
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
