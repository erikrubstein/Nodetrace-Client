import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import IconButton from '../../components/IconButton'
import {
  AddPhotoIcon,
  FitViewIcon,
  FolderIcon,
  LocationIcon,
  MapOverviewIcon,
  RemoveLocationIcon,
  UploadIcon,
} from '../../components/icons'
import { getZoomWheelDelta } from '../../lib/wheel'
import FloorPlanImage from './FloorPlanImage'
import {
  buildFloorPlanNodeIndex,
  buildMiniTreeEntries,
  FLOOR_PLAN_NODE_DRAG_TYPE,
  getFloorPlanWorldSize,
} from './model'

const DEFAULT_TRANSFORM = { x: 60, y: 60, scale: 1 }

function FloorPlanMarker({
  childrenById,
  descendantCount,
  expanded,
  node,
  onExpand,
  onRemove,
  onSelect,
  placement,
  viewportScale,
}) {
  const miniTreeEntries = useMemo(
    () => (expanded ? buildMiniTreeEntries(node.id, childrenById) : []),
    [childrenById, expanded, node.id],
  )
  const hiddenDescendantCount = Math.max(0, descendantCount - miniTreeEntries.length)

  return (
    <div
      className={`floor-plan-marker-position ${expanded ? 'is-expanded' : ''}`}
      style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%` }}
    >
      <div
        className={`floor-plan-marker ${expanded ? 'is-expanded' : ''}`}
        data-floor-plan-interactive="true"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData(FLOOR_PLAN_NODE_DRAG_TYPE, node.id)
        }}
        style={{ '--floor-plan-marker-scale': 1 / Math.max(0.12, viewportScale) }}
      >
        <button
          aria-label={`Open location ${node.name}`}
          className="floor-plan-marker__anchor"
          onClick={(event) => {
            event.stopPropagation()
            onExpand(node.id)
          }}
          type="button"
        >
          <span className="floor-plan-marker__pin" aria-hidden="true">
            <LocationIcon />
          </span>
          <span className="floor-plan-marker__summary">
            {node.previewUrl || node.imageUrl ? (
              <img alt="" className="floor-plan-marker__thumbnail" draggable="false" src={node.previewUrl || node.imageUrl} />
            ) : (
              <span className="floor-plan-marker__thumbnail floor-plan-marker__thumbnail--empty" aria-hidden="true">
                {node.type === 'photo' ? <AddPhotoIcon /> : <FolderIcon />}
              </span>
            )}
            <span className="floor-plan-marker__text">
              <strong>{node.name}</strong>
              <small>{descendantCount ? `${descendantCount} nested item${descendantCount === 1 ? '' : 's'}` : 'Location'}</small>
            </span>
          </span>
        </button>
        {expanded ? (
          <div className="floor-plan-marker__tree">
            {miniTreeEntries.length ? (
              miniTreeEntries.map((entry) => (
                <button
                  className="floor-plan-marker__tree-row"
                  key={entry.node.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(entry.node.id)
                  }}
                  style={{ '--floor-plan-depth': `${Math.min(entry.depth, 4) * 10}px` }}
                  type="button"
                >
                  {entry.node.hasImage ? <AddPhotoIcon /> : <FolderIcon />}
                  <span>{entry.node.name}</span>
                </button>
              ))
            ) : (
              <div className="floor-plan-marker__tree-empty">No nested nodes yet</div>
            )}
            {hiddenDescendantCount ? (
              <div className="floor-plan-marker__tree-more">+{hiddenDescendantCount} more</div>
            ) : null}
            <button
              className="floor-plan-marker__remove"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(node.id)
              }}
              type="button"
            >
              <RemoveLocationIcon />
              Remove from plan
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const FloorPlanWorkspace = forwardRef(function FloorPlanWorkspace({
  activeFloorPlanId,
  busy,
  floorPlans,
  nodes,
  onActiveFloorPlanChange,
  onPendingPlacementChange,
  onRemovePlacement,
  onSavePlacement,
  onSelectNode,
  onTransformChange,
  onUploadFloorPlan,
  pendingPlacementNodeId,
  theme,
  transform,
}, ref) {
  const viewportRef = useRef(null)
  const uploadInputRef = useRef(null)
  const panRef = useRef(null)
  const [expandedMarkerNodeId, setExpandedMarkerNodeId] = useState(null)

  const activeFloorPlan = useMemo(
    () => floorPlans.find((floorPlan) => floorPlan.id === activeFloorPlanId) || floorPlans[0] || null,
    [activeFloorPlanId, floorPlans],
  )
  const nodeIndex = useMemo(() => buildFloorPlanNodeIndex(nodes), [nodes])
  const worldSize = useMemo(() => getFloorPlanWorldSize(activeFloorPlan), [activeFloorPlan])
  const activeTransform = transform || DEFAULT_TRANSFORM
  useEffect(() => {
    if (activeFloorPlan && activeFloorPlan.id !== activeFloorPlanId) {
      onActiveFloorPlanChange(activeFloorPlan.id)
    }
  }, [activeFloorPlan, activeFloorPlanId, onActiveFloorPlanChange])

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
      scale,
      x: (rect.width - worldSize.width * scale) / 2,
      y: (rect.height - worldSize.height * scale) / 2,
    })
  }, [activeFloorPlan, onTransformChange, worldSize.height, worldSize.width])

  useImperativeHandle(ref, () => ({ fitToView }), [fitToView])

  useEffect(() => {
    if (!activeFloorPlan || transform) {
      return undefined
    }
    const frame = window.requestAnimationFrame(fitToView)
    return () => window.cancelAnimationFrame(frame)
  }, [activeFloorPlan, fitToView, transform])

  function positionFromClientPoint(clientX, clientY) {
    const viewport = viewportRef.current
    if (!viewport) {
      return null
    }
    const rect = viewport.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left - activeTransform.x) / activeTransform.scale / worldSize.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top - activeTransform.y) / activeTransform.scale / worldSize.height)),
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
    onSelectNode(nodeId)
    void onSavePlacement(activeFloorPlan.id, nodeId, position)
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

  function endPan(event) {
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
      scale: nextScale,
      x: pointerX - worldX * nextScale,
      y: pointerY - worldY * nextScale,
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
      <section className="floor-plan-workspace floor-plan-workspace--empty">
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload floor plan image"
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
            <h2>Add a floor plan</h2>
            <p>Upload a PNG, JPEG, or WebP image, then place existing tree nodes as location markers.</p>
          </div>
          <button disabled={busy} onClick={() => uploadInputRef.current?.click()} type="button">
            <UploadIcon />
            Upload floor plan
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      className={`floor-plan-workspace ${pendingPlacementNodeId ? 'is-placing' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
      ref={viewportRef}
    >
      <div className="canvas-tools" data-floor-plan-interactive="true">
        <IconButton
          aria-label="Fit floor plan to view"
          className="canvas-tool-button"
          disabled={busy}
          onClick={fitToView}
          tooltip="Fit View"
        >
          <FitViewIcon />
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
          return (
            <FloorPlanMarker
              childrenById={nodeIndex.childrenById}
              descendantCount={nodeIndex.descendantCountById.get(node.id) || 0}
              expanded={expandedMarkerNodeId === node.id}
              key={node.id}
              node={node}
              onExpand={(nodeId) => {
                setExpandedMarkerNodeId((current) => current === nodeId ? null : nodeId)
                onSelectNode(nodeId)
              }}
              onRemove={(nodeId) => {
                setExpandedMarkerNodeId(null)
                void onRemovePlacement(activeFloorPlan.id, nodeId)
              }}
              onSelect={onSelectNode}
              placement={placement}
              viewportScale={activeTransform.scale}
            />
          )
        })}
      </div>
      <div className="floor-plan-status">
        {Math.round(activeTransform.scale * 100)}% · {activeFloorPlan.placements?.length || 0} placed
      </div>
    </section>
  )
})

export default FloorPlanWorkspace
