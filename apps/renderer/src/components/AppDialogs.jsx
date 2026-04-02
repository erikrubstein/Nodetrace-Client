import { useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import IconButton from './IconButton'
import { GearIcon, PlusIcon, UsersIcon, WarningIcon } from './icons'

export default function AppDialogs({
  accountDialog,
  accountForm,
  accountDialogUsername = '',
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
  desktopEnvironment = false,
  desktopProjectPickerLoading = false,
  desktopProjectPickerProjects = [],
  desktopServerProfiles = [],
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
  onOpenManageAccounts = null,
  onOpenDesktopProject = null,
  onSelectDesktopServerProfile = null,
  projects,
  renameProject,
  logoutUser,
  saveProjectOpenAiKey,
  selectedNode,
  selectedDesktopServerProfileId = null,
  selectedProjectId,
  serverDisconnectDialogOpen = false,
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
  projectName = '',
  setProjectName,
  setMergePhotoConfirmation,
  showProjectDialog,
  handleServerDisconnectDismiss,
  submitNewNode,
  submitTemplateDialog,
  transferProgress,
  tree,
  bulkSelectionCount,
  templateDialog,
  setTemplateDialog,
}) {
  const [openProjectFilter, setOpenProjectFilter] = useState(null)
  const [connectedAccountFilter, setConnectedAccountFilter] = useState(false)
  const [showProjectLoadingNotice, setShowProjectLoadingNotice] = useState(false)
  const [collaboratorTooltip, setCollaboratorTooltip] = useState(null)
  const collaboratorTooltipHideTimeoutRef = useRef(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setShowProjectLoadingNotice(desktopProjectPickerLoading)
    }, desktopProjectPickerLoading ? 140 : 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [desktopProjectPickerLoading])

  useEffect(() => {
    if (!collaboratorTooltip || collaboratorTooltip.visible) {
      return undefined
    }

    const frame = window.requestAnimationFrame(() => {
      setCollaboratorTooltip((current) => (current ? { ...current, visible: true } : current))
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [collaboratorTooltip])

  useEffect(() => {
    return () => {
      if (collaboratorTooltipHideTimeoutRef.current != null) {
        window.clearTimeout(collaboratorTooltipHideTimeoutRef.current)
      }
    }
  }, [])

  const openProjectSource = desktopEnvironment ? desktopProjectPickerProjects : projects
  const selectedDesktopServerProfile = useMemo(
    () => desktopServerProfiles.find((profile) => profile.id === selectedDesktopServerProfileId) || null,
    [desktopServerProfiles, selectedDesktopServerProfileId],
  )
  const openProjectUserId = desktopEnvironment
    ? selectedDesktopServerProfile?.userId || null
    : currentUser?.id || null
  const canOpenProjectsForSelectedProfile = !desktopEnvironment || selectedDesktopServerProfile?.connectionStatus === 'connected'
  const suppressOpenProjectError =
    showProjectDialog === 'open' &&
    desktopEnvironment &&
    selectedDesktopServerProfile?.connectionStatus !== 'connected' &&
    /^Desktop proxy request failed/i.test(String(error || ''))
  const sortedProjects = useMemo(
    () =>
      [...openProjectSource].sort((left, right) =>
        String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
      ),
    [openProjectSource],
  )
  const visibleDesktopAccounts = useMemo(
    () =>
      desktopServerProfiles.filter((profile) =>
        connectedAccountFilter ? profile.connectionStatus === 'connected' : true,
      ),
    [connectedAccountFilter, desktopServerProfiles],
  )

  const visibleProjects = useMemo(
    () =>
      sortedProjects.filter((project) => {
        const owned = Boolean(project?.ownerUserId && project.ownerUserId === openProjectUserId)
        if (openProjectFilter === 'owned') {
          return owned
        }
        if (openProjectFilter === 'collaborator') {
          return !owned
        }
        return true
      }),
    [openProjectFilter, openProjectUserId, sortedProjects],
  )

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

  function toggleOpenProjectFilter(filterKey) {
    setOpenProjectFilter((current) => (current === filterKey ? null : filterKey))
  }

  function openDesktopAccountManager(profileId) {
    onOpenManageAccounts?.(profileId)
  }

  function showCollaboratorTooltip(event, ownerUsername) {
    if (collaboratorTooltipHideTimeoutRef.current != null) {
      window.clearTimeout(collaboratorTooltipHideTimeoutRef.current)
      collaboratorTooltipHideTimeoutRef.current = null
    }
    const anchorRect = event.currentTarget.getBoundingClientRect()
    setCollaboratorTooltip({
      text: `Owner: ${ownerUsername || 'Unknown'}`,
      top: anchorRect.bottom + 8,
      left: anchorRect.left + anchorRect.width / 2,
      visible: false,
    })
  }

  function hideCollaboratorTooltip() {
    setCollaboratorTooltip((current) => (current ? { ...current, visible: false } : current))
    if (collaboratorTooltipHideTimeoutRef.current != null) {
      window.clearTimeout(collaboratorTooltipHideTimeoutRef.current)
    }
    collaboratorTooltipHideTimeoutRef.current = window.setTimeout(() => {
      setCollaboratorTooltip(null)
      collaboratorTooltipHideTimeoutRef.current = null
    }, 120)
  }

  const resolvedAccountDialogUsername = accountDialogUsername || currentUser?.username || ''

  return (
    <>
      {accountDialog === 'overview' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Manage Account</div>
            <div className="inspector__notice">
              Signed in as <strong>{resolvedAccountDialogUsername || 'Unknown user'}</strong>
            </div>
            <div className="field-stack">
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => setAccountDialog('username')}
                type="button"
              >
                Change Username
              </button>
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => setAccountDialog('password')}
                type="button"
              >
                Change Password
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => setAccountDialog('delete-account')}
                type="button"
              >
                Delete Account
              </button>
              <button className="ghost-button" disabled={busy} onClick={logoutUser} type="button">
                Logout
              </button>
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                Boolean(
                  accountForm.currentPassword &&
                    accountForm.newPassword &&
                    accountForm.confirmPassword &&
                    accountForm.newPassword === accountForm.confirmPassword,
                ) && !busy,
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
            <input
              onChange={(event) => setAccountForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              placeholder="Retype new password"
              type="password"
              value={accountForm.confirmPassword || ''}
            />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountForm.confirmPassword && accountForm.newPassword !== accountForm.confirmPassword ? (
              <div className="inspector__notice error">New passwords do not match.</div>
            ) : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !accountForm.currentPassword ||
                  !accountForm.newPassword ||
                  !accountForm.confirmPassword ||
                  accountForm.newPassword !== accountForm.confirmPassword
                }
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
                accountForm.deleteConfirmation === resolvedAccountDialogUsername && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">Delete Account</div>
            <div className="inspector__notice">
              Type <strong>{resolvedAccountDialogUsername}</strong> to permanently delete this account from the server.
            </div>
            <div className="inspector__notice error">
              This is not just removing a saved login from this client. It deletes the real server account and any server-side access tied to it.
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
                disabled={busy || accountForm.deleteConfirmation !== resolvedAccountDialogUsername}
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
            setShowProjectDialog(null)
          }}
          role="presentation"
        >
          <div
            className="dialog dialog--wide dialog--frameless project-picker-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className={`project-picker${desktopEnvironment ? ' project-picker--desktop' : ''}`}>
              {desktopEnvironment ? (
                <div className="project-picker__card project-picker__card--servers">
                  <div className="project-picker__card-header">
                    <div className="project-picker__section-title">Select Server Profile</div>
                    {onOpenManageAccounts ? (
                      <IconButton
                        className="tool-button"
                        disabled={busy}
                        onClick={onOpenManageAccounts}
                        tooltip="Manage Server Profiles"
                      >
                        <GearIcon />
                      </IconButton>
                    ) : null}
                  </div>
                  <div className="project-picker__card-body project-picker__card-body--servers project-picker__card-body--server-filtered">
                    <div className="project-picker__filters">
                      <button
                        className={`project-picker__filter ${connectedAccountFilter ? 'is-active' : ''}`}
                        disabled={busy}
                        onClick={() => setConnectedAccountFilter((current) => !current)}
                        type="button"
                      >
                        Connected
                      </button>
                    </div>
                    <div className="project-picker__divider" />
                    <div className="project-list project-list--fill">
                      {visibleDesktopAccounts.length ? (
                        visibleDesktopAccounts.map((profile) => {
                          const selected = profile.id === selectedDesktopServerProfileId
                          const hasWarning = profile.connectionStatus !== 'connected'
                          const warningClass =
                            profile.connectionStatus === 'invalid_login'
                              ? 'project-row__warning-inline--invalid'
                              : 'project-row__warning-inline--disconnected'
                          return (
                            <div
                              key={profile.id}
                              className={`project-row project-row--account ${selected ? 'active' : ''} ${hasWarning ? 'project-row--warning' : ''}`}
                            >
                              <button
                                className="project-row__main-button"
                                disabled={busy}
                                onClick={() => {
                                  void onSelectDesktopServerProfile?.(profile.id)
                                }}
                                type="button"
                              >
                                <span className="project-row__account-meta">
                                  <span>{profile.username || profile.baseUrl || 'Server Profile'}</span>
                                  <small>{profile.baseUrl}</small>
                                </span>
                              </button>
                              {hasWarning ? (
                                <span className={`project-row__warning-inline ${warningClass}`} aria-hidden="true">
                                  <WarningIcon />
                                </span>
                              ) : null}
                            </div>
                          )
                        })
                      ) : (
                        <div className="inspector__notice">
                          {connectedAccountFilter ? 'No connected server profiles found.' : 'No desktop server profiles saved yet.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="project-picker__card project-picker__card--projects">
                <div className="project-picker__card-header">
                  <div className="project-picker__section-title">Open Project</div>
                  <IconButton
                    className="tool-button"
                    disabled={busy || (desktopEnvironment && !canOpenProjectsForSelectedProfile)}
                    onClick={() => {
                      setProjectName('')
                      setShowProjectDialog('create')
                    }}
                    tooltip="Create Project"
                  >
                    <PlusIcon />
                  </IconButton>
                </div>
                  <div className="project-picker__card-body">
                    <div className="project-picker__filters">
                      <button
                        className={`project-picker__filter ${openProjectFilter === 'owned' ? 'is-active' : ''}`}
                        disabled={busy}
                        onClick={() => toggleOpenProjectFilter('owned')}
                        type="button"
                      >
                        Owned
                      </button>
                      <button
                        className={`project-picker__filter ${openProjectFilter === 'collaborator' ? 'is-active' : ''}`}
                        disabled={busy}
                        onClick={() => toggleOpenProjectFilter('collaborator')}
                        type="button"
                      >
                        Collaborator
                      </button>
                    </div>
                    <div className="project-picker__divider" />
                  {desktopEnvironment && !selectedDesktopServerProfile ? (
                    <div className="inspector__notice">Add a server profile before opening projects.</div>
                  ) : desktopEnvironment && selectedDesktopServerProfile?.connectionStatus !== 'connected' ? (
                    <div className="project-picker__state-stack">
                      <div className="inspector__notice">
                        {selectedDesktopServerProfile?.connectionStatus === 'invalid_login' ? (
                          <>
                            <strong>{selectedDesktopServerProfile?.username || 'This server profile'}</strong> has invalid login
                            credentials. Re-authenticate or fix it before opening projects.
                          </>
                        ) : (
                          <>
                            <strong>{selectedDesktopServerProfile?.username || 'This server profile'}</strong> is disconnected.
                            Reconnect the server to view its projects.
                          </>
                        )}
                      </div>
                      <div className="project-picker__state-actions">
                        <button
                          className="ghost-button"
                          disabled={busy}
                          onClick={() => void openDesktopAccountManager(selectedDesktopServerProfile?.id)}
                          type="button"
                        >
                          Manage Server Profile
                        </button>
                      </div>
                    </div>
                  ) : desktopProjectPickerLoading && showProjectLoadingNotice ? (
                    <div className="inspector__notice">Loading projects...</div>
                  ) : desktopProjectPickerLoading ? (
                    <div className="project-picker__loading-placeholder" aria-hidden="true" />
                  ) : visibleProjects.length ? (
                    <div className="project-list project-list--fill">
                      {visibleProjects.map((project) => {
                        const collaboratorProject = !(project?.ownerUserId && project.ownerUserId === openProjectUserId)
                        return (
                          <button
                            key={project.id}
                            className={`project-row ${project.id === selectedProjectId ? 'active' : ''}`}
                            onClick={() => {
                              if (desktopEnvironment) {
                                void onOpenDesktopProject?.(selectedDesktopServerProfile?.id, project.id)
                                return
                              }
                              setShowProjectId(project.id)
                              setShowProjectDialog(null)
                            }}
                            disabled={!canOpenProjectsForSelectedProfile}
                            type="button"
                          >
                            <span className="project-row__name">
                                <span>{project.name}</span>
                              {collaboratorProject ? (
                                <span
                                  className="project-row__icon-wrap project-row__collaborator-indicator"
                                  onMouseEnter={(event) => showCollaboratorTooltip(event, project.ownerUsername)}
                                  onMouseLeave={hideCollaboratorTooltip}
                                  onFocus={(event) => showCollaboratorTooltip(event, project.ownerUsername)}
                                  onBlur={hideCollaboratorTooltip}
                                >
                                  <span className="project-row__icon project-row__icon-button" aria-hidden="true">
                                    <UsersIcon />
                                  </span>
                                </span>
                              ) : null}
                            </span>
                            <small>{project.node_count} nodes</small>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="inspector__notice">
                      {openProjectSource.length
                        ? 'No projects match the selected filter.'
                        : 'No projects available on this server profile yet.'}
                    </div>
                  )}
                  {canCloseOpenProjectDialog ? (
                    <div className="project-picker__card-actions">
                      <button
                        className="ghost-button"
                        disabled={busy}
                        onClick={() => {
                          setShowProjectDialog(null)
                        }}
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {error && !suppressOpenProjectError ? <div className="inspector__notice error">{error}</div> : null}
          </div>
        </div>
      ) : null}

      {serverDisconnectDialogOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <ConfirmDialog
            confirmLabel="Go To Projects"
            confirmTone="ghost"
            onConfirm={() => {
              handleServerDisconnectDismiss?.()
            }}
            title="Server Profile Disconnected"
          >
            <div className="inspector__notice">
              The server profile for the current project disconnected.
            </div>
          </ConfirmDialog>
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
            <div className="dialog__actions">
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => setShowProjectDialog(null)}
                type="button"
              >
                Close
              </button>
            </div>
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

      {collaboratorTooltip ? (
        <div
          aria-hidden="true"
          className={`icon-tooltip icon-tooltip--floating ${collaboratorTooltip.visible ? 'icon-tooltip--visible' : ''}`}
          style={{
            top: `${collaboratorTooltip.top}px`,
            left: `${collaboratorTooltip.left}px`,
          }}
        >
          {collaboratorTooltip.text}
        </div>
      ) : null}
    </>
  )
}
