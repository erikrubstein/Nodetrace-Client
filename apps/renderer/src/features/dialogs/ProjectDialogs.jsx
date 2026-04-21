import ConfirmDialog from '../../components/ConfirmDialog'
import IconButton from '../../components/IconButton'
import { GearIcon, GlobeIcon, PlusIcon, UserIcon, UsersIcon, WarningIcon } from '../../components/icons'
import { resolvePublicAssetUrl } from '../../lib/runtimePaths'

const nodetraceLogoUrl = resolvePublicAssetUrl('nodetrace.svg')

export default function ProjectDialogs({
  busy,
  canCloseProjectDialog = false,
  currentUser,
  deleteProject,
  deleteProjectText,
  desktopEnvironment = false,
  desktopProjectPickerLoading = false,
  desktopProjectPickerProjects = [],
  desktopProjectPickerProjectsProfileId = null,
  desktopProjectPickerProjectsOwnerUserId = null,
  desktopServerProfiles = [],
  error,
  exportFileName,
  exportMediaTree,
  exportProject,
  handleDialogEnter,
  importArchiveFile,
  importInputRef,
  importProject,
  importProjectName,
  onOpenManageAccounts = null,
  onOpenDesktopProject = null,
  onSelectDesktopServerProfile = null,
  openProjectFilter,
  openProjectSearch = '',
  setOpenProjectFilter,
  setOpenProjectSearch,
  connectedAccountFilter,
  setConnectedAccountFilter,
  projectApiKeyInput,
  projectName = '',
  projects,
  renameProject,
  saveProjectOpenAiKey,
  activeDesktopServerProfileId = null,
  selectedDesktopServerProfileId = null,
  selectedProjectId,
  setDeleteProjectText,
  setExportFileName,
  setImportProjectName,
  setProjectApiKeyInput,
  setProjectName,
  setShowProjectDialog,
  setShowProjectId,
  showProjectDialog,
  transferProgress,
  tree,
  createProject,
}) {
  const openProjectSource = desktopEnvironment ? desktopProjectPickerProjects : projects
  const selectedDesktopServerProfile =
    desktopServerProfiles.find((profile) => profile.id === selectedDesktopServerProfileId) || null
  const openProjectUserId = desktopEnvironment ? desktopProjectPickerProjectsOwnerUserId || null : currentUser?.id || null
  const canOpenProjectsForSelectedProfile = !desktopEnvironment || selectedDesktopServerProfile?.connectionStatus === 'connected'
  const suppressOpenProjectError =
    showProjectDialog === 'open' &&
    desktopEnvironment &&
    (/^Desktop proxy request failed/i.test(String(error || '')) ||
      /^Unable to reach the selected server profile\./i.test(String(error || '')))

  const sortedProjects = [...openProjectSource].sort((left, right) =>
    String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    }),
  )
  const normalizedProjectSearch = String(openProjectSearch || '').trim().toLowerCase()
  const visibleDesktopAccounts = [...desktopServerProfiles]
    .sort((left, right) =>
      String(left?.username || left?.baseUrl || '').localeCompare(String(right?.username || right?.baseUrl || ''), undefined, {
        sensitivity: 'base',
        numeric: true,
      }),
    )
    .filter((profile) => (connectedAccountFilter ? profile.connectionStatus === 'connected' : true))
  const visibleProjects = sortedProjects.filter((project) => {
    const owned = Boolean(project?.ownerUserId && project.ownerUserId === openProjectUserId)
    const nameMatches = !normalizedProjectSearch || String(project?.name || '').toLowerCase().includes(normalizedProjectSearch)
    if (!nameMatches) {
      return false
    }
    if (openProjectFilter === 'owned') {
      return owned
    }
    if (openProjectFilter === 'collaborator') {
      return !owned
    }
    return true
  })
  const showActiveProjectSelection =
    !desktopEnvironment || (
      Boolean(activeDesktopServerProfileId) &&
      activeDesktopServerProfileId === desktopProjectPickerProjectsProfileId
    )
  function toggleOpenProjectFilter(filterKey) {
    setOpenProjectFilter((current) => (current === filterKey ? null : filterKey))
  }

  function openDesktopAccountManager(profileId) {
    onOpenManageAccounts?.(profileId)
  }

  function renderProjectPickerContent(mode) {
    if (mode === 'needs-profile') {
      return <div className="inspector__notice">Add a server profile before opening projects.</div>
    }

    if (mode === 'disconnected') {
      return (
        <div className="project-picker__state-stack">
          <div className="inspector__notice">
            {selectedDesktopServerProfile?.connectionStatus === 'invalid_login' ? (
              <>
                <strong>{selectedDesktopServerProfile?.username || 'This server profile'}</strong> has invalid login credentials. Re-authenticate or fix it before opening projects.
              </>
            ) : (
              <>
                <strong>{selectedDesktopServerProfile?.username || 'This server profile'}</strong> is disconnected. Reconnect the server to view its projects.
              </>
            )}
          </div>
          <div className="project-picker__state-actions">
            <button className="ghost-button" disabled={busy} onClick={() => void openDesktopAccountManager(selectedDesktopServerProfile?.id)} type="button">
              Manage Server Profile
            </button>
          </div>
        </div>
      )
    }

    if (mode === 'projects') {
      return (
        <div className="project-picker__content-slot project-picker__content-slot--loaded">
          <div className="project-list project-list--fill">
            {visibleProjects.map((project) => {
              const ownedProject = Boolean(project?.ownerUserId && project.ownerUserId === openProjectUserId)
              const publicProject = Boolean(project?.isPublic)
              const showPublicIndicator = publicProject && !ownedProject
              const collaboratorProject = !ownedProject && !publicProject
              return (
                <button
                  key={project.id}
                  className={`project-row ${showActiveProjectSelection && project.id === selectedProjectId ? 'active' : ''}`}
                  onClick={() => {
                    if (desktopEnvironment) {
                      void onOpenDesktopProject?.(desktopProjectPickerProjectsProfileId, project.id)
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
                    {showPublicIndicator ? (
                      <span className="icon-button-wrap project-row__icon-wrap project-row__collaborator-indicator">
                        <span className="project-row__icon project-row__icon-button" aria-hidden="true">
                          <GlobeIcon />
                        </span>
                        <span aria-hidden="true" className="icon-tooltip project-row__icon-tooltip">
                          {`Owner: ${project.ownerUsername || 'Unknown'}`}
                        </span>
                      </span>
                    ) : collaboratorProject ? (
                      <span className="icon-button-wrap project-row__icon-wrap project-row__collaborator-indicator">
                        <span className="project-row__icon project-row__icon-button" aria-hidden="true">
                          <UsersIcon />
                        </span>
                        <span aria-hidden="true" className="icon-tooltip project-row__icon-tooltip">
                          {`Owner: ${project.ownerUsername || 'Unknown'}`}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <small>{project.node_count} nodes</small>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (mode === 'pending') {
      return <div className="project-picker__content-slot" />
    }

    return (
      <div className="project-picker__content-slot project-picker__content-slot--loaded">
        <div className="inspector__notice">
          {openProjectSource.length
            ? normalizedProjectSearch
              ? 'No projects match the current search.'
              : 'No projects match the selected filter.'
            : 'No projects available on this server profile yet.'}
        </div>
      </div>
    )
  }

  return (
    <>
      {showProjectDialog === 'create' ? (
        <div className="dialog-backdrop" onClick={() => setShowProjectDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, createProject, Boolean(projectName.trim()) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Create Project</div>
            <input autoFocus placeholder="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !projectName.trim()} onClick={createProject} type="button">
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
            <input autoFocus placeholder="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !projectName.trim()} onClick={renameProject} type="button">
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
              <button className="ghost-button" disabled={busy || !projectApiKeyInput.trim()} onClick={saveProjectOpenAiKey} type="button">
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
            if (!canCloseProjectDialog) {
              return
            }
            setShowProjectDialog(null)
          }}
          role="presentation"
        >
          <div className="dialog dialog--wide dialog--frameless project-picker-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="project-picker__brand">
              <img alt="Nodetrace" className="project-picker__brand-logo" src={nodetraceLogoUrl} />
              <div className="project-picker__brand-title">Nodetrace</div>
            </div>
            <div className={`project-picker${desktopEnvironment ? ' project-picker--desktop' : ''}`}>
              {desktopEnvironment ? (
                <div className="project-picker__card project-picker__card--servers">
                <div className="project-picker__card-header">
                  <div className="project-picker__section-title">Select Server Profile</div>
                  <div className="project-picker__card-actions-inline">
                    {onOpenManageAccounts ? (
                      <IconButton className="tool-button" disabled={busy} onClick={onOpenManageAccounts} tooltip="Manage Server Profiles">
                        <GearIcon />
                      </IconButton>
                    ) : null}
                  </div>
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
                              <button className="project-row__main-button" disabled={busy} onClick={() => void onSelectDesktopServerProfile?.(profile.id)} type="button">
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
                  <div className="project-picker__card-actions-inline">
                    {!desktopEnvironment && onOpenManageAccounts ? (
                      <IconButton
                        className="tool-button"
                        disabled={busy}
                        onClick={() => void onOpenManageAccounts()}
                        tooltip="Manage Account"
                      >
                        <UserIcon />
                      </IconButton>
                    ) : null}
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
                </div>
                <div className="project-picker__card-body">
                  <div className="project-picker__filters">
                    <button className={`project-picker__filter ${openProjectFilter === 'owned' ? 'is-active' : ''}`} disabled={busy} onClick={() => toggleOpenProjectFilter('owned')} type="button">
                      Owned
                    </button>
                    <button className={`project-picker__filter ${openProjectFilter === 'collaborator' ? 'is-active' : ''}`} disabled={busy} onClick={() => toggleOpenProjectFilter('collaborator')} type="button">
                      Not Owned
                    </button>
                  </div>
                  <div className="project-picker__divider" />
                  <input
                    autoFocus={!desktopEnvironment}
                    className="project-picker__search"
                    disabled={busy || (desktopEnvironment && !canOpenProjectsForSelectedProfile)}
                    onChange={(event) => setOpenProjectSearch(event.target.value)}
                    placeholder="Search projects"
                    type="text"
                    value={openProjectSearch}
                  />
                  <div className="project-picker__divider" />
                  {renderProjectPickerContent(
                    desktopEnvironment && !selectedDesktopServerProfile
                      ? 'needs-profile'
                      : desktopEnvironment && selectedDesktopServerProfile?.connectionStatus !== 'connected'
                        ? 'disconnected'
                        : desktopEnvironment && desktopProjectPickerLoading && !visibleProjects.length
                          ? 'pending'
                        : visibleProjects.length
                            ? 'projects'
                            : 'empty',
                  )}
                  {canCloseProjectDialog ? (
                    <div className="project-picker__card-actions">
                      <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
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

      {showProjectDialog === 'export' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleDialogEnter(event, exportProject, Boolean(selectedProjectId) && !busy)} role="dialog">
            <div className="dialog__title">Export Project</div>
            <input autoFocus placeholder="Archive filename" value={exportFileName} onChange={(event) => setExportFileName(event.target.value.replace(/\.zip$/i, ''))} />
            <div className="inspector__notice">File will be saved as {`${exportFileName || tree?.project?.name || 'project'}.zip`}</div>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !selectedProjectId} onClick={exportProject} type="button">
                Export
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'export-media' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleDialogEnter(event, exportMediaTree, Boolean(selectedProjectId) && !busy)} role="dialog">
            <div className="dialog__title">Export Media Tree</div>
            <input autoFocus placeholder="Archive filename" value={exportFileName} onChange={(event) => setExportFileName(event.target.value.replace(/\.zip$/i, ''))} />
            <div className="inspector__notice">
              Exports the current node tree as folders with full-resolution photos in {`${exportFileName || `${tree?.project?.name || 'project'}-media`}.zip`}
            </div>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !selectedProjectId} onClick={exportMediaTree} type="button">
                Export
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectDialog === 'import' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setShowProjectDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleDialogEnter(event, importProject, Boolean(importArchiveFile) && !busy)} role="dialog">
            <div className="dialog__title">Import Project</div>
            <input placeholder="New project name" value={importProjectName} onChange={(event) => setImportProjectName(event.target.value)} />
            <button className="ghost-button" disabled={busy} onClick={() => importInputRef.current?.click()} type="button">
              {importArchiveFile ? importArchiveFile.name : 'Choose Archive'}
            </button>
            <progress className="transfer-progress" max="100" value={transferProgress ?? undefined} />
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setShowProjectDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !importArchiveFile} onClick={importProject} type="button">
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
            onKeyDown={(event) => handleDialogEnter(event, deleteProject, deleteProjectText === tree?.project?.name && !busy)}
            title="Delete Project"
          >
            <div className="inspector__notice">
              Type <strong>{tree?.project?.name}</strong> to permanently delete this project.
            </div>
            <input autoFocus placeholder="Project name" value={deleteProjectText} onChange={(event) => setDeleteProjectText(event.target.value)} />
          </ConfirmDialog>
        </div>
      ) : null}
    </>
  )
}
