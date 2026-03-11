import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const NODE_WIDTH = 112
const NODE_HEIGHT = 112
const MIN_INSPECTOR_WIDTH = 240
const VARIANT_VISUAL_SIZE = 78
const VARIANT_VISUAL_OFFSET = Math.round((NODE_WIDTH - VARIANT_VISUAL_SIZE) / 2)
const defaultProjectSettings = {
  orientation: 'horizontal',
  horizontalGap: 72,
  verticalGap: 44,
  imageMode: 'square',
}

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const projectId = Number(params.get('project'))
  return Number.isFinite(projectId) && projectId > 0 ? projectId : null
}

function updateProjectIdInUrl(projectId) {
  const url = new URL(window.location.href)
  if (projectId) {
    url.searchParams.set('project', String(projectId))
  } else {
    url.searchParams.delete('project')
  }
  window.history.replaceState({}, '', url)
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

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.responseType = 'json'

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.(null)
        return
      }

      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response)
        return
      }

      reject(new Error(request.response?.error || 'Request failed'))
    }

    request.onerror = () => {
      reject(new Error('Network request failed'))
    }

    request.send(formData)
  })
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
        event.preventDefault()
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

function AddVariantIcon() {
  return <i aria-hidden="true" className="fa-solid fa-images" />
}

function FitViewIcon() {
  return <i aria-hidden="true" className="fa-solid fa-expand" />
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
  const childCount = node?.children?.length || 0
  const variantCount = node?.variants?.length || 0

  if (!childCount && !variantCount) {
    return 1
  }

  const childLeaves = (node.children || []).reduce((total, child) => total + countLeaves(child), 0)
  return Math.max(childLeaves, 1 + variantCount)
}

function countDescendants(node) {
  if (!node) {
    return 0
  }

  const childCount = (node.children || []).reduce((total, child) => total + 1 + countDescendants(child), 0)
  const variantCount = (node.variants || []).length
  return childCount + variantCount
}

function buildVisibleTree(node) {
  if (!node) {
    return null
  }

  if (node.collapsed && node.children?.length) {
    return {
      ...node,
      children: [
        {
          id: `collapsed-${node.id}`,
          parent_id: node.id,
          type: 'collapsed-group',
          name: `${countDescendants(node)} Items`,
          collapsedGroupOf: node.id,
          totalItems: countDescendants(node),
          previewItems: collectCollapsedPreviewItems(node),
          children: [],
          variants: [],
        },
      ],
      variants: (node.variants || []).map((variant) => ({ ...variant, children: [], variants: [] })),
    }
  }

  return {
    ...node,
    children: (node.children || []).map((child) => buildVisibleTree(child)),
    variants: (node.variants || []).map((variant) => ({ ...variant, children: [], variants: [] })),
  }
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
    const childLeaves = (node.children || []).reduce((total, child) => total + countLeaves(child), 0)
    const variantCount = node.variants?.length || 0
    const ownLeaves = 1 + variantCount

    if (orientation === 'horizontal') {
      const branchHeight = leaves * spanY
      const x = 56 + depth * spanX
      const ownHeight = ownLeaves * spanY
      const childHeight = Math.max(childLeaves, 1) * spanY
      const ownTop = top + (branchHeight - ownHeight) / 2
      const childTopBase = top + (branchHeight - childHeight) / 2
      const y = ownTop + spanY / 2 - NODE_HEIGHT / 2

      nodes.push({ id: node.id, node, x, y })

      let cursorTop = childTopBase
      for (const child of node.children || []) {
        const childLeaves = countLeaves(child)
        place(child, depth + 1, left, cursorTop)
        cursorTop += childLeaves * spanY
      }

      let variantTop = ownTop + spanY
      for (const variant of node.variants || []) {
        const variantY = variantTop + spanY / 2 - NODE_HEIGHT / 2
        nodes.push({ id: variant.id, node: variant, x, y: variantY, variantOf: node.id })
        links.push({
          key: `${node.id}-${variant.id}-variant`,
          x1: x + NODE_WIDTH / 2,
          y1: y + NODE_HEIGHT,
          x2: x + NODE_WIDTH / 2,
          y2: variantY + VARIANT_VISUAL_OFFSET,
          dashed: true,
        })
        variantTop += spanY
      }
    } else {
      const branchWidth = leaves * spanX
      const ownWidth = ownLeaves * spanX
      const childWidth = Math.max(childLeaves, 1) * spanX
      const ownLeft = left + (branchWidth - ownWidth) / 2
      const childLeftBase = left + (branchWidth - childWidth) / 2
      const x = ownLeft + spanX / 2 - NODE_WIDTH / 2
      const y = 56 + depth * spanY

      nodes.push({ id: node.id, node, x, y })

      let cursorLeft = childLeftBase
      for (const child of node.children || []) {
        const childLeaves = countLeaves(child)
        place(child, depth + 1, cursorLeft, top)
        cursorLeft += childLeaves * spanX
      }

      let variantLeft = ownLeft + spanX
      for (const variant of node.variants || []) {
        const variantX = variantLeft + spanX / 2 - NODE_WIDTH / 2
        nodes.push({ id: variant.id, node: variant, x: variantX, y, variantOf: node.id })
        links.push({
          key: `${node.id}-${variant.id}-variant`,
          x1: x + NODE_WIDTH,
          y1: y + NODE_HEIGHT / 2,
          x2: variantX + VARIANT_VISUAL_OFFSET,
          y2: y + NODE_HEIGHT / 2,
          dashed: true,
        })
        variantLeft += spanX
      }
    }
  }

  const visibleRoot = buildVisibleTree(root)
  place(visibleRoot, 0, 56, 56)

  const byId = new Map(nodes.map((item) => [item.id, item]))
  for (const item of nodes) {
    if (item.node.parent_id == null || item.node.variant_of_id != null) {
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
        dashed: false,
      })
    } else {
      links.push({
        key: `${parent.id}-${item.id}`,
        x1: parent.x + NODE_WIDTH / 2,
        y1: parent.y + NODE_HEIGHT,
        x2: item.x + NODE_WIDTH / 2,
        y2: item.y,
        dashed: false,
      })
    }
  }

  const minX = Math.min(...nodes.map((item) => item.x))
  const minY = Math.min(...nodes.map((item) => item.y))
  const shiftX = minX < 56 ? 56 - minX : 0
  const shiftY = minY < 56 ? 56 - minY : 0

  if (shiftX || shiftY) {
    nodes.forEach((item) => {
      item.x += shiftX
      item.y += shiftY
    })
    links.forEach((link) => {
      link.x1 += shiftX
      link.x2 += shiftX
      link.y1 += shiftY
      link.y2 += shiftY
    })
  }

  const width = Math.max(...nodes.map((item) => item.x + NODE_WIDTH)) + 240
  const height = Math.max(...nodes.map((item) => item.y + NODE_HEIGHT)) + 240

  return { nodes, links, width, height }
}

