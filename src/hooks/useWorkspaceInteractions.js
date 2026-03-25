import { useCallback, useEffect, useRef, useState } from 'react'
import { getContainedRect } from '../lib/image'
import { MIN_INSPECTOR_WIDTH, NODE_HEIGHT, NODE_WIDTH, SIDEBAR_RAIL_WIDTH } from '../lib/constants'
import { debugLog } from '../lib/debug'

export default function useWorkspaceInteractions({
  addToEffectiveSelection,
  cameraVisible,
  dragHoverNodeId,
  layout,
  moveDraggedNode,
  previewVisible,
  previewTransform,
  selectedCameraId,
  selectedNodeIds,
  selectedNode,
  setContextMenu,
  setCameraDevices,
  setCameraNotice,
  setCameraSelection,
  setDragHoverNodeId,
  setDragPreview,
  setEffectiveSelection,
  setLeftSidebarWidth,
  setPreviewTransform,
  setRightSidebarWidth,
  setSelectedCameraId,
  setTransform,
  transform,
  uploadFiles,
}) {
  const viewportRef = useRef(null)
  const previewViewportRef = useRef(null)
  const cameraViewportRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const panRef = useRef(null)
  const previewPanRef = useRef(null)
  const resizeRef = useRef(null)
  const nodeDragRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const cameraSelectRef = useRef(null)
  const cameraSelectionRef = useRef(null)
  const marqueeRef = useRef(null)
  const suppressCanvasContextMenuRef = useRef(false)
  const [canvasMarqueeRect, setCanvasMarqueeRect] = useState(null)

  function beginCanvasPointerDown(event) {
    if (
      event.button === 2 &&
      !event.target.closest('.graph-node') &&
      !event.target.closest('.canvas-tools') &&
      !event.target.closest('.canvas-caption') &&
      viewportRef.current
    ) {
      const rect = viewportRef.current.getBoundingClientRect()
      const startX = event.clientX - rect.left
      const startY = event.clientY - rect.top
      marqueeRef.current = {
        pointerId: event.pointerId,
        startX,
        startY,
        additive: event.shiftKey,
      }
      setCanvasMarqueeRect({ x: startX, y: startY, width: 0, height: 0 })
      setContextMenu(null)
      viewportRef.current.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }

    beginPan(event)
  }

  function handleCanvasContextMenu(event) {
    if (suppressCanvasContextMenuRef.current) {
      suppressCanvasContextMenuRef.current = false
      event.preventDefault()
      return
    }

    if (!event.target.closest('.graph-node')) {
      event.preventDefault()
      setContextMenu(null)
    }
  }

  function beginPan(event) {
    if (event.button !== 0) {
      return
    }

    if (event.target.closest('.graph-node img') || event.target.closest('.graph-node__meta')) {
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
  }

  function handleCanvasPointerMove(event) {
    const marqueeState = marqueeRef.current
    if (marqueeState && marqueeState.pointerId === event.pointerId) {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      const currentX = event.clientX - rect.left
      const currentY = event.clientY - rect.top
      setCanvasMarqueeRect({
        x: Math.min(marqueeState.startX, currentX),
        y: Math.min(marqueeState.startY, currentY),
        width: Math.abs(currentX - marqueeState.startX),
        height: Math.abs(currentY - marqueeState.startY),
      })
      return
    }

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

  function stopPanning(event) {
    if (panRef.current && panRef.current.pointerId === event.pointerId) {
      panRef.current = null
      viewportRef.current?.releasePointerCapture(event.pointerId)
    }
  }

  function beginPreviewPan(event) {
    if (event.button !== 0 || !selectedNode?.imageUrl) {
      return
    }

    previewPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewTransform.x,
      originY: previewTransform.y,
    }

    previewViewportRef.current?.setPointerCapture(event.pointerId)
  }

  function stopPreviewPan(event) {
    if (previewPanRef.current && previewPanRef.current.pointerId === event.pointerId) {
      previewPanRef.current = null
      previewViewportRef.current?.releasePointerCapture(event.pointerId)
    }
  }

  function beginNodeDrag(nodeId, event) {
    if (event.button !== 0) {
      return
    }

    event.stopPropagation()
    nodeDragRef.current = {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
  }

  function fitCanvasToView() {
    const viewport = viewportRef.current
    if (!viewport || !layout.width || !layout.height) {
      return
    }

    const rect = viewport.getBoundingClientRect()
    const padding = 48
    const availableWidth = Math.max(120, rect.width - padding * 2)
    const availableHeight = Math.max(120, rect.height - padding * 2)
    const scale = Math.max(
      0.2,
      Math.min(2.5, Math.min(availableWidth / layout.width, availableHeight / layout.height)),
    )
    const scaledWidth = layout.width * scale
    const scaledHeight = layout.height * scale

    setTransform({
      scale,
      x: (rect.width - scaledWidth) / 2,
      y: (rect.height - scaledHeight) / 2,
    })
  }

  function focusSelectedNode() {
    const viewport = viewportRef.current
    const selectedNodeId = selectedNode?.id
    if (!viewport || !selectedNodeId) {
      debugLog('focusSelectedNode aborted', {
        hasViewport: Boolean(viewport),
        selectedNodeId,
      })
      return
    }

    const rect = viewport.getBoundingClientRect()
    const nodeElement = viewport.querySelector(`[data-node-id="${selectedNodeId}"]`)
    const nodeRect = nodeElement?.getBoundingClientRect()
    if (!nodeRect) {
      debugLog('focusSelectedNode missing node rect', {
        selectedNodeId,
        nodeFound: Boolean(nodeElement),
      })
      return
    }

    const scale = 2
    const nodeCenterViewportX = nodeRect.left - rect.left + nodeRect.width / 2
    const nodeCenterViewportY = nodeRect.top - rect.top + nodeRect.height / 2
    const nodeCenterWorldX = (nodeCenterViewportX - transform.x) / Math.max(0.001, transform.scale)
    const nodeCenterWorldY = (nodeCenterViewportY - transform.y) / Math.max(0.001, transform.scale)

    const nextTransform = {
      scale,
      x: rect.width / 2 - nodeCenterWorldX * scale,
      y: rect.height / 2 - nodeCenterWorldY * scale,
    }
    debugLog('focusSelectedNode applying transform', {
      selectedNodeId,
      currentTransform: transform,
      nextTransform,
      viewportRect: { width: rect.width, height: rect.height },
      nodeRect: {
        left: nodeRect.left - rect.left,
        top: nodeRect.top - rect.top,
        width: nodeRect.width,
        height: nodeRect.height,
      },
    })
    setTransform(nextTransform)
  }

  function beginCameraSelection(event) {
    if (event.button !== 0 || !cameraVisible || !cameraViewportRef.current || !cameraVideoRef.current) {
      return
    }

    const containerRect = cameraViewportRef.current.getBoundingClientRect()
    const video = cameraVideoRef.current
    const videoRect = getContainedRect(
      containerRect.width,
      containerRect.height,
      video.videoWidth || containerRect.width,
      video.videoHeight || containerRect.height,
    )

    const startX = Math.min(Math.max(event.clientX - containerRect.left, videoRect.x), videoRect.x + videoRect.width)
    const startY = Math.min(Math.max(event.clientY - containerRect.top, videoRect.y), videoRect.y + videoRect.height)

    cameraSelectRef.current = {
      pointerId: event.pointerId,
      containerRect,
      videoRect,
      startX,
      startY,
    }
    const initialSelection = { x: startX, y: startY, width: 0, height: 0 }
    cameraSelectionRef.current = initialSelection
    setCameraSelection(initialSelection)
    cameraViewportRef.current.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const finishCameraSelection = useCallback(async (event) => {
    const selectState = cameraSelectRef.current
    if (!selectState || selectState.pointerId !== event.pointerId) {
      return
    }

    cameraSelectRef.current = null
    cameraViewportRef.current?.releasePointerCapture(event.pointerId)
    const selection = cameraSelectionRef.current
    cameraSelectionRef.current = null
    setCameraSelection(null)

    if (!selection || selection.width < 12 || selection.height < 12) {
      return
    }

    if (!selectedNode || selectedNode.isVariant) {
      setCameraNotice('Select a non-variant node before capturing.')
      return
    }

    const video = cameraVideoRef.current
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraNotice('Camera frame is not ready yet.')
      return
    }

    const videoRect = selectState.videoRect
    const cropX = Math.round(((selection.x - videoRect.x) / videoRect.width) * video.videoWidth)
    const cropY = Math.round(((selection.y - videoRect.y) / videoRect.height) * video.videoHeight)
    const cropWidth = Math.round((selection.width / videoRect.width) * video.videoWidth)
    const cropHeight = Math.round((selection.height / videoRect.height) * video.videoHeight)

    if (cropWidth < 4 || cropHeight < 4) {
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = cropWidth
    canvas.height = cropHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      setCameraNotice('Unable to capture the selected region.')
      return
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setCameraNotice('Uploading selection...')
    await uploadFiles([file], selectedNode.id, 'child')
    setCameraNotice('Selection added.')
  }, [selectedNode, setCameraNotice, setCameraSelection, uploadFiles])

  async function captureFullCameraFrame(mode = 'child') {
    const video = cameraVideoRef.current
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraNotice('Camera frame is not ready yet.')
      return
    }

    if (!selectedNode) {
      setCameraNotice(mode === 'variant' ? 'Select a node before capturing a variant.' : 'Select a non-variant node before capturing.')
      return
    }

    if (mode !== 'variant' && selectedNode.isVariant) {
      setCameraNotice('Select a non-variant node before capturing.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      setCameraNotice('Unable to capture the current frame.')
      return
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setCameraNotice(mode === 'variant' ? 'Uploading variant frame...' : 'Uploading full frame...')
    await uploadFiles([file], selectedNode.id, mode)
    setCameraNotice(mode === 'variant' ? 'Variant frame added.' : 'Full frame added.')
  }

  useEffect(() => {
    async function handleMove(nodeId, parentId, asVariant = false) {
      await moveDraggedNode(nodeId, parentId, asVariant)
    }

    function handlePointerMove(event) {
      const cameraSelectState = cameraSelectRef.current
      if (cameraSelectState && cameraSelectState.pointerId === event.pointerId) {
        const { containerRect, videoRect, startX, startY } = cameraSelectState
        const currentX = Math.min(
          Math.max(event.clientX - containerRect.left, videoRect.x),
          videoRect.x + videoRect.width,
        )
        const currentY = Math.min(
          Math.max(event.clientY - containerRect.top, videoRect.y),
          videoRect.y + videoRect.height,
        )
        const left = Math.min(startX, currentX)
        const top = Math.min(startY, currentY)
        const nextSelection = {
          x: left,
          y: top,
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        }
        cameraSelectionRef.current = nextSelection
        setCameraSelection(nextSelection)
        return
      }

      if (nodeDragRef.current) {
        const dragState = nodeDragRef.current
        const dx = event.clientX - dragState.startX
        const dy = event.clientY - dragState.startY

        if (!dragState.dragging && Math.hypot(dx, dy) > 6) {
          dragState.dragging = true
        }

        if (dragState.dragging) {
          const rect = viewportRef.current?.getBoundingClientRect()
          if (rect) {
            const worldX = (event.clientX - rect.left - transform.x) / transform.scale
            const worldY = (event.clientY - rect.top - transform.y) / transform.scale
            const hoverNode = layout.nodes.find((item) => {
              if (item.id === dragState.nodeId || item.node.type === 'collapsed-group') {
                return false
              }

              return (
                worldX >= item.x &&
                worldX <= item.x + NODE_WIDTH &&
                worldY >= item.y &&
                worldY <= item.y + NODE_HEIGHT
              )
            })

            setDragHoverNodeId(hoverNode?.id ?? null)
            setDragPreview({
              nodeId: dragState.nodeId,
              x: event.clientX - rect.left + 10,
              y: event.clientY - rect.top + 10,
            })
          }
        }

        return
      }

      const previewPanState = previewPanRef.current
      if (previewPanState && previewPanState.pointerId === event.pointerId) {
        const dx = event.clientX - previewPanState.startX
        const dy = event.clientY - previewPanState.startY
        setPreviewTransform((current) => ({
          ...current,
          x: previewPanState.originX + dx,
          y: previewPanState.originY + dy,
        }))
        return
      }

      if (!resizeRef.current) {
        return
      }

      if (resizeRef.current.target === 'left') {
        const nextWidth = Math.max(MIN_INSPECTOR_WIDTH, event.clientX - SIDEBAR_RAIL_WIDTH)
        setLeftSidebarWidth(nextWidth)
        return
      }

      const nextWidth = Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - event.clientX - SIDEBAR_RAIL_WIDTH)
      setRightSidebarWidth(nextWidth)
    }

    function handlePointerUp(event) {
      if (marqueeRef.current && marqueeRef.current.pointerId === event.pointerId) {
        const marqueeState = marqueeRef.current
        marqueeRef.current = null
        viewportRef.current?.releasePointerCapture(event.pointerId)
        const selectionRect = canvasMarqueeRect
        setCanvasMarqueeRect(null)
        suppressCanvasContextMenuRef.current = Boolean(selectionRect && (selectionRect.width > 3 || selectionRect.height > 3))

        if (selectionRect && (selectionRect.width > 3 || selectionRect.height > 3)) {
          const viewportRect = viewportRef.current?.getBoundingClientRect()
          if (viewportRect) {
            const selectedIds = layout.nodes
              .filter((item) => item.node.type !== 'collapsed-group')
              .filter((item) => {
                const nodeElement = viewportRef.current?.querySelector(`[data-node-id="${item.id}"]`)
                const nodeRect = nodeElement?.getBoundingClientRect()
                if (!nodeRect) {
                  return false
                }
                const left = nodeRect.left - viewportRect.left
                const top = nodeRect.top - viewportRect.top
                const right = left + nodeRect.width
                const bottom = top + nodeRect.height
                return (
                  right >= selectionRect.x &&
                  left <= selectionRect.x + selectionRect.width &&
                  bottom >= selectionRect.y &&
                  top <= selectionRect.y + selectionRect.height
                )
              })
              .map((item) => item.id)

            if (marqueeState.additive) {
              addToEffectiveSelection(selectedIds, selectedNodeIds[0] || selectedIds[0] || null)
            } else {
              setEffectiveSelection(selectedIds, selectedIds[0] || null)
            }
          }
        }
        return
      }

      if (nodeDragRef.current) {
        const dragState = nodeDragRef.current
        const targetNodeId = dragHoverNodeId
        nodeDragRef.current = null
        setDragPreview(null)
        setDragHoverNodeId(null)

        if (dragState.dragging && targetNodeId && targetNodeId !== dragState.nodeId) {
          void handleMove(dragState.nodeId, targetNodeId, event.shiftKey)
        }
      }

      previewPanRef.current = null
      if (cameraSelectRef.current && cameraSelectRef.current.pointerId === event.pointerId) {
        void finishCameraSelection(event)
      }
      resizeRef.current = null
      document.body.classList.remove('is-resizing')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [
    dragHoverNodeId,
    finishCameraSelection,
    layout.nodes,
    moveDraggedNode,
    addToEffectiveSelection,
    canvasMarqueeRect,
    selectedNodeIds,
    setEffectiveSelection,
    setCameraSelection,
    setDragHoverNodeId,
    setDragPreview,
    setLeftSidebarWidth,
    setPreviewTransform,
    setRightSidebarWidth,
    transform.scale,
    transform.x,
    transform.y,
  ])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) {
      return undefined
    }

    const wheelListener = (event) => {
      event.preventDefault()
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

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

    element.addEventListener('wheel', wheelListener, { passive: false })
    return () => {
      element.removeEventListener('wheel', wheelListener)
    }
  }, [layout.height, layout.width, setTransform])

  useEffect(() => {
    const element = previewViewportRef.current
    if (!element || !previewVisible) {
      return undefined
    }

    const wheelListener = (event) => {
      event.preventDefault()
      const rect = previewViewportRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const cursorX = event.clientX - rect.left
      const cursorY = event.clientY - rect.top
      const factor = event.deltaY < 0 ? 1.08 : 0.92

      setPreviewTransform((current) => {
        const nextScale = Math.max(0.1, Math.min(10, current.scale * factor))
        const ratio = nextScale / current.scale

        return {
          scale: nextScale,
          x: cursorX - (cursorX - current.x) * ratio,
          y: cursorY - (cursorY - current.y) * ratio,
        }
      })
    }

    element.addEventListener('wheel', wheelListener, { passive: false })
    return () => {
      element.removeEventListener('wheel', wheelListener)
    }
  }, [previewVisible, selectedNode?.imageUrl, setPreviewTransform])

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!cameraVisible) {
        setCameraSelection(null)
        setCameraNotice('')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraNotice('Camera access is not available in this browser. Use HTTPS or localhost.')
        return
      }

      try {
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((track) => track.stop())
          cameraStreamRef.current = null
        }

        setCameraNotice('Requesting camera permission...')
        const stream = await navigator.mediaDevices.getUserMedia(
          selectedCameraId
            ? { video: { deviceId: { exact: selectedCameraId } }, audio: false }
            : { video: true, audio: false },
        )
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        cameraStreamRef.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          await cameraVideoRef.current.play().catch(() => {})
        }

        const refreshedDevices = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) {
          const videoInputs = refreshedDevices.filter((device) => device.kind === 'videoinput')
          setCameraDevices(videoInputs)
          if (!selectedCameraId) {
            const activeTrack = stream.getVideoTracks()[0]
            const activeDeviceId = activeTrack?.getSettings?.().deviceId || videoInputs[0]?.deviceId || ''
            if (activeDeviceId) {
              setSelectedCameraId(activeDeviceId)
            }
          }
          setCameraNotice('Drag over the camera view to capture a crop.')
        }
      } catch (cameraError) {
        if (!cancelled) {
          setCameraNotice(cameraError.message || 'Unable to access the selected camera.')
        }
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop())
        cameraStreamRef.current = null
      }
    }
  }, [cameraVisible, selectedCameraId, setCameraDevices, setCameraNotice, setCameraSelection, setSelectedCameraId])

  return {
    beginCameraSelection,
    beginCanvasPointerDown,
    beginNodeDrag,
    beginPan,
    beginPreviewPan,
    canvasMarqueeRect,
    cameraVideoRef,
    cameraViewportRef,
    captureFullCameraFrame,
    handleCanvasContextMenu,
    focusSelectedNode,
    fitCanvasToView,
    handleCanvasPointerMove,
    previewViewportRef,
    resizeRef,
    stopPanning,
    stopPreviewPan,
    viewportRef,
  }
}
