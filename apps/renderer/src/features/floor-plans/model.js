import { buildLayout, buildVisibleTree } from '../../lib/tree'

export const defaultFloorPlanAppearance = {
  transparentWhite: false,
  backgroundColor: '#ffffff',
  inkMode: 'original',
  inkColor: '#efefef',
  themeBrightness: 50,
  whiteThreshold: 245,
}

export const FLOOR_PLAN_NODE_DRAG_TYPE = 'application/x-nodetrace-floor-plan-node'

export function normalizeFloorPlanAppearance(input) {
  const source = input && typeof input === 'object' ? input : {}
  const requestedInkMode = String(source.inkMode || '').trim()
  const requestedColor = String(source.inkColor || '').trim()
  const requestedBackgroundColor = String(source.backgroundColor || '').trim()
  const requestedThemeBrightness = source.themeBrightness == null || source.themeBrightness === ''
    ? Number.NaN
    : Number(source.themeBrightness)
  const requestedWhiteThreshold = source.whiteThreshold == null || source.whiteThreshold === ''
    ? Number.NaN
    : Number(source.whiteThreshold)
  return {
    transparentWhite: Boolean(source.transparentWhite),
    backgroundColor: /^#[0-9a-f]{6}$/i.test(requestedBackgroundColor)
      ? requestedBackgroundColor.toLowerCase()
      : defaultFloorPlanAppearance.backgroundColor,
    inkMode: ['original', 'theme', 'custom'].includes(requestedInkMode) ? requestedInkMode : 'original',
    inkColor: /^#[0-9a-f]{6}$/i.test(requestedColor)
      ? requestedColor.toLowerCase()
      : defaultFloorPlanAppearance.inkColor,
    themeBrightness: Number.isFinite(requestedThemeBrightness)
      ? Math.max(0, Math.min(100, requestedThemeBrightness))
      : defaultFloorPlanAppearance.themeBrightness,
    whiteThreshold: Number.isFinite(requestedWhiteThreshold)
      ? Math.max(1, Math.min(255, requestedWhiteThreshold))
      : defaultFloorPlanAppearance.whiteThreshold,
  }
}

export function buildFloorPlanNodeIndex(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const childrenById = new Map()
  for (const node of nodes) {
    if (node.parent_id == null) {
      continue
    }
    const children = childrenById.get(node.parent_id) || []
    children.push(node)
    childrenById.set(node.parent_id, children)
  }

  const descendantCountById = new Map()
  function countDescendants(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) {
      return 0
    }
    if (descendantCountById.has(nodeId)) {
      return descendantCountById.get(nodeId)
    }
    const nextVisited = new Set(visited).add(nodeId)
    const count = (childrenById.get(nodeId) || []).reduce(
      (total, child) => total + 1 + countDescendants(child.id, nextVisited),
      0,
    )
    descendantCountById.set(nodeId, count)
    return count
  }

  for (const node of nodes) {
    countDescendants(node.id)
  }

  return { byId, childrenById, descendantCountById }
}

export function collectFloorPlanPlacedNodeIds(floorPlan, nodeIndex) {
  const placedNodeIds = new Set()

  function visit(nodeId) {
    if (!nodeId || placedNodeIds.has(nodeId) || !nodeIndex.byId.has(nodeId)) {
      return
    }
    placedNodeIds.add(nodeId)
    for (const child of nodeIndex.childrenById.get(nodeId) || []) {
      visit(child.id)
    }
  }

  for (const placement of floorPlan?.placements || []) {
    visit(placement.nodeId)
  }

  return placedNodeIds
}

export function collectFloorPlanVisibleNodeIds(floorPlan, nodeIndex, expandedNodeIds = new Set()) {
  const expandedIds = expandedNodeIds instanceof Set ? expandedNodeIds : new Set(expandedNodeIds || [])
  const visibleNodeIds = new Set()

  function visit(nodeId) {
    if (!nodeId || visibleNodeIds.has(nodeId) || !nodeIndex.byId.has(nodeId)) {
      return
    }
    visibleNodeIds.add(nodeId)
    if (!expandedIds.has(nodeId)) {
      return
    }
    for (const child of nodeIndex.childrenById.get(nodeId) || []) {
      visit(child.id)
    }
  }

  for (const placement of floorPlan?.placements || []) {
    visit(placement.nodeId)
  }

  return visibleNodeIds
}

