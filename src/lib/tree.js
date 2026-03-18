import {
  NODE_HEIGHT,
  NODE_WIDTH,
  VARIANT_VISUAL_OFFSET,
} from './constants'

export function countDescendants(node) {
  if (!node) {
    return 0
  }

  const childCount = (node.children || []).reduce((total, child) => total + 1 + countDescendants(child), 0)
  const variantCount = (node.variants || []).length
  return childCount + variantCount
}

export function buildFocusPathContext(nodes, selectedNodeId) {
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

export function formatItemCountLabel(count) {
  return `${count} ${count === 1 ? 'Item' : 'Items'}`
}

export function collectCollapsedPreviewItems(node, limit = 9, items = []) {
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
              name: formatItemCountLabel(countDescendants(node)),
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

export function buildVisibleTree(node, options = {}) {
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
          name: formatItemCountLabel(countDescendants(node)),
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

export function buildLayout(root, settings) {
  if (!root) {
    return { nodes: [], links: [], width: 1600, height: 1000 }
  }

  const orientation = settings.orientation
  const spanX = NODE_WIDTH + settings.horizontalGap
  const spanY = NODE_HEIGHT + settings.verticalGap

  function countLeaves(node) {
    const childCount = node?.children?.length || 0
    const variantCount = node?.variants?.length || 0

    if (!childCount && !variantCount) {
      return 1
    }

    const childLeaves = (node.children || []).reduce((total, child) => total + countLeaves(child), 0)
    return Math.max(childLeaves, 1 + variantCount)
  }

  function finalizeLayout(baseNodes, baseLinks) {
    const minX = Math.min(...baseNodes.map((item) => item.x))
    const minY = Math.min(...baseNodes.map((item) => item.y))
    const shiftX = 56 - minX
    const shiftY = 56 - minY
    const nodes = baseNodes.map((item) => ({
      ...item,
      x: item.x + shiftX,
      y: item.y + shiftY,
    }))
    const links = baseLinks.map((link) => ({
      ...link,
      x1: link.x1 + shiftX,
      x2: link.x2 + shiftX,
      y1: link.y1 + shiftY,
      y2: link.y2 + shiftY,
    }))
    const width = Math.max(...nodes.map((item) => item.x + NODE_WIDTH)) + 240
    const height = Math.max(...nodes.map((item) => item.y + NODE_HEIGHT)) + 240
    return { nodes, links, width, height }
  }

  function buildClassicPrimary(rootNode) {
    const nodes = []
    const links = []

    function place(node, depth, left, top) {
      const leaves = countLeaves(node)
      const childLeaves = (node.children || []).reduce((total, child) => total + countLeaves(child), 0)
      const variantCount = node.variants?.length || 0
      const ownLeaves = 1 + variantCount

      const branchHeight = leaves * spanY
      const x = depth * spanX
      const ownHeight = ownLeaves * spanY
      const childHeight = Math.max(childLeaves, 1) * spanY
      const ownTop = top + (branchHeight - ownHeight) / 2
      const childTopBase = top + (branchHeight - childHeight) / 2
      const y = ownTop + spanY / 2 - NODE_HEIGHT / 2

      nodes.push({ id: node.id, node, x, y })

      let cursorTop = childTopBase
      for (const child of node.children || []) {
        const childLeafCount = countLeaves(child)
        place(child, depth + 1, left, cursorTop)
        cursorTop += childLeafCount * spanY
      }

      let variantTop = ownTop + spanY
      for (const variant of node.variants || []) {
        const variantY = variantTop + spanY / 2 - NODE_HEIGHT / 2
        nodes.push({ id: variant.id, node: variant, x, y: variantY, variantOf: node.id })
        links.push({
          key: `${node.id}-${variant.id}-variant`,
          sourceId: node.id,
          targetId: variant.id,
          x1: x + NODE_WIDTH / 2,
          y1: y + NODE_HEIGHT,
          x2: x + NODE_WIDTH / 2,
          y2: variantY + VARIANT_VISUAL_OFFSET,
          dashed: true,
        })
        variantTop += spanY
      }
    }

    place(rootNode, 0, 0, 0)

    const byId = new Map(nodes.map((item) => [item.id, item]))
    for (const item of nodes) {
      if (item.node.parent_id == null || item.node.variant_of_id != null) {
        continue
      }

      const parent = byId.get(item.node.parent_id)
      if (!parent) {
        continue
      }

      links.push({
        key: `${parent.id}-${item.id}`,
        sourceId: parent.id,
        targetId: item.id,
        x1: parent.x + NODE_WIDTH,
        y1: parent.y + NODE_HEIGHT / 2,
        x2: item.x,
        y2: item.y + NODE_HEIGHT / 2,
        dashed: false,
      })
    }

    return { nodes, links }
  }

  function mergeProfiles(baseProfile, incomingProfile, depthOffset, yOffset) {
    const merged = baseProfile.map((entry) => (entry ? { ...entry } : undefined))
    for (let depth = 0; depth < incomingProfile.length; depth += 1) {
      const entry = incomingProfile[depth]
      if (!entry) {
        continue
      }
      const targetDepth = depth + depthOffset
      const shifted = {
        min: entry.min + yOffset,
        max: entry.max + yOffset,
      }

      if (!merged[targetDepth]) {
        merged[targetDepth] = shifted
        continue
      }

      merged[targetDepth] = {
        min: Math.min(merged[targetDepth].min, shifted.min),
        max: Math.max(merged[targetDepth].max, shifted.max),
      }
    }
    return merged
  }

  function requiredOffsetForProfiles(baseProfile, incomingProfile) {
    let requiredOffset = 0
    for (let depth = 0; depth < incomingProfile.length; depth += 1) {
      const baseEntry = baseProfile[depth + 1]
      const incomingEntry = incomingProfile[depth]
      if (!baseEntry || !incomingEntry) {
        continue
      }
      requiredOffset = Math.max(requiredOffset, baseEntry.max + settings.verticalGap - incomingEntry.min)
    }
    return requiredOffset
  }

  function buildPrimarySubtree(node) {
    const ownBlockHeight = (1 + (node.variants?.length || 0)) * spanY
    const childLayouts = (node.children || []).map((child) => buildPrimarySubtree(child))

    let childProfile = []
    const childPlacements = []
    for (const childLayout of childLayouts) {
      const preferredOffset = -childLayout.rootY
      const requiredOffset =
        childPlacements.length === 0 ? preferredOffset : requiredOffsetForProfiles(childProfile, childLayout.profile)
      const childOffset = Math.max(preferredOffset, requiredOffset)
      childPlacements.push({ layout: childLayout, offset: childOffset })
      childProfile = mergeProfiles(childProfile, childLayout.profile, 1, childOffset)
    }

    const filledChildProfile = childProfile.filter(Boolean)
    if (filledChildProfile.length > 0) {
      const childMin = Math.min(...filledChildProfile.map((entry) => entry.min))
      const childMax = Math.max(...filledChildProfile.map((entry) => entry.max))
      const desiredCenter = ownBlockHeight / 2
      const currentCenter = (childMin + childMax) / 2
      const centerShift = desiredCenter - currentCenter

      if (centerShift !== 0) {
        childPlacements.forEach((placement) => {
          placement.offset += centerShift
        })
        childProfile = childProfile.map((entry) =>
          entry
            ? {
                min: entry.min + centerShift,
                max: entry.max + centerShift,
              }
            : undefined,
        )
      }
    }

    const nodes = []
    const links = []
    const rootY = 0
    nodes.push({ id: node.id, node, x: 0, y: rootY })

    let variantTop = spanY
    for (const variant of node.variants || []) {
      const variantY = variantTop + spanY / 2 - NODE_HEIGHT / 2
      nodes.push({ id: variant.id, node: variant, x: 0, y: variantY, variantOf: node.id })
      links.push({
        key: `${node.id}-${variant.id}-variant`,
        sourceId: node.id,
        targetId: variant.id,
        x1: NODE_WIDTH / 2,
        y1: rootY + NODE_HEIGHT,
        x2: NODE_WIDTH / 2,
        y2: variantY + VARIANT_VISUAL_OFFSET,
        dashed: true,
      })
      variantTop += spanY
    }

    for (const placement of childPlacements) {
      for (const childNode of placement.layout.nodes) {
        nodes.push({
          ...childNode,
          x: childNode.x + spanX,
          y: childNode.y + placement.offset,
        })
      }
      for (const childLink of placement.layout.links) {
        links.push({
          ...childLink,
          x1: childLink.x1 + spanX,
          x2: childLink.x2 + spanX,
          y1: childLink.y1 + placement.offset,
          y2: childLink.y2 + placement.offset,
        })
      }
      links.push({
        key: `${node.id}-${placement.layout.rootId}`,
        sourceId: node.id,
        targetId: placement.layout.rootId,
        x1: NODE_WIDTH,
        y1: rootY + NODE_HEIGHT / 2,
        x2: placement.layout.rootX + spanX,
        y2: placement.layout.rootY + placement.offset + NODE_HEIGHT / 2,
        dashed: false,
      })
    }

    const ownProfile = [{ min: 0, max: ownBlockHeight }]
    const profile = mergeProfiles(ownProfile, childProfile, 1, 0)

    return {
      rootId: node.id,
      rootX: 0,
      rootY,
      nodes,
      links,
      profile,
    }
  }

  const primaryLayout =
    settings.layoutMode === 'classic' ? buildClassicPrimary(root) : buildPrimarySubtree(root)

  const baseNodes =
    orientation === 'horizontal'
      ? primaryLayout.nodes
      : primaryLayout.nodes.map((item) => ({
          ...item,
          x: item.y,
          y: item.x,
        }))
  const baseLinks =
    orientation === 'horizontal'
      ? primaryLayout.links
      : primaryLayout.links.map((link) => ({
          ...link,
          x1: link.y1,
          y1: link.x1,
          x2: link.y2,
          y2: link.x2,
        }))

  return finalizeLayout(baseNodes, baseLinks)
}

export function findNode(node, targetId) {
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

  for (const variant of node.variants || []) {
    const match = findNode(variant, targetId)
    if (match) {
      return match
    }
  }

  return null
}

export function collectDescendantIds(node) {
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

export function collectBlockedIdsForSelection(root, nodeIds) {
  const blockedIds = new Set()
  for (const nodeId of nodeIds) {
    const node = findNode(root, nodeId)
    if (!node) {
      continue
    }
    for (const blockedId of collectDescendantIds(node)) {
      blockedIds.add(blockedId)
    }
  }
  return blockedIds
}

export function getSelectionRootIds(root, nodeIds) {
  const uniqueIds = Array.from(new Set(nodeIds.filter(Boolean)))
  const selectedSet = new Set(uniqueIds)
  return uniqueIds.filter((nodeId) => {
    const node = findNode(root, nodeId)
    if (!node) {
      return false
    }

    let ancestorId = node.variant_of_id ?? node.parent_id
    while (ancestorId != null) {
      if (selectedSet.has(ancestorId)) {
        return false
      }
      const ancestor = findNode(root, ancestorId)
      ancestorId = ancestor ? ancestor.variant_of_id ?? ancestor.parent_id : null
    }

    return true
  })
}

export function flattenSubtreeNodes(node, items = []) {
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

export function collectParentOptions(root, blockedIds) {
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

export function buildNodePath(nodes, selectedNodeId) {
  if (!selectedNodeId || !nodes?.length) {
    return []
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const path = []
  const seen = new Set()
  let currentId = selectedNodeId

  while (currentId != null && byId.has(currentId) && !seen.has(currentId)) {
    seen.add(currentId)
    const current = byId.get(currentId)
    path.push(current.name)
    currentId = current.variant_of_id ?? current.parent_id ?? null
  }

  return path.reverse()
}

export function compactNodePath(path, options = {}) {
  const maxChars = options.maxChars ?? 72
  if (!Array.isArray(path) || path.length === 0) {
    return ''
  }

  const separator = ' > '
  const selected = path[path.length - 1]
  let visible = [selected]
  let current = selected

  for (let index = path.length - 2; index >= 0; index -= 1) {
    const candidate = `${path[index]}${separator}${current}`
    if (candidate.length > maxChars) {
      break
    }
    visible.unshift(path[index])
    current = candidate
  }

  return visible.length < path.length ? `...${separator}${visible.join(separator)}` : visible.join(separator)
}

export function buildClientTree(project, rows) {
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
