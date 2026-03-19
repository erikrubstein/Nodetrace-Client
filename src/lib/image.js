export async function createPreviewFile(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = imageUrl
    })

    const maxDimension = 640
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) {
      return null
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'preview'
    return new File([blob], `${baseName}-preview.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export const defaultImageEdits = {
  crop: null,
  brightness: 0,
  contrast: 100,
  exposure: 0,
  sharpness: 0,
  denoise: 0,
  invert: false,
  rotationTurns: 0,
}

function clampEdit(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }
  return Math.max(min, Math.min(max, number))
}

export function normalizeImageEdits(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const cropInput = raw.crop && typeof raw.crop === 'object' ? raw.crop : null
  let crop = null
  if (cropInput) {
    const x = clampEdit(cropInput.x, 0, 1, 0)
    const y = clampEdit(cropInput.y, 0, 1, 0)
    const width = clampEdit(cropInput.width, 0, 1, 1)
    const height = clampEdit(cropInput.height, 0, 1, 1)
    if (width > 0 && height > 0) {
      crop = {
        x,
        y,
        width: Math.min(width, 1 - x),
        height: Math.min(height, 1 - y),
      }
    }
  }

  return {
    crop,
    brightness: clampEdit(raw.brightness, -100, 100, defaultImageEdits.brightness),
    contrast: clampEdit(raw.contrast, 0, 200, defaultImageEdits.contrast),
    exposure: clampEdit(raw.exposure, -100, 100, defaultImageEdits.exposure),
    sharpness: clampEdit(raw.sharpness, 0, 100, defaultImageEdits.sharpness),
    denoise: clampEdit(raw.denoise, 0, 100, defaultImageEdits.denoise),
    invert: Boolean(raw.invert),
    rotationTurns: ((Number.parseInt(raw.rotationTurns, 10) || 0) % 4 + 4) % 4,
  }
}

export function mapDisplayedCropToSourceCrop(displayCrop, rotationTurns) {
  const turns = ((Number.parseInt(rotationTurns, 10) || 0) % 4 + 4) % 4
  if (turns === 1) {
    return {
      x: displayCrop.y,
      y: 1 - displayCrop.x - displayCrop.width,
      width: displayCrop.height,
      height: displayCrop.width,
    }
  }
  if (turns === 2) {
    return {
      x: 1 - displayCrop.x - displayCrop.width,
      y: 1 - displayCrop.y - displayCrop.height,
      width: displayCrop.width,
      height: displayCrop.height,
    }
  }
  if (turns === 3) {
    return {
      x: 1 - displayCrop.y - displayCrop.height,
      y: displayCrop.x,
      width: displayCrop.height,
      height: displayCrop.width,
    }
  }
  return displayCrop
}

function clampColor(value) {
  return Math.max(0, Math.min(255, value))
}

function applyPixelAdjustments(imageData, edits) {
  const data = imageData.data
  const brightnessOffset = (edits.brightness / 100) * 255
  const contrastFactor = edits.contrast / 100
  const exposureFactor = 2 ** (edits.exposure / 50)

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index] * exposureFactor + brightnessOffset
    let green = data[index + 1] * exposureFactor + brightnessOffset
    let blue = data[index + 2] * exposureFactor + brightnessOffset

    red = (red - 128) * contrastFactor + 128
    green = (green - 128) * contrastFactor + 128
    blue = (blue - 128) * contrastFactor + 128

    if (edits.invert) {
      red = 255 - red
      green = 255 - green
      blue = 255 - blue
    }

    data[index] = clampColor(red)
    data[index + 1] = clampColor(green)
    data[index + 2] = clampColor(blue)
  }
}

function applySharpen(imageData, amount) {
  if (amount <= 0) {
    return imageData
  }

  const { width, height, data } = imageData
  const source = new Uint8ClampedArray(data)
  const strength = (amount / 100) * 1.2

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel] * (1 + 4 * strength)
        const left = source[index - 4 + channel] * strength
        const right = source[index + 4 + channel] * strength
        const top = source[index - width * 4 + channel] * strength
        const bottom = source[index + width * 4 + channel] * strength
        data[index + channel] = clampColor(center - left - right - top - bottom)
      }
    }
  }

  return imageData
}

export function renderImageEditsToCanvas(canvas, image, editsInput, options = {}) {
  const edits = normalizeImageEdits(editsInput)
  const crop = edits.crop || { x: 0, y: 0, width: 1, height: 1 }
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const cropX = Math.round(crop.x * sourceWidth)
  const cropY = Math.round(crop.y * sourceHeight)
  const cropWidth = Math.max(1, Math.round(crop.width * sourceWidth))
  const cropHeight = Math.max(1, Math.round(crop.height * sourceHeight))
  const maxDimension = Number(options.maxDimension) || 0
  const scale = maxDimension > 0 ? Math.min(1, maxDimension / Math.max(cropWidth, cropHeight)) : 1
  const baseWidth = Math.max(1, Math.round(cropWidth * scale))
  const baseHeight = Math.max(1, Math.round(cropHeight * scale))
  const rotationTurns = edits.rotationTurns || 0
  const outputWidth = rotationTurns % 2 === 0 ? baseWidth : baseHeight
  const outputHeight = rotationTurns % 2 === 0 ? baseHeight : baseWidth

  const workCanvas = document.createElement('canvas')
  workCanvas.width = baseWidth
  workCanvas.height = baseHeight
  const context = workCanvas.getContext('2d', { willReadFrequently: true })
  context.clearRect(0, 0, baseWidth, baseHeight)
  context.filter = edits.denoise > 0 ? `blur(${(edits.denoise / 100) * 2.2}px)` : 'none'
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, baseWidth, baseHeight)
  context.filter = 'none'

  const hasPixelWork =
    edits.brightness !== 0 ||
    edits.contrast !== 100 ||
    edits.exposure !== 0 ||
    edits.invert ||
    edits.sharpness > 0

  if (hasPixelWork) {
    const imageData = context.getImageData(0, 0, baseWidth, baseHeight)
    applyPixelAdjustments(imageData, edits)
    applySharpen(imageData, edits.sharpness)
    context.putImageData(imageData, 0, 0)
  }

  canvas.width = outputWidth
  canvas.height = outputHeight
  const outputContext = canvas.getContext('2d')
  outputContext.clearRect(0, 0, outputWidth, outputHeight)
  outputContext.save()
  if (rotationTurns === 1) {
    outputContext.translate(outputWidth, 0)
    outputContext.rotate(Math.PI / 2)
  } else if (rotationTurns === 2) {
    outputContext.translate(outputWidth, outputHeight)
    outputContext.rotate(Math.PI)
  } else if (rotationTurns === 3) {
    outputContext.translate(0, outputHeight)
    outputContext.rotate(-Math.PI / 2)
  }
  outputContext.drawImage(workCanvas, 0, 0)
  outputContext.restore()

  return {
    width: outputWidth,
    height: outputHeight,
  }
}

export function mimeTypeToExtension(mimeType) {
  if (mimeType === 'image/png') {
    return '.png'
  }
  if (mimeType === 'image/webp') {
    return '.webp'
  }
  if (mimeType === 'image/gif') {
    return '.gif'
  }
  return '.jpg'
}

export function getContainedRect(containerWidth, containerHeight, sourceWidth, sourceHeight) {
  if (!containerWidth || !containerHeight || !sourceWidth || !sourceHeight) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight }
  }

  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

export async function blobFromUrl(url) {
  if (!url) {
    return null
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Unable to load image data for undo.')
  }
  return response.blob()
}

