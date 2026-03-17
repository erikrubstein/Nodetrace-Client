export default function InspectorPanel({
  busy,
  bulkSelectionCount,
  editForm,
  editTargetNode,
  error,
  hasBulkSelection,
  hasLockedSelectionRoot,
  moveNodeTo,
  moveParentId,
  nameInputRef,
  parentOptions,
  saveNodeDraft,
  selectedNode,
  setDeleteNodeOpen,
  setEditForm,
  setMoveParentId,
  status,
}) {
  return (
    <>
      <div className="inspector__section">
        <div className="inspector__title">
          {selectedNode
            ? selectedNode.isVariant
              ? selectedNode.type === 'photo'
                ? 'Variant Photo'
                : 'Variant Folder'
              : selectedNode.type === 'photo'
                ? 'Photo'
                : 'Folder'
            : 'Selection'}
        </div>
        {selectedNode ? (
          <div className="inspector__name">{selectedNode.name}</div>
        ) : (
          <div className="inspector__empty">Select a node.</div>
        )}
      </div>

      {selectedNode ? (
        <>
          <div className="inspector__section field-stack">
            <label>
              <span>Name</span>
              <input
                ref={nameInputRef}
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
              />
            </label>
            <label>
              <span>Tags</span>
              <input
                value={editForm.tags}
                onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })}
                onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                placeholder="front, cabinet"
              />
            </label>
            <label>
              <span>Notes</span>
              <textarea
                rows="7"
                value={editForm.notes}
                onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
              />
            </label>
          </div>

          <div className="inspector__section field-stack">
            {hasBulkSelection ? (
              <div className="inspector__notice">
                {bulkSelectionCount} nodes selected for bulk actions. Preview and editing still follow {selectedNode.name}.
              </div>
            ) : null}
            <label>
              <span>Parent</span>
              <select
                disabled={hasLockedSelectionRoot || busy}
                value={moveParentId}
                onChange={async (event) => {
                  const nextParentId = event.target.value
                  setMoveParentId(nextParentId)
                  if (!nextParentId || String(selectedNode.parent_id ?? '') === nextParentId) {
                    return
                  }
                  await moveNodeTo(nextParentId)
                }}
              >
                <option value="">Choose node</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="danger-button wide"
              disabled={hasLockedSelectionRoot || busy}
              onClick={() => setDeleteNodeOpen(true)}
              type="button"
            >
              {hasBulkSelection ? `Delete ${bulkSelectionCount} Nodes` : 'Delete Node'}
            </button>
          </div>

          <div className="inspector__section inspector__footer">
            <div className="settings-panel__meta-row">
              <span>Node ID</span>
              <strong>{selectedNode.id}</strong>
            </div>
          </div>
        </>
      ) : null}

      {error ? <div className="inspector__notice error">{error}</div> : null}
      {!error && status ? <div className="inspector__notice">{status}</div> : null}
    </>
  )
}
