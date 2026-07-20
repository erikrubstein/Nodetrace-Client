export function getZoomWheelDelta(event) {
  const deltaX = Number(event?.deltaX) || 0
  const deltaY = Number(event?.deltaY) || 0
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
}
