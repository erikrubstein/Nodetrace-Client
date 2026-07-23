import { useMemo, useState } from 'react'

import IconButton from '../../components/IconButton'
import { AddPhotoIcon, FolderIcon, LocationIcon, RemoveLocationIcon, SearchIcon } from '../../components/icons'
import { buildFloorPlanNodeIndex, FLOOR_PLAN_NODE_DRAG_TYPE } from './model'

export default function FloorPlanLocationsPanel({
  activeFloorPlan,
  busy,
  nodes,
  onBeginPlacement,
  onRemovePlacement,
  onSelectNode,
  pendingPlacementNodeId,
  selectedNodeId,
}) {
  const [query, setQuery] = useState('')
  const nodeIndex = useMemo(() => buildFloorPlanNodeIndex(nodes), [nodes])
  const placementsByNodeId = useMemo(
    () => new Map((activeFloorPlan?.placements || []).map((placement) => [placement.nodeId, placement])),
    [activeFloorPlan?.placements],
  )
  const searchableNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return nodes
      .filter((node) => node.parent_id != null)
      .filter((node) => !normalizedQuery || `${node.name} ${(node.tags || []).join(' ')}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const placementDifference = Number(placementsByNodeId.has(left.id)) - Number(placementsByNodeId.has(right.id))
        return placementDifference || left.name.localeCompare(right.name)
      })
  }, [nodes, placementsByNodeId, query])

  if (!activeFloorPlan) {
    return <div className="inspector__notice floor-plan-panel__notice">Upload a floor plan before placing locations.</div>
  }

  return (
    <div className="floor-plan-locations-panel">
      <section className="inspector__section floor-plan-panel__section">
        <label className="floor-plan-panel__search">
          <SearchIcon />
          <input
            aria-label="Search locations"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes"
            type="search"
            value={query}
          />
        </label>
        <div className="inspector__notice">Drag a node onto the plan, or use its location button and click the plan.</div>
        {pendingPlacementNodeId ? (
          <div className="floor-plan-panel__placing">
            Click the plan to place <strong>{nodeIndex.byId.get(pendingPlacementNodeId)?.name}</strong>.
            <button onClick={() => onBeginPlacement(null)} type="button">Cancel</button>
          </div>
        ) : null}
      </section>
      <div className="floor-plan-locations-panel__list">
        {searchableNodes.map((node) => {
          const placed = placementsByNodeId.has(node.id)
          return (
            <div
              className={`floor-plan-location-row ${selectedNodeId === node.id ? 'is-selected' : ''}`}
              draggable
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = placed ? 'move' : 'copy'
                event.dataTransfer.setData(FLOOR_PLAN_NODE_DRAG_TYPE, node.id)
              }}
            >
              {node.previewUrl || node.imageUrl ? (
                <img alt="" draggable="false" src={node.previewUrl || node.imageUrl} />
              ) : (
                <span className="floor-plan-location-row__icon" aria-hidden="true">
                  {node.type === 'photo' ? <AddPhotoIcon /> : <FolderIcon />}
                </span>
              )}
              <span className="floor-plan-location-row__name">
                <strong>{node.name}</strong>
                <small>{placed ? 'Placed' : `${nodeIndex.descendantCountById.get(node.id) || 0} nested`}</small>
              </span>
              <span className="floor-plan-location-row__actions">
                {placed ? (
                  <IconButton
                    aria-label={`Remove ${node.name} from floor plan`}
                    className="tool-button"
                    disabled={busy}
                    onClick={() => onRemovePlacement(node.id)}
                    tooltip="Remove Location"
                  >
                    <RemoveLocationIcon />
                  </IconButton>
                ) : null}
                <IconButton
                  aria-label={`${placed ? 'Move' : 'Place'} ${node.name}`}
                  className="tool-button"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    onBeginPlacement(node.id)
                    onSelectNode(node.id)
                  }}
                  tooltip={placed ? 'Move Location' : 'Place Location'}
                >
                  <LocationIcon />
                </IconButton>
              </span>
            </div>
          )
        })}
        {!searchableNodes.length ? <div className="floor-plan-panel__empty">No matching nodes</div> : null}
      </div>
    </div>
  )
}
