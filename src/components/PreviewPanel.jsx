import { useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultImageEdits,
  mapDisplayedCropToSourceCrop,
  mimeTypeToExtension,
  normalizeImageEdits,
  renderImageEditsToCanvas,
} from '../lib/image'

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
  patchNodeImageEdits,
  previewTransform,
  previewViewportRef,
  resetPreviewTransform,
  selectedNode,
  setError,
  stopPreviewPan,
}) {
  const renderCanvasRef = useRef(null)
  const sourceImageRef = useRef(null)
  const cropGestureRef = useRef(null)
  const saveTimerRef = useRef(null)
  const saveSequenceRef = useRef(0)
  const [sourceMimeType, setSourceMimeType] = useState('image/jpeg')
  const [localEdits, setLocalEdits] = useState(defaultImageEdits)
  const [cropMode, setCropMode] = useState(false)
  const [cropSelection, setCropSelection] = useState(null)
  const [imageReady, setImageReady] = useState(false)

  const normalizedSelectedEdits = useMemo(
    () => normalizeImageEdits(selectedNode?.imageEdits),
    [selectedNode?.imageEdits],
  )
  const selectedEditSignature = useMemo(
    () => JSON.stringify(normalizedSelectedEdits),
    [normalizedSelectedEdits],
  )
  const localEditSignature = useMemo(() => JSON.stringify(normalizeImageEdits(localEdits)), [localEdits])
  const hasImage = Boolean(selectedNode?.imageUrl)
  const hasCrop = Boolean(localEdits.crop)
  const hasNonDefaultEdits = useMemo(
    () => localEditSignature !== JSON.stringify(defaultImageEdits),
    [localEditSignature],
  )

  useEffect(() => {
    let cancelled = false
    let objectUrl = null

    async function loadSourceImage() {
      if (!selectedNode?.imageUrl) {
        sourceImageRef.current = null
        setImageReady(false)
        setSourceMimeType('image/jpeg')
        return
      }

      setImageReady(false)
      try {
        const response = await fetch(selectedNode.imageUrl)
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
        setSourceMimeType(blob.type || 'image/jpeg')
        setImageReady(true)
      } catch (error) {
        if (!cancelled) {
          sourceImageRef.current = null
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
  }, [selectedNode?.imageUrl, setError])

  useEffect(() => {
    setLocalEdits(normalizedSelectedEdits)
    setCropMode(false)
    setCropSelection(null)
  }, [normalizedSelectedEdits, selectedNode?.id])

  useEffect(() => {
    const canvas = renderCanvasRef.current
    const image = sourceImageRef.current
    if (!canvas || !imageReady || !image) {
      return
    }
    renderImageEditsToCanvas(canvas, image, localEdits, { maxDimension: 1800 })
  }, [imageReady, localEdits])

  useEffect(() => {
    if (!selectedNode?.id || localEditSignature === selectedEditSignature) {
      return undefined
    }

    window.clearTimeout(saveTimerRef.current)
    const nextSequence = saveSequenceRef.current + 1
    saveSequenceRef.current = nextSequence
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await patchNodeImageEdits(selectedNode.id, localEdits)
      } catch (error) {
        if (saveSequenceRef.current === nextSequence) {
          setError(error.message || 'Unable to save image adjustments.')
        }
      }
    }, 220)

    return () => {
      window.clearTimeout(saveTimerRef.current)
    }
  }, [localEditSignature, localEdits, patchNodeImageEdits, selectedEditSignature, selectedNode?.id, setError])

  function updateEdit(key, value) {
    setLocalEdits((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function resetEdits() {
    setLocalEdits(defaultImageEdits)
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

  const toolButtons = [
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
      onClick: resetPreviewTransform,
    }),
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
      disabled: !hasImage || busy || !hasNonDefaultEdits,
      iconClassName: 'fa-solid fa-rotate-left',
      label: 'Reset Adjustments',
      onClick: resetEdits,
    }),
    tooltipButton({
      active: localEdits.invert,
      disabled: !hasImage || busy,
      iconClassName: 'fa-solid fa-circle-half-stroke',
      label: 'Invert Colors',
      onClick: () => updateEdit('invert', !localEdits.invert),
    }),
  ]

  return (
    <div className="preview-panel">
      <div className="preview-panel__actions">{toolButtons}</div>
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

          <div className="inspector__section field-stack">
            <div className="inspector__title">Adjustments</div>
            {cropMode ? <div className="preview-panel__hint">Drag over the preview to define a crop.</div> : null}
            {hasCrop && !cropMode ? <div className="preview-panel__hint">Crop applied. Use reset to revert.</div> : null}
            <label>
              <span className="preview-panel__control-header"><span>Brightness</span><strong>{localEdits.brightness}</strong></span>
              <input max="100" min="-100" type="range" value={localEdits.brightness} onChange={(event) => updateEdit('brightness', Number(event.target.value))} />
            </label>
            <label>
              <span className="preview-panel__control-header"><span>Contrast</span><strong>{localEdits.contrast}</strong></span>
              <input max="200" min="0" type="range" value={localEdits.contrast} onChange={(event) => updateEdit('contrast', Number(event.target.value))} />
            </label>
            <label>
              <span className="preview-panel__control-header"><span>Exposure</span><strong>{localEdits.exposure}</strong></span>
              <input max="100" min="-100" type="range" value={localEdits.exposure} onChange={(event) => updateEdit('exposure', Number(event.target.value))} />
            </label>
            <label>
              <span className="preview-panel__control-header"><span>Sharpness</span><strong>{localEdits.sharpness}</strong></span>
              <input max="100" min="0" type="range" value={localEdits.sharpness} onChange={(event) => updateEdit('sharpness', Number(event.target.value))} />
            </label>
            <label>
              <span className="preview-panel__control-header"><span>Denoise</span><strong>{localEdits.denoise}</strong></span>
              <input max="100" min="0" type="range" value={localEdits.denoise} onChange={(event) => updateEdit('denoise', Number(event.target.value))} />
            </label>
          </div>
        </>
      ) : (
        <div className="inspector__section">
          <div className="inspector__empty">Select a photo to preview the full-resolution image.</div>
        </div>
      )}
    </div>
  )
}
