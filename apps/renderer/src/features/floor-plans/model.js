export const defaultFloorPlanAppearance = {
  transparentWhite: false,
  backgroundColor: '#ffffff',
  inkMode: 'original',
  inkColor: '#efefef',
  whiteThreshold: 245,
}

export const FLOOR_PLAN_NODE_DRAG_TYPE = 'application/x-nodetrace-floor-plan-node'

export function normalizeFloorPlanAppearance(input) {
  const source = input && typeof input === 'object' ? input : {}
  const requestedInkMode = String(source.inkMode || '').trim()
  const requestedColor = String(source.inkColor || '').trim()
  const requestedBackgroundColor = String(source.backgroundColor || '').trim()
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

export function buildMiniTreeEntries(anchorNodeId, childrenById, limit = 9) {
  const entries = []
  const stack = [...(childrenById.get(anchorNodeId) || [])].reverse().map((node) => ({ node, depth: 1 }))
  while (stack.length > 0 && entries.length < limit) {
    const entry = stack.pop()
    entries.push(entry)
    const children = childrenById.get(entry.node.id) || []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: entry.depth + 1 })
    }
  }
  return entries
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
