import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import CanvasNodePathCaption from '../../components/CanvasNodePathCaption'
import GraphNodeVisual from '../../components/GraphNodeVisual'
import IconButton from '../../components/IconButton'
import {
  FitViewIcon,
  MapOverviewIcon,
  ResetIcon,
  UploadIcon,
} from '../../components/icons'
import { getZoomWheelDelta } from '../../lib/wheel'
import FloorPlanImage from './FloorPlanImage'
import {
  buildFloorPlanNodeIndex,
  buildFloorPlanTreeLayout,
  FLOOR_PLAN_NODE_DRAG_TYPE,
  getFloorPlanWorldSize,
} from './model'

const DEFAULT_TRANSFORM = { x: 60, y: 60, scale: 1, markerScale: 1 }
const MIN_MARKER_SCALE = 0.4
const MAX_MARKER_SCALE = 3
const MARKER_TREE_GAP = 28
const MARKER_NODE_HALF_SIZE = 56

function placementContainsNode(rootNodeId, nodeId, nodeIndex) {
  let currentNode = nodeIndex.byId.get(nodeId)
  const visited = new Set()
  while (currentNode && !visited.has(currentNode.id)) {
    if (currentNode.id === rootNodeId) {
      return true
    }
    visited.add(currentNode.id)
    currentNode =
      currentNode.parent_id == null ? null : nodeIndex.byId.get(currentNode.parent_id)
  }
  return false
}

