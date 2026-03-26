import TagInput from './TagInput'

function formatCreatedAt(value) {
  if (!value) {
    return 'Unknown'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export default function InspectorPanel({
  availableTags,
  busy,
  bulkSelectionCount,
  editForm,
  editTargetNode,
  error,
  hasBulkSelection,
  hasLockedSelectionRoot,
  nameInputRef,
  patchNodeReviewStatus,
  saveNodeDraft,
  selectedNode,
  setDeleteNodeOpen,
  setEditForm,
  status,
}) {
  const isRootNode = Boolean(selectedNode && selectedNode.parent_id == null && !selectedNode.isVariant)

  return (
    <>
      <div className="inspector__section">
        <div className="inspector__title">
          {hasBulkSelection
            ? 'Selection'
            : selectedNode
            ? 'Node'
            : 'Selection'}
        </div>
        {selectedNode ? (
          <div className="inspector__name">{hasBulkSelection ? `${bulkSelectionCount} Nodes Selected` : selectedNode.name}</div>
        ) : (
          <div className="inspector__empty">Select a node.</div>
        )}
      </div>

      {selectedNode ? (
        <>
          {!hasBulkSelection ? (
            <div className="inspector__section field-stack">
              <div className="inspector__title">Details</div>
              <label>
                <span>Name</span>
                <input
                  disabled={isRootNode}
                  ref={nameInputRef}
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                />
              </label>
              {isRootNode ? <div className="inspector__notice">Root name follows the project name.</div> : null}
              <label>
                <span>Notes</span>
                <textarea
                  rows="7"
                  value={editForm.notes}
                  onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                  onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                />
              </label>
              <label>
                <span>Tags</span>
                <TagInput
                  availableTags={availableTags}
                  onBlur={() => void saveNodeDraft(editTargetNode, editForm)}
                  onChange={(tags) => setEditForm({ ...editForm, tags })}
                  onCommit={(tags) => {
                    const nextForm = { ...editForm, tags }
                    setEditForm(nextForm)
                    void saveNodeDraft(editTargetNode, nextForm, { skipNextAutoSave: true })
                  }}
                  value={editForm.tags}
                />
              </label>
            </div>
          ) : (
            <div className="inspector__section field-stack">
              <div className="inspector__title">Status</div>
              <div className="inspector__notice">{bulkSelectionCount} nodes selected.</div>
            </div>
          )}

          {!hasBulkSelection ? (
            <div className="inspector__section field-stack">
              <div className="inspector__title">Status</div>
              <label>
                <span>Review Status</span>
                <select
                  className={`node-review-status node-review-status--${selectedNode.reviewStatus || 'new'}`}
                  disabled={busy}
                  value={selectedNode.reviewStatus || 'new'}
                  onChange={(event) => void patchNodeReviewStatus(selectedNode.id, event.target.value)}
                >
                  <option value="new">New</option>
                  <option value="needs_attention">Needs Attention</option>
                  <option value="reviewed">Reviewed</option>
                </select>
              </label>
            </div>
          ) : null}

          <div className="inspector__section field-stack">
            <button
              className="danger-button wide"
              disabled={hasLockedSelectionRoot || busy}
              onClick={() => setDeleteNodeOpen(true)}
              type="button"
            >
              {hasBulkSelection ? `Delete ${bulkSelectionCount} Nodes` : 'Delete Node'}
            </button>
          </div>

          {!hasBulkSelection ? (
            <div className="inspector__section inspector__footer">
              <div className="settings-panel__meta-row">
                <span>Photos</span>
                <strong>{Math.max(0, Number(selectedNode.mediaCount || 0))}</strong>
              </div>
              <div className="settings-panel__meta-row">
                <span>Node Owner</span>
                <strong>{selectedNode.ownerUsername || 'Unknown'}</strong>
              </div>
              <div className="settings-panel__meta-row">
                <span>Date Added</span>
                <strong>{formatCreatedAt(selectedNode.added_at || selectedNode.created_at)}</strong>
              </div>
              <div className="settings-panel__meta-row">
                <span>Node ID</span>
                <strong>{selectedNode.id}</strong>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <div className="inspector__notice error">{error}</div> : null}
      {!error && status ? <div className="inspector__notice">{status}</div> : null}
    </>
  )
}
