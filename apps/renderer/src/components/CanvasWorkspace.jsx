import { useLayoutEffect, useRef, useState } from 'react'

import IconButton from './IconButton'
import { AddFolderIcon, AddPhotoIcon, AddVariantIcon, EyeLowVisionIcon, FitViewIcon, FocusNodeIcon, FolderIcon, GridIcon, RootNodeIcon } from './icons'

export default function CanvasWorkspace({
  beginNodeDrag,
  beginCanvasPointerDown,
  busy,
  canvasMarqueeRect,
  contextMenu,
  contextMenuNode,
  dragActive,
  dragHoverNodeId,
  dragPreview,
  editForm,
  editTargetNode,
  fileInputRef,
  focusSelectedNode,
  fitCanvasToView,
  focusPathMode,
  handleCanvasContextMenu,
  handleCanvasPointerMove,
  hideNonResultNodes,
  layout,
  loadedImages,
  markImageLoaded,
  multiSelectedNodeIds,
  openNewFolderDialog,
  projectSettings,
  remoteSelectionsByNodeId,
  searchResultNodeIds,
  selectRootNode,
  selectedNodePath,
  selectNodeFromPath,
  saveNodeDraft,
  selectedNode,
  selectedNodeId,
  setCollapsed,
  setContextMenu,
  setDeleteNodeOpen,
  setDragActive,
  setPendingUploadMode,
  setPendingUploadParentId,
  setEffectiveSelection,
  showGrid,
  stopPanning,
  toggleHideNonResults,
  toggleGrid,
  toggleMultiSelection,
  triggerAddPhoto,
  triggerAddPhotoNode,
  transform,
  tree,
  uploadFiles,
  viewportRef,
}) {
  const searchResultNodeIdSet = hideNonResultNodes ? new Set(searchResultNodeIds || []) : null
  const pathContainerRef = useRef(null)
  const pathMeasureRef = useRef(null)
  const [visiblePathStart, setVisiblePathStart] = useState(0)

  useLayoutEffect(() => {
    function recomputeVisiblePath() {
      const container = pathContainerRef.current
      const measurer = pathMeasureRef.current
      if (!container || !measurer || !selectedNodePath?.length) {
        setVisiblePathStart(0)
        return
      }

      const segmentWidths = Array.from(measurer.querySelectorAll('[data-path-segment="true"]')).map((element) =>
        Math.ceil(element.getBoundingClientRect().width),
      )
      const ellipsisWidth = Math.ceil(
        measurer.querySelector('[data-path-ellipsis="true"]')?.getBoundingClientRect().width || 0,
      )
      const availableWidth = Math.floor(container.parentElement?.getBoundingClientRect().width || 0)

      if (!segmentWidths.length || availableWidth <= 0) {
        setVisiblePathStart(0)
        return
      }

      let startIndex = segmentWidths.length - 1
      let usedWidth = segmentWidths[startIndex] || 0
      while (startIndex > 0 && usedWidth + segmentWidths[startIndex - 1] <= availableWidth) {
        startIndex -= 1
        usedWidth += segmentWidths[startIndex]
      }

      if (startIndex > 0) {
        while (startIndex < segmentWidths.length - 1 && usedWidth + ellipsisWidth > availableWidth) {
          usedWidth -= segmentWidths[startIndex]
          startIndex += 1
        }
      }

      setVisiblePathStart(startIndex)
    }

    recomputeVisiblePath()
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && pathContainerRef.current
        ? new ResizeObserver(() => recomputeVisiblePath())
        : null
    if (resizeObserver && pathContainerRef.current) {
      resizeObserver.observe(pathContainerRef.current)
    }
    window.addEventListener('resize', recomputeVisiblePath)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', recomputeVisiblePath)
    }
  }, [selectedNodeId, selectedNodePath])

  const visiblePath = selectedNodePath.slice(visiblePathStart)
  const showLeadingEllipsis = visiblePathStart > 0

  return (
    <section
      ref={viewportRef}
      className={`canvas-viewport ${dragActive ? 'drag-active' : ''} ${showGrid ? '' : 'canvas-viewport--no-grid'}`.trim()}
      onContextMenu={handleCanvasContextMenu}
      onDragEnter={(event) => {
        event.preventDefault()
        if (event.dataTransfer.types.includes('Files')) {
          setDragActive(true)
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragActive(false)
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (event.dataTransfer.types.includes('Files')) {
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={async (event) => {
        event.preventDefault()
        setDragActive(false)
        await uploadFiles(Array.from(event.dataTransfer.files || []))
      }}
      onPointerDown={beginCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      <div className="canvas-tools">
        <IconButton
          aria-label="Fit view"
          className="canvas-tool-button"
          disabled={busy}
          onClick={fitCanvasToView}
          tooltip="Fit View"
        >
          <FitViewIcon />
        </IconButton>
        <IconButton
          aria-label="Focus selected node"
          className="canvas-tool-button"
          disabled={!selectedNode || busy}
          onClick={focusSelectedNode}
          tooltip="Focus Selected"
        >
          <FocusNodeIcon />
        </IconButton>
        <IconButton
          aria-label="Select root node"
          className="canvas-tool-button"
          disabled={!tree?.root || busy}
          onClick={selectRootNode}
          tooltip="Select Root"
        >
          <RootNodeIcon />
        </IconButton>
        <IconButton
          aria-label="Add node"
          className="canvas-tool-button"
          disabled={!selectedNode || busy}
          onClick={() => openNewFolderDialog()}
          tooltip="Add Node"
        >
          <AddFolderIcon />
        </IconButton>
        <IconButton
          aria-label="Add photo node"
          className="canvas-tool-button"
          disabled={!selectedNode || busy}
          onClick={triggerAddPhotoNode}
          tooltip="Add Photo Node"
        >
          <AddPhotoIcon />
        </IconButton>
        <IconButton
          aria-label="Add photo"
          className="canvas-tool-button"
          disabled={!selectedNode || busy}
          onClick={triggerAddPhoto}
          tooltip="Add Photo"
        >
          <AddVariantIcon />
        </IconButton>
      </div>
      <div className="canvas-tools canvas-tools--right">
        <IconButton
          aria-label={showGrid ? 'Hide dot grid' : 'Show dot grid'}
          className="canvas-tool-button"
          onClick={toggleGrid}
          tooltip={showGrid ? 'Hide Grid' : 'Show Grid'}
        >
          <GridIcon />
        </IconButton>
        <IconButton
          aria-label={hideNonResultNodes ? 'Show all nodes' : 'Show search results only'}
          className={`canvas-tool-button ${hideNonResultNodes ? 'is-active' : ''}`}
          disabled={!searchResultNodeIds?.length && !hideNonResultNodes}
          onClick={toggleHideNonResults}
          tooltip={hideNonResultNodes ? 'Show All Nodes' : 'Show Results Only'}
        >
          <EyeLowVisionIcon />
        </IconButton>
      </div>
      <div
        className="canvas-stage"
        style={{
          width: `${layout.width}px`,
          height: `${layout.height}px`,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        <svg className="canvas-links" width={layout.width} height={layout.height}>
          {layout.links.map((link) => (
            <line
              key={link.key}
              className={`${link.dashed ? 'canvas-link--variant ' : ''}${
                link.sourceId === selectedNodeId ? 'canvas-link--selected' : ''
              }`.trim()}
              strokeDasharray={link.dashed ? '6 5' : undefined}
              x1={link.x1}
              x2={link.x2}
              y1={link.y1}
              y2={link.y2}
            />
          ))}
        </svg>

        {layout.nodes.map((item) => {
          const remoteSelections = remoteSelectionsByNodeId?.get(item.id) || []
          const isSearchMuted = Boolean(searchResultNodeIdSet && !searchResultNodeIdSet.has(item.id))
          const visualSize = 112
          const visualOffsetX = 0
          const visualOffsetY = 0
          const visualRadius = 6
          const remoteRingBaseOffset =
            selectedNodeId === item.id || multiSelectedNodeIds.includes(item.id) ? 7 : 4
          return (
          <button
            key={item.id}
            data-node-id={item.id}
            className={`graph-node ${selectedNodeId === item.id ? 'selected' : ''} ${
              multiSelectedNodeIds.includes(item.id) ? 'selected-secondary' : ''
            } ${
              dragHoverNodeId === item.id ? 'drop-target' : ''
            } ${projectSettings.imageMode === 'square' ? 'image-square' : 'image-original'} ${
              item.node.hasImage ? 'node-with-photo' : 'node-without-photo'
            } ${item.node.type === 'collapsed-group' ? 'collapsed-node' : ''} ${isSearchMuted ? 'graph-node--search-muted' : ''
            }`}
            onContextMenu={(event) => {
              if (item.node.type === 'collapsed-group') {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              const rect = viewportRef.current?.getBoundingClientRect()
              setContextMenu({
                nodeId: item.id,
                x: event.clientX - (rect?.left || 0),
                y: event.clientY - (rect?.top || 0),
              })
            }}
            onClick={(event) => {
              if (item.node.type === 'collapsed-group') {
                return
              }
              if (event.ctrlKey || event.metaKey) {
                if (!focusPathMode) {
                  void setCollapsed(item.id, !item.node.collapsed)
                }
                return
              }
              if (event.shiftKey) {
                toggleMultiSelection(item.id)
                return
              }
              void saveNodeDraft(editTargetNode, editForm)
              setEffectiveSelection([item.id], item.id)
            }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (item.node.type === 'collapsed-group') {
                return
              }
              beginNodeDrag(item.id, event)
            }}
            style={{ left: `${item.x}px`, top: `${item.y}px` }}
            type="button"
          >
            {remoteSelections.map((user, index) => {
              const ringOffset = remoteRingBaseOffset + index * 6
              return (
                <span
                  key={user.userId}
                  aria-hidden="true"
                  className="graph-node__presence-ring"
                  style={{
                    '--presence-color': user.color,
                    left: `${visualOffsetX - ringOffset}px`,
                    top: `${visualOffsetY - ringOffset}px`,
                    width: `${visualSize + ringOffset * 2}px`,
                    height: `${visualSize + ringOffset * 2}px`,
                    borderRadius: `${visualRadius + ringOffset}px`,
                  }}
                />
              )
            })}
            <div className="graph-node__visual">
              {item.node.hiddenSiblingCount ? (
                <div className="graph-node__sibling-indicator">+{item.node.hiddenSiblingCount}</div>
              ) : null}
              {item.node.type === 'collapsed-group' ? (
                <div className="graph-node__collapsed-grid">
                  {item.node.previewItems.map((preview) =>
                    preview.imageUrl ? (
                      <img
                        key={preview.id}
                        className="graph-node__collapsed-thumb"
                        src={preview.imageUrl}
                        alt=""
                        draggable="false"
                      />
                    ) : (
                      <div key={preview.id} className="graph-node__collapsed-thumb graph-node__collapsed-placeholder">
                        <FolderIcon />
                      </div>
                    ),
                  )}
                </div>
              ) : item.node.previewUrl || item.node.imageUrl ? (
                <>
                  {!loadedImages[item.node.previewUrl || item.node.imageUrl] ? (
                    <div className="graph-node__spinner" aria-hidden="true" />
                  ) : null}
                  <img
                    className={
                      loadedImages[item.node.previewUrl || item.node.imageUrl]
                        ? 'graph-node__image'
                        : 'graph-node__image graph-node__image--loading'
                    }
                    src={item.node.previewUrl || item.node.imageUrl}
                    alt={item.node.name}
                    draggable="false"
                    onError={() => markImageLoaded(item.node.previewUrl || item.node.imageUrl)}
                    onLoad={() => markImageLoaded(item.node.previewUrl || item.node.imageUrl)}
                  />
                </>
              ) : (
                <div className="graph-node__placeholder">
                  <FolderIcon />
                </div>
              )}
            </div>
            <div className="graph-node__meta">
              <span>{item.node.name}</span>
            </div>
          </button>
          )
        })}
      </div>

      {dragActive ? <div className="drop-overlay">Drop photos onto the selected node</div> : null}
      {canvasMarqueeRect ? (
        <div
          className="canvas-marquee"
          style={{
            left: `${canvasMarqueeRect.x}px`,
            top: `${canvasMarqueeRect.y}px`,
            width: `${canvasMarqueeRect.width}px`,
            height: `${canvasMarqueeRect.height}px`,
          }}
        />
      ) : null}
      {dragPreview ? (
        <div className="drag-preview" style={{ left: `${dragPreview.x}px`, top: `${dragPreview.y}px` }}>
          {tree?.nodes.find((node) => node.id === dragPreview.nodeId)?.name || 'Moving'}
        </div>
      ) : null}
      <div className="canvas-caption canvas-caption--left">
        {selectedNodePath?.length ? (
          <>
            <div ref={pathContainerRef} className="canvas-caption__path" role="navigation" aria-label="Selected node path">
              {showLeadingEllipsis ? <span className="canvas-caption__ellipsis">...</span> : null}
              {visiblePath.map((entry, index) => (
                <span key={entry.id} className="canvas-caption__segment">
                  {showLeadingEllipsis || index > 0 ? <span className="canvas-caption__separator">{'>'}</span> : null}
                  <button
                    className={`canvas-caption__node ${entry.id === selectedNodePath[selectedNodePath.length - 1]?.id ? 'is-selected' : ''}`}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void selectNodeFromPath(entry.id)
                    }}
                    type="button"
                  >
                    {entry.name}
                  </button>
                </span>
              ))}
            </div>
            <div ref={pathMeasureRef} className="canvas-caption__path-measure" aria-hidden="true">
              <span className="canvas-caption__ellipsis" data-path-ellipsis="true">...</span>
              {selectedNodePath.map((entry, index) => (
                <span key={entry.id} className="canvas-caption__segment" data-path-segment="true">
                  {index > 0 ? <span className="canvas-caption__separator">{'>'}</span> : null}
                  <span className="canvas-caption__node">{entry.name}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          'No node selected'
        )}
      </div>
      <div className="canvas-caption canvas-caption--right">
        {Math.round(transform.scale * 100)}% | {tree?.nodes?.length ?? 0} nodes
      </div>
      {contextMenu ? (
        <div
          className="node-context-menu"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          <button
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              setContextMenu(null)
              openNewFolderDialog(contextMenu.nodeId)
            }}
            type="button"
          >
            Add Node
          </button>
          <button
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              setPendingUploadParentId(contextMenu.nodeId)
              setPendingUploadMode('photo_node')
              setContextMenu(null)
              fileInputRef.current?.click()
            }}
            type="button"
          >
            Add Photo Node
          </button>
          <button
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              setPendingUploadParentId(contextMenu.nodeId)
              setPendingUploadMode('additional_photo')
              setContextMenu(null)
              fileInputRef.current?.click()
            }}
            type="button"
          >
            Add Photo
          </button>
          {!focusPathMode &&
          (contextMenuNode?.children?.length || contextMenuNode?.collapsed) ? (
            <button
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={() => {
                setContextMenu(null)
                void setCollapsed(contextMenu.nodeId, !contextMenuNode?.collapsed)
              }}
              type="button"
            >
              {contextMenuNode?.collapsed ? 'Expand' : 'Collapse'}
            </button>
          ) : null}
          <button
            className="danger-text"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              setContextMenu(null)
              setEffectiveSelection([contextMenu.nodeId], contextMenu.nodeId)
              setDeleteNodeOpen(true)
            }}
            type="button"
          >
            Delete
          </button>
        </div>
      ) : null}
    </section>
  )
}