function collectCollapsedPreviewItems(node, limit = 9, items = []) {
  if (!node || items.length >= limit) {
    return items
  }

  for (const child of node.children || []) {
    if (items.length >= limit) {
      break
    }

    items.push({
      id: child.id,
      imageUrl: child.previewUrl || child.imageUrl || null,
      type: child.type,
    })

    collectCollapsedPreviewItems(child, limit, items)
  }

  for (const variant of node.variants || []) {
    if (items.length >= limit) {
      break
    }

    items.push({
      id: variant.id,
      imageUrl: variant.previewUrl || variant.imageUrl || null,
      type: variant.type,
    })
  }

  return items
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
    if (!blockedIds.has(node.id) && !node.isVariant) {
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
  const desktopClientId =
    localStorage.getItem('photomap-desktop-client-id') ||
    (() => {
      const generated = `desktop-${crypto.randomUUID()}`
      localStorage.setItem('photomap-desktop-client-id', generated)
      return generated
    })()
  const desktopClientName =
    localStorage.getItem('photomap-desktop-client-name') ||
    (() => {
      const generated = `Desktop ${desktopClientId.slice(-4)}`
      localStorage.setItem('photomap-desktop-client-name', generated)
      return generated
    })()
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
  const [pendingUploadParentId, setPendingUploadParentId] = useState(null)
  const [pendingUploadMode, setPendingUploadMode] = useState('child')
  const fileInputRef = useRef(null)
  const importInputRef = useRef(null)
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

  const selectedNode = tree?.nodes.find((node) => node.id === selectedNodeId) || null
  const editTargetNode = tree?.nodes.find((node) => node.id === editTargetId) || null
  const projectSettings = tree?.project?.settings || defaultProjectSettings
  const selectedTreeNode = selectedNodeId ? findNode(tree?.root, selectedNodeId) : null
  const blockedParentIds = collectDescendantIds(selectedTreeNode)
  const parentOptions = collectParentOptions(tree?.root, blockedParentIds)
  const layout = useMemo(() => buildLayout(tree?.root, projectSettings), [tree, projectSettings])
  const contextMenuNode = tree?.nodes.find((node) => node.id === contextMenu?.nodeId) || null

  useEffect(() => {
    async function initialize() {
      try {
        await loadProjects(getProjectIdFromUrl())
      } catch (loadError) {
        setError(loadError.message)
        setStatus('Unable to load projects.')
      }
    }

    initialize()
  }, [])

  useEffect(() => {
    updateProjectIdInUrl(selectedProjectId)
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId) {
      return
    }

    loadTree(selectedProjectId).catch((loadError) => {
      setError(loadError.message)
    })
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || !selectedNode?.id) {
      return undefined
    }

    let cancelled = false

    async function publishSelection() {
      try {
        await api(`/api/projects/${selectedProjectId}/clients/${desktopClientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: desktopClientName,
            selectedNodeId: selectedNode.id,
          }),
        })
      } catch (publishError) {
        if (!cancelled) {
          setError(publishError.message)
        }
      }
    }

    publishSelection()
    const heartbeat = window.setInterval(publishSelection, 15000)

    return () => {
      cancelled = true
      window.clearInterval(heartbeat)
    }
  }, [desktopClientId, desktopClientName, selectedNode?.id, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId) {
      return undefined
    }

    const stream = new EventSource(`/api/projects/${selectedProjectId}/events`)
    stream.onmessage = (event) => {
      const payload = JSON.parse(event.data || '{}')

      if (payload.type === 'project-deleted') {
        loadProjects().catch((loadError) => {
          setError(loadError.message)
        })
        return
      }

      loadTree(selectedProjectId, selectedNodeId).catch((loadError) => {
        setError(loadError.message)
      })
    }

    stream.onerror = () => {
      stream.close()
    }

    return () => {
      stream.close()
    }
  }, [selectedNodeId, selectedProjectId])

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
    async function moveDraggedNode(nodeId, parentId, asVariant = false) {
      setBusy(true)
      setError('')

      try {
        await api(`/api/nodes/${nodeId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asVariant ? { variantOfId: parentId } : { parentId, variantOfId: null }),
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
              if (item.id === dragState.nodeId || item.node.type === 'collapsed-group') {
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

    function handlePointerUp(event) {
      if (nodeDragRef.current) {
        const dragState = nodeDragRef.current
        const targetNodeId = dragHoverNodeId
        nodeDragRef.current = null
        setDragPreview(null)
        setDragHoverNodeId(null)

        if (dragState.dragging && targetNodeId) {
          const node = tree?.nodes.find((item) => item.id === dragState.nodeId)
          if (node && node.parent_id != null && targetNodeId !== dragState.nodeId) {
            moveDraggedNode(dragState.nodeId, targetNodeId, event.shiftKey)
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
    setError('')
  }, [selectedNodeId, selectedProjectId])

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

      if (event.key === 'Escape') {
        setContextMenu(null)
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

  async function exportProject() {
    if (!selectedProjectId) {
      return
    }

    setBusy(true)
    setError('')
    setTransferProgress(0)

    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/export`)
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
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = (exportFileName.trim() || tree?.project?.name || 'project') + '.zip'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setTransferProgress(100)
      setShowProjectDialog(null)
      setFileMenuOpen(false)
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
      setFileMenuOpen(false)
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
      await api(`/api/projects/${selectedProjectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          name: 'New Folder',
          notes: '',
          tags: '',
        }),
      })

      await refresh(selectedProjectId, parentId)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function uploadFiles(files, targetNodeId = selectedNode?.id, mode = 'child') {
    if (!targetNodeId || files.length === 0) {
      return
    }

    setBusy(true)
    setError('')

    try {
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

        await api(`/api/projects/${selectedProjectId}/photos`, {
          method: 'POST',
          body: formData,
        })
      }

      await refresh(selectedProjectId, selectedNodeId)
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

  async function setCollapsed(nodeId, collapsed) {
    setBusy(true)
    setError('')

    try {
      await api(`/api/nodes/${nodeId}/collapse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collapsed }),
      })

      await refresh(selectedProjectId, nodeId)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function convertNodeToVariant(node, anchorId = node?.parent_id) {
    if (!node || !anchorId) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await api(`/api/nodes/${node.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantOfId: Number(anchorId) }),
      })

      await refresh(selectedProjectId, node.id)
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
      await api(`/api/nodes/${node.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: Number(node.variant_of_id), variantOfId: null }),
      })

      await refresh(selectedProjectId, node.id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function moveNodeTo(parentId) {
    if (!selectedNode || !parentId || (selectedNode.parent_id == null && !selectedNode.isVariant)) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await api(`/api/nodes/${selectedNode.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: Number(parentId), variantOfId: null }),
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

  function fitCanvasToView() {
    const viewport = viewportRef.current
    if (!viewport || !layout.width || !layout.height) {
      return
    }

    const rect = viewport.getBoundingClientRect()
    const padding = 48
    const availableWidth = Math.max(120, rect.width - padding * 2)
    const availableHeight = Math.max(120, rect.height - padding * 2)
    const scale = Math.max(
      0.2,
      Math.min(2.5, Math.min(availableWidth / layout.width, availableHeight / layout.height)),
    )
    const scaledWidth = layout.width * scale
    const scaledHeight = layout.height * scale

    setTransform({
      scale,
      x: (rect.width - scaledWidth) / 2,
      y: (rect.height - scaledHeight) / 2,
    })
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
                  className="menu-item"
                  disabled={!selectedProjectId || busy}
                  onClick={() => {
                    setExportFileName(tree?.project?.name || 'project')
                    setShowProjectDialog('export')
                    setFileMenuOpen(false)
                  }}
                  type="button"
                >
                  Export Project
                </button>
                <button
                  className="menu-item"
                  disabled={busy}
                  onClick={() => {
                    setImportProjectName('')
                    setImportArchiveFile(null)
                    setShowProjectDialog('import')
                    setFileMenuOpen(false)
                  }}
                  type="button"
                >
                  Import Project
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
            onChange={(event) =>
              uploadFiles(
                Array.from(event.target.files || []),
                pendingUploadParentId || selectedNode?.id,
                pendingUploadMode,
              )
            }
            type="file"
          />
          <input
            ref={importInputRef}
            accept=".zip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] || null
              setImportArchiveFile(file)
              if (file && !importProjectName) {
                setImportProjectName(file.name.replace(/\.zip$/i, ''))
              }
            }}
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
          onContextMenu={(event) => {
            if (!event.target.closest('.graph-node')) {
              event.preventDefault()
              setContextMenu(null)
            }
          }}
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
              aria-label="Fit view"
              className="canvas-tool-button"
              disabled={busy}
              onClick={fitCanvasToView}
              tooltip="Fit View"
            >
              <FitViewIcon />
            </IconButton>
            <IconButton
              aria-label="Add folder"
              className="canvas-tool-button"
              disabled={!selectedNode || selectedNode.isVariant || busy}
              onClick={() => addFolder()}
              tooltip="Add Folder"
            >
              <AddFolderIcon />
            </IconButton>
            <IconButton
              aria-label="Add photo"
              className="canvas-tool-button"
              disabled={!selectedNode || selectedNode.isVariant || busy}
              onClick={() => {
                setPendingUploadParentId(selectedNode?.id || null)
                setPendingUploadMode('child')
                fileInputRef.current?.click()
              }}
              tooltip="Add Photo"
            >
              <AddPhotoIcon />
            </IconButton>
            <IconButton
              aria-label="Add variant photo"
              className="canvas-tool-button"
              disabled={!selectedNode || busy}
              onClick={() => {
                setPendingUploadParentId(selectedNode?.id || null)
                setPendingUploadMode('variant')
                fileInputRef.current?.click()
              }}
              tooltip="Add Variant Photo"
            >
              <AddVariantIcon />
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
                <line
                  key={link.key}
                  className={link.dashed ? 'canvas-link--variant' : ''}
                  strokeDasharray={link.dashed ? '6 5' : undefined}
                  x1={link.x1}
                  x2={link.x2}
                  y1={link.y1}
                  y2={link.y2}
                />
              ))}
            </svg>

            {layout.nodes.map((item) => (
              <button
                key={item.id}
                className={`graph-node ${selectedNodeId === item.id ? 'selected' : ''} ${
                  dragHoverNodeId === item.id ? 'drop-target' : ''
                } ${projectSettings.imageMode === 'square' ? 'image-square' : 'image-original'} ${
                  item.node.type === 'photo' ? 'photo-node' : 'folder-node'
                } ${item.node.type === 'collapsed-group' ? 'collapsed-node' : ''} ${
                  item.node.isVariant ? 'variant-node' : ''
                }`}
                onContextMenu={(event) => {
                  if (item.node.type === 'collapsed-group') {
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  const rect = viewportRef.current?.getBoundingClientRect()
                  setSelectedNodeId(item.id)
                  setContextMenu({
                    nodeId: item.id,
                    x: event.clientX - (rect?.left || 0),
                    y: event.clientY - (rect?.top || 0),
                  })
                }}
                onClick={() => {
                  if (item.node.type === 'collapsed-group') {
                    return
                  }
                  void saveNodeDraft(editTargetNode, editForm)
                  setSelectedNodeId(item.id)
                }}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (item.node.type === 'collapsed-group') {
                    return
                  }
                  beginNodeDrag(item.id, event)
                }}
                style={{ left: `${item.x}px`, top: `${item.y}px` }}
                type="button"
              >
                <div className="graph-node__visual">
                  {item.node.type === 'collapsed-group' ? (
                    <div className="graph-node__collapsed-grid">
                      {item.node.previewItems.map((preview) =>
                        preview.imageUrl ? (
                          <img
                            key={preview.id}
                            className="graph-node__collapsed-thumb"
                            src={preview.imageUrl}
                            alt=""
                            draggable="false"
                          />
                        ) : (
                          <div key={preview.id} className="graph-node__collapsed-thumb graph-node__collapsed-placeholder">
                            <FolderIcon />
                          </div>
                        ),
                      )}
                    </div>
                  ) : item.node.previewUrl || item.node.imageUrl ? (
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
            {selectedNode ? selectedNode.name : 'No node selected'} | {desktopClientName} |{' '}
            {Math.round(transform.scale * 100)}%
          </div>
          {contextMenu ? (
            <div
              className="node-context-menu"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            >
              {!contextMenuNode?.isVariant ? (
                <button
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={() => {
                    setContextMenu(null)
                    void addFolder(contextMenu.nodeId)
                  }}
                  type="button"
                >
                  Add Folder
                </button>
              ) : null}
              {!contextMenuNode?.isVariant ? (
                <button
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={() => {
                    setPendingUploadParentId(contextMenu.nodeId)
                    setPendingUploadMode('child')
                    setContextMenu(null)
                    fileInputRef.current?.click()
                  }}
                  type="button"
                >
                  Add Photo
                </button>
              ) : null}
              <button
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => {
                  setPendingUploadParentId(contextMenu.nodeId)
                  setPendingUploadMode('variant')
                  setContextMenu(null)
                  fileInputRef.current?.click()
                }}
                type="button"
              >
                Add Variant Photo
              </button>
              {!contextMenuNode?.isVariant &&
              (contextMenuNode?.children?.length || contextMenuNode?.collapsed) ? (
                <button
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={() => {
                    setContextMenu(null)
                    void setCollapsed(contextMenu.nodeId, !contextMenuNode?.collapsed)
                  }}
                  type="button"
                >
                  {contextMenuNode?.collapsed ? 'Expand' : 'Collapse'}
                </button>
              ) : null}
              {contextMenuNode?.isVariant ? (
                <button
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={() => {
                    setContextMenu(null)
                    void convertVariantToChild(contextMenuNode)
                  }}
                  type="button"
                >
                  Convert to Child
                </button>
              ) : null}
              {!contextMenuNode?.isVariant &&
              contextMenuNode?.parent_id != null &&
              !(contextMenuNode?.children?.length > 0) &&
              !(contextMenuNode?.variants?.length > 0) ? (
                <button
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={() => {
                    setContextMenu(null)
                    void convertNodeToVariant(contextMenuNode, contextMenuNode.parent_id)
                  }}
                  type="button"
                >
                  Convert to Variant
                </button>
              ) : null}
              <button
                className="danger-text"
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => {
                  setContextMenu(null)
                  setSelectedNodeId(contextMenu.nodeId)
                  setDeleteNodeOpen(true)
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          ) : null}
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
                  {selectedNode
                    ? selectedNode.isVariant
                      ? selectedNode.type === 'photo'
                        ? 'Variant Photo'
                        : 'Variant Folder'
                      : selectedNode.type === 'photo'
                        ? 'Photo'
                        : 'Folder'
                    : 'Selection'}
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
                        disabled={(selectedNode.parent_id == null && !selectedNode.isVariant) || busy}
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

      {showProjectDialog === 'export' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Export Project</div>
            <input
              autoFocus
              placeholder="Archive filename"
              value={exportFileName}
              onChange={(event) => setExportFileName(event.target.value.replace(/\.zip$/i, ''))}
            />
            <div className="inspector__notice">
              File will be saved as {`${exportFileName || tree?.project?.name || 'project'}.zip`}
            </div>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !selectedProjectId}
                onClick={exportProject}
                type="button"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'import' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Import Project</div>
            <input
              placeholder="New project name"
              value={importProjectName}
              onChange={(event) => setImportProjectName(event.target.value)}
            />
            <button className="ghost-button" disabled={busy} onClick={() => importInputRef.current?.click()} type="button">
              {importArchiveFile ? importArchiveFile.name : 'Choose Archive'}
            </button>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !importArchiveFile}
                onClick={importProject}
                type="button"
              >
                Import
              </button>
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
