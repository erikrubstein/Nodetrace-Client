import { useEffect, useLayoutEffect, useRef } from 'react'

export default function CanvasNodePathCaption({
  onSelectNode,
  selectedNodePath,
}) {
  const pathScrollRef = useRef(null)
  const pathScrollTargetRef = useRef(0)

  useLayoutEffect(() => {
    const element = pathScrollRef.current
    if (!element) {
      return
    }
    const nextScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth)
    pathScrollTargetRef.current = nextScrollLeft
    element.scrollLeft = nextScrollLeft
  }, [selectedNodePath])

  useEffect(() => {
    const element = pathScrollRef.current
    if (!element) {
      return undefined
    }

    const wheelListener = (event) => {
      const canScrollHorizontally = element.scrollWidth > element.clientWidth
      if (!canScrollHorizontally) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()

      const delta = event.deltaX || event.deltaY
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth)
      const currentScrollLeft =
        Number.isFinite(pathScrollTargetRef.current) && pathScrollTargetRef.current > 0
          ? pathScrollTargetRef.current
          : element.scrollLeft
      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, currentScrollLeft + delta))
      pathScrollTargetRef.current = nextScrollLeft
      element.scrollTo({
        left: nextScrollLeft,
        behavior: 'smooth',
      })
    }

    element.addEventListener('wheel', wheelListener, { passive: false, capture: true })
    return () => {
      element.removeEventListener('wheel', wheelListener, true)
    }
  }, [])

  return (
    <div className="canvas-caption canvas-caption--left">
      {selectedNodePath?.length ? (
        <div
          ref={pathScrollRef}
          className="canvas-caption__path"
          role="navigation"
          aria-label="Selected node path"
        >
          <div className="canvas-caption__path-track">
            {selectedNodePath.map((entry, index) => (
              <span key={entry.id} className="canvas-caption__segment">
                {index > 0 ? <span className="canvas-caption__separator">{'>'}</span> : null}
                <button
                  className={`canvas-caption__node ${
                    entry.id === selectedNodePath[selectedNodePath.length - 1]?.id ? 'is-selected' : ''
                  }`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void onSelectNode(entry.id)
                  }}
                  type="button"
                >
                  {entry.name}
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        'No node selected'
      )}
    </div>
  )
}
