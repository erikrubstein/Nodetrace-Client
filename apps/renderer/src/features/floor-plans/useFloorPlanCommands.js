import { useCallback, useRef } from 'react'

import {
  deleteFloorPlan,
  deleteFloorPlanPlacement,
  saveFloorPlanPlacement,
  updateFloorPlanAppearance,
  uploadFloorPlan,
} from './api'
import { normalizeFloorPlanAppearance } from './model'

export default function useFloorPlanCommands({
  beginLocalEventExpectation,
  selectedProjectId,
  setActiveFloorPlanId,
  setBusy,
  setError,
  setTree,
  setWorkspaceMode,
}) {
  const appearanceRevisionRef = useRef(new Map())
  const applyFloorPlanList = useCallback((nextFloorPlans) => {
    setTree((current) => {
      if (!current?.project) {
        return current
      }
      return {
        ...current,
        project: {
          ...current.project,
          floorPlans: nextFloorPlans,
        },
      }
    })
  }, [setTree])

  const handleUploadFloorPlan = useCallback(async (file) => {
    if (!selectedProjectId || !file) {
      return
    }
    const rollbackLocalEvent = beginLocalEventExpectation()
    setBusy(true)
    setError('')
    try {
      const nextFloorPlans = await uploadFloorPlan(selectedProjectId, file)
      applyFloorPlanList(nextFloorPlans)
      const uploadedPlan = nextFloorPlans[nextFloorPlans.length - 1] || null
      if (uploadedPlan) {
        setActiveFloorPlanId(uploadedPlan.id)
      }
      setWorkspaceMode('floor-plan')
    } catch (uploadError) {
      rollbackLocalEvent()
      setError(uploadError.message)
    } finally {
      setBusy(false)
    }
  }, [applyFloorPlanList, beginLocalEventExpectation, selectedProjectId, setActiveFloorPlanId, setBusy, setError, setWorkspaceMode])

  const handleDeleteFloorPlan = useCallback(async (floorPlan) => {
    if (!floorPlan || !window.confirm(`Delete the floor plan "${floorPlan.name}" and all of its marker placements?`)) {
      return
    }
    const rollbackLocalEvent = beginLocalEventExpectation()
    setBusy(true)
    setError('')
    try {
      const nextFloorPlans = await deleteFloorPlan(floorPlan.id)
      applyFloorPlanList(nextFloorPlans)
      setActiveFloorPlanId(nextFloorPlans[0]?.id || null)
    } catch (deleteError) {
      rollbackLocalEvent()
      setError(deleteError.message)
    } finally {
      setBusy(false)
    }
  }, [applyFloorPlanList, beginLocalEventExpectation, setActiveFloorPlanId, setBusy, setError])

  const handleSaveFloorPlanPlacement = useCallback(async (floorPlanId, nodeId, position) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    setError('')
    try {
      const nextFloorPlans = await saveFloorPlanPlacement(floorPlanId, nodeId, position)
      applyFloorPlanList(nextFloorPlans)
    } catch (placementError) {
      rollbackLocalEvent()
      setError(placementError.message)
    }
  }, [applyFloorPlanList, beginLocalEventExpectation, setError])

  const handleRemoveFloorPlanPlacement = useCallback(async (floorPlanId, nodeId) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    setError('')
    try {
      const nextFloorPlans = await deleteFloorPlanPlacement(floorPlanId, nodeId)
      applyFloorPlanList(nextFloorPlans)
    } catch (placementError) {
      rollbackLocalEvent()
      setError(placementError.message)
    }
  }, [applyFloorPlanList, beginLocalEventExpectation, setError])

  const handleUpdateFloorPlanAppearance = useCallback(async (floorPlanId, appearancePatch) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    const nextRevision = (appearanceRevisionRef.current.get(floorPlanId) || 0) + 1
    appearanceRevisionRef.current.set(floorPlanId, nextRevision)
    setError('')
    setTree((current) => {
      if (!current?.project) {
        return current
      }
      return {
        ...current,
        project: {
          ...current.project,
          floorPlans: (current.project.floorPlans || []).map((floorPlan) =>
            floorPlan.id === floorPlanId
              ? {
                  ...floorPlan,
                  appearance: normalizeFloorPlanAppearance({
                    ...floorPlan.appearance,
                    ...appearancePatch,
                  }),
                }
              : floorPlan,
          ),
        },
      }
    })
    try {
      const nextFloorPlans = await updateFloorPlanAppearance(floorPlanId, appearancePatch)
      if (appearanceRevisionRef.current.get(floorPlanId) === nextRevision) {
        applyFloorPlanList(nextFloorPlans)
      }
    } catch (appearanceError) {
      rollbackLocalEvent()
      if (appearanceRevisionRef.current.get(floorPlanId) === nextRevision) {
        setError(appearanceError.message)
      }
    }
  }, [applyFloorPlanList, beginLocalEventExpectation, setError, setTree])

  return {
    handleDeleteFloorPlan,
    handleRemoveFloorPlanPlacement,
    handleSaveFloorPlanPlacement,
    handleUpdateFloorPlanAppearance,
    handleUploadFloorPlan,
  }
}
