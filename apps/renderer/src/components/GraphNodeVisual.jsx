import { useEffect, useMemo, useState } from 'react'

import { defaultImageEdits, normalizeImageEdits, renderImageEditsToCanvas } from '../lib/image'
import { FolderIcon } from './icons'

const editedPreviewCache = new Map()
const defaultImageEditsSignature = JSON.stringify(defaultImageEdits)

function EditedGraphNodeImage({ alt = '', className = '', edits, imageLoadRevision = 0, onError, onLoad, src }) {
  const normalizedEdits = useMemo(() => normalizeImageEdits(edits), [edits])
  const editSignature = useMemo(() => JSON.stringify(normalizedEdits), [normalizedEdits])
  const requiresEditedPreview = editSignature !== defaultImageEditsSignature
  const [renderedSrc, setRenderedSrc] = useState(() =>
    requiresEditedPreview ? editedPreviewCache.get(`${src}::${editSignature}`) || '' : src,
  )

  useEffect(() => {
    let cancelled = false

    if (!src) {
      setRenderedSrc('')
      return undefined
    }

    if (!requiresEditedPreview) {
      setRenderedSrc(src)
      return undefined
    }

    const cacheKey = `${src}::${editSignature}`
    const cachedPreview = editedPreviewCache.get(cacheKey)
    if (cachedPreview) {
      setRenderedSrc(cachedPreview)
      return undefined
    }

    setRenderedSrc('')

    async function renderEditedPreview() {
      try {
        const response = await fetch(src)
        if (!response.ok) {
          throw new Error('Unable to load node preview image.')
        }
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        try {
          const image = await new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = objectUrl
          })
          if (cancelled) {
            return
          }
          const canvas = document.createElement('canvas')
          renderImageEditsToCanvas(canvas, image, normalizedEdits, { maxDimension: 320 })
          const nextRenderedSrc = canvas.toDataURL('image/jpeg', 0.88)
          editedPreviewCache.set(cacheKey, nextRenderedSrc)
          if (!cancelled) {
            setRenderedSrc(nextRenderedSrc)
          }
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      } catch {
        if (!cancelled) {
          onError?.()
        }
      }
    }

    void renderEditedPreview()

    return () => {
      cancelled = true
    }
  }, [editSignature, normalizedEdits, onError, requiresEditedPreview, src])

  if (!renderedSrc) {
    return null
  }

  return (
    <img
      key={`${renderedSrc}-${imageLoadRevision}`}
      alt={alt}
      className={className}
      draggable="false"
      onError={onError}
      onLoad={onLoad}
      src={renderedSrc}
    />
  )
}

export default function GraphNodeVisual({
  imageLoadRevision = 0,
  loadedImages = {},
  markImageLoaded,
  node,
}) {
  const imageUrl = node.previewUrl || node.imageUrl

  return (
    <>
      <div className="graph-node__visual">
        {node.hiddenSiblingCount ? (
          <div className="graph-node__sibling-indicator">+{node.hiddenSiblingCount}</div>
        ) : null}
        {node.type === 'collapsed-group' ? (
          <div className="graph-node__collapsed-grid">
            {node.previewItems.map((preview) =>
              preview.imageUrl ? (
                <EditedGraphNodeImage
                  alt=""
                  className="graph-node__collapsed-thumb"
                  edits={preview.imageEdits}
                  imageLoadRevision={imageLoadRevision}
                  key={`${preview.id}-${imageLoadRevision}`}
                  onError={() => markImageLoaded?.(preview.imageUrl)}
                  onLoad={() => markImageLoaded?.(preview.imageUrl)}
                  src={preview.imageUrl}
                />
              ) : (
                <div key={preview.id} className="graph-node__collapsed-thumb graph-node__collapsed-placeholder">
                  <FolderIcon />
                </div>
              ),
            )}
          </div>
        ) : imageUrl ? (
          <>
            {!loadedImages[imageUrl] ? <div className="graph-node__spinner" aria-hidden="true" /> : null}
            <EditedGraphNodeImage
              alt={node.name}
              className={loadedImages[imageUrl] ? 'graph-node__image' : 'graph-node__image graph-node__image--loading'}
              edits={node.imageEdits}
              imageLoadRevision={imageLoadRevision}
              key={`${imageUrl}-${imageLoadRevision}`}
              onError={() => markImageLoaded?.(imageUrl)}
              onLoad={() => markImageLoaded?.(imageUrl)}
              src={imageUrl}
            />
          </>
        ) : (
          <div className="graph-node__placeholder">
            <FolderIcon />
          </div>
        )}
      </div>
      <div className="graph-node__meta">
        <span>{node.name}</span>
      </div>
    </>
  )
}
