import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const NODE_WIDTH = 112
const NODE_HEIGHT = 112
const MIN_INSPECTOR_WIDTH = 240
const defaultProjectSettings = {
  orientation: 'horizontal',
  horizontalGap: 72,
  verticalGap: 44,
  imageMode: 'square',
}

async function api(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Request failed')
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function IconButton({ children, tooltip, ...props }) {
  const {
    className,
    onClick,
    onPointerDown,
    onMouseDown,
    ...restProps
  } = props
  const buttonClassName = className ? `icon-button ${className}` : 'icon-button'
  const button = (
    <button
      {...restProps}
      className={buttonClassName}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
      }}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onMouseDown?.(event)
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        onPointerDown?.(event)
      }}
      type="button"
    >
      {children}
    </button>
  )

  if (!tooltip) {
    return button
  }

  return (
    <span className="icon-button-wrap">
      {button}
      <span aria-hidden="true" className="icon-tooltip">
        {tooltip}
      </span>
    </span>
  )
}

function HamburgerIcon() {
  return <i aria-hidden="true" className="fa-solid fa-bars" />
}

function SunIcon() {
  return <i aria-hidden="true" className="fa-solid fa-sun" />
}

function MoonIcon() {
  return <i aria-hidden="true" className="fa-solid fa-moon" />
}

function WrenchIcon() {
  return <i aria-hidden="true" className="fa-solid fa-screwdriver-wrench" />
}

function FolderIcon() {
  return <i aria-hidden="true" className="fa-solid fa-folder" />
}

function GearIcon() {
  return <i aria-hidden="true" className="fa-solid fa-gear" />
}

function AddFolderIcon() {
  return <i aria-hidden="true" className="fa-solid fa-folder-plus" />
}

function AddPhotoIcon() {
  return <i aria-hidden="true" className="fa-solid fa-image" />
}

function PreviewIcon() {
  return <i aria-hidden="true" className="fa-solid fa-eye" />
}

function patchTreeNode(root, updatedNode) {
  if (!root) {
    return root
  }

  if (root.id === updatedNode.id) {
    return { ...root, ...updatedNode }
  }

  return {
    ...root,
    children: (root.children || []).map((child) => patchTreeNode(child, updatedNode)),
  }
}

