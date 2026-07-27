import { useMemo, useRef, useState, useEffect } from 'react'

import { PlusIcon } from '../../components/icons'
import FloorPlanImage from './FloorPlanImage'

function findPlacement(floorPlans, location) {
  if (!location?.floorPlanId || !location?.nodeId) {
    return null
  }
  const floorPlan = floorPlans.find((candidate) => candidate.id === location.floorPlanId)
  const placement = floorPlan?.placements?.find(
    (candidate) => candidate.nodeId === location.nodeId,
  )
  return floorPlan && placement ? { floorPlan, placement } : null
}

function findMostRecentPlacement(floorPlans) {
  const candidates = floorPlans.flatMap((floorPlan) =>
    (floorPlan.placements || []).map((placement) => ({ floorPlan, placement })))
  return candidates.reduce((latest, candidate) => {
    if (!latest) {
      return candidate
    }
    const candidateTime = Date.parse(
      candidate.placement.createdAt || candidate.placement.updatedAt || '',
    ) || 0
    const latestTime = Date.parse(
      latest.placement.createdAt || latest.placement.updatedAt || '',
    ) || 0
    return candidateTime >= latestTime ? candidate : latest
  }, null)
}

function existingSelection(floorPlan, placement) {
  if (!floorPlan || !placement) {
    return null
  }
  return {
    floorPlanId: floorPlan.id,
    kind: 'existing',
    nodeId: placement.nodeId,
    nodeName: placement.nodeName || 'Location',
  }
}

