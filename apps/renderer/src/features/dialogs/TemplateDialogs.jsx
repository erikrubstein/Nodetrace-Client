import ConfirmDialog from '../../components/ConfirmDialog'

export default function TemplateDialogs({
  applyTemplateConfirmation,
  bulkSelectionCount,
  bulkTemplateCount,
  busy,
  confirmApplyTemplateSelection,
  confirmMergeNodeIntoPhoto,
  confirmRemoveIdentificationTemplate,
  deleteNode,
  deleteNodeOpen,
  deleteTemplate,
  error,
  handleDialogEnter,
  hasBulkSelection,
  identificationTemplateRemovalCount,
  identificationTemplateRemovalNodes,
  identificationTemplates,
  importTemplateDialog,
  importTemplateFromProject,
  importableProjects,
  importableTemplates,
  mergePhotoConfirmation,
  newNodeDialog,
  newNodeName,
  selectedImportProject,
  selectedNode,
  setApplyTemplateConfirmation,
  setDeleteNodeOpen,
  setIdentificationTemplateRemovalNodeId,
  setImportTemplateDialog,
  setMergePhotoConfirmation,
  setNewNodeDialog,
  setNewNodeName,
  setShowProjectDialog,
  setTemplateDialog,
  submitNewNode,
  submitTemplateDialog,
  templateDialog,
  showProjectDialog,
}) {
  return (
    <>
      {newNodeDialog ? (
        <div className="dialog-backdrop" onClick={() => !busy && setNewNodeDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                () => {
                  void submitNewNode()
                },
                Boolean(newNodeName.trim()) && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">New Node</div>
            <input autoFocus placeholder="Node name" value={newNodeName} onChange={(event) => setNewNodeName(event.target.value)} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setNewNodeDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !newNodeName.trim()} onClick={submitNewNode} type="button">
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteNodeOpen ? (
        <div className="dialog-backdrop" onClick={() => setDeleteNodeOpen(false)} role="presentation">
          <ConfirmDialog
            busy={busy}
            confirmLabel="Delete Node"
            confirmTone="danger"
            onCancel={() => setDeleteNodeOpen(false)}
            onConfirm={deleteNode}
            onKeyDown={(event) => handleDialogEnter(event, deleteNode, !busy)}
            title="Delete Node"
          >
            <div className="inspector__notice">
              {hasBulkSelection ? (
                <>Delete <strong>{bulkSelectionCount} selected nodes</strong> and all child nodes?</>
              ) : (
                <>Delete <strong>{selectedNode?.name}</strong> and all child nodes?</>
              )}
            </div>
          </ConfirmDialog>
        </div>
      ) : null}

      {identificationTemplateRemovalCount ? (
        <div className="dialog-backdrop" onClick={() => !busy && setIdentificationTemplateRemovalNodeId(null)} role="presentation">
          <ConfirmDialog
            busy={busy}
            confirmLabel="Remove Template"
            confirmTone="danger"
            onCancel={() => setIdentificationTemplateRemovalNodeId(null)}
            onConfirm={confirmRemoveIdentificationTemplate}
            onKeyDown={(event) => handleDialogEnter(event, confirmRemoveIdentificationTemplate, !busy)}
            title="Remove Template"
          >
            <div className="inspector__notice">
              {identificationTemplateRemovalCount > 1 ? (
                <>
                  Remove templates from <strong>{identificationTemplateRemovalCount} selected nodes</strong>? This will remove all saved field data on those nodes.
                </>
              ) : (
                <>
                  Remove the template from <strong>{identificationTemplateRemovalNodes?.[0]?.name || 'this node'}</strong>? This will remove all the data you entered.
                </>
              )}
            </div>
          </ConfirmDialog>
        </div>
      ) : null}

      {showProjectDialog === 'apply-template' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Apply Template</div>
            <div className="project-list">
              {identificationTemplates.map((template) => (
                <button
                  key={template.id}
                  className="project-row"
                  disabled={busy || (!selectedNode && !hasBulkSelection)}
                  onClick={() => {
                    if (!selectedNode && !hasBulkSelection) {
                      return
                    }
                    setApplyTemplateConfirmation({
                      templateId: template.id,
                      templateName: template.name,
                      nodeId: hasBulkSelection ? null : selectedNode.id,
                    })
                  }}
                  type="button"
                >
                  <span>{template.name}</span>
                  <small>{template.fields?.length || 0} fields</small>
                </button>
              ))}
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {applyTemplateConfirmation ? (
        <div className="dialog-backdrop" onClick={() => !busy && setApplyTemplateConfirmation(null)} role="presentation">
          <ConfirmDialog
            busy={busy}
            confirmLabel="Apply Template"
            disabled={false}
            onCancel={() => setApplyTemplateConfirmation(null)}
            onConfirm={confirmApplyTemplateSelection}
            onKeyDown={(event) => handleDialogEnter(event, confirmApplyTemplateSelection, !busy)}
            title="Apply Template"
          >
            <div className="inspector__notice">
              {hasBulkSelection ? (
                <>
                  Apply <strong>{applyTemplateConfirmation.templateName}</strong> to <strong>{bulkSelectionCount} selected nodes</strong>?
                  {bulkTemplateCount ? ` ${bulkTemplateCount} currently have template data that may be replaced.` : ''}
                </>
              ) : (
                <>
                  Apply <strong>{applyTemplateConfirmation.templateName}</strong> to <strong>{selectedNode?.name || 'this node'}</strong>?
                  {selectedNode?.identification ? ' Current template data may be replaced.' : ''}
                </>
              )}
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
          </ConfirmDialog>
        </div>
      ) : null}

      {mergePhotoConfirmation ? (
        <div className="dialog-backdrop" onClick={() => !busy && setMergePhotoConfirmation(null)} role="presentation">
          <ConfirmDialog
            busy={busy}
            confirmLabel="Convert Photo"
            confirmTone="danger"
            onCancel={() => setMergePhotoConfirmation(null)}
            onConfirm={confirmMergeNodeIntoPhoto}
            onKeyDown={(event) => handleDialogEnter(event, confirmMergeNodeIntoPhoto, !busy)}
            title="Convert To Photo"
          >
            <div className="inspector__notice">
              Move the main photo from <strong>{mergePhotoConfirmation.sourceNodeName}</strong> onto <strong>{mergePhotoConfirmation.targetNodeName}</strong> as an additional photo?
            </div>
            <div className="inspector__notice">This will delete the source node data and preserve only its main photo.</div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
          </ConfirmDialog>
        </div>
      ) : null}

      {templateDialog?.mode === 'delete' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setTemplateDialog(null)} role="presentation">
          <ConfirmDialog
            busy={busy}
            confirmLabel="Delete Template"
            confirmTone="danger"
            onCancel={() => setTemplateDialog(null)}
            onConfirm={deleteTemplate}
            onKeyDown={(event) => handleDialogEnter(event, deleteTemplate, !busy)}
            title="Delete Template"
          >
            <div className="inspector__notice">
              {templateDialog.affectsData ? (
                <>Delete <strong>{templateDialog.templateName}</strong>? This will also remove data from nodes using this template.</>
              ) : (
                <>Delete <strong>{templateDialog.templateName}</strong>? This cannot be undone.</>
              )}
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
          </ConfirmDialog>
        </div>
      ) : null}

      {templateDialog?.mode === 'confirm-save' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setTemplateDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleDialogEnter(event, submitTemplateDialog, !busy)} role="dialog">
            <div className="dialog__title">Save Template</div>
            <div className="inspector__notice">
              Removing fields from <strong>{templateDialog.templateName}</strong> will delete data from nodes already using this template.
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setTemplateDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void submitTemplateDialog()} type="button">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importTemplateDialog ? (
        <div className="dialog-backdrop" onClick={() => !busy && setImportTemplateDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                () => importTemplateFromProject(importTemplateDialog.sourceProjectId, importTemplateDialog.sourceTemplateId),
                Boolean(importTemplateDialog.sourceProjectId && importTemplateDialog.sourceTemplateId) && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">Import Template</div>
            <div className="inspector__notice">
              Imports a copied local template into the current project. This does not create a live link back to the source project.
            </div>
            <label>
              <span>Project</span>
              <select
                autoFocus
                disabled={busy}
                value={importTemplateDialog.sourceProjectId || ''}
                onChange={(event) =>
                  setImportTemplateDialog({
                    sourceProjectId: event.target.value,
                    sourceTemplateId: '',
                  })
                }
              >
                <option value="">Select project</option>
                {importableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Template</span>
              <select
                disabled={busy || !selectedImportProject}
                value={importTemplateDialog.sourceTemplateId || ''}
                onChange={(event) =>
                  setImportTemplateDialog((current) => ({
                    ...current,
                    sourceTemplateId: event.target.value,
                  }))
                }
              >
                <option value="">Select template</option>
                {importableTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setImportTemplateDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !importTemplateDialog.sourceProjectId || !importTemplateDialog.sourceTemplateId}
                onClick={() => void importTemplateFromProject(importTemplateDialog.sourceProjectId, importTemplateDialog.sourceTemplateId)}
                type="button"
              >
                Import Template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
