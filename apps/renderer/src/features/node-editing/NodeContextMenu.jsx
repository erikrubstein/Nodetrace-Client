export default function NodeContextMenu({
  canToggleCollapsed,
  collapsed,
  contextMenu,
  contextMenuNode,
  fileInputRef,
  onToggleCollapsed,
  openNewNodeDialog,
  setContextMenu,
  setDeleteNodeOpen,
  setEffectiveSelection,
  setMergePhotoConfirmation,
  setPendingUploadMode,
  setPendingUploadParentId,
  tree,
  workspaceActions,
}) {
  if (!contextMenu) {
    return null
  }

  return (
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
      {canToggleCollapsed ? (
        <button
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={onToggleCollapsed}
          type="button"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      ) : null}
      {(workspaceActions || []).map((action) => (
        <button
          key={action.label}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      ))}
      {contextMenuNode?.parent_id != null &&
      !contextMenuNode?.children?.length &&
      contextMenuNode?.hasImage ? (
        <button
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={() => {
            const parentNode = tree?.nodes.find(
              (node) => node.id === contextMenuNode.parent_id,
            )
            setContextMenu(null)
            setMergePhotoConfirmation?.({
              sourceNodeId: contextMenuNode.id,
              sourceNodeName: contextMenuNode.name,
              targetNodeId: contextMenuNode.parent_id,
              targetNodeName: parentNode?.name || 'the parent node',
            })
          }}
          type="button"
        >
          Convert To Photo
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
  )
}
