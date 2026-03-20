import IconButton from './IconButton'
import { AddFolderIcon, AddPhotoIcon, AddVariantIcon, FitViewIcon, FocusNodeIcon, FolderIcon, GridIcon, RootNodeIcon } from './icons'

export default function CanvasWorkspace({
  beginNodeDrag,
  beginCanvasPointerDown,
  busy,
  canvasMarqueeRect,
  contextMenu,
  contextMenuNode,
  convertNodeToVariant,
  promoteVariantToMain,
  convertVariantToChild,
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
  toggleGrid,
  toggleMultiSelection,
  transform,
  tree,
  uploadFiles,
  viewportRef,
}) {
  const searchResultNodeIdSet = hideNonResultNodes ? new Set(searchResultNodeIds || []) : null
  const selectedPathSeparatorIndex = selectedNodePath.lastIndexOf(' > ')
  const selectedPathPrefix =
    selectedPathSeparatorIndex >= 0 ? `${selectedNodePath.slice(0, selectedPathSeparatorIndex)} > ` : ''
  const selectedPathLeaf =
    selectedPathSeparatorIndex >= 0 ? selectedNodePath.slice(selectedPathSeparatorIndex + 3) : selectedNodePath

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
          aria-label="Add folder"
          className="canvas-tool-button"
          disabled={!selectedNode || selectedNode.isVariant || busy}
          onClick={() => openNewFolderDialog()}
          tooltip="Add Folder"
        >
          <AddFolderIcon />
        </IconButton>
        <IconButton
          aria-label="Add photo"
          className="canvas-tool-button"
          disabled={!selectedNode || selectedNode.isVariant || busy}
          onClick={() => {
            setPendingUploadParentId(selectedNode?.id || null)
            setPendingUploadMode('child')
            fileInputRef.current?.click()
          }}
          tooltip="Add Photo"
        >
          <AddPhotoIcon />
        </IconButton>
        <IconButton
          aria-label="Add variant photo"
          className="canvas-tool-button"
          disabled={!selectedNode || busy}
          onClick={() => {
            setPendingUploadParentId(selectedNode?.id || null)
            setPendingUploadMode('variant')
            fileInputRef.current?.click()
          }}
          tooltip="Add Variant Photo"
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
          const visualSize = item.node.isVariant ? 78 : 112
          const visualOffsetX = item.node.isVariant ? 17 : 0
          const visualOffsetY = item.node.isVariant ? 17 : 0
          const visualRadius = item.node.isVariant ? 5 : 6
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
              item.node.type === 'photo' ? 'photo-node' : 'folder-node'
            } ${item.node.type === 'collapsed-group' ? 'collapsed-node' : ''} ${
              item.node.isVariant ? 'variant-node' : ''
            } ${isSearchMuted ? 'graph-node--search-muted' : ''
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
                if (!focusPathMode && !item.node.isVariant) {
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
        {selectedNodePath ? (
          <>
            {selectedPathPrefix ? <span>{selectedPathPrefix}</span> : null}
            <span className="canvas-caption__selected">{selectedPathLeaf}</span>
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
          {!contextMenuNode?.isVariant ? (
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
              Add Folder
            </button>
          ) : null}
          {!contextMenuNode?.isVariant ? (
            <button
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={() => {
                setPendingUploadParentId(contextMenu.nodeId)
                setPendingUploadMode('child')
                setContextMenu(null)
                fileInputRef.current?.click()
              }}
              type="button"
            >
              Add Photo
            </button>
          ) : null}
          <button
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              setPendingUploadParentId(contextMenu.nodeId)
              setPendingUploadMode('variant')
              setContextMenu(null)
              fileInputRef.current?.click()
            }}
            type="button"
          >
            Add Variant Photo
          </button>
          {!focusPathMode &&
          !contextMenuNode?.isVariant &&
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
          {contextMenuNode?.isVariant ? (
            <button
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={() => {
                setContextMenu(null)
                void promoteVariantToMain(contextMenuNode)
              }}
              type="button"
            >
              Make Main
            </button>
          ) : null}
          {contextMenuNode?.isVariant ? (
            <button
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={() => {
                setContextMenu(null)
                void convertVariantToChild(contextMenuNode)
              }}
              type="button"
            >
              Convert to Child
            </button>
          ) : null}
          {!contextMenuNode?.isVariant &&
          contextMenuNode?.parent_id != null &&
          !(contextMenuNode?.children?.length > 0) &&
          !(contextMenuNode?.variants?.length > 0) ? (
            <button
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={() => {
                setContextMenu(null)
                void convertNodeToVariant(contextMenuNode, contextMenuNode.parent_id)
              }}
              type="button"
            >
              Convert to Variant
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
