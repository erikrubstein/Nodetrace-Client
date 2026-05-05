import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import IconButton from './IconButton'
import { normalizeImageEdits, renderImageEditsToCanvas } from '../lib/image'

export default function FullscreenPreviewOverlay({
  open = false,
  onClose,
  selectedNode,
}) {
  const viewportRef = useRef(null)
  const renderCanvasRef = useRef(null)
  const sourceImageRef = useRef(null)
  const pendingInitialFitRef = useRef(false)
  const panRef = useRef(null)
  const viewportSizeRef = useRef({ width: 0, height: 0 })
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [imageReady, setImageReady] = useState(false)
  const imageUrl = selectedNode?.imageUrl || selectedNode?.previewUrl || ''
  const normalizedEdits = useMemo(() => normalizeImageEdits(selectedNode?.imageEdits), [selectedNode?.imageEdits])

  const fitView = useCallback(() => {
    const viewport = viewportRef.current
    const canvas = renderCanvasRef.current
    if (!viewport || !canvas || !canvas.width || !canvas.height) {
      setTransform({ x: 0, y: 0, scale: 1 })
      return
    }

    const padding = 32
    const availableWidth = Math.max(80, viewport.clientWidth - padding * 2)
    const availableHeight = Math.max(80, viewport.clientHeight - padding * 2)
    const scale = Math.max(0.1, Math.min(10, Math.min(availableWidth / canvas.width, availableHeight / canvas.height)))
    setTransform({
      scale,
      x: (viewport.clientWidth - canvas.width * scale) / 2,
      y: (viewport.clientHeight - canvas.height * scale) / 2,
    })
  }, [])

  useEffect(() => {
    if (!open || !imageUrl) {
      sourceImageRef.current = null
      if (renderCanvasRef.current) {
        renderCanvasRef.current.width = 0
        renderCanvasRef.current.height = 0
      }
      setImageReady(false)
      return undefined
    }

    let cancelled = false
    let objectUrl = null
    pendingInitialFitRef.current = true

    async function loadSourceImage() {
      try {
        setImageReady(false)
        const response = await fetch(imageUrl)
        if (!response.ok) {
          throw new Error('Unable to load the selected image.')
        }
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        const image = await new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = objectUrl
        })
        if (cancelled) {
          return
        }
        sourceImageRef.current = image
        setImageReady(true)
      } catch {
        if (!cancelled) {
          sourceImageRef.current = null
          setImageReady(false)
        }
      }
    }

    void loadSourceImage()

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [imageUrl, open])

  useLayoutEffect(() => {
    const canvas = renderCanvasRef.current
    const image = sourceImageRef.current
    if (!open || !canvas || !imageReady || !image) {
      return
    }
    renderImageEditsToCanvas(canvas, image, normalizedEdits, { maxDimension: 3200 })
    if (pendingInitialFitRef.current) {
      pendingInitialFitRef.current = false
      fitView()
    }
  }, [fitView, imageReady, normalizedEdits, open])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!open || !viewport) {
      return undefined
    }

    const syncViewportSize = (width, height) => {
      const previous = viewportSizeRef.current
      viewportSizeRef.current = { width, height }
      if (!previous.width || !previous.height || pendingInitialFitRef.current) {
        return
      }
      if (previous.width === width && previous.height === height) {
        return
      }
      const deltaX = (width - previous.width) / 2
      const deltaY = (height - previous.height) / 2
      setTransform((current) => ({
        ...current,
        x: current.x + deltaX,
        y: current.y + deltaY,
      }))
    }

    syncViewportSize(viewport.clientWidth, viewport.clientHeight)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      syncViewportSize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(viewport)
    return () => {
      observer.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerMove(event) {
      const panState = panRef.current
      if (!panState || panState.pointerId !== event.pointerId) {
        return
      }
      const dx = event.clientX - panState.startX
      const dy = event.clientY - panState.startY
      setTransform((current) => ({
        ...current,
        x: panState.originX + dx,
        y: panState.originY + dy,
      }))
    }

    function handlePointerUp(event) {
      if (!panRef.current || panRef.current.pointerId !== event.pointerId) {
        return
      }
      panRef.current = null
      viewportRef.current?.releasePointerCapture(event.pointerId)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [open])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!open || !viewport) {
      return undefined
    }

    const wheelListener = (event) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const factor = event.deltaY < 0 ? 1.08 : 0.92

      setTransform((current) => {
        const nextScale = Math.max(0.1, Math.min(10, current.scale * factor))
        const ratio = nextScale / current.scale
        return {
          scale: nextScale,
          x: cursorX - (cursorX - current.x) * ratio,
          y: cursorY - (cursorY - current.y) * ratio,
        }
      })
    }

    viewport.addEventListener('wheel', wheelListener, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', wheelListener)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open || !selectedNode || !imageUrl) {
    return null
  }

  return (
    <div
      className="fullscreen-preview-overlay"
      onClick={() => onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label={`Fullscreen preview for ${selectedNode.name}`}
    >
      <div
        className="fullscreen-preview-overlay__chrome"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fullscreen-preview-overlay__title">{selectedNode.name}</div>
        <div className="fullscreen-preview-overlay__meta">{Math.round(transform.scale * 100)}%</div>
        <IconButton
          className="tool-button preview-panel__tool-button fullscreen-preview-overlay__close"
          onClick={() => onClose?.()}
          tooltip="Close Preview"
          wrapperClassName="fullscreen-preview-overlay__close-wrap"
        >
          <i aria-hidden="true" className="fa-solid fa-xmark" />
        </IconButton>
      </div>
      <div
        ref={viewportRef}
        className="fullscreen-preview-overlay__viewport preview-viewport"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.preventDefault()
          fitView()
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !imageReady) {
            return
          }
          panRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: transform.x,
            originY: transform.y,
          }
          viewportRef.current?.setPointerCapture(event.pointerId)
        }}
      >
        {!imageReady ? (
          <div className="fullscreen-preview-overlay__loading" role="status" aria-label="Loading preview">
            <div className="fullscreen-preview-overlay__spinner" aria-hidden="true" />
          </div>
        ) : null}
        <div
          className="preview-stage"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          <canvas ref={renderCanvasRef} className="preview-stage__canvas" />
        </div>
      </div>
    </div>
  )
}