export default function MobileFloorPlanPlacement({
  busy,
  defaultLocation,
  floorPlans,
  onAttach,
  onPlace,
  onSkip,
  showGrid,
  status,
  statusIsError,
  theme,
}) {
  const initialExistingLocation =
    findPlacement(floorPlans, defaultLocation) || findMostRecentPlacement(floorPlans)
  const [activeFloorPlanId, setActiveFloorPlanId] = useState(
    initialExistingLocation?.floorPlan.id || floorPlans[0]?.id || null,
  )
  const [selection, setSelection] = useState(() =>
    existingSelection(
      initialExistingLocation?.floorPlan,
      initialExistingLocation?.placement,
    ))
  const [frameSize, setFrameSize] = useState({ height: 0, width: 0 })
  const frameRef = useRef(null)
  const activeFloorPlan = useMemo(
    () => floorPlans.find((floorPlan) => floorPlan.id === activeFloorPlanId) || floorPlans[0] || null,
    [activeFloorPlanId, floorPlans],
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) {
      return undefined
    }

    const updateSize = () => {
      const rect = frame.getBoundingClientRect()
      setFrameSize({ height: rect.height, width: rect.width })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const mapSize = useMemo(() => {
    const naturalWidth = Math.max(1, Number(activeFloorPlan?.width) || 4)
    const naturalHeight = Math.max(1, Number(activeFloorPlan?.height) || 3)
    const scale = Math.min(
      frameSize.width / naturalWidth || 0,
      frameSize.height / naturalHeight || 0,
    )
    return {
      aspectRatio: `${naturalWidth} / ${naturalHeight}`,
      height: scale > 0 ? naturalHeight * scale : 0,
      width: scale > 0 ? naturalWidth * scale : 0,
    }
  }, [activeFloorPlan?.height, activeFloorPlan?.width, frameSize.height, frameSize.width])

  if (!activeFloorPlan) {
    return null
  }

  function chooseNewPosition(event) {
    if (busy) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      return
    }
    const keyboardActivation = event.detail === 0
    setSelection({
      floorPlanId: activeFloorPlan.id,
      kind: 'new',
      position: {
        x: keyboardActivation ? 0.5 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: keyboardActivation ? 0.5 : Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      },
    })
  }

  function selectFloorPlan(floorPlanId) {
    const nextFloorPlan = floorPlans.find((floorPlan) => floorPlan.id === floorPlanId)
    const latestPlacement = findMostRecentPlacement(nextFloorPlan ? [nextFloorPlan] : [])
    setActiveFloorPlanId(floorPlanId)
    setSelection(existingSelection(nextFloorPlan, latestPlacement?.placement))
  }

  const selectedExistingLocation =
    selection?.kind === 'existing' ? selection : null
  const selectedNewPosition =
    selection?.kind === 'new' && selection.floorPlanId === activeFloorPlan.id
      ? selection.position
      : null

  return (
    <main className="mobile-plan-placement">
      <header className="mobile-plan-placement__header">
        <div className="mobile-plan-placement__title">Choose a location</div>
        <div className="mobile-plan-placement__instructions">
          Tap a ring to add under it, or tap the plan for a new location.
        </div>
        {floorPlans.length > 1 ? (
          <label className="mobile-plan-placement__plan-picker">
            <span>Plan</span>
            <select
              disabled={busy}
              onChange={(event) => selectFloorPlan(event.target.value)}
              value={activeFloorPlan.id}
            >
              {floorPlans.map((floorPlan) => (
                <option key={floorPlan.id} value={floorPlan.id}>
                  {floorPlan.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mobile-plan-placement__plan-name">{activeFloorPlan.name}</div>
        )}
        <div className="mobile-plan-placement__selection">
          {selectedExistingLocation ? (
            <>
              <span>Selected</span>
              <strong>{selectedExistingLocation.nodeName}</strong>
            </>
          ) : selectedNewPosition ? (
            <strong>New location</strong>
          ) : (
            <span>Nothing selected</span>
          )}
        </div>
        {status ? (
          <div className={`capture-status ${statusIsError ? 'is-error' : ''}`}>{status}</div>
        ) : null}
      </header>

      <div
        className={`mobile-plan-placement__frame${showGrid ? '' : ' is-grid-hidden'}`}
        ref={frameRef}
      >
        <div
          className={`mobile-plan-placement__map${
            activeFloorPlan.appearance?.transparentWhite ? ' is-transparent' : ''
          }`}
          style={{
            aspectRatio: mapSize.aspectRatio,
            height: mapSize.height ? `${mapSize.height}px` : undefined,
            width: mapSize.width ? `${mapSize.width}px` : '100%',
          }}
        >
          <FloorPlanImage
            alt={activeFloorPlan.name}
            appearance={activeFloorPlan.appearance}
            src={activeFloorPlan.imageUrl}
            theme={theme}
          />
          <button
            aria-label={`Create a new location on ${activeFloorPlan.name}`}
            className="mobile-plan-placement__new-location-target"
            disabled={busy}
            onClick={chooseNewPosition}
            type="button"
          />
          {(activeFloorPlan.placements || []).map((placement) => {
            const selected =
              selectedExistingLocation?.floorPlanId === activeFloorPlan.id &&
              selectedExistingLocation.nodeId === placement.nodeId
            return (
              <button
                aria-label={`Use ${placement.nodeName || 'location'} location`}
                aria-pressed={selected}
                className={`mobile-plan-placement__existing-marker${selected ? ' is-selected' : ''}`}
                disabled={busy}
                key={placement.nodeId}
                onClick={() =>
                  setSelection(existingSelection(activeFloorPlan, placement))
                }
                style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%` }}
                type="button"
              >
                <span />
              </button>
            )
          })}
          {selectedNewPosition ? (
            <span
              aria-hidden="true"
              className="mobile-plan-placement__new-marker"
              style={{
                left: `${selectedNewPosition.x * 100}%`,
                top: `${selectedNewPosition.y * 100}%`,
              }}
            >
              <PlusIcon size={22} strokeWidth={3} />
            </span>
          ) : null}
        </div>
      </div>

      <footer className="mobile-plan-placement__actions">
        <button
          className="capture-secondary-button"
          disabled={busy}
          onClick={onSkip}
          type="button"
        >
          Skip
        </button>
        <button
          className="capture-primary-button"
          disabled={busy || !selection}
          onClick={() => {
            if (selectedExistingLocation) {
              onAttach(activeFloorPlan.id, selectedExistingLocation.nodeId)
              return
            }
            if (selectedNewPosition) {
              onPlace(activeFloorPlan.id, selectedNewPosition)
            }
          }}
          type="button"
        >
          {busy
            ? 'Saving...'
            : selectedExistingLocation
              ? 'Add to Location'
              : selectedNewPosition
                ? 'Place Here'
                : 'Choose a Location'}
        </button>
      </footer>
    </main>
  )
}
