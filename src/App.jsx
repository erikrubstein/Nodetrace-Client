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

function getUrlState() {
  const params = new URLSearchParams(window.location.search)
  const projectId = Number(params.get('project'))
  const nodeId = Number(params.get('node'))
  return {
    projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : null,
    nodeId: Number.isFinite(nodeId) && nodeId > 0 ? nodeId : null,
  }
}

function updateUrlState(projectId, nodeId) {
  const url = new URL(window.location.href)
  if (projectId) {
    url.searchParams.set('project', String(projectId))
  } else {
    url.searchParams.delete('project')
  }
  if (nodeId) {
    url.searchParams.set('node', String(nodeId))
  } else if (!projectId) {
    url.searchParams.delete('node')
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

function CameraIcon() {
  return <i aria-hidden="true" className="fa-solid fa-camera" />
}

function PreviewIcon() {
  return <i aria-hidden="true" className="fa-solid fa-eye" />
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

function getContainedRect(containerWidth, containerHeight, sourceWidth, sourceHeight) {
  if (!containerWidth || !containerHeight || !sourceWidth || !sourceHeight) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight }
  }

  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
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

function buildFocusPathContext(nodes, selectedNodeId) {
  if (!selectedNodeId || !nodes?.length) {
    return { pathIds: null, nextById: null }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pathIds = new Set()
  const nextById = new Map()
  let currentId = selectedNodeId
  let previousId = null

  while (currentId != null && byId.has(currentId) && !pathIds.has(currentId)) {
    pathIds.add(currentId)
    if (previousId != null) {
      nextById.set(currentId, previousId)
    }
    const current = byId.get(currentId)
    previousId = currentId
    currentId = current?.variant_of_id ?? current?.parent_id ?? null
  }

  return { pathIds, nextById }
}

function countBranchItems(children = [], variants = []) {
  const childItems = children.reduce((total, child) => total + 1 + countDescendants(child), 0)
  return childItems + variants.length
}

function buildCollapsedPreviewNode(node) {
  return {
    ...node,
    children:
      (node.children?.length || 0) > 0
        ? [
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
          ]
        : (node.children || []).map((child) => buildCollapsedPreviewNode(child)),
    variants: (node.variants || []).map((variant) => ({ ...variant, children: [], variants: [] })),
  }
}

function buildVisibleTree(node, options = {}) {
  if (!node) {
    return null
  }

  const focusPathIds = options.focusPathIds || null
  const focusNextById = options.focusNextById || null
  const selectedNodeId = options.selectedNodeId ?? null
  const inFocusPath = focusPathIds ? focusPathIds.has(node.id) : false
  const collapsibleChildCount = node.children?.length || 0
  const focusFilteringActive = Boolean(focusPathIds)

  if (focusFilteringActive && node.id === selectedNodeId) {
    return {
      ...node,
      children: (node.children || []).map((child) => buildCollapsedPreviewNode(child)),
      variants: (node.variants || []).map((variant) => ({
        ...variant,
        children: [],
        variants: [],
      })),
    }
  }

  if (focusFilteringActive && inFocusPath) {
    const nextFocusId = focusNextById?.get(node.id) ?? null
    const focusedChildren = (node.children || []).filter((child) => child.id === nextFocusId)
    const focusedVariants = (node.variants || []).filter((variant) => variant.id === nextFocusId)
    const hiddenChildren = (node.children || []).filter((child) => child.id !== nextFocusId)
    const hiddenVariants = (node.variants || []).filter((variant) => variant.id !== nextFocusId)
    const hiddenItemCount = countBranchItems(hiddenChildren, hiddenVariants)

    const visibleChildren = focusedChildren.map((child) => {
      const visibleChild = buildVisibleTree(child, options)
      return hiddenItemCount > 0
        ? {
            ...visibleChild,
            hiddenSiblingCount: (visibleChild.hiddenSiblingCount || 0) + hiddenItemCount,
          }
        : visibleChild
    })

    const visibleVariants = focusedVariants.map((variant) => {
      const visibleVariant = buildVisibleTree(variant, options)
      return hiddenItemCount > 0
        ? {
            ...visibleVariant,
            hiddenSiblingCount: (visibleVariant.hiddenSiblingCount || 0) + hiddenItemCount,
          }
        : visibleVariant
    })

    return {
      ...node,
      children: visibleChildren,
      variants: visibleVariants,
    }
  }

  const showCollapsedGroup = collapsibleChildCount > 0 ? node.collapsed : false

  if (showCollapsedGroup) {
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
    children: (node.children || []).map((child) => buildVisibleTree(child, options)),
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

  place(root, 0, 56, 56)

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
    for (const variant of current.variants || []) {
      walk(variant)
    }
  }

  if (node) {
    walk(node)
  }

  return ids
}

function flattenSubtreeNodes(node, items = []) {
  if (!node) {
    return items
  }

  const { children = [], variants = [], ...rest } = node
  items.push({ ...rest })

  for (const child of children) {
    flattenSubtreeNodes(child, items)
  }
  for (const variant of variants) {
    flattenSubtreeNodes(variant, items)
  }

  return items
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

async function blobFromUrl(url) {
  if (!url) {
    return null
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Unable to load image data for undo.')
  }
  return response.blob()
}

function buildClientTree(project, rows) {
  const byId = new Map(rows.map((node) => [node.id, { ...node, children: [], variants: [] }]))
  let root = null

  for (const node of byId.values()) {
    if (node.variant_of_id != null) {
      const anchor = byId.get(node.variant_of_id)
      if (anchor) {
        anchor.variants.push(node)
      }
      continue
    }

    if (node.parent_id == null) {
      root = node
      continue
    }

    const parent = byId.get(node.parent_id)
    if (parent) {
      parent.children.push(node)
    }
  }

  return {
    project,
    root,
    nodes: Array.from(byId.values()),
  }
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
  const [editTargetId, setEditTargetId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', notes: '', tags: '' })
  const [moveParentId, setMoveParentId] = useState('')
  const [transform, setTransform] = useState({ x: 80, y: 80, scale: 1 })
  const [previewTransform, setPreviewTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [focusPathMode, setFocusPathMode] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(340)
  const [inspectorWidth, setInspectorWidth] = useState(320)
  const [settingsWidth, setSettingsWidth] = useState(280)
  const [cameraWidth, setCameraWidth] = useState(360)
  const [pendingUploadParentId, setPendingUploadParentId] = useState(null)
  const [pendingUploadMode, setPendingUploadMode] = useState('child')
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraNotice, setCameraNotice] = useState('')
  const [cameraSelection, setCameraSelection] = useState(null)
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 })
  const [loadedImages, setLoadedImages] = useState({})
  const fileInputRef = useRef(null)
  const importInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const viewportRef = useRef(null)
  const previewViewportRef = useRef(null)
  const cameraViewportRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const panRef = useRef(null)
  const previewPanRef = useRef(null)
  const resizeRef = useRef(null)
  const nodeDragRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const cameraSelectRef = useRef(null)
  const cameraSelectionRef = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const replayingHistoryRef = useRef(false)
  const pendingLocalEventsRef = useRef(0)
  const treeRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('photomap-theme', theme)
  }, [theme])

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

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

  function updateHistoryCounts() {
    setHistoryState({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    })
  }

  function pushHistory(entry) {
    if (replayingHistoryRef.current) {
      return
    }

    undoStackRef.current.push(entry)
    if (undoStackRef.current.length > 40) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    updateHistoryCounts()
  }

  async function runHistoryEntry(direction) {
    const sourceStack = direction === 'undo' ? undoStackRef.current : redoStackRef.current
    const targetStack = direction === 'undo' ? redoStackRef.current : undoStackRef.current
    const entry = sourceStack.pop()
    if (!entry || busy) {
      updateHistoryCounts()
      return
    }

    setBusy(true)
    setError('')
    replayingHistoryRef.current = true
    try {
      if (direction === 'undo') {
        await entry.undo()
      } else {
        await entry.redo()
      }
      targetStack.push(entry)
      updateHistoryCounts()
    } catch (submitError) {
      sourceStack.push(entry)
      updateHistoryCounts()
      setError(submitError.message)
    } finally {
      replayingHistoryRef.current = false
      setBusy(false)
    }
  }

  async function undo() {
    await runHistoryEntry('undo')
  }

  async function redo() {
    await runHistoryEntry('redo')
  }

  const selectedNode = tree?.nodes.find((node) => node.id === selectedNodeId) || null
  const editTargetNode = tree?.nodes.find((node) => node.id === editTargetId) || null
  const projectSettings = tree?.project?.settings || defaultProjectSettings
  const selectedTreeNode = selectedNodeId ? findNode(tree?.root, selectedNodeId) : null
  const blockedParentIds = collectDescendantIds(selectedTreeNode)
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

  function markImageLoaded(url) {
    if (!url) {
      return
    }
    setLoadedImages((current) => (current[url] ? current : { ...current, [url]: true }))
  }

  useEffect(() => {
    async function initialize() {
      try {
        await loadProjects(getUrlState().projectId)
      } catch (loadError) {
        setError(loadError.message)
        setStatus('Unable to load projects.')
      }
    }

    initialize()
  }, [])

  useEffect(() => {
    updateUrlState(selectedProjectId, selectedNodeId || getUrlState().nodeId)
  }, [selectedNodeId, selectedProjectId])

  useEffect(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    updateHistoryCounts()
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId) {
      return
    }

    const urlState = getUrlState()
    const preferredNodeId =
      selectedProjectId === urlState.projectId ? urlState.nodeId : null

    loadTree(selectedProjectId, preferredNodeId).catch((loadError) => {
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

      if (pendingLocalEventsRef.current > 0) {
        pendingLocalEventsRef.current -= 1
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

  function beginLocalEventExpectation() {
    pendingLocalEventsRef.current += 1
    return () => {
      pendingLocalEventsRef.current = Math.max(0, pendingLocalEventsRef.current - 1)
    }
  }

  async function patchNodeRequest(nodeId, payload) {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedNode = await api(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      applyNodeUpdate(updatedNode)
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

  async function moveNodeRequest(nodeId, payload) {
    return api(`/api/nodes/${nodeId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  async function setCollapsedRequest(nodeId, collapsed) {
    return api(`/api/nodes/${nodeId}/collapse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collapsed }),
    })
  }

  function applyCollapsedState(updatedNode, updatedIds, collapsed) {
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
  }

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
        parent_old_id: current.childrenParentOverride ?? current.parent_id,
        variant_of_old_id: current.variant_of_id,
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
        const before = {
          name: node.name,
          notes: node.notes || '',
          tags: (node.tags || []).join(', '),
        }
        const after = {
          name: normalizedName,
          notes: draft.notes,
          tags: draft.tags,
        }

        await patchNodeRequest(node.id, after)
        pushHistory({
          undo: async () => {
            await patchNodeRequest(node.id, before)
            setSelectedNodeId(node.id)
          },
          redo: async () => {
            await patchNodeRequest(node.id, after)
            setSelectedNodeId(node.id)
          },
        })
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
    }

    function handlePointerMove(event) {
      const cameraSelectState = cameraSelectRef.current
      if (cameraSelectState && cameraSelectState.pointerId === event.pointerId) {
        const { containerRect, videoRect, startX, startY } = cameraSelectState
        const currentX = Math.min(
          Math.max(event.clientX - containerRect.left, videoRect.x),
          videoRect.x + videoRect.width,
        )
        const currentY = Math.min(
          Math.max(event.clientY - containerRect.top, videoRect.y),
          videoRect.y + videoRect.height,
        )
        const left = Math.min(startX, currentX)
        const top = Math.min(startY, currentY)
        const nextSelection = {
          x: left,
          y: top,
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        }
        cameraSelectionRef.current = nextSelection
        setCameraSelection(nextSelection)
        return
      }

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

      if (resizeRef.current.target === 'camera') {
        const nextWidth = Math.max(MIN_INSPECTOR_WIDTH, event.clientX)
        setCameraWidth(nextWidth)
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
      if (cameraSelectRef.current && cameraSelectRef.current.pointerId === event.pointerId) {
        void finishCameraSelection(event)
      }
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
    let cancelled = false

    async function startCamera() {
      if (!cameraOpen) {
        setCameraSelection(null)
        setCameraNotice('')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraNotice('Camera access is not available in this browser. Use HTTPS or localhost.')
        return
      }

      try {
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((track) => track.stop())
          cameraStreamRef.current = null
        }

        setCameraNotice('Requesting camera permission...')
        const stream = await navigator.mediaDevices.getUserMedia(
          selectedCameraId
            ? { video: { deviceId: { exact: selectedCameraId } }, audio: false }
            : { video: true, audio: false },
        )
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        cameraStreamRef.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          await cameraVideoRef.current.play().catch(() => {})
        }

        const refreshedDevices = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) {
          const videoInputs = refreshedDevices.filter((device) => device.kind === 'videoinput')
          setCameraDevices(videoInputs)
          if (!selectedCameraId) {
            const activeTrack = stream.getVideoTracks()[0]
            const activeDeviceId = activeTrack?.getSettings?.().deviceId || videoInputs[0]?.deviceId || ''
            if (activeDeviceId) {
              setSelectedCameraId(activeDeviceId)
            }
          }
          setCameraNotice('Drag over the camera view to capture a crop.')
        }
      } catch (cameraError) {
        if (!cancelled) {
          setCameraNotice(cameraError.message || 'Unable to access the selected camera.')
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop())
        cameraStreamRef.current = null
      }
    }
  }, [cameraOpen, selectedCameraId])

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
  }, [focusPathMode, selectedNode])

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

  async function setCollapsed(nodeId, collapsed) {
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
  }

  async function convertNodeToVariant(node, anchorId = node?.parent_id) {
    if (!node || !anchorId) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const previousPayload =
        node.variant_of_id != null
          ? { variantOfId: Number(node.variant_of_id) }
          : { parentId: Number(node.parent_id), variantOfId: null }
      const nextPayload = { variantOfId: Number(anchorId) }

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
      const previousPayload = { variantOfId: Number(node.variant_of_id) }
      const nextPayload = { parentId: Number(node.variant_of_id), variantOfId: null }

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
    if (!selectedNode || !parentId || (selectedNode.parent_id == null && !selectedNode.isVariant)) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const previousPayload =
        selectedNode.variant_of_id != null
          ? { variantOfId: Number(selectedNode.variant_of_id) }
          : { parentId: Number(selectedNode.parent_id), variantOfId: null }
      const nextPayload = { parentId: Number(parentId), variantOfId: null }

      const rollbackLocalEvent = beginLocalEventExpectation()
      let updatedNode = null
      try {
        updatedNode = await moveNodeRequest(selectedNode.id, nextPayload)
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
            revertedNode = await moveNodeRequest(selectedNode.id, previousPayload)
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
            redoneNode = await moveNodeRequest(selectedNode.id, nextPayload)
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
    if (!selectedNode || selectedNode.parent_id == null) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const fallbackId = selectedNode.parent_id
      const subtreeNode = selectedTreeNode || findNode(tree?.root, selectedNode.id)
      const snapshot = subtreeNode ? await createDeleteSnapshot(subtreeNode) : null
      let currentRootId = selectedNode.id

      const subtreeIds = Array.from(collectDescendantIds(subtreeNode || { id: currentRootId, children: [], variants: [] }))
      const rollbackLocalEvent = beginLocalEventExpectation()
      try {
        await deleteNodeRequest(currentRootId)
      } catch (error) {
        rollbackLocalEvent()
        throw error
      }
      setDeleteNodeOpen(false)
      removeNodesFromTree(subtreeIds)
      updateProjectListNodeCount(-subtreeIds.length)
      setSelectedNodeId(fallbackId)
      if (snapshot) {
        pushHistory({
          undo: async () => {
            const rollbackUndoEvent = beginLocalEventExpectation()
            let restoredRoot = null
            try {
              restoredRoot = await restoreDeletedSubtree(selectedProjectId, snapshot)
            } catch (error) {
              rollbackUndoEvent()
              throw error
            }
            if (!restoredRoot) {
              rollbackUndoEvent()
              return
            }

            const restoredNodes = flattenSubtreeNodes(restoredRoot)
            currentRootId = restoredRoot.id
            appendNodesToTree(restoredNodes)
            updateProjectListNodeCount(restoredNodes.length)
            setSelectedNodeId(restoredRoot.id)
          },
          redo: async () => {
            const rollbackRedoEvent = beginLocalEventExpectation()
            const currentTree = treeRef.current
            const currentSubtreeNode = findNode(currentTree?.root, currentRootId)
            const currentSubtreeIds = Array.from(
              collectDescendantIds(currentSubtreeNode || { id: currentRootId, children: [], variants: [] }),
            )
            try {
              await deleteNodeRequest(currentRootId)
            } catch (error) {
              rollbackRedoEvent()
              throw error
            }
            removeNodesFromTree(currentSubtreeIds)
            updateProjectListNodeCount(-currentSubtreeIds.length)
            setSelectedNodeId(fallbackId)
          },
        })
      }
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
      const nextScale = Math.max(0.1, Math.min(10, current.scale * factor))
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
        const nextScale = Math.max(0.1, Math.min(10, current.scale * factor))
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
  }, [previewOpen, selectedNode?.imageUrl])

  function beginNodeDrag(nodeId, event) {
    if (event.button !== 0) {
      return
    }

    event.stopPropagation()
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

  function beginCameraSelection(event) {
    if (event.button !== 0 || !cameraOpen || !cameraViewportRef.current || !cameraVideoRef.current) {
      return
    }

    const containerRect = cameraViewportRef.current.getBoundingClientRect()
    const video = cameraVideoRef.current
    const videoRect = getContainedRect(
      containerRect.width,
      containerRect.height,
      video.videoWidth || containerRect.width,
      video.videoHeight || containerRect.height,
    )

    const startX = Math.min(Math.max(event.clientX - containerRect.left, videoRect.x), videoRect.x + videoRect.width)
    const startY = Math.min(Math.max(event.clientY - containerRect.top, videoRect.y), videoRect.y + videoRect.height)

    cameraSelectRef.current = {
      pointerId: event.pointerId,
      containerRect,
      videoRect,
      startX,
      startY,
    }
    const initialSelection = { x: startX, y: startY, width: 0, height: 0 }
    cameraSelectionRef.current = initialSelection
    setCameraSelection(initialSelection)
    cameraViewportRef.current.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  async function finishCameraSelection(event) {
    const selectState = cameraSelectRef.current
    if (!selectState || selectState.pointerId !== event.pointerId) {
      return
    }

    cameraSelectRef.current = null
    cameraViewportRef.current?.releasePointerCapture(event.pointerId)
    const selection = cameraSelectionRef.current
    cameraSelectionRef.current = null
    setCameraSelection(null)

    if (!selection || selection.width < 12 || selection.height < 12) {
      return
    }

    if (!selectedNode || selectedNode.isVariant) {
      setCameraNotice('Select a non-variant node before capturing.')
      return
    }

    const video = cameraVideoRef.current
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraNotice('Camera frame is not ready yet.')
      return
    }

    const videoRect = selectState.videoRect
    const cropX = Math.round(((selection.x - videoRect.x) / videoRect.width) * video.videoWidth)
    const cropY = Math.round(((selection.y - videoRect.y) / videoRect.height) * video.videoHeight)
    const cropWidth = Math.round((selection.width / videoRect.width) * video.videoWidth)
    const cropHeight = Math.round((selection.height / videoRect.height) * video.videoHeight)

    if (cropWidth < 4 || cropHeight < 4) {
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = cropWidth
    canvas.height = cropHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      setCameraNotice('Unable to capture the selected region.')
      return
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setCameraNotice('Uploading selection...')
    await uploadFiles([file], selectedNode.id, 'child')
    setCameraNotice('Selection added.')
  }

  async function captureFullCameraFrame() {
    const video = cameraVideoRef.current
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraNotice('Camera frame is not ready yet.')
      return
    }

    if (!selectedNode || selectedNode.isVariant) {
      setCameraNotice('Select a non-variant node before capturing.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      setCameraNotice('Unable to capture the current frame.')
      return
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setCameraNotice('Uploading full frame...')
    await uploadFiles([file], selectedNode.id, 'child')
    setCameraNotice('Full frame added.')
  }

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
      <header className="topbar">
        <div className="topbar__left">
          <div className="menu-wrap">
            <button
              className={`menu-trigger ${openMenu === 'file' ? 'active' : ''}`}
              onClick={() => setOpenMenu((current) => (current === 'file' ? null : 'file'))}
              type="button"
            >
              File
            </button>
            {openMenu === 'file' ? (
              <div className="menu-panel">
                <button
                  className="menu-item"
                  onClick={() => {
                    setShowProjectDialog('create')
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  Create Project
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setShowProjectDialog('open')
                    setOpenMenu(null)
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
                    setOpenMenu(null)
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
                    setOpenMenu(null)
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
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  Delete Project
                </button>
              </div>
            ) : null}
          </div>
          <div className="menu-wrap">
            <button
              className={`menu-trigger ${openMenu === 'edit' ? 'active' : ''}`}
              onClick={() => setOpenMenu((current) => (current === 'edit' ? null : 'edit'))}
              type="button"
            >
              Edit
            </button>
            {openMenu === 'edit' ? (
              <div className="menu-panel">
                <button
                  className="menu-item"
                  disabled={historyState.undo === 0 || busy}
                  onClick={() => {
                    setOpenMenu(null)
                    void undo()
                  }}
                  type="button"
                >
                  Undo
                </button>
                <button
                  className="menu-item"
                  disabled={historyState.redo === 0 || busy}
                  onClick={() => {
                    setOpenMenu(null)
                    void redo()
                  }}
                  type="button"
                >
                  Redo
                </button>
                <button
                  className="menu-item"
                  disabled={!selectedNode || selectedNode.parent_id == null || busy}
                  onClick={() => {
                    setOpenMenu(null)
                    setDeleteNodeOpen(true)
                  }}
                  type="button"
                >
                  Delete Node
                </button>
              </div>
            ) : null}
          </div>
          <div className="menu-wrap">
            <button
              className={`menu-trigger ${openMenu === 'view' ? 'active' : ''}`}
              onClick={() => setOpenMenu((current) => (current === 'view' ? null : 'view'))}
              type="button"
            >
              View
            </button>
            {openMenu === 'view' ? (
              <div className="menu-panel">
                <button
                  className="menu-item"
                  disabled={!tree?.nodes?.length || busy || focusPathMode}
                  onClick={() => void setAllNodesCollapsed(true)}
                  type="button"
                >
                  Collapse All
                </button>
                <button
                  className="menu-item"
                  disabled={!tree?.nodes?.length || busy || focusPathMode}
                  onClick={() => void setAllNodesCollapsed(false)}
                  type="button"
                >
                  Expand All
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setFocusPathMode((enabled) => !enabled)
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  {focusPathMode ? 'Disable Focus Path' : 'Enable Focus Path'}
                </button>
                <button
                  className="menu-item"
                  disabled={!tree?.nodes?.length}
                  onClick={() => {
                    fitCanvasToView()
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  Fit View
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setPreviewOpen((open) => !open)
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  {previewOpen ? 'Hide Preview' : 'Show Preview'}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setCameraOpen((open) => !open)
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  {cameraOpen ? 'Hide Camera' : 'Show Camera'}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setInspectorOpen((open) => !open)
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  {inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setSettingsOpen((open) => !open)
                    setOpenMenu(null)
                  }}
                  type="button"
                >
                  {settingsOpen ? 'Hide Settings' : 'Show Settings'}
                </button>
              </div>
            ) : null}
          </div>
          <span className="topbar__separator">|</span>
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
            aria-label={cameraOpen ? 'Close camera' : 'Open camera'}
            onClick={() => setCameraOpen((open) => !open)}
            tooltip="Camera"
          >
            <CameraIcon />
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
          <>
            <aside className="inspector preview-panel">
              <div className="inspector__titlebar">Preview</div>
              <div className="preview-panel__actions">
                <button
                  className="ghost-button"
                  disabled={!selectedNode?.imageUrl || busy}
                  onClick={async () => {
                    try {
                      await downloadSelectedImage()
                    } catch (submitError) {
                      setError(submitError.message)
                    }
                  }}
                  type="button"
                >
                  Download Image
                </button>
                <button
                  className="ghost-button"
                  disabled={!selectedNode?.imageUrl || busy}
                  onClick={async () => {
                    try {
                      await copySelectedImage()
                    } catch (submitError) {
                      setError(submitError.message)
                    }
                  }}
                  type="button"
                >
                  Copy Image
                </button>
              </div>
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
        {cameraOpen ? (
          <>
            <aside className="inspector camera-panel">
              <div className="inspector__titlebar">Camera</div>
              <div className="inspector__section field-stack">
                <label>
                  <span>Input</span>
                  <select
                    value={selectedCameraId}
                    onChange={(event) => setSelectedCameraId(event.target.value)}
                  >
                    {cameraDevices.length === 0 ? (
                      <option value="">No camera inputs</option>
                    ) : null}
                    {cameraDevices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `Camera ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="camera-panel__hint">
                  {selectedNode && !selectedNode.isVariant
                    ? `Capture target: ${selectedNode.name}`
                    : 'Select a non-variant node to capture into.'}
                </div>
                <button
                  className="primary-button wide"
                  disabled={!selectedNode || selectedNode.isVariant || busy}
                  onClick={() => void captureFullCameraFrame()}
                  type="button"
                >
                  Take Photo
                </button>
              </div>
              <div
                ref={cameraViewportRef}
                className={`camera-viewport ${selectedNode?.isVariant ? 'disabled' : ''}`}
                onPointerDown={beginCameraSelection}
              >
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  className="camera-video"
                  muted
                  playsInline
                />
                {cameraSelection ? (
                  <div
                    className="camera-selection"
                    style={{
                      left: `${cameraSelection.x}px`,
                      top: `${cameraSelection.y}px`,
                      width: `${cameraSelection.width}px`,
                      height: `${cameraSelection.height}px`,
                    }}
                  />
                ) : null}
              </div>
              <div className="inspector__notice">{cameraNotice || 'Drag to crop and upload.'}</div>
            </aside>
            <div
              className="inspector-resize-handle"
              onPointerDown={(event) => {
                resizeRef.current = { pointerId: event.pointerId, target: 'camera' }
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
              onClick={() => openNewFolderDialog()}
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
                  {item.node.hiddenSiblingCount ? (
                    <div className="graph-node__sibling-indicator">
                      +{item.node.hiddenSiblingCount}
                    </div>
                  ) : null}
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
                    <>
                      {!loadedImages[item.node.previewUrl || item.node.imageUrl] ? (
                        <div className="graph-node__spinner" aria-hidden="true" />
                      ) : null}
                      <img
                        className={
                          loadedImages[item.node.previewUrl || item.node.imageUrl]
                            ? 'graph-node__image'
                            : 'graph-node__image graph-node__image--loading'
                        }
                        src={item.node.previewUrl || item.node.imageUrl}
                        alt={item.node.name}
                        draggable="false"
                        onError={() => markImageLoaded(item.node.previewUrl || item.node.imageUrl)}
                        onLoad={() => markImageLoaded(item.node.previewUrl || item.node.imageUrl)}
                      />
                    </>
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
            {tree?.nodes?.length ?? 0} nodes | {Math.round(transform.scale * 100)}%
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
                    openNewFolderDialog(contextMenu.nodeId)
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
              {!focusPathMode &&
              !contextMenuNode?.isVariant &&
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

      {newFolderDialog ? (
        <div className="dialog-backdrop" onClick={() => !busy && setNewFolderDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">New Folder</div>
            <input
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setNewFolderDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !newFolderName.trim()}
                onClick={submitNewFolder}
                type="button"
              >
                Create
              </button>
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
