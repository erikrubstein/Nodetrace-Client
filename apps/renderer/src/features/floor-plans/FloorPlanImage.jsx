import { useEffect, useMemo, useRef, useState } from 'react'

import { normalizeFloorPlanAppearance } from './model'

const MAX_RENDER_DIMENSION = 4096

function parseCanvasColor(value) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = '#000000'
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return { red, green, blue }
}

export default function FloorPlanImage({ alt, appearance: appearanceInput, src, theme }) {
  const canvasRef = useRef(null)
  const [renderFailed, setRenderFailed] = useState(false)
  const [renderedKey, setRenderedKey] = useState('')
  const appearance = useMemo(() => normalizeFloorPlanAppearance(appearanceInput), [appearanceInput])
  const treatmentEnabled = appearance.transparentWhite || appearance.inkMode !== 'original'
  const renderKey = useMemo(() => JSON.stringify([src, theme, appearance]), [appearance, src, theme])

  useEffect(() => {
    if (!treatmentEnabled || !src) {
      setRenderFailed(false)
      setRenderedKey('')
      return undefined
    }

    let cancelled = false
    let objectUrl = ''

    async function renderPlan() {
      try {
        const response = await fetch(src, { credentials: 'same-origin' })
        if (!response.ok) {
          throw new Error('Unable to load floor plan image')
        }
        objectUrl = URL.createObjectURL(await response.blob())
        const image = await new Promise((resolve, reject) => {
          const nextImage = new Image()
          nextImage.onload = () => resolve(nextImage)
          nextImage.onerror = reject
          nextImage.src = objectUrl
        })
        if (cancelled || !canvasRef.current) {
          return
        }

        const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1)
        const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1)
        const renderScale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(naturalWidth, naturalHeight))
        const width = Math.max(1, Math.round(naturalWidth * renderScale))
        const height = Math.max(1, Math.round(naturalHeight * renderScale))
        const canvas = canvasRef.current
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)

        const imageData = context.getImageData(0, 0, width, height)
        const pixels = imageData.data
        const computedThemeColor = getComputedStyle(canvas).color
        const tint = parseCanvasColor(appearance.inkMode === 'custom' ? appearance.inkColor : computedThemeColor)
        const background = parseCanvasColor(appearance.backgroundColor)
        const cutoffFeather = 12

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]

          if (appearance.transparentWhite) {
            const backgroundDistance = Math.max(
              Math.abs(red - background.red),
              Math.abs(green - background.green),
              Math.abs(blue - background.blue),
            )
            const backgroundSimilarity = 255 - backgroundDistance
            const opacity = Math.max(
              0,
              Math.min(1, (appearance.whiteThreshold - backgroundSimilarity) / cutoffFeather),
            )
            pixels[index + 3] = Math.round(pixels[index + 3] * opacity)
          }

          if (appearance.inkMode !== 'original' && pixels[index + 3] > 0) {
            if (appearance.transparentWhite) {
              pixels[index] = tint.red
              pixels[index + 1] = tint.green
              pixels[index + 2] = tint.blue
            } else {
              const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
              const inkStrength = 1 - luminance / 255
              pixels[index] = Math.round(255 + (tint.red - 255) * inkStrength)
              pixels[index + 1] = Math.round(255 + (tint.green - 255) * inkStrength)
              pixels[index + 2] = Math.round(255 + (tint.blue - 255) * inkStrength)
            }
          }
        }

        context.clearRect(0, 0, width, height)
        context.putImageData(imageData, 0, 0)
        if (!cancelled) {
          setRenderFailed(false)
          setRenderedKey(renderKey)
        }
      } catch {
        if (!cancelled) {
          setRenderFailed(true)
          setRenderedKey('')
        }
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = ''
        }
      }
    }

    void renderPlan()
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [appearance, renderKey, src, theme, treatmentEnabled])

  if (!treatmentEnabled || renderFailed) {
    return <img alt={alt} className="floor-plan-stage__image" draggable="false" src={src} />
  }

  const renderReady = renderedKey === renderKey
  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className={`floor-plan-stage__image floor-plan-stage__image--fallback${renderReady ? ' is-hidden' : ''}`}
        draggable="false"
        src={src}
      />
      <canvas
        aria-label={alt}
        className={`floor-plan-stage__image floor-plan-stage__image--processed${renderReady ? ' is-ready' : ''}`}
        ref={canvasRef}
        role="img"
      />
    </>
  )
}