function FloorPlanMarker({
  expandedNodeIds,
  imageLoadRevision,
  loadedImages,
  markImageLoaded,
  node,
  nodeIndex,
  onBeginPlacementDrag,
  onSelect,
  onToggleNode,
  markerScale,
  placement,
  projectSettings,
  selectedNodeId,
  selectedPlacementRootNodeId,
  placementDragging,
  viewportScale,
}) {
  const treeLayout = useMemo(
    () => buildFloorPlanTreeLayout(node.id, nodeIndex, projectSettings, expandedNodeIds),
    [expandedNodeIds, node.id, nodeIndex, projectSettings],
  )
  const markerExpanded = treeLayout.nodes.some(
    (item) => item.node.type !== 'collapsed-group' && expandedNodeIds.has(item.id),
  )
  const selectedOccurrenceInMarker = selectedPlacementRootNodeId === node.id
  const markerSelected =
    selectedOccurrenceInMarker && treeLayout.nodes.some((item) => item.id === selectedNodeId)
  const verticalLayout = projectSettings.orientation === 'vertical'
  const markerTreeOrigin = verticalLayout
    ? { x: -MARKER_NODE_HALF_SIZE, y: MARKER_TREE_GAP }
    : { x: MARKER_TREE_GAP, y: -MARKER_NODE_HALF_SIZE }

  return (
    <div
      className={`floor-plan-marker-position ${markerExpanded ? 'is-expanded' : ''} ${
        markerSelected ? 'has-selected-node' : ''
      }`}
      style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%` }}
    >
      <div
        className={`floor-plan-marker ${placementDragging ? 'is-dragging' : ''}`}
        data-floor-plan-interactive="true"
        style={{ '--floor-plan-marker-scale': markerScale / Math.max(0.12, viewportScale) }}
      >
        <svg
          className={`floor-plan-marker__anchor ${verticalLayout ? 'is-vertical' : 'is-horizontal'}`}
          aria-hidden="true"
        >
          <line x1="0" x2={verticalLayout ? 0 : MARKER_TREE_GAP} y1="0" y2={verticalLayout ? MARKER_TREE_GAP : 0} />
          <circle className="floor-plan-marker__anchor-background" cx="0" cy="0" r="12" />
          <circle className="floor-plan-marker__anchor-dot" cx="0" cy="0" r="6" />
        </svg>
        <button
          aria-label={`Move ${node.name} location`}
          className="floor-plan-marker__anchor-handle"
          onPointerDown={(event) => onBeginPlacementDrag(node.id, placement, event)}
          title={`Move ${node.name} location`}
          type="button"
        />
        <svg className="floor-plan-marker__links" aria-hidden="true">
          {treeLayout.links.map((link) => (
            <line
              className={
                selectedOccurrenceInMarker && link.sourceId === selectedNodeId ? 'is-selected' : ''
              }
              key={link.key}
              x1={markerTreeOrigin.x + link.x1}
              x2={markerTreeOrigin.x + link.x2}
              y1={markerTreeOrigin.y + link.y1}
              y2={markerTreeOrigin.y + link.y2}
            />
          ))}
        </svg>
        {treeLayout.nodes.map((item) => {
          const collapsedGroup = item.node.type === 'collapsed-group'
          const rootNode = item.id === node.id
          return (
            <button
              aria-label={item.node.name}
              className={`graph-node floor-plan-marker__tree-node ${rootNode ? 'is-root' : ''} ${
                selectedOccurrenceInMarker && selectedNodeId === item.id ? 'selected' : ''
              } ${projectSettings.imageMode === 'square' ? 'image-square' : 'image-original'} ${
                item.node.hasImage ? 'node-with-photo' : 'node-without-photo'
              } ${collapsedGroup ? 'collapsed-node' : ''}`}
              data-node-id={item.id}
              key={item.id}
              onClick={(event) => {
                event.stopPropagation()
                if (collapsedGroup) {
                  return
                }
                onSelect(item.id, node.id)
              }}
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!collapsedGroup && (nodeIndex.childrenById.get(item.id) || []).length) {
                  onToggleNode(item.id)
                }
              }}
              style={{
                left: `${markerTreeOrigin.x + item.x}px`,
                top: `${markerTreeOrigin.y + item.y}px`,
              }}
              type="button"
            >
              <GraphNodeVisual
                imageLoadRevision={imageLoadRevision}
                loadedImages={loadedImages}
                markImageLoaded={markImageLoaded}
                node={item.node}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

const FloorPlanWorkspace = forwardRef(function FloorPlanWorkspace({
  active,
  activeFloorPlanId,
  busy,
  expandedNodeIds,
  floorPlans,
  imageLoadRevision,
  loadedImages,
  markImageLoaded,
  nodes,
  onActiveFloorPlanChange,
  onPendingPlacementChange,
  onExpandedNodeIdsChange,
  onSelectedPlacementRootNodeIdChange,
  onSavePlacement,
  onSelectNode,
  onTransformChange,
  onUploadFloorPlan,
  pendingPlacementNodeId,
  projectSettings,
  selectedNodePath,
  selectedNodeId,
  selectedPlacementRootNodeId,
  selectNodeFromPath,
  theme,
  transform,
}, ref) {
  const viewportRef = useRef(null)
  const uploadInputRef = useRef(null)
  const panRef = useRef(null)
  const placementDragRef = useRef(null)
  const [placementPreview, setPlacementPreview] = useState(null)

  const activeFloorPlan = useMemo(
    () => floorPlans.find((floorPlan) => floorPlan.id === activeFloorPlanId) || floorPlans[0] || null,
    [activeFloorPlanId, floorPlans],
  )
  const nodeIndex = useMemo(() => buildFloorPlanNodeIndex(nodes), [nodes])
  const worldSize = useMemo(() => getFloorPlanWorldSize(activeFloorPlan), [activeFloorPlan])
  const activeTransform = transform || DEFAULT_TRANSFORM
  const markerScale = Math.max(
    MIN_MARKER_SCALE,
    Math.min(MAX_MARKER_SCALE, Number(activeTransform.markerScale) || 1),
  )
  const placedRootIds = useMemo(
    () => new Set((activeFloorPlan?.placements || []).map((placement) => placement.nodeId)),
    [activeFloorPlan?.placements],
  )
  const resolvedSelectedPlacementRootId = useMemo(() => {
    if (!selectedNodeId) {
      return null
    }
    if (
      selectedPlacementRootNodeId &&
      placedRootIds.has(selectedPlacementRootNodeId) &&
      placementContainsNode(selectedPlacementRootNodeId, selectedNodeId, nodeIndex)
    ) {
      return selectedPlacementRootNodeId
    }
    if (placedRootIds.has(selectedNodeId)) {
      return selectedNodeId
    }
    for (const placement of activeFloorPlan?.placements || []) {
      if (
        nodeIndex.byId.has(placement.nodeId) &&
        placementContainsNode(placement.nodeId, selectedNodeId, nodeIndex)
      ) {
        return placement.nodeId
      }
    }
    return null
  }, [
    activeFloorPlan?.placements,
    nodeIndex,
    placedRootIds,
    selectedNodeId,
    selectedPlacementRootNodeId,
  ])
  const expandedTreeNodeIds = useMemo(
    () => new Set(expandedNodeIds || []),
    [expandedNodeIds],
  )
  useEffect(() => {
    if (activeFloorPlan && activeFloorPlan.id !== activeFloorPlanId) {
      onActiveFloorPlanChange(activeFloorPlan.id)
    }
  }, [activeFloorPlan, activeFloorPlanId, onActiveFloorPlanChange])

  useEffect(() => {
    if (!active || !nodes.length) {
      return
    }
    const currentFloorPlanId = activeFloorPlan?.id
    if (!currentFloorPlanId) {
      return
    }
    if (resolvedSelectedPlacementRootId) {
      if (selectedPlacementRootNodeId !== resolvedSelectedPlacementRootId) {
        onSelectedPlacementRootNodeIdChange(
          currentFloorPlanId,
          resolvedSelectedPlacementRootId,
        )
      }
      return
    }
    if (!placedRootIds.size) {
      if (selectedPlacementRootNodeId) {
        onSelectedPlacementRootNodeIdChange(currentFloorPlanId, null)
      }
      if (selectedNodeId && nodeIndex.byId.has(selectedNodeId)) {
        return
      }
      const fallbackNodeId =
        nodes.find((candidate) => candidate.parent_id == null)?.id || nodes[0].id
      onSelectNode(fallbackNodeId)
      return
    }
    const fallbackPlacementRootId =
      (activeFloorPlan?.placements || []).find((placement) => nodeIndex.byId.has(placement.nodeId))?.nodeId ||
      null
    if (fallbackPlacementRootId) {
      onSelectNode(fallbackPlacementRootId, fallbackPlacementRootId)
    }
  }, [
    active,
    activeFloorPlan?.id,
    activeFloorPlan?.placements,
    nodeIndex,
    nodes,
    onSelectedPlacementRootNodeIdChange,
    onSelectNode,
    placedRootIds.size,
    resolvedSelectedPlacementRootId,
    selectedNodeId,
    selectedPlacementRootNodeId,
  ])

  function toggleFloorPlanTreeNode(nodeId) {
    if (!activeFloorPlan?.id) {
      return
    }
    const nextExpandedIds = new Set(expandedTreeNodeIds)
    if (nextExpandedIds.has(nodeId)) {
      nextExpandedIds.delete(nodeId)
    } else {
      nextExpandedIds.add(nodeId)
    }
    onExpandedNodeIdsChange(Array.from(nextExpandedIds))
  }

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !activeFloorPlan) {
      return
    }
    const rect = viewport.getBoundingClientRect()
    const availableWidth = Math.max(160, rect.width - 80)
    const availableHeight = Math.max(160, rect.height - 96)
    const scale = Math.max(0.12, Math.min(2.5, Math.min(availableWidth / worldSize.width, availableHeight / worldSize.height)))
    onTransformChange({
      markerScale,
      scale,
      x: (rect.width - worldSize.width * scale) / 2,
      y: (rect.height - worldSize.height * scale) / 2,
    })
  }, [activeFloorPlan, markerScale, onTransformChange, worldSize.height, worldSize.width])

  useImperativeHandle(ref, () => ({ fitToView }), [fitToView])

  useEffect(() => {
    if (!active || !activeFloorPlan || transform) {
      return undefined
    }
    const frame = window.requestAnimationFrame(fitToView)
    return () => window.cancelAnimationFrame(frame)
  }, [active, activeFloorPlan, fitToView, transform])

  function positionFromClientPoint(clientX, clientY, offset = { x: 0, y: 0 }) {
    const viewport = viewportRef.current
    if (!viewport) {
      return null
    }
    const rect = viewport.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(
        1,
        (clientX - rect.left - activeTransform.x) / activeTransform.scale / worldSize.width + offset.x,
      )),
      y: Math.max(0, Math.min(
        1,
        (clientY - rect.top - activeTransform.y) / activeTransform.scale / worldSize.height + offset.y,
      )),
    }
  }

  function placeNodeAtPoint(nodeId, clientX, clientY) {
    if (!activeFloorPlan || !nodeIndex.byId.has(nodeId)) {
      return
    }
    const position = positionFromClientPoint(clientX, clientY)
    if (!position) {
      return
    }
    onPendingPlacementChange(null)
    onSelectNode(nodeId, nodeId)
    void onSavePlacement(activeFloorPlan.id, nodeId, position)
  }

  function beginPlacementDrag(nodeId, placement, event) {
    if (event.button !== 0 || !activeFloorPlan) {
      return
    }
    const pointerPosition = positionFromClientPoint(event.clientX, event.clientY)
    if (!pointerPosition) {
      return
    }
    const currentPlacement = placementPreview?.nodeId === nodeId ? placementPreview : placement
    event.preventDefault()
    event.stopPropagation()
    onPendingPlacementChange(null)
    onSelectNode(nodeId, nodeId)
    placementDragRef.current = {
      nodeId,
      offset: {
        x: currentPlacement.x - pointerPosition.x,
        y: currentPlacement.y - pointerPosition.y,
      },
      pointerId: event.pointerId,
      position: {
        x: currentPlacement.x,
        y: currentPlacement.y,
      },
    }
    setPlacementPreview({
      dragging: true,
      nodeId,
      x: currentPlacement.x,
      y: currentPlacement.y,
    })
    viewportRef.current?.setPointerCapture(event.pointerId)
  }

  function beginPan(event) {
    if (event.button !== 0 || event.target.closest('[data-floor-plan-interactive="true"]')) {
      return
    }
    if (pendingPlacementNodeId) {
      placeNodeAtPoint(pendingPlacementNodeId, event.clientX, event.clientY)
      event.preventDefault()
      return
    }
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: activeTransform.x,
      originY: activeTransform.y,
    }
    viewportRef.current?.setPointerCapture(event.pointerId)
  }

  function movePan(event) {
    const placementDrag = placementDragRef.current
    if (placementDrag?.pointerId === event.pointerId) {
      const position = positionFromClientPoint(
        event.clientX,
        event.clientY,
        placementDrag.offset,
      )
      if (position) {
        placementDrag.position = position
        setPlacementPreview({
          dragging: true,
          nodeId: placementDrag.nodeId,
          ...position,
        })
      }
      return
    }
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      return
    }
    onTransformChange({
      ...activeTransform,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    })
  }

  function endPointerInteraction(event) {
    const placementDrag = placementDragRef.current
    if (placementDrag?.pointerId === event.pointerId) {
      placementDragRef.current = null
      viewportRef.current?.releasePointerCapture(event.pointerId)
      setPlacementPreview((current) =>
        current?.nodeId === placementDrag.nodeId
          ? { ...current, dragging: false }
          : current,
      )
      if (activeFloorPlan) {
        void Promise.resolve(
          onSavePlacement(activeFloorPlan.id, placementDrag.nodeId, placementDrag.position),
        ).finally(() => {
          setPlacementPreview((current) =>
            current?.nodeId === placementDrag.nodeId ? null : current,
          )
        })
      } else {
        setPlacementPreview(null)
      }
      return
    }
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) {
      return
    }
    panRef.current = null
    viewportRef.current?.releasePointerCapture(event.pointerId)
  }

  function handleWheel(event) {
    if (!activeFloorPlan) {
      return
    }
    const zoomDelta = getZoomWheelDelta(event)
    if (!zoomDelta) {
      return
    }
    event.preventDefault()
    if (event.shiftKey) {
      onTransformChange({
        ...activeTransform,
        markerScale: Math.max(
          MIN_MARKER_SCALE,
          Math.min(MAX_MARKER_SCALE, markerScale * Math.exp(-zoomDelta * 0.0012)),
        ),
      })
      return
    }
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const worldX = (pointerX - activeTransform.x) / activeTransform.scale
    const worldY = (pointerY - activeTransform.y) / activeTransform.scale
    const nextScale = Math.max(0.12, Math.min(5, activeTransform.scale * Math.exp(-zoomDelta * 0.0012)))
    onTransformChange({
      ...activeTransform,
      markerScale,
      scale: nextScale,
      x: pointerX - worldX * nextScale,
      y: pointerY - worldY * nextScale,
    })
  }

  function resetMarkerZoom() {
    onTransformChange({
      ...activeTransform,
      markerScale: 1,
    })
  }

  function handleDrop(event) {
    event.preventDefault()
    const nodeId = event.dataTransfer.getData(FLOOR_PLAN_NODE_DRAG_TYPE)
    if (nodeId) {
      placeNodeAtPoint(nodeId, event.clientX, event.clientY)
    }
  }

  if (!activeFloorPlan) {
    return (
      <section className="floor-plan-workspace floor-plan-workspace--empty" hidden={!active}>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload plan image"
          className="floor-plan-workspace__file-input"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void onUploadFloorPlan(file)
            }
          }}
          ref={uploadInputRef}
          type="file"
        />
        <div className="floor-plan-empty-state">
          <span className="floor-plan-empty-state__icon" aria-hidden="true">
            <MapOverviewIcon />
          </span>
          <div>
            <h2>Add a plan</h2>
            <p>Upload a PNG, JPEG, or WebP image, then place existing tree nodes as location markers.</p>
          </div>
          <button disabled={busy} onClick={() => uploadInputRef.current?.click()} type="button">
            <UploadIcon />
            Upload plan
          </button>
        </div>
        <CanvasNodePathCaption
          onSelectNode={selectNodeFromPath}
          selectedNodePath={selectedNodePath}
        />
      </section>
    )
  }

  return (
    <section
      className={`floor-plan-workspace ${pendingPlacementNodeId ? 'is-placing' : ''}`}
      hidden={!active}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPointerInteraction}
      onPointerCancel={endPointerInteraction}
      onWheel={handleWheel}
      ref={viewportRef}
    >
      <div className="canvas-tools" data-floor-plan-interactive="true">
        <IconButton
          aria-label="Fit plan to view"
          className="canvas-tool-button"
          disabled={busy}
          onClick={fitToView}
          tooltip="Fit View"
        >
          <FitViewIcon />
        </IconButton>
        <IconButton
          aria-label="Reset node zoom"
          className="canvas-tool-button"
          disabled={busy}
          onClick={resetMarkerZoom}
          tooltip="Reset Node Zoom"
        >
          <ResetIcon />
        </IconButton>
      </div>
      <div
        className={`floor-plan-stage${activeFloorPlan.appearance?.transparentWhite ? ' is-transparent' : ''}`}
        style={{
          height: `${worldSize.height}px`,
          transform: `translate(${activeTransform.x}px, ${activeTransform.y}px) scale(${activeTransform.scale})`,
          width: `${worldSize.width}px`,
        }}
      >
        <FloorPlanImage
          alt={activeFloorPlan.name}
          appearance={activeFloorPlan.appearance}
          src={activeFloorPlan.imageUrl}
          theme={theme}
        />
        {(activeFloorPlan.placements || []).map((placement) => {
          const node = nodeIndex.byId.get(placement.nodeId)
          if (!node) {
            return null
          }
          const displayedPlacement = placementPreview?.nodeId === placement.nodeId
            ? { ...placement, x: placementPreview.x, y: placementPreview.y }
            : placement
          return (
            <FloorPlanMarker
              expandedNodeIds={expandedTreeNodeIds}
              imageLoadRevision={imageLoadRevision}
              key={node.id}
              loadedImages={loadedImages}
              markImageLoaded={markImageLoaded}
              node={node}
              nodeIndex={nodeIndex}
              onBeginPlacementDrag={beginPlacementDrag}
              onSelect={onSelectNode}
              onToggleNode={toggleFloorPlanTreeNode}
              placement={displayedPlacement}
              placementDragging={
                placementPreview?.nodeId === node.id && placementPreview.dragging
              }
              markerScale={markerScale}
              projectSettings={projectSettings}
              selectedNodeId={selectedNodeId}
              selectedPlacementRootNodeId={resolvedSelectedPlacementRootId}
              viewportScale={activeTransform.scale}
            />
          )
        })}
      </div>
      <CanvasNodePathCaption
        onSelectNode={selectNodeFromPath}
        selectedNodePath={selectedNodePath}
      />
      <div className="canvas-caption canvas-caption--right floor-plan-status">
        {Math.round(activeTransform.scale * 100)}% · {Math.round(markerScale * 100)}% ·{' '}
        {activeFloorPlan.placements?.length || 0} placed nodes
      </div>
    </section>
  )
})

export default FloorPlanWorkspace
