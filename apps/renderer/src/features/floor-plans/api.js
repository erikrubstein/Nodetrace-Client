import { api, resolveApiUrl } from '../../lib/api'
import { normalizeFloorPlanAppearance } from './model'

function normalizeFloorPlans(floorPlans) {
  return Array.isArray(floorPlans)
    ? floorPlans.map((floorPlan) => ({
        ...floorPlan,
        imageUrl: resolveApiUrl(floorPlan.imageUrl),
        appearance: normalizeFloorPlanAppearance(floorPlan.appearance),
        placements: Array.isArray(floorPlan.placements) ? floorPlan.placements : [],
      }))
    : []
}

function readImageDimensions(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: 0, height: 0 })
    }
    image.src = objectUrl
  })
}

export async function uploadFloorPlan(projectId, file) {
  const dimensions = await readImageDimensions(file)
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', file.name.replace(/\.[^.]+$/, ''))
  formData.append('width', String(dimensions.width))
  formData.append('height', String(dimensions.height))
  const floorPlans = await api(`/api/projects/${projectId}/floor-plans`, {
    method: 'POST',
    body: formData,
  })
  return normalizeFloorPlans(floorPlans)
}

export async function deleteFloorPlan(floorPlanId) {
  const floorPlans = await api(`/api/floor-plans/${floorPlanId}`, { method: 'DELETE' })
  return normalizeFloorPlans(floorPlans)
}

export async function saveFloorPlanPlacement(floorPlanId, nodeId, position) {
  const floorPlans = await api(`/api/floor-plans/${floorPlanId}/placements/${nodeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(position),
  })
  return normalizeFloorPlans(floorPlans)
}

export async function deleteFloorPlanPlacement(floorPlanId, nodeId) {
  const floorPlans = await api(`/api/floor-plans/${floorPlanId}/placements/${nodeId}`, {
    method: 'DELETE',
  })
  return normalizeFloorPlans(floorPlans)
}

export async function updateFloorPlanAppearance(floorPlanId, appearancePatch) {
  const floorPlans = await api(`/api/floor-plans/${floorPlanId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appearance: appearancePatch }),
  })
  return normalizeFloorPlans(floorPlans)
}
