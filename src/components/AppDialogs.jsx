import { useMemo, useState } from 'react'

export default function AppDialogs({
  applyIdentificationTemplate,
  applyIdentificationTemplateToSelection,
  accountDialog,
  accountForm,
  accountStatus,
  busy,
  bulkTemplateCount,
  changePassword,
  changeUsername,
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
  projectApiKeyInput,
  identificationTemplateRemovalCount,
  identificationTemplateRemovalNodes,
  mobileConnectionCount,
  newFolderDialog,
  newFolderName,
  projects,
  renameProject,
  saveProjectOpenAiKey,
  selectedNode,
  selectedProjectId,
  sessionDialogOpen,
  setAccountDialog,
  setAccountForm,
  setDeleteNodeOpen,
  setDeleteProjectText,
  setExportFileName,
  setIdentificationTemplateRemovalNodeId,
  setImportProjectName,
  setNewFolderDialog,
  setNewFolderName,
  setProjectApiKeyInput,
  setSessionDialogOpen,
  setShowProjectDialog,
  setShowProjectId,
  projectName,
  setProjectName,
  showProjectDialog,
  submitNewFolder,
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

      {newFolderDialog ? (
        <div className="dialog-backdrop" onClick={() => !busy && setNewFolderDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                () => {
                  void submitNewFolder()
                },
                Boolean(newFolderName.trim()) && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">New Folder</div>
            <input
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setNewFolderDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !newFolderName.trim()}
                onClick={submitNewFolder}
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
              Exports normal folders and full-resolution photos as {`${exportFileName || `${tree?.project?.name || 'project'}-media`}.zip`}
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
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(event, deleteProject, deleteProjectText === tree?.project?.name && !busy)
            }
            role="dialog"
          >
            <div className="dialog__title">Delete Project</div>
            <div className="inspector__notice">
              Type <strong>{tree?.project?.name}</strong> to permanently delete this project.
            </div>
            <input
              autoFocus
              placeholder="Project name"
              value={deleteProjectText}
              onChange={(event) => setDeleteProjectText(event.target.value)}
            />
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy || deleteProjectText !== tree?.project?.name}
                onClick={deleteProject}
                type="button"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteNodeOpen ? (
        <div className="dialog-backdrop" onClick={() => setDeleteNodeOpen(false)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, deleteNode, !busy)}
            role="dialog"
          >
            <div className="dialog__title">Delete Node</div>
            <div className="inspector__notice">
              {hasBulkSelection ? (
                <>Delete <strong>{bulkSelectionCount} selected nodes</strong> and all child nodes?</>
              ) : (
                <>Delete <strong>{selectedNode?.name}</strong> and all child nodes?</>
              )}
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setDeleteNodeOpen(false)} type="button">
                Cancel
              </button>
              <button className="danger-button" disabled={busy} onClick={deleteNode} type="button">
                Delete Node
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {identificationTemplateRemovalCount ? (
        <div
          className="dialog-backdrop"
          onClick={() => !busy && setIdentificationTemplateRemovalNodeId(null)}
          role="presentation"
        >
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, confirmRemoveIdentificationTemplate, !busy)}
            role="dialog"
          >
            <div className="dialog__title">Remove Template</div>
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
            <div className="dialog__actions">
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => setIdentificationTemplateRemovalNodeId(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={confirmRemoveIdentificationTemplate}
                type="button"
              >
                Remove Template
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'apply-template' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Apply Template</div>
            {hasBulkSelection ? (
              <div className="inspector__notice">
                Apply a template to <strong>{bulkSelectionCount} selected nodes</strong>.
                {bulkTemplateCount ? ` ${bulkTemplateCount} currently have template data that may be replaced.` : ''}
              </div>
            ) : selectedNode?.identification ? (
              <div className="inspector__notice">
                Applying a different template here may replace the current template data on <strong>{selectedNode.name}</strong>.
              </div>
            ) : null}
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
                    try {
                      if (hasBulkSelection) {
                        await applyIdentificationTemplateToSelection(template.id)
                      } else {
                        await applyIdentificationTemplate(selectedNode.id, template.id)
                      }
                      setShowProjectDialog(null)
                    } catch {
                      // Parent handles global error state.
                    }
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

      {templateDialog?.mode === 'delete' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setTemplateDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, deleteTemplate, !busy)}
            role="dialog"
          >
            <div className="dialog__title">Delete Template</div>
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
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setTemplateDialog(null)} type="button">
                Cancel
              </button>
              <button className="danger-button" disabled={busy} onClick={deleteTemplate} type="button">
                Delete Template
              </button>
            </div>
          </div>
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