async function createPreviewFile(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = imageUrl
    })

    const maxDimension = 640
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) {
      return null
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'preview'
    return new File([blob], `${baseName}-preview.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function countLeaves(node) {
  if (!node?.children?.length) {
    return 1
  }

  return node.children.reduce((total, child) => total + countLeaves(child), 0)
}

function buildLayout(root, settings) {
  if (!root) {
    return { nodes: [], links: [], width: 1600, height: 1000 }
  }

  const nodes = []
  const links = []
  const orientation = settings.orientation
  const spanX = NODE_WIDTH + settings.horizontalGap
  const spanY = NODE_HEIGHT + settings.verticalGap

  function place(node, depth, left, top) {
    const leaves = countLeaves(node)

    if (orientation === 'horizontal') {
      const branchHeight = leaves * spanY
      const x = 56 + depth * spanX
      const y = top + branchHeight / 2 - NODE_HEIGHT / 2

      nodes.push({ id: node.id, node, x, y })

      let cursorTop = top
      for (const child of node.children || []) {
        const childLeaves = countLeaves(child)
        place(child, depth + 1, left, cursorTop)
        cursorTop += childLeaves * spanY
      }
    } else {
      const branchWidth = leaves * spanX
      const x = left + branchWidth / 2 - NODE_WIDTH / 2
      const y = 56 + depth * spanY

      nodes.push({ id: node.id, node, x, y })

      let cursorLeft = left
      for (const child of node.children || []) {
        const childLeaves = countLeaves(child)
        place(child, depth + 1, cursorLeft, top)
        cursorLeft += childLeaves * spanX
      }
    }
  }

  place(root, 0, 56, 56)

  const byId = new Map(nodes.map((item) => [item.id, item]))
  for (const item of nodes) {
    if (item.node.parent_id == null) {
      continue
    }

    const parent = byId.get(item.node.parent_id)
    if (!parent) {
      continue
    }

    if (orientation === 'horizontal') {
      links.push({
        key: `${parent.id}-${item.id}`,
        x1: parent.x + NODE_WIDTH,
        y1: parent.y + NODE_HEIGHT / 2,
        x2: item.x,
        y2: item.y + NODE_HEIGHT / 2,
      })
    } else {
      links.push({
        key: `${parent.id}-${item.id}`,
        x1: parent.x + NODE_WIDTH / 2,
        y1: parent.y + NODE_HEIGHT,
        x2: item.x + NODE_WIDTH / 2,
        y2: item.y,
      })
    }
  }

  const width = Math.max(...nodes.map((item) => item.x + NODE_WIDTH)) + 240
  const height = Math.max(...nodes.map((item) => item.y + NODE_HEIGHT)) + 240

  return { nodes, links, width, height }
}

function findNode(node, targetId) {
  if (!node) {
    return null
  }

  if (node.id === targetId) {
    return node
  }

  for (const child of node.children || []) {
    const match = findNode(child, targetId)
    if (match) {
      return match
    }
  }

  return null
}

function collectDescendantIds(node) {
  const ids = new Set()

  function walk(current) {
    ids.add(current.id)
    for (const child of current.children || []) {
      walk(child)
    }
  }

  if (node) {
    walk(node)
  }

  return ids
}

function collectParentOptions(root, blockedIds) {
  if (!root) {
    return []
  }

  const options = []

  function walk(node, depth) {
    if (!blockedIds.has(node.id)) {
      options.push({
        id: node.id,
        label: `${'  '.repeat(depth)}${node.name}`,
      })
    }

    for (const child of node.children || []) {
      walk(child, depth + 1)
    }
  }

  walk(root, 0)
  return options
}

function App() {
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [tree, setTree] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('photomap-theme') || 'dark')
  const [status, setStatus] = useState('Loading projects...')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [showProjectDialog, setShowProjectDialog] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [deleteProjectText, setDeleteProjectText] = useState('')
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [dragHoverNodeId, setDragHoverNodeId] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)
  const [editTargetId, setEditTargetId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', notes: '', tags: '' })
  const [moveParentId, setMoveParentId] = useState('')
  const [transform, setTransform] = useState({ x: 80, y: 80, scale: 1 })
  const [previewTransform, setPreviewTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(340)
  const [inspectorWidth, setInspectorWidth] = useState(320)
  const [settingsWidth, setSettingsWidth] = useState(280)
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const viewportRef = useRef(null)
  const previewViewportRef = useRef(null)
  const panRef = useRef(null)
  const previewPanRef = useRef(null)
  const resizeRef = useRef(null)
  const nodeDragRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('photomap-theme', theme)
  }, [theme])

  async function loadProjects(preferredProjectId) {
    const projectList = await api('/api/projects')
    setProjects(projectList)

    if (projectList.length === 0) {
      setSelectedProjectId(null)
      setTree(null)
      setSelectedNodeId(null)
      setStatus('Create a project to start mapping images.')
      return
    }

    const nextId =
      preferredProjectId && projectList.some((project) => project.id === preferredProjectId)
        ? preferredProjectId
        : projectList[0].id

    setSelectedProjectId(nextId)
    setStatus('')
  }

  async function loadTree(projectId, preferredNodeId) {
    if (!projectId) {
      return
    }

    const payload = await api(`/api/projects/${projectId}/tree`)
    setTree(payload)
    setSelectedNodeId(
      preferredNodeId && payload.nodes.some((node) => node.id === preferredNodeId)
        ? preferredNodeId
        : payload.root?.id ?? null,
    )
  }

  async function refresh(projectId = selectedProjectId, preferredNodeId = selectedNodeId) {
    await loadProjects(projectId)
    await loadTree(projectId, preferredNodeId)
  }

  useEffect(() => {
    async function initialize() {
      try {
        await loadProjects()
      } catch (loadError) {
        setError(loadError.message)
        setStatus('Unable to load projects.')
      }
    }

    initialize()
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      return
    }

    loadTree(selectedProjectId).catch((loadError) => {
      setError(loadError.message)
    })
  }, [selectedProjectId])

  const selectedNode = tree?.nodes.find((node) => node.id === selectedNodeId) || null
  const editTargetNode = tree?.nodes.find((node) => node.id === editTargetId) || null
  const projectSettings = tree?.project?.settings || defaultProjectSettings
  const selectedTreeNode = selectedNodeId ? findNode(tree?.root, selectedNodeId) : null
  const blockedParentIds = collectDescendantIds(selectedTreeNode)
  const parentOptions = collectParentOptions(tree?.root, blockedParentIds)
  const layout = useMemo(() => buildLayout(tree?.root, projectSettings), [tree, projectSettings])

  const applyNodeUpdate = useCallback((updatedNode) => {
    setTree((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        nodes: current.nodes.map((node) => (node.id === updatedNode.id ? { ...node, ...updatedNode } : node)),
        root: patchTreeNode(current.root, updatedNode),
      }
    })
  }, [])

  const saveNodeDraft = useCallback(
    async (node, draft) => {
      if (!node) {
        return
      }

      const normalizedName = draft.name.trim() || node.name
      const normalizedNotes = draft.notes.trim()
      const normalizedTags = draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(', ')
      const selectedTags = (node.tags || []).join(', ')

      if (
        normalizedName === node.name &&
        normalizedNotes === (node.notes || '') &&
        normalizedTags === selectedTags
      ) {
        return
      }

      try {
        const updatedNode = await api(`/api/nodes/${node.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: normalizedName,
            notes: draft.notes,
            tags: draft.tags,
          }),
        })

        applyNodeUpdate(updatedNode)
      } catch (submitError) {
        setError(submitError.message)
      }
    },
    [applyNodeUpdate],
  )

  useEffect(() => {
    async function moveDraggedNode(nodeId, parentId) {
      setBusy(true)
      setError('')

      try {
        await api(`/api/nodes/${nodeId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId }),
        })

        await refresh(selectedProjectId, nodeId)
      } catch (submitError) {
        setError(submitError.message)
      } finally {
        setBusy(false)
      }
    }

    function handlePointerMove(event) {
      if (nodeDragRef.current) {
        const dragState = nodeDragRef.current
        const dx = event.clientX - dragState.startX
        const dy = event.clientY - dragState.startY

        if (!dragState.dragging && Math.hypot(dx, dy) > 6) {
          dragState.dragging = true
        }

        if (dragState.dragging) {
          const rect = viewportRef.current?.getBoundingClientRect()
          if (rect) {
            const worldX = (event.clientX - rect.left - transform.x) / transform.scale
            const worldY = (event.clientY - rect.top - transform.y) / transform.scale
            const hoverNode = layout.nodes.find((item) => {
              if (item.id === dragState.nodeId) {
                return false
              }

              return (
                worldX >= item.x &&
                worldX <= item.x + NODE_WIDTH &&
                worldY >= item.y &&
                worldY <= item.y + NODE_HEIGHT
              )
            })

            setDragHoverNodeId(hoverNode?.id ?? null)
            setDragPreview({
              nodeId: dragState.nodeId,
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top + 10,
            })
          }
        }

        return
      }

      const previewPanState = previewPanRef.current
      if (previewPanState && previewPanState.pointerId === event.pointerId) {
        const dx = event.clientX - previewPanState.startX
        const dy = event.clientY - previewPanState.startY
        setPreviewTransform((current) => ({
          ...current,
          x: previewPanState.originX + dx,
          y: previewPanState.originY + dy,
        }))
        return
      }

      if (!resizeRef.current) {
        return
      }

      if (resizeRef.current.target === 'preview') {
        const nextWidth = Math.max(MIN_INSPECTOR_WIDTH, event.clientX)
        setPreviewWidth(nextWidth)
        return
      }

      const nextWidth = Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - event.clientX)
      if (resizeRef.current.target === 'settings') {
        setSettingsWidth(nextWidth)
      } else {
        setInspectorWidth(nextWidth)
      }
    }

    function handlePointerUp() {
      if (nodeDragRef.current) {
        const dragState = nodeDragRef.current
        const targetNodeId = dragHoverNodeId
        nodeDragRef.current = null
        setDragPreview(null)
        setDragHoverNodeId(null)

        if (dragState.dragging && targetNodeId) {
          const node = tree?.nodes.find((item) => item.id === dragState.nodeId)
          if (node && node.parent_id != null && targetNodeId !== dragState.nodeId) {
            moveDraggedNode(dragState.nodeId, targetNodeId)
          }
        }
      }

      previewPanRef.current = null
      resizeRef.current = null
      document.body.classList.remove('is-resizing')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragHoverNodeId, layout.nodes, selectedProjectId, transform.scale, transform.x, transform.y, tree?.nodes])

  useEffect(() => {
    if (!selectedNode) {
      setEditTargetId(null)
      setEditForm({ name: '', notes: '', tags: '' })
      setMoveParentId('')
      setPreviewTransform({ x: 0, y: 0, scale: 1 })
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
  }, [selectedNode])

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
  }, [selectedNode])

  useEffect(() => {
    if (!selectedNode || !editTargetNode || selectedNode.id !== editTargetId) {
      return undefined
    }

    const timer = window.setTimeout(async () => {
      await saveNodeDraft(editTargetNode, editForm)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [editForm, editTargetId, editTargetNode, saveNodeDraft, selectedNode])

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
      setFileMenuOpen(false)
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
      setFileMenuOpen(false)
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

    setTree((current) =>
      current ? { ...current, project: { ...current.project, settings: nextSettings } } : current,
    )
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId ? { ...project, settings: nextSettings } : project,
      ),
    )

    try {
      const updatedProject = await api(`/api/projects/${selectedProjectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })

      setTree((current) => (current ? { ...current, project: updatedProject } : current))
      setProjects((current) =>
        current.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
      )
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function resetProjectSettings() {
    await persistProjectSettings(defaultProjectSettings)
  }

  async function addFolder() {
    if (!selectedNode) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await api(`/api/projects/${selectedProjectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: selectedNode.id,
          name: 'New Folder',
          notes: '',
          tags: '',
        }),
      })

      await refresh(selectedProjectId, selectedNode.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function uploadFiles(files, parentId = selectedNode?.id) {
    if (!parentId || files.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
      for (const file of files) {
        const previewFile = await createPreviewFile(file)
        const formData = new FormData()
        formData.append('parentId', parentId)
        formData.append('name', '<untitled>')
        formData.append('notes', '')
        formData.append('tags', '')
        formData.append('file', file)
        if (previewFile) {
          formData.append('preview', previewFile)
        }

        await api(`/api/projects/${selectedProjectId}/photos`, {
          method: 'POST',
          body: formData,
        })
      }

      setSelectedNodeId(parentId)
      await refresh(selectedProjectId, parentId)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function moveNodeTo(parentId) {
    if (!selectedNode || !parentId || selectedNode.parent_id == null) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await api(`/api/nodes/${selectedNode.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: Number(parentId) }),
      })

      await refresh(selectedProjectId, selectedNode.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteNode() {
    if (!selectedNode || selectedNode.parent_id == null) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const fallbackId = selectedNode.parent_id
      await api(`/api/nodes/${selectedNode.id}`, { method: 'DELETE' })
      setDeleteNodeOpen(false)
      await refresh(selectedProjectId, fallbackId)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  function beginPan(event) {
    if (event.button !== 0) {
      return
    }

    if (event.target.closest('.graph-node img') || event.target.closest('.graph-node__meta')) {
      return
    }

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    }

    viewportRef.current?.setPointerCapture(event.pointerId)
  }

  function handleCanvasPointerMove(event) {
    const panState = panRef.current
    if (!panState || panState.pointerId !== event.pointerId) {
      return
    }

    const dx = event.clientX - panState.startX
    const dy = event.clientY - panState.startY
    setTransform((current) => ({
      ...current,
      x: panState.originX + dx,
      y: panState.originY + dy,
    }))
  }

  function stopPanning(event) {
    if (panRef.current && panRef.current.pointerId === event.pointerId) {
      panRef.current = null
      viewportRef.current?.releasePointerCapture(event.pointerId)
    }
  }

  function handleWheel(event) {
    event.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const factor = event.deltaY < 0 ? 1.08 : 0.92

    setTransform((current) => {
      const nextScale = Math.max(0.35, current.scale * factor)
      const ratio = nextScale / current.scale

      return {
        scale: nextScale,
        x: cursorX - (cursorX - current.x) * ratio,
        y: cursorY - (cursorY - current.y) * ratio,
      }
    })
  }

  function beginPreviewPan(event) {
    if (event.button !== 0 || !selectedNode?.imageUrl) {
      return
    }

    previewPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewTransform.x,
      originY: previewTransform.y,
    }

    previewViewportRef.current?.setPointerCapture(event.pointerId)
  }

  function stopPreviewPan(event) {
    if (previewPanRef.current && previewPanRef.current.pointerId === event.pointerId) {
      previewPanRef.current = null
      previewViewportRef.current?.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const element = viewportRef.current
    if (!element) {
      return undefined
    }

    const wheelListener = (event) => {
      handleWheel(event)
    }

    element.addEventListener('wheel', wheelListener, { passive: false })
    return () => {
      element.removeEventListener('wheel', wheelListener)
    }
  }, [transform.scale, transform.x, transform.y])

  useEffect(() => {
    const element = previewViewportRef.current
    if (!element) {
      return undefined
    }

    const wheelListener = (event) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const factor = event.deltaY < 0 ? 1.08 : 0.92

      setPreviewTransform((current) => {
        const nextScale = Math.max(0.4, current.scale * factor)
        const ratio = nextScale / current.scale

        return {
          scale: nextScale,
          x: cursorX - (cursorX - current.x) * ratio,
          y: cursorY - (cursorY - current.y) * ratio,
        }
      })
    }

    element.addEventListener('wheel', wheelListener, { passive: false })
    return () => {
      element.removeEventListener('wheel', wheelListener)
    }
  }, [selectedNode?.imageUrl])

  function beginNodeDrag(nodeId, event) {
    if (event.button !== 0) {
      return
    }

    event.stopPropagation()
    setSelectedNodeId(nodeId)
    nodeDragRef.current = {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="topbar__left">
          <div className="menu-wrap">
            <IconButton
              aria-label="Open project menu"
              onClick={() => setFileMenuOpen((open) => !open)}
              tooltip="Project Menu"
            >
              <HamburgerIcon />
            </IconButton>
            {fileMenuOpen ? (
              <div className="menu-panel">
                <button
                  className="menu-item"
                  onClick={() => {
                    setShowProjectDialog('create')
                    setFileMenuOpen(false)
                  }}
                  type="button"
                >
                  Create Project
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setShowProjectDialog('open')
                    setFileMenuOpen(false)
                  }}
                  type="button"
                >
                  Open Project
                </button>
                <button
                  className="menu-item danger-text"
                  disabled={!tree?.project || busy}
                  onClick={() => {
                    setDeleteProjectText('')
                    setShowProjectDialog('delete')
                    setFileMenuOpen(false)
                  }}
                  type="button"
                >
                  Delete Project
                </button>
              </div>
            ) : null}
          </div>
          <div className="project-chip">{tree?.project?.name || 'No project'}</div>
          <input
            ref={fileInputRef}
            accept="image/*"
            hidden
            multiple
            onChange={(event) => uploadFiles(Array.from(event.target.files || []))}
            type="file"
          />
        </div>

        <div className="topbar__right">
          <IconButton
            aria-label={previewOpen ? 'Close preview' : 'Open preview'}
            onClick={() => setPreviewOpen((open) => !open)}
            tooltip="Preview"
          >
            <PreviewIcon />
          </IconButton>
          <IconButton
            aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'}
            onClick={() => setInspectorOpen((open) => !open)}
            tooltip="Inspector"
          >
            <WrenchIcon />
          </IconButton>
          <IconButton
            aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
            onClick={() => setSettingsOpen((open) => !open)}
            tooltip="Settings"
          >
            <GearIcon />
          </IconButton>
          <IconButton
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            tooltip={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>
        </div>
      </header>

      <main
        className="main-layout"
        style={{
          gridTemplateColumns: [
            previewOpen ? `${previewWidth}px 3px` : '',
            'minmax(0, 1fr)',
            inspectorOpen ? `3px ${inspectorWidth}px` : '',
            settingsOpen ? `3px ${settingsWidth}px` : '',
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >
        {previewOpen ? (
          <>
            <aside className="inspector preview-panel">
              <div className="inspector__titlebar">Preview</div>
              {selectedNode?.imageUrl ? (
                <div
                  ref={previewViewportRef}
                  className="preview-viewport"
                  onPointerDown={beginPreviewPan}
                  onPointerUp={stopPreviewPan}
                  onPointerCancel={stopPreviewPan}
                >
                  <div
                    className="preview-stage"
                    style={{
                      transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.scale})`,
                    }}
                  >
                    <img className="preview-stage__image" src={selectedNode.imageUrl} alt={selectedNode.name} />
                  </div>
                </div>
              ) : (
                <div className="inspector__section">
                  <div className="inspector__empty">Select a photo to preview the full-resolution image.</div>
                </div>
              )}
            </aside>
            <div
              className="inspector-resize-handle"
              onPointerDown={(event) => {
                resizeRef.current = { pointerId: event.pointerId, target: 'preview' }
                document.body.classList.add('is-resizing')
                event.preventDefault()
              }}
              role="separator"
            />
          </>
        ) : null}
        <section
          ref={viewportRef}
          className={`canvas-viewport ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            if (event.dataTransfer.types.includes('Files')) {
              setDragActive(true)
            }
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setDragActive(false)
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (event.dataTransfer.types.includes('Files')) {
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={async (event) => {
            event.preventDefault()
            setDragActive(false)
            await uploadFiles(Array.from(event.dataTransfer.files || []))
          }}
          onPointerDown={beginPan}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={stopPanning}
          onPointerCancel={stopPanning}
        >
          <div className="canvas-tools">
            <IconButton
              aria-label="Add folder"
              className="canvas-tool-button"
              disabled={!selectedNode || busy}
              onClick={addFolder}
              tooltip="Add Folder"
            >
              <AddFolderIcon />
            </IconButton>
            <IconButton
              aria-label="Add photo"
              className="canvas-tool-button"
              disabled={!selectedNode || busy}
              onClick={() => fileInputRef.current?.click()}
              tooltip="Add Photo"
            >
              <AddPhotoIcon />
            </IconButton>
          </div>
          <div
            className="canvas-stage"
            style={{
              width: `${layout.width}px`,
              height: `${layout.height}px`,
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          >
            <svg className="canvas-links" width={layout.width} height={layout.height}>
              {layout.links.map((link) => (
                <line key={link.key} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} />
              ))}
            </svg>

            {layout.nodes.map((item) => (
              <button
                key={item.id}
                className={`graph-node ${selectedNodeId === item.id ? 'selected' : ''} ${
                  dragHoverNodeId === item.id ? 'drop-target' : ''
                } ${projectSettings.imageMode === 'square' ? 'image-square' : 'image-original'} ${
                  item.node.type === 'photo' ? 'photo-node' : 'folder-node'
                }`}
                onClick={() => {
                  void saveNodeDraft(editTargetNode, editForm)
                  setSelectedNodeId(item.id)
                }}
                onPointerDown={(event) => beginNodeDrag(item.id, event)}
                style={{ left: `${item.x}px`, top: `${item.y}px` }}
                type="button"
              >
                <div className="graph-node__visual">
                  {item.node.previewUrl || item.node.imageUrl ? (
                    <img src={item.node.previewUrl || item.node.imageUrl} alt={item.node.name} draggable="false" />
                  ) : (
                    <div className="graph-node__placeholder">
                      <FolderIcon />
                    </div>
                  )}
                </div>
                <div className="graph-node__meta">
                  <span>{item.node.name}</span>
                </div>
              </button>
            ))}
          </div>

          {dragActive ? <div className="drop-overlay">Drop photos onto the selected node</div> : null}
          {dragPreview ? (
            <div
              className="drag-preview"
              style={{ left: `${dragPreview.x}px`, top: `${dragPreview.y}px` }}
            >
              {tree?.nodes.find((node) => node.id === dragPreview.nodeId)?.name || 'Moving'}
            </div>
          ) : null}
          <div className="canvas-caption">
            {tree?.project?.name || 'No project'} |{' '}
            {selectedNode ? selectedNode.name : 'No node selected'} | {Math.round(transform.scale * 100)}%
          </div>
        </section>

        {inspectorOpen ? (
          <>
            <div
              className="inspector-resize-handle"
              onPointerDown={(event) => {
                resizeRef.current = { pointerId: event.pointerId, target: 'inspector' }
                document.body.classList.add('is-resizing')
                event.preventDefault()
              }}
              role="separator"
            />
            <aside className="inspector">
              <div className="inspector__titlebar">Inspector</div>
              <div className="inspector__section">
                <div className="inspector__title">
                  {selectedNode ? (selectedNode.type === 'photo' ? 'Photo' : 'Folder') : 'Selection'}
                </div>
                {selectedNode ? (
                  <div className="inspector__name">{selectedNode.name}</div>
                ) : (
                  <div className="inspector__empty">Select a node.</div>
                )}
              </div>

              {selectedNode ? (
                <>
                  <div className="inspector__section field-stack">
                    <label>
                      <span>Name</span>
                      <input
                        ref={nameInputRef}
                        value={editForm.name}
                        onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                      />
                    </label>
                    <label>
                      <span>Tags</span>
                      <input
                        value={editForm.tags}
                        onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })}
                        onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                        placeholder="front, cabinet"
                      />
                    </label>
                    <label>
                      <span>Notes</span>
                      <textarea
                        rows="7"
                        value={editForm.notes}
                        onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                        onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                      />
                    </label>
                  </div>

                  <div className="inspector__section field-stack">
                    <label>
                      <span>Parent</span>
                      <select
                        disabled={selectedNode.parent_id == null || busy}
                        value={moveParentId}
                        onChange={async (event) => {
                          const nextParentId = event.target.value
                          setMoveParentId(nextParentId)
                          if (!nextParentId || String(selectedNode.parent_id ?? '') === nextParentId) {
                            return
                          }
                          await moveNodeTo(nextParentId)
                        }}
                      >
                        <option value="">Choose node</option>
                        {parentOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="danger-button wide"
                      disabled={selectedNode.parent_id == null || busy}
                      onClick={() => setDeleteNodeOpen(true)}
                      type="button"
                    >
                      Delete Node
                    </button>
                  </div>
                </>
              ) : null}

              {error ? <div className="inspector__notice error">{error}</div> : null}
              {!error && status ? <div className="inspector__notice">{status}</div> : null}
            </aside>
          </>
        ) : null}
        {settingsOpen ? (
          <>
            <div
              className="inspector-resize-handle"
              onPointerDown={(event) => {
                resizeRef.current = { pointerId: event.pointerId, target: 'settings' }
                document.body.classList.add('is-resizing')
                event.preventDefault()
              }}
              role="separator"
            />
            <aside className="inspector settings-panel">
              <div className="inspector__titlebar">Settings</div>
              <div className="inspector__section field-stack">
                <label>
                  <span>Direction</span>
                  <select
                    value={projectSettings.orientation}
                    onChange={(event) =>
                      persistProjectSettings({
                        ...projectSettings,
                        orientation: event.target.value,
                      })
                    }
                  >
                    <option value="horizontal">Right</option>
                    <option value="vertical">Down</option>
                  </select>
                </label>
                <label>
                  <span>Horizontal spacing</span>
                  <input
                    max="220"
                    min="24"
                    onChange={(event) =>
                      persistProjectSettings({
                        ...projectSettings,
                        horizontalGap: Number(event.target.value),
                      })
                    }
                    type="range"
                    value={projectSettings.horizontalGap}
                  />
                </label>
                <label>
                  <span>Vertical spacing</span>
                  <input
                    max="180"
                    min="16"
                    onChange={(event) =>
                      persistProjectSettings({
                        ...projectSettings,
                        verticalGap: Number(event.target.value),
                      })
                    }
                    type="range"
                    value={projectSettings.verticalGap}
                  />
                </label>
                <label>
                  <span>Image mode</span>
                  <select
                    value={projectSettings.imageMode}
                    onChange={(event) =>
                      persistProjectSettings({
                        ...projectSettings,
                        imageMode: event.target.value,
                      })
                    }
                  >
                    <option value="original">Original Ratio</option>
                    <option value="square">Square</option>
                  </select>
                </label>
                <div className="settings-readout">
                  <span>H: {projectSettings.horizontalGap}</span>
                  <span>V: {projectSettings.verticalGap}</span>
                  <span>{projectSettings.imageMode === 'square' ? 'Square' : 'Original'}</span>
                </div>
                <button className="ghost-button" disabled={busy} onClick={resetProjectSettings} type="button">
                  Reset
                </button>
              </div>
            </aside>
          </>
        ) : null}
      </main>

      {showProjectDialog === 'create' ? (
        <div className="dialog-backdrop" onClick={() => setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Create Project</div>
            <input
              autoFocus
              placeholder="Project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !projectName.trim()}
                onClick={createProject}
                type="button"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'open' ? (
        <div className="dialog-backdrop" onClick={() => setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Open Project</div>
            <div className="project-list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`project-row ${project.id === selectedProjectId ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedProjectId(project.id)
                    setShowProjectDialog(null)
                  }}
                  type="button"
                >
                  <span>{project.name}</span>
                  <small>{project.node_count} nodes</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'delete' ? (
        <div className="dialog-backdrop" onClick={() => setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Delete Project</div>
            <div className="inspector__notice">
              Type <strong>{tree?.project?.name}</strong> to permanently delete this project.
            </div>
            <input
              autoFocus
              placeholder="Project name"
              value={deleteProjectText}
              onChange={(event) => setDeleteProjectText(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy || deleteProjectText !== tree?.project?.name}
                onClick={deleteProject}
                type="button"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteNodeOpen ? (
        <div className="dialog-backdrop" onClick={() => setDeleteNodeOpen(false)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Delete Node</div>
            <div className="inspector__notice">
              Delete <strong>{selectedNode?.name}</strong> and all child nodes?
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setDeleteNodeOpen(false)} type="button">
                Cancel
              </button>
              <button className="danger-button" disabled={busy} onClick={deleteNode} type="button">
                Delete Node
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