export function getFloorPlanTreeCommandTargetIds({
  collapsed,
  expandedNodeIds,
  floorPlan,
  nodeIndex,
  scope,
  selectedNodeIds = [],
}) {
  const expandedIds = expandedNodeIds instanceof Set ? expandedNodeIds : new Set(expandedNodeIds || [])
  const placedNodeIds = collectFloorPlanPlacedNodeIds(floorPlan, nodeIndex)
  const collapsibleNodeIds = new Set(
    Array.from(placedNodeIds).filter((nodeId) => (nodeIndex.childrenById.get(nodeId) || []).length > 0),
  )
  const targetIds = new Set()

  const addIfStateChanges = (nodeId) => {
    if (!collapsibleNodeIds.has(nodeId)) {
      return
    }
    if (collapsed ? expandedIds.has(nodeId) : !expandedIds.has(nodeId)) {
      targetIds.add(nodeId)
    }
  }

  if (scope === 'all') {
    for (const nodeId of collapsibleNodeIds) {
      addIfStateChanges(nodeId)
    }
    return targetIds
  }

  const validSelectedNodeIds = Array.from(new Set(selectedNodeIds)).filter((nodeId) => placedNodeIds.has(nodeId))
  if (scope === 'selected') {
    for (const nodeId of validSelectedNodeIds) {
      addIfStateChanges(nodeId)
    }
    return targetIds
  }

  if (collapsed) {
    for (const nodeId of validSelectedNodeIds) {
      let current = nodeIndex.byId.get(nodeId) || null
      const visited = new Set()
      while (current && placedNodeIds.has(current.id) && !visited.has(current.id)) {
        visited.add(current.id)
        addIfStateChanges(current.id)
        current = current.parent_id == null ? null : nodeIndex.byId.get(current.parent_id) || null
      }
    }
    return targetIds
  }

  function visitDescendants(nodeId, visited = new Set()) {
    if (!nodeId || visited.has(nodeId) || !placedNodeIds.has(nodeId)) {
      return
    }
    const nextVisited = new Set(visited).add(nodeId)
    addIfStateChanges(nodeId)
    for (const child of nodeIndex.childrenById.get(nodeId) || []) {
      visitDescendants(child.id, nextVisited)
    }
  }

  for (const nodeId of validSelectedNodeIds) {
    visitDescendants(nodeId)
  }
  return targetIds
}

export function applyFloorPlanTreeCommand(options) {
  const expandedIds = options.expandedNodeIds instanceof Set
    ? new Set(options.expandedNodeIds)
    : new Set(options.expandedNodeIds || [])
  const targetIds = getFloorPlanTreeCommandTargetIds(options)
  for (const nodeId of targetIds) {
    if (options.collapsed) {
      expandedIds.delete(nodeId)
    } else {
      expandedIds.add(nodeId)
    }
  }
  return Array.from(expandedIds)
}

export function buildFloorPlanSubtree(rootNodeId, nodeIndex, expandedNodeIds = new Set(), visited = new Set()) {
  if (!rootNodeId || visited.has(rootNodeId)) {
    return null
  }
  const node = nodeIndex.byId.get(rootNodeId)
  if (!node) {
    return null
  }
  const nextVisited = new Set(visited).add(rootNodeId)
  const children = (nodeIndex.childrenById.get(rootNodeId) || [])
    .map((child) => buildFloorPlanSubtree(child.id, nodeIndex, expandedNodeIds, nextVisited))
    .filter(Boolean)
  return {
    ...node,
    collapsed: children.length > 0 && !expandedNodeIds.has(rootNodeId),
    children,
  }
}

export function buildFloorPlanTreeLayout(rootNodeId, nodeIndex, projectSettings = {}, expandedNodeIds = new Set()) {
  const subtree = buildFloorPlanSubtree(rootNodeId, nodeIndex, expandedNodeIds)
  if (!subtree) {
    return { links: [], nodes: [] }
  }
  const visibleTree = buildVisibleTree(subtree)
  const layout = buildLayout(visibleTree, {
    horizontalGap: 72,
    layoutMode: 'compact',
    orientation: 'horizontal',
    verticalGap: 44,
    ...projectSettings,
  })
  const rootLayoutNode = layout.nodes.find((item) => item.id === rootNodeId)
  if (!rootLayoutNode) {
    return { links: [], nodes: [] }
  }
  return {
    nodes: layout.nodes.map((item) => ({
      ...item,
      x: item.x - rootLayoutNode.x,
      y: item.y - rootLayoutNode.y,
    })),
    links: layout.links.map((link) => ({
      ...link,
      x1: link.x1 - rootLayoutNode.x,
      x2: link.x2 - rootLayoutNode.x,
      y1: link.y1 - rootLayoutNode.y,
      y2: link.y2 - rootLayoutNode.y,
    })),
  }
}

export function getFloorPlanWorldSize(floorPlan) {
  const sourceWidth = Math.max(1, Number(floorPlan?.width || 0) || 1600)
  const sourceHeight = Math.max(1, Number(floorPlan?.height || 0) || 1000)
  const longEdge = 1800
  if (sourceWidth >= sourceHeight) {
    return {
      width: longEdge,
      height: Math.max(1, Math.round(longEdge * (sourceHeight / sourceWidth))),
    }
  }
  return {
    width: Math.max(1, Math.round(longEdge * (sourceWidth / sourceHeight))),
    height: longEdge,
  }
}
