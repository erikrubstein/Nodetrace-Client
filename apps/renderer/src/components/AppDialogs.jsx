import { useMemo, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

export default function AppDialogs({
  accountDialog,
  accountForm,
  accountStatus,
  applyTemplateConfirmation,
  busy,
  bulkTemplateCount,
  changePassword,
  changeUsername,
  confirmApplyTemplateSelection,
  confirmMergeNodeIntoPhoto,
  createProject,
  currentUser,
  deleteNode,
  deleteAccount,
  deleteTemplate,
  deleteNodeOpen,
  confirmRemoveIdentificationTemplate,
  deleteProject,
  deleteProjectText,
  desktopClientId,
  error,
  exportFileName,
  exportMediaTree,
  exportProject,
  handleDialogEnter,
  hasBulkSelection,
  identificationTemplates,
  importArchiveFile,
  importInputRef,
  importProject,
  importProjectName,
  importTemplateDialog,
  importTemplateFromProject,
  projectApiKeyInput,
  identificationTemplateRemovalCount,
  identificationTemplateRemovalNodes,
  mergePhotoConfirmation,
  mobileConnectionCount,
  newNodeDialog,
  newNodeName,
  projects,
  renameProject,
  saveProjectOpenAiKey,
  selectedNode,
  selectedProjectId,
  sessionDialogOpen,
  setAccountDialog,
  setAccountForm,
  setApplyTemplateConfirmation,
  setDeleteNodeOpen,
  setDeleteProjectText,
  setExportFileName,
  setIdentificationTemplateRemovalNodeId,
  setImportProjectName,
  setImportTemplateDialog,
  setNewNodeDialog,
  setNewNodeName,
  setProjectApiKeyInput,
  setSessionDialogOpen,
  setShowProjectDialog,
  setShowProjectId,
  projectName,
  setProjectName,
  setMergePhotoConfirmation,
  showProjectDialog,
  submitNewNode,
  submitTemplateDialog,
  transferProgress,
  tree,
  bulkSelectionCount,
  templateDialog,
  setTemplateDialog,
}) {
  const [openProjectSearch, setOpenProjectSearch] = useState('')

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((left, right) =>
        String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
      ),
    [projects],
  )

  const filteredProjects = useMemo(() => {
    const query = openProjectSearch.toLowerCase()
    if (!query) {
      return sortedProjects
    }

    return sortedProjects.filter((project) => String(project?.name || '').toLowerCase().includes(query))
  }, [openProjectSearch, sortedProjects])

  const importableProjects = useMemo(
    () =>
      (projects || []).filter(
        (project) =>
          project.id !== selectedProjectId && Array.isArray(project.identificationTemplates) && project.identificationTemplates.length > 0,
      ),
    [projects, selectedProjectId],
  )
  const selectedImportProject =
    importableProjects.find((project) => project.id === importTemplateDialog?.sourceProjectId) || null
  const importableTemplates = selectedImportProject?.identificationTemplates || []

  const canCloseOpenProjectDialog = Boolean(tree?.project?.id)

  return (
    <>
      {accountDialog === 'username' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(event, changeUsername, Boolean(accountForm.username.trim()) && !busy)
            }
            role="dialog"
          >
            <div className="dialog__title">Change Username</div>
            <input
              autoFocus
              onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="New username"
              value={accountForm.username}
            />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !accountForm.username.trim()}
                onClick={changeUsername}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountDialog === 'password' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                changePassword,
                Boolean(accountForm.currentPassword && accountForm.newPassword) && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">Change Password</div>
            <input
              autoFocus
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, currentPassword: event.target.value }))
              }
              placeholder="Current password"
              type="password"
              value={accountForm.currentPassword}
            />
            <input
              onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))}
              placeholder="New password"
              type="password"
              value={accountForm.newPassword}
            />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !accountForm.currentPassword || !accountForm.newPassword}
                onClick={changePassword}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountDialog === 'delete-account' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                deleteAccount,
                accountForm.deleteConfirmation === currentUser?.username && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">Delete Account</div>
            <div className="inspector__notice">
              Type <strong>{currentUser?.username}</strong> to permanently delete this account.
            </div>
            <input
              autoFocus
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, deleteConfirmation: event.target.value }))
              }
              placeholder="Username"
              value={accountForm.deleteConfirmation}
            />
            <div className="inspector__notice">Account deletion is blocked while you still own projects.</div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy || accountForm.deleteConfirmation !== currentUser?.username}
                onClick={deleteAccount}
                type="button"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'create' ? (
        <div className="dialog-backdrop" onClick={() => setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, createProject, Boolean(projectName.trim()) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Create Project</div>
            <input
              autoFocus
              placeholder="Project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !projectName.trim()}
                onClick={createProject}
                type="button"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'rename' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, renameProject, Boolean(projectName.trim()) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Rename Project</div>
            <input
              autoFocus
              placeholder="Project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !projectName.trim()}
                onClick={renameProject}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'openai-key' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, saveProjectOpenAiKey, Boolean(projectApiKeyInput.trim()) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Project OpenAI API Key</div>
            <input
              autoFocus
              placeholder="sk-..."
              type="password"
              value={projectApiKeyInput}
              onChange={(event) => setProjectApiKeyInput(event.target.value)}
            />
            <div className="inspector__notice">This key is stored server-side and shared by collaborators on this project.</div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="ghost-button"
                disabled={busy || !projectApiKeyInput.trim()}
                onClick={saveProjectOpenAiKey}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'open' ? (
        <div
          className="dialog-backdrop"
          onClick={() => {
            if (!canCloseOpenProjectDialog) {
              return
            }
            setOpenProjectSearch('')
            setShowProjectDialog(null)
          }}
          role="presentation"
        >
          <div
            className="dialog dialog--wide"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="dialog__title">Open Project</div>
            <div className="project-picker__toolbar">
              <input
                autoFocus
                onChange={(event) => setOpenProjectSearch(event.target.value)}
                placeholder="Search projects"
                value={openProjectSearch}
              />
            </div>
            <div className="project-picker__divider" />
            <div className="project-list">
              {filteredProjects.length ? (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    className={`project-row ${project.id === selectedProjectId ? 'active' : ''}`}
                    onClick={() => {
                      setOpenProjectSearch('')
                      setShowProjectId(project.id)
                      setShowProjectDialog(null)
                    }}
                    type="button"
                  >
                    <span>{project.name}</span>
                    <small>{project.node_count} nodes</small>
                  </button>
                ))
              ) : (
                <div className="inspector__notice">No projects match that search.</div>
              )}
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions project-picker__actions">
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => {
                  setOpenProjectSearch('')
                  setProjectName('')
                  setShowProjectDialog('create')
                }}
                type="button"
              >
                Create Project
              </button>
              {canCloseOpenProjectDialog ? (
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => {
                    setOpenProjectSearch('')
                    setShowProjectDialog(null)
                  }}
                  type="button"
                >
                  Close
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
            <input
              autoFocus
              placeholder="Node name"
              value={newNodeName}
              onChange={(event) => setNewNodeName(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setNewNodeDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !newNodeName.trim()}
                onClick={submitNewNode}
                type="button"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'export' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, exportProject, Boolean(selectedProjectId) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Export Project</div>
            <input
              autoFocus
              placeholder="Archive filename"
              value={exportFileName}
              onChange={(event) => setExportFileName(event.target.value.replace(/\.zip$/i, ''))}
            />
            <div className="inspector__notice">
              File will be saved as {`${exportFileName || tree?.project?.name || 'project'}.zip`}
            </div>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !selectedProjectId}
                onClick={exportProject}
                type="button"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'export-media' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, exportMediaTree, Boolean(selectedProjectId) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Export Media Tree</div>
            <input
              autoFocus
              placeholder="Archive filename"
              value={exportFileName}
              onChange={(event) => setExportFileName(event.target.value.replace(/\.zip$/i, ''))}
            />
            <div className="inspector__notice">
              Exports the current node tree as folders with full-resolution photos in {`${exportFileName || `${tree?.project?.name || 'project'}-media`}.zip`}
            </div>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !selectedProjectId}
                onClick={exportMediaTree}
                type="button"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'import' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, importProject, Boolean(importArchiveFile) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Import Project</div>
            <input
              placeholder="New project name"
              value={importProjectName}
              onChange={(event) => setImportProjectName(event.target.value)}
            />
            <button className="ghost-button" disabled={busy} onClick={() => importInputRef.current?.click()} type="button">
              {importArchiveFile ? importArchiveFile.name : 'Choose Archive'}
            </button>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !importArchiveFile}
                onClick={importProject}
                type="button"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'delete' ? (
        <div className="dialog-backdrop" onClick={() => setShowProjectDialog(null)} role="presentation">
          <ConfirmDialog
            busy={busy}
            confirmLabel="Delete Project"
            confirmTone="danger"
            disabled={deleteProjectText !== tree?.project?.name}
            onCancel={() => setShowProjectDialog(null)}
            onConfirm={deleteProject}
            onKeyDown={(event) =>
              handleDialogEnter(event, deleteProject, deleteProjectText === tree?.project?.name && !busy)
            }
            title="Delete Project"
          >
            <div className="inspector__notice">
              Type <strong>{tree?.project?.name}</strong> to permanently delete this project.
            </div>
            <input
              autoFocus
              placeholder="Project name"
              value={deleteProjectText}
              onChange={(event) => setDeleteProjectText(event.target.value)}
            />
          </ConfirmDialog>
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
        <div
          className="dialog-backdrop"
          onClick={() => !busy && setIdentificationTemplateRemovalNodeId(null)}
          role="presentation"
        >
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
                  Remove templates from <strong>{identificationTemplateRemovalCount} selected nodes</strong>? This will
                  remove all saved field data on those nodes.
                </>
              ) : (
                <>
                  Remove the template from <strong>{identificationTemplateRemovalNodes?.[0]?.name || 'this node'}</strong>?
                  This will remove all the data you entered.
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
                  onClick={async () => {
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
          </div>
        </div>
      ) : null}

      {applyTemplateConfirmation ? (
        <div
          className="dialog-backdrop"
          onClick={() => !busy && setApplyTemplateConfirmation(null)}
          role="presentation"
        >
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
                  Apply <strong>{applyTemplateConfirmation.templateName}</strong> to{' '}
                  <strong>{bulkSelectionCount} selected nodes</strong>?
                  {bulkTemplateCount ? ` ${bulkTemplateCount} currently have template data that may be replaced.` : ''}
                </>
              ) : (
                <>
                  Apply <strong>{applyTemplateConfirmation.templateName}</strong> to{' '}
                  <strong>{selectedNode?.name || 'this node'}</strong>?
                  {selectedNode?.identification ? ' Current template data may be replaced.' : ''}
                </>
              )}
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
          </ConfirmDialog>
        </div>
      ) : null}

      {mergePhotoConfirmation ? (
        <div
          className="dialog-backdrop"
          onClick={() => !busy && setMergePhotoConfirmation(null)}
          role="presentation"
        >
          <ConfirmDialog
            busy={busy}
            confirmLabel="Convert Photo"
            confirmTone="danger"
            onCancel={() => setMergePhotoConfirmation(null)}
            onConfirm={confirmMergeNodeIntoPhoto}
            onKeyDown={(event) => handleDialogEnter(event, confirmMergeNodeIntoPhoto, !busy)}
            title="Convert To Additional Photo"
          >
            <div className="inspector__notice">
              Move the main photo from <strong>{mergePhotoConfirmation.sourceNodeName}</strong> onto{' '}
              <strong>{mergePhotoConfirmation.targetNodeName}</strong> as an additional photo?
            </div>
            <div className="inspector__notice">
              This will delete the source node data and preserve only its main photo.
            </div>
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
                <>
                  Delete <strong>{templateDialog.templateName}</strong>? This will also remove data from nodes using this
                  template.
                </>
              ) : (
                <>
                  Delete <strong>{templateDialog.templateName}</strong>? This cannot be undone.
                </>
              )}
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
          </ConfirmDialog>
        </div>
      ) : null}

      {templateDialog?.mode === 'confirm-save' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setTemplateDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, submitTemplateDialog, !busy)}
            role="dialog"
          >
            <div className="dialog__title">Save Template</div>
            <div className="inspector__notice">
              Removing fields from <strong>{templateDialog.templateName}</strong> will delete data from nodes already using
              this template.
            </div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => setTemplateDialog(null)}
                type="button"
              >
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
        <div
          className="dialog-backdrop"
          onClick={() => !busy && setImportTemplateDialog(null)}
          role="presentation"
        >
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                () =>
                  importTemplateFromProject(
                    importTemplateDialog.sourceProjectId,
                    importTemplateDialog.sourceTemplateId,
                  ),
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
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => setImportTemplateDialog(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !importTemplateDialog.sourceProjectId || !importTemplateDialog.sourceTemplateId}
                onClick={() =>
                  void importTemplateFromProject(
                    importTemplateDialog.sourceProjectId,
                    importTemplateDialog.sourceTemplateId,
                  )
                }
                type="button"
              >
                Import Template
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sessionDialogOpen ? (
        <div className="dialog-backdrop" onClick={() => setSessionDialogOpen(false)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, () => setSessionDialogOpen(false))}
            role="dialog"
          >
            <div className="dialog__title">Mobile Capture</div>
            <div className="inspector__notice">
              Enter this session code on your phone to connect capture directly to this desktop session.
            </div>
            <div className="session-code">{desktopClientId}</div>
            <div className="inspector__notice">
              {mobileConnectionCount > 0
                ? `${mobileConnectionCount} active phone connection${mobileConnectionCount === 1 ? '' : 's'}`
                : 'No active phone connections'}
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setSessionDialogOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
