import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import IconButton from './IconButton'
import { AddFolderIcon, AddPhotoIcon, AddVariantIcon, EyeLowVisionIcon, FitViewIcon, FocusNodeIcon, FolderIcon, GridIcon, PathIcon, RootNodeIcon } from './icons'

export default function CanvasWorkspace({
  beginNodeDrag,
  beginCanvasPointerDown,
  busy,
  canvasIsolationMode,
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
  layout,
  loadedImages,
  markImageLoaded,
  multiSelectedNodeIds,
  openNewNodeDialog,
  projectSettings,
  remoteSelectionsByNodeId,
  searchResultNodeIds,
  selectRootNode,
  selectedNodePath,
  selectedNodePathIds,
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
  togglePathIsolation,
  toggleSearchIsolation,
  toggleGrid,
  toggleMultiSelection,
  triggerAddPhoto,
  triggerAddPhotoNode,
  transform,
  tree,
  uploadFiles,
  viewportRef,
}) {
  const isolatedNodeIdSet = useMemo(() => {
    if (canvasIsolationMode === 'search') {
      return new Set(searchResultNodeIds || [])
    }
    if (canvasIsolationMode === 'path') {
      return new Set(selectedNodePathIds || [])
    }
    return null
  }, [canvasIsolationMode, searchResultNodeIds, selectedNodePathIds])
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
  }, [selectedNodeId, selectedNodePath])

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
          onClick={() => openNewNodeDialog()}
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
          aria-label={canvasIsolationMode === 'search' ? 'Show all nodes' : 'Show search results only'}
          className={`canvas-tool-button ${canvasIsolationMode === 'search' ? 'is-active' : ''}`}
          disabled={busy}
          onClick={toggleSearchIsolation}
          tooltip={canvasIsolationMode === 'search' ? 'Show All Nodes' : 'Show Results Only'}
        >
          <EyeLowVisionIcon />
        </IconButton>
        <IconButton
          aria-label={canvasIsolationMode === 'path' ? 'Show all nodes' : 'Show selected path only'}
          className={`canvas-tool-button ${canvasIsolationMode === 'path' ? 'is-active' : ''}`}
          disabled={!selectedNodePathIds?.length && canvasIsolationMode !== 'path'}
          onClick={togglePathIsolation}
          tooltip={canvasIsolationMode === 'path' ? 'Show All Nodes' : 'Show Ancestors Only'}
        >
          <PathIcon />
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
          const collapsedGroupVisibleByParent =
            item.node.type === 'collapsed-group' &&
            item.node.parent_id != null &&
            isolatedNodeIdSet?.has(item.node.parent_id)
          const isSearchMuted = Boolean(
            isolatedNodeIdSet &&
            !isolatedNodeIdSet.has(item.id) &&
            !collapsedGroupVisibleByParent,
          )
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
              setEffectiveSelection([item.id], item.id)
              void saveNodeDraft(editTargetNode, editForm)
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
            </div>
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
              openNewNodeDialog(contextMenu.nodeId)
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
