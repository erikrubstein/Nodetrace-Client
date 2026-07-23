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
  const [renderedSource, setRenderedSource] = useState('')
  const appearance = useMemo(() => normalizeFloorPlanAppearance(appearanceInput), [appearanceInput])
  const pixelAppearance = useMemo(() => ({
    backgroundColor: appearance.backgroundColor,
    inkColor: appearance.inkColor,
    inkMode: appearance.transparentWhite ? appearance.inkMode : 'original',
    transparentWhite: appearance.transparentWhite,
    whiteThreshold: appearance.whiteThreshold,
  }), [
    appearance.backgroundColor,
    appearance.inkColor,
    appearance.inkMode,
    appearance.transparentWhite,
    appearance.whiteThreshold,
  ])
  const treatmentEnabled = pixelAppearance.transparentWhite || pixelAppearance.inkMode !== 'original'
  const renderKey = useMemo(
    () => JSON.stringify([src, theme, pixelAppearance]),
    [pixelAppearance, src, theme],
  )
  const planBrightness = appearance.transparentWhite && appearance.inkMode === 'theme'
    ? appearance.themeBrightness / 100
    : 1

  useEffect(() => {
    if (!treatmentEnabled || !src) {
      setRenderFailed(false)
      setRenderedSource('')
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
        const visibleCanvas = canvasRef.current
        const renderCanvas = document.createElement('canvas')
        renderCanvas.width = width
        renderCanvas.height = height
        const context = renderCanvas.getContext('2d', { willReadFrequently: true })
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)

        const imageData = context.getImageData(0, 0, width, height)
        const pixels = imageData.data
        const computedThemeColor = getComputedStyle(visibleCanvas).color
        const tint = parseCanvasColor(pixelAppearance.inkMode === 'custom' ? pixelAppearance.inkColor : computedThemeColor)
        const background = parseCanvasColor(pixelAppearance.backgroundColor)
        const cutoffFeather = 12

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]

          if (pixelAppearance.transparentWhite) {
            const backgroundDistance = Math.max(
              Math.abs(red - background.red),
              Math.abs(green - background.green),
              Math.abs(blue - background.blue),
            )
            const backgroundSimilarity = 255 - backgroundDistance
            const opacity = Math.max(
              0,
              Math.min(1, (pixelAppearance.whiteThreshold - backgroundSimilarity) / cutoffFeather),
            )
            pixels[index + 3] = Math.round(pixels[index + 3] * opacity)
          }

          if (pixelAppearance.inkMode !== 'original' && pixels[index + 3] > 0) {
            if (pixelAppearance.transparentWhite) {
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
        if (cancelled || !canvasRef.current) {
          return
        }
        const nextCanvas = canvasRef.current
        nextCanvas.width = width
        nextCanvas.height = height
        const nextContext = nextCanvas.getContext('2d')
        nextContext.clearRect(0, 0, width, height)
        nextContext.drawImage(renderCanvas, 0, 0)
        setRenderFailed(false)
        setRenderedSource(src)
      } catch {
        if (!cancelled) {
          setRenderFailed(true)
          setRenderedSource('')
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
  }, [pixelAppearance, renderKey, src, theme, treatmentEnabled])

  if (!treatmentEnabled) {
    return <img alt={alt} className="floor-plan-stage__image" draggable="false" src={src} />
  }

  const renderReady = renderedSource === src
  if (renderFailed && !renderReady) {
    return <img alt={alt} className="floor-plan-stage__image" draggable="false" src={src} />
  }

  return (
    <canvas
      aria-label={alt}
      className={`floor-plan-stage__image floor-plan-stage__image--processed${renderReady ? ' is-ready' : ''}`}
      ref={canvasRef}
      role="img"
      style={{ '--floor-plan-brightness': planBrightness }}
    />
  )
}
