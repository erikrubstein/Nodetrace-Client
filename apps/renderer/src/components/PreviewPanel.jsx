import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  defaultImageEdits,
  mapDisplayedCropToSourceCrop,
  mimeTypeToExtension,
  normalizeImageEdits,
  renderImageEditsToCanvas,
} from '../lib/image'
import ImageAdjustmentControls from './ImageAdjustmentControls'

function tooltipButton({ active = false, disabled = false, iconClassName, label, onClick }) {
  return (
    <span className="icon-button-wrap" key={label}>
      <button
        aria-label={label}
        className={`tool-button preview-panel__tool-button ${active ? 'is-active' : ''}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <i aria-hidden="true" className={iconClassName} />
      </button>
      <span aria-hidden="true" className="icon-tooltip">
        {label}
      </span>
    </span>
  )
}

export default function PreviewPanel({
  beginPreviewPan,
  busy,
  extractNodeMediaToChild,
  patchNodeMediaEdits,
  previewTransform,
  previewViewportRef,
  removeNodeMedia,
  setPrimaryMedia,
  setPreviewTransform,
  selectedNode,
  setError,
  stopPreviewPan,
}) {
  const renderCanvasRef = useRef(null)
  const sourceImageRef = useRef(null)
  const sourceImageNodeIdRef = useRef(null)
  const cropGestureRef = useRef(null)
  const pendingInitialFitRef = useRef(false)
  const pendingFitAfterCropRef = useRef(false)
  const saveTimerRef = useRef(null)
  const saveSequenceRef = useRef(0)
  const viewportResizeTimerRef = useRef(null)
  const syncedNodeIdRef = useRef(null)
  const syncedEditSignatureRef = useRef(JSON.stringify(defaultImageEdits))
  const viewportSizeRef = useRef({ width: 0, height: 0 })
  const [sourceMimeType, setSourceMimeType] = useState('image/jpeg')
  const [localEdits, setLocalEdits] = useState(defaultImageEdits)
  const [activeMediaId, setActiveMediaId] = useState(null)
  const [cropMode, setCropMode] = useState(false)
  const [cropSelection, setCropSelection] = useState(null)
  const [imageReady, setImageReady] = useState(false)
  const mediaItems = useMemo(() => selectedNode?.media || [], [selectedNode?.media])
  const selectedMedia = useMemo(
    () => mediaItems.find((item) => item.id === activeMediaId) || mediaItems[0] || null,
    [activeMediaId, mediaItems],
  )

  useEffect(() => {
    const preferredMediaId = selectedNode?.primaryMediaId || mediaItems[0]?.id || null
    setActiveMediaId((current) => {
      if (current && mediaItems.some((item) => item.id === current)) {
        return current
      }
      return preferredMediaId
    })
  }, [mediaItems, selectedNode?.primaryMediaId])

  const normalizedSelectedEdits = useMemo(
    () => normalizeImageEdits(selectedMedia?.imageEdits),
    [selectedMedia?.imageEdits],
  )
  const selectedEditSignature = useMemo(
    () => JSON.stringify(normalizedSelectedEdits),
    [normalizedSelectedEdits],
  )
  const localEditSignature = useMemo(() => JSON.stringify(normalizeImageEdits(localEdits)), [localEdits])
  const hasImage = Boolean(selectedMedia?.imageUrl)
  const hasCrop = Boolean(localEdits.crop)
  const hasAdjustmentChanges = useMemo(
    () =>
      localEdits.brightness !== defaultImageEdits.brightness ||
      localEdits.contrast !== defaultImageEdits.contrast ||
      localEdits.exposure !== defaultImageEdits.exposure ||
      localEdits.sharpness !== defaultImageEdits.sharpness ||
      localEdits.denoise !== defaultImageEdits.denoise ||
      localEdits.invert !== defaultImageEdits.invert ||
      localEdits.rotationTurns !== defaultImageEdits.rotationTurns,
    [localEdits],
  )

  useEffect(() => {
    let cancelled = false
    let objectUrl = null

    async function loadSourceImage() {
      if (!selectedMedia?.imageUrl) {
        sourceImageRef.current = null
        sourceImageNodeIdRef.current = null
        if (renderCanvasRef.current) {
          renderCanvasRef.current.width = 0
          renderCanvasRef.current.height = 0
        }
        setImageReady(false)
        setSourceMimeType('image/jpeg')
        return
      }

      setImageReady(false)
      try {
        const response = await fetch(selectedMedia.imageUrl)
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
        sourceImageNodeIdRef.current = `${selectedNode.id}:${selectedMedia.id}`
        setSourceMimeType(blob.type || 'image/jpeg')
        setImageReady(true)
      } catch (error) {
        if (!cancelled) {
          sourceImageRef.current = null
          sourceImageNodeIdRef.current = null
          setImageReady(false)
          setError(error.message || 'Unable to load the selected image.')
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
  }, [selectedMedia?.id, selectedMedia?.imageUrl, selectedNode?.id, setError])

  useEffect(() => {
    const nextNodeId = selectedMedia ? `${selectedNode?.id}:${selectedMedia.id}` : selectedNode?.id ?? null
    const nodeChanged = syncedNodeIdRef.current !== nextNodeId
    const serverChanged = syncedEditSignatureRef.current !== selectedEditSignature
    const localMatchesPreviousServer = localEditSignature === syncedEditSignatureRef.current
    const localMatchesCurrentServer = localEditSignature === selectedEditSignature

    if (nodeChanged) {
      syncedNodeIdRef.current = nextNodeId
      syncedEditSignatureRef.current = selectedEditSignature
      setLocalEdits(normalizedSelectedEdits)
      setCropMode(false)
      setCropSelection(null)
      pendingInitialFitRef.current = true
      return
    }

    if (!serverChanged) {
      return
    }

    if (localMatchesCurrentServer) {
      syncedEditSignatureRef.current = selectedEditSignature
      return
    }

    if (localMatchesPreviousServer) {
      syncedEditSignatureRef.current = selectedEditSignature
      setLocalEdits(normalizedSelectedEdits)
      setCropMode(false)
      setCropSelection(null)
    }
  }, [localEditSignature, normalizedSelectedEdits, selectedEditSignature, selectedMedia, selectedMedia?.id, selectedNode?.id])

  useEffect(() => {
    if (!selectedNode?.id || !selectedMedia?.id || localEditSignature === selectedEditSignature) {
      return undefined
    }

    window.clearTimeout(saveTimerRef.current)
    const nextSequence = saveSequenceRef.current + 1
    saveSequenceRef.current = nextSequence
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await patchNodeMediaEdits(selectedNode.id, selectedMedia.id, localEdits)
      } catch (error) {
        if (saveSequenceRef.current === nextSequence) {
          setError(error.message || 'Unable to save image adjustments.')
        }
      }
    }, 220)

    return () => {
      window.clearTimeout(saveTimerRef.current)
    }
  }, [localEditSignature, localEdits, patchNodeMediaEdits, selectedEditSignature, selectedMedia?.id, selectedNode?.id, setError])

  function updateEdit(key, value) {
    setLocalEdits((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const fitPreviewView = useCallback(() => {
    const viewport = previewViewportRef.current
    const canvas = renderCanvasRef.current
    if (!viewport || !canvas || !canvas.width || !canvas.height) {
      setPreviewTransform({ x: 0, y: 0, scale: 1 })
      return
    }

    const padding = 12
    const availableWidth = Math.max(40, viewport.clientWidth - padding * 2)
    const availableHeight = Math.max(40, viewport.clientHeight - padding * 2)
    const scale = Math.max(0.1, Math.min(10, Math.min(availableWidth / canvas.width, availableHeight / canvas.height)))
    setPreviewTransform({
      scale,
      x: (viewport.clientWidth - canvas.width * scale) / 2,
      y: (viewport.clientHeight - canvas.height * scale) / 2,
    })
  }, [previewViewportRef, setPreviewTransform])

  function resetAdjustments() {
    setLocalEdits((current) => ({
      ...current,
      brightness: defaultImageEdits.brightness,
      contrast: defaultImageEdits.contrast,
      exposure: defaultImageEdits.exposure,
      sharpness: defaultImageEdits.sharpness,
      denoise: defaultImageEdits.denoise,
      invert: defaultImageEdits.invert,
      rotationTurns: defaultImageEdits.rotationTurns,
    }))
    setCropMode(false)
    setCropSelection(null)
  }

  useLayoutEffect(() => {
    const canvas = renderCanvasRef.current
    const image = sourceImageRef.current
    if (!canvas || !imageReady || !image || sourceImageNodeIdRef.current !== `${selectedNode?.id}:${selectedMedia?.id}`) {
      return
    }
    renderImageEditsToCanvas(canvas, image, localEdits, { maxDimension: 1800 })
    if (pendingFitAfterCropRef.current) {
      pendingFitAfterCropRef.current = false
      fitPreviewView()
    } else if (pendingInitialFitRef.current) {
      pendingInitialFitRef.current = false
      fitPreviewView()
    }
  }, [fitPreviewView, imageReady, localEdits, selectedMedia?.id, selectedNode?.id])

  useLayoutEffect(() => {
    const viewport = previewViewportRef.current
    if (!viewport) {
      return undefined
    }

    const syncViewportSize = (width, height) => {
      const previous = viewportSizeRef.current
      if (!previous.width || !previous.height) {
        viewportSizeRef.current = { width, height }
        return
      }

      if (previous.width === width && previous.height === height) {
        return
      }

      const deltaX = (width - previous.width) / 2
      const deltaY = (height - previous.height) / 2
      viewportSizeRef.current = { width, height }

      setPreviewTransform((current) => ({
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
      window.clearTimeout(viewportResizeTimerRef.current)
      viewportResizeTimerRef.current = window.setTimeout(() => {
        syncViewportSize(entry.contentRect.width, entry.contentRect.height)
      }, 40)
    })

    observer.observe(viewport)
    return () => {
      observer.disconnect()
      window.clearTimeout(viewportResizeTimerRef.current)
    }
  }, [previewViewportRef, setPreviewTransform])

  function resetCrop() {
    setLocalEdits((current) => ({
      ...current,
      crop: null,
    }))
    pendingFitAfterCropRef.current = true
    setCropMode(false)
    setCropSelection(null)
  }

  function beginCropSelection(event) {
    const canvasRect = renderCanvasRef.current?.getBoundingClientRect()
    const viewportRect = previewViewportRef.current?.getBoundingClientRect()
    if (!canvasRect || !viewportRect) {
      return false
    }

    if (
      event.clientX < canvasRect.left ||
      event.clientX > canvasRect.right ||
      event.clientY < canvasRect.top ||
      event.clientY > canvasRect.bottom
    ) {
      return false
    }

    const startX = Math.max(canvasRect.left, Math.min(event.clientX, canvasRect.right))
    const startY = Math.max(canvasRect.top, Math.min(event.clientY, canvasRect.bottom))
    cropGestureRef.current = {
      pointerId: event.pointerId,
      canvasRect,
      viewportRect,
      startX,
      startY,
      selection: null,
    }
    const nextSelection = {
      x: startX - viewportRect.left,
      y: startY - viewportRect.top,
      width: 0,
      height: 0,
    }
    cropGestureRef.current.selection = nextSelection
    setCropSelection(nextSelection)
    previewViewportRef.current?.setPointerCapture(event.pointerId)
    return true
  }

  function handlePointerDown(event) {
    if (cropMode && imageReady) {
      const startedCrop = beginCropSelection(event)
      if (startedCrop) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }
    beginPreviewPan(event)
  }

  function handlePointerMove(event) {
    const cropGesture = cropGestureRef.current
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return
    }

    const currentX = Math.max(cropGesture.canvasRect.left, Math.min(event.clientX, cropGesture.canvasRect.right))
    const currentY = Math.max(cropGesture.canvasRect.top, Math.min(event.clientY, cropGesture.canvasRect.bottom))
    const left = Math.min(cropGesture.startX, currentX)
    const top = Math.min(cropGesture.startY, currentY)
    const nextSelection = {
      x: left - cropGesture.viewportRect.left,
      y: top - cropGesture.viewportRect.top,
      width: Math.abs(currentX - cropGesture.startX),
      height: Math.abs(currentY - cropGesture.startY),
    }
    cropGesture.selection = nextSelection
    setCropSelection(nextSelection)
  }

  function finishCropSelection(event, cancelled = false) {
    const cropGesture = cropGestureRef.current
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return false
    }

    cropGestureRef.current = null
    previewViewportRef.current?.releasePointerCapture(event.pointerId)
    const selection = cropGesture.selection || cropSelection
    setCropSelection(null)

    if (cancelled || !selection || selection.width < 8 || selection.height < 8) {
      return true
    }

    setLocalEdits((current) => ({
      ...current,
      crop: mapDisplayedCropToSourceCrop(
        {
          x:
            selection.x / cropGesture.canvasRect.width -
            (cropGesture.canvasRect.left - cropGesture.viewportRect.left) / cropGesture.canvasRect.width,
          y:
            selection.y / cropGesture.canvasRect.height -
            (cropGesture.canvasRect.top - cropGesture.viewportRect.top) / cropGesture.canvasRect.height,
          width: selection.width / cropGesture.canvasRect.width,
          height: selection.height / cropGesture.canvasRect.height,
        },
        current.rotationTurns,
      ),
    }))
    pendingFitAfterCropRef.current = true
    setCropMode(false)
    return true
  }

  function handlePointerUp(event) {
    if (finishCropSelection(event)) {
      return
    }
    stopPreviewPan(event)
  }

  function handlePointerCancel(event) {
    if (finishCropSelection(event, true)) {
      return
    }
    stopPreviewPan(event)
  }

  async function createEditedBlob() {
    const image = sourceImageRef.current
    if (!image) {
      throw new Error('No image is loaded.')
    }
    const canvas = document.createElement('canvas')
    renderImageEditsToCanvas(canvas, image, localEdits)
    const preferredType = ['image/jpeg', 'image/png', 'image/webp'].includes(sourceMimeType) ? sourceMimeType : 'image/png'
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, preferredType, preferredType === 'image/jpeg' || preferredType === 'image/webp' ? 0.95 : undefined),
    )
    if (blob) {
      return blob
    }
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) {
      throw new Error('Unable to render the edited image.')
    }
    return pngBlob
  }

  async function handleDownload() {
    try {
      const blob = await createEditedBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedNode?.name || 'image'}${mimeTypeToExtension(blob.type || sourceMimeType)}`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setError(error.message)
    }
  }

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Image copy is not supported in this browser.')
      }
      const blob = await createEditedBlob()
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
      } catch {
        const canvas = document.createElement('canvas')
        renderImageEditsToCanvas(canvas, sourceImageRef.current, localEdits)
        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!pngBlob) {
          throw new Error('Unable to convert image for clipboard copy.')
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      }
    } catch (error) {
      setError(error.message)
    }
  }

  const actionGroups = [
    {
      label: 'File',
      actions: [
        tooltipButton({
          disabled: !hasImage || busy || !imageReady,
          iconClassName: 'fa-solid fa-download',
          label: 'Download Image',
          onClick: handleDownload,
        }),
        tooltipButton({
          disabled: !hasImage || busy || !imageReady,
          iconClassName: 'fa-solid fa-copy',
          label: 'Copy Image',
          onClick: handleCopy,
        }),
        tooltipButton({
          disabled: !hasImage,
          iconClassName: 'fa-solid fa-expand',
          label: 'Fit View',
          onClick: fitPreviewView,
        }),
      ],
    },
    {
      label: 'Adjust',
      actions: [
        tooltipButton({
          disabled: !hasImage || busy,
          iconClassName: 'fa-solid fa-rotate-right',
          label: 'Rotate 90 Degrees',
          onClick: () => updateEdit('rotationTurns', (localEdits.rotationTurns + 1) % 4),
        }),
        tooltipButton({
          active: cropMode,
          disabled: !hasImage || busy || !imageReady,
          iconClassName: 'fa-solid fa-crop-simple',
          label: cropMode ? 'Crop Mode Active' : 'Crop Image',
          onClick: () => {
            setCropMode((current) => !current)
            setCropSelection(null)
          },
        }),
        tooltipButton({
          disabled: !hasImage || busy || !hasCrop,
          iconClassName: 'fa-solid fa-eraser',
          label: 'Reset Crop',
          onClick: resetCrop,
        }),
        tooltipButton({
          active: localEdits.invert,
          disabled: !hasImage || busy,
          iconClassName: 'fa-solid fa-circle-half-stroke',
          label: 'Invert Colors',
          onClick: () => updateEdit('invert', !localEdits.invert),
        }),
        tooltipButton({
          disabled: !hasImage || busy || !hasAdjustmentChanges,
          iconClassName: 'fa-solid fa-sliders',
          label: 'Reset Adjustments',
          onClick: resetAdjustments,
        }),
      ],
    },
    {
      label: 'Photo',
      actions: [
        tooltipButton({
          disabled: !hasImage || busy || selectedMedia?.isPrimary,
          iconClassName: 'fa-solid fa-star',
          label: 'Make Main Photo',
          onClick: async () => {
            try {
              await setPrimaryMedia(selectedNode.id, selectedMedia.id)
            } catch (error) {
              setError(error.message || 'Unable to update the main photo.')
            }
          },
        }),
        tooltipButton({
          disabled: !hasImage || busy,
          iconClassName: 'fa-solid fa-turn-down',
          label: 'Convert Photo To Child Node',
          onClick: async () => {
            try {
              await extractNodeMediaToChild(selectedNode.id, selectedMedia.id)
            } catch (error) {
              setError(error.message || 'Unable to convert the selected photo into a child node.')
            }
          },
        }),
        tooltipButton({
          disabled: !hasImage || busy,
          iconClassName: 'fa-solid fa-trash',
          label: 'Remove Photo',
          onClick: async () => {
            try {
              await removeNodeMedia(selectedNode.id, selectedMedia.id)
            } catch (error) {
              setError(error.message || 'Unable to remove the selected photo.')
            }
          },
        }),
      ],
    },
  ]

  return (
    <div className="preview-panel">
      <div className="preview-panel__actions">
        {actionGroups.map((group) => (
          <div key={group.label} className="preview-panel__action-group">
            <div className="preview-panel__action-label">{group.label}</div>
            <div className="preview-panel__action-buttons">{group.actions}</div>
          </div>
        ))}
      </div>
      {mediaItems.length > 1 ? (
        <div className="preview-panel__media-strip">
          {mediaItems.map((mediaItem) => (
            <button
              key={mediaItem.id}
              className={`preview-panel__media-thumb ${mediaItem.id === selectedMedia?.id ? 'is-active' : ''}`}
              onClick={() => setActiveMediaId(mediaItem.id)}
              type="button"
            >
              {mediaItem.previewUrl || mediaItem.imageUrl ? (
                <img alt="" src={mediaItem.previewUrl || mediaItem.imageUrl} />
              ) : (
                <span>{mediaItem.isPrimary ? 'Main' : 'Photo'}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      {hasImage ? (
        <>
          <div
            ref={previewViewportRef}
            className={`preview-viewport ${cropMode ? 'preview-viewport--crop' : ''}`}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              className="preview-stage"
              style={{
                transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.scale})`,
              }}
            >
              <canvas ref={renderCanvasRef} className="preview-stage__canvas" />
            </div>
            {cropSelection ? (
              <div
                className="preview-crop-selection"
                style={{
                  left: cropSelection.x,
                  top: cropSelection.y,
                  width: cropSelection.width,
                  height: cropSelection.height,
                }}
              />
            ) : null}
          </div>

          <ImageAdjustmentControls
            edits={localEdits}
            onChange={setLocalEdits}
          />
        </>
      ) : (
        <div className="inspector__section">
          <div className="inspector__empty">Select a node with a photo to preview the full-resolution image.</div>
        </div>
      )}
    </div>
  )
}
