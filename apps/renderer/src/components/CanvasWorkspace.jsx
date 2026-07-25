import { useMemo } from 'react'

import CanvasNodePathCaption from './CanvasNodePathCaption'
import GraphNodeVisual from './GraphNodeVisual'
import IconButton from './IconButton'
import { AddFolderIcon, AddPhotoIcon, AddVariantIcon, EyeLowVisionIcon, FitViewIcon, FocusNodeIcon, GridIcon, PathIcon, RootNodeIcon } from './icons'
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/constants'

export default function CanvasWorkspace({
  beginNodeDrag,
  beginCanvasPointerDown,
  busy,
  canvasIsolationMode,
  canvasMarqueeRect,
  dragActive,
  dragHoverNodeId,
  dragPreview,
  editForm,
  editTargetNode,
  focusSelectedNode,
  fitCanvasToView,
  handleCanvasContextMenu,
  handleCanvasPointerMove,
  imageLoadRevision = 0,
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
  setContextMenu,
  setDragActive,
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
  viewportSize,
  viewportRef,
  onNodeDoubleClick,
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
  const treeBounds = useMemo(() => {
    const visibleNodes = Array.isArray(layout.nodes) && layout.nodes.length ? layout.nodes : null
    if (!visibleNodes) {
      return {
        centerX: (layout.width || NODE_WIDTH) / 2,
        centerY: (layout.height || NODE_HEIGHT) / 2,
      }
    }

    const left = Math.min(...visibleNodes.map((item) => item.x))
    const top = Math.min(...visibleNodes.map((item) => item.y))
    const right = Math.max(...visibleNodes.map((item) => item.x + NODE_WIDTH))
    const bottom = Math.max(...visibleNodes.map((item) => item.y + NODE_HEIGHT))

    return {
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    }
  }, [layout.height, layout.nodes, layout.width])
  const centeredPanX = Math.round(transform.x + treeBounds.centerX * transform.scale - ((viewportSize?.width || 0) / 2))
  const centeredPanY = Math.round(transform.y + treeBounds.centerY * transform.scale - ((viewportSize?.height || 0) / 2))

  function blurActiveTextInput() {
    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      activeElement?.isContentEditable
    ) {
      activeElement.blur()
    }
  }

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
          wrapperClassName="canvas-tool__results-tooltip"
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
              className={`${link.dashed ? 'canvas-link--media ' : ''}${
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
                workspaceMode: 'tree',
                x: event.clientX - (rect?.left || 0),
                y: event.clientY - (rect?.top || 0),
              })
            }}
            onClick={(event) => {
              if (item.node.type === 'collapsed-group') {
                return
              }
              if (event.shiftKey) {
                toggleMultiSelection(item.id)
                return
              }
              setEffectiveSelection([item.id], item.id)
              void saveNodeDraft(editTargetNode, editForm)
            }}
            onDoubleClick={(event) => {
              if (item.node.type === 'collapsed-group') {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              onNodeDoubleClick?.(item.node)
            }}
            onPointerDown={(event) => {
              blurActiveTextInput()
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
            <GraphNodeVisual
              imageLoadRevision={imageLoadRevision}
              loadedImages={loadedImages}
              markImageLoaded={markImageLoaded}
              node={item.node}
            />
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
      <CanvasNodePathCaption
        onSelectNode={selectNodeFromPath}
        selectedNodePath={selectedNodePath}
      />
      <div className="canvas-caption canvas-caption--right">
        {Math.round(transform.scale * 100)}% | X {centeredPanX} | Y {centeredPanY} | {tree?.nodes?.length ?? 0}{' '}
        nodes
      </div>
    </section>
  )
}
