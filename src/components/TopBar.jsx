import IconButton from './IconButton'
import {
  MoonIcon,
  PhoneIcon,
  SunIcon,
} from './icons'

export default function TopBar({
  busy,
  fileInputRef,
  fitCanvasToView,
  focusPathMode,
  historyState,
  importInputRef,
  importProjectName,
  mobileConnectionCount,
  openNewFolderDialog,
  openMenu,
  pendingUploadMode,
  pendingUploadParentId,
  onPresenceSelect,
  presenceUsers,
  projectName,
  projects,
  redo,
  appendChildren,
  appendParents,
  appendSearchResults,
  appendVariants,
  invertSelection,
  selectedNode,
  selectedProjectId,
  selectionCount,
  setAllNodesCollapsed,
  setDeleteNodeOpen,
  setExportFileName,
  setFocusPathMode,
  setImportArchiveFile,
  setImportProjectName,
  setOpenMenu,
  setSessionDialogOpen,
  setShowProjectDialog,
  selectChildren,
  selectParents,
  selectSearchResults,
  selectVariants,
  searchResultCount,
  theme,
  triggerAddPhoto,
  triggerAddVariantPhoto,
  toggleTheme,
  tree,
  undo,
  uploadFiles,
  style,
}) {
  return (
    <header className="topbar" style={style}>
      <div className="topbar__left">
        <img alt="Nodetrace" className="topbar__logo" src="/nodetrace.svg" />
        <div className="menu-wrap">
          <button
            className={`menu-trigger ${openMenu === 'file' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'file' ? null : 'file'))}
            type="button"
          >
            File
          </button>
          {openMenu === 'file' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                onClick={() => {
                  setShowProjectDialog('create')
                  setOpenMenu(null)
                }}
                type="button"
              >
                Create Project
              </button>
              <button
                className="menu-item"
                disabled={projects.length === 0}
                onClick={() => {
                  setShowProjectDialog('open')
                  setOpenMenu(null)
                }}
                type="button"
              >
                Open Project
              </button>
              <div className="menu-submenu-wrap">
                <button className="menu-item" disabled={!selectedProjectId || busy} type="button">
                  <span>Export</span>
                  <span aria-hidden="true" className="menu-submenu-caret">
                    <i className="fa-solid fa-chevron-right" />
                  </span>
                </button>
                <div className="menu-panel menu-panel--submenu">
                  <button
                    className="menu-item"
                    disabled={!selectedProjectId || busy}
                    onClick={() => {
                      setExportFileName(`${tree?.project?.name || 'project'}-media`)
                      setShowProjectDialog('export-media')
                      setOpenMenu(null)
                    }}
                    type="button"
                  >
                    Export Media Tree
                  </button>
                </div>
              </div>
              <button
                className="menu-item"
                disabled={!selectedProjectId || busy}
                onClick={() => {
                  setExportFileName(tree?.project?.name || 'project')
                  setShowProjectDialog('export')
                  setOpenMenu(null)
                }}
                type="button"
              >
                Export Project
              </button>
              <button
                className="menu-item"
                disabled={busy}
                onClick={() => {
                  setImportProjectName('')
                  setImportArchiveFile(null)
                  setShowProjectDialog('import')
                  setOpenMenu(null)
                }}
                type="button"
              >
                Import Project
              </button>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
          <button
            className={`menu-trigger ${openMenu === 'edit' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'edit' ? null : 'edit'))}
            type="button"
          >
            Edit
          </button>
          {openMenu === 'edit' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                disabled={historyState.undo === 0 || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void undo()
                }}
                type="button"
              >
                Undo
              </button>
              <button
                className="menu-item"
                disabled={historyState.redo === 0 || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void redo()
                }}
                type="button"
              >
                Redo
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || selectedNode.isVariant || busy}
                onClick={() => {
                  setOpenMenu(null)
                  openNewFolderDialog()
                }}
                type="button"
              >
                Add Folder
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || selectedNode.isVariant || busy}
                onClick={() => {
                  setOpenMenu(null)
                  triggerAddPhoto()
                }}
                type="button"
              >
                Add Photo
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || busy}
                onClick={() => {
                  setOpenMenu(null)
                  triggerAddVariantPhoto()
                }}
                type="button"
              >
                Add Variant Photo
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || selectedNode.parent_id == null || busy}
                onClick={() => {
                  setOpenMenu(null)
                  setDeleteNodeOpen(true)
                }}
                type="button"
              >
                Delete Node
              </button>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
          <button
            className={`menu-trigger ${openMenu === 'select' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'select' ? null : 'select'))}
            type="button"
          >
            Select
          </button>
          {openMenu === 'select' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                disabled={!searchResultCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  selectSearchResults()
                }}
                type="button"
              >
                Select Results
              </button>
              <button
                className="menu-item"
                disabled={!selectionCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  selectParents()
                }}
                type="button"
              >
                Select Parents
              </button>
              <button
                className="menu-item"
                disabled={!selectionCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  selectChildren()
                }}
                type="button"
              >
                Select Children
              </button>
              <button
                className="menu-item"
                disabled={!selectionCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  selectVariants()
                }}
                type="button"
              >
                Select Variants
              </button>
              <button
                className="menu-item"
                disabled={!searchResultCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  appendSearchResults()
                }}
                type="button"
              >
                Append Select Results
              </button>
              <button
                className="menu-item"
                disabled={!selectionCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  appendParents()
                }}
                type="button"
              >
                Append Select Parents
              </button>
              <button
                className="menu-item"
                disabled={!selectionCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  appendChildren()
                }}
                type="button"
              >
                Append Select Children
              </button>
              <button
                className="menu-item"
                disabled={!selectionCount || busy}
                onClick={() => {
                  setOpenMenu(null)
                  appendVariants()
                }}
                type="button"
              >
                Append Select Variants
              </button>
              <button
                className="menu-item"
                disabled={!tree?.nodes?.length || busy}
                onClick={() => {
                  setOpenMenu(null)
                  invertSelection()
                }}
                type="button"
              >
                Invert Selection
              </button>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
          <button
            className={`menu-trigger ${openMenu === 'view' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'view' ? null : 'view'))}
            type="button"
          >
            View
          </button>
          {openMenu === 'view' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                disabled={!tree?.nodes?.length || busy || focusPathMode}
                onClick={() => void setAllNodesCollapsed(true)}
                type="button"
              >
                Collapse All
              </button>
              <button
                className="menu-item"
                disabled={!tree?.nodes?.length || busy || focusPathMode}
                onClick={() => void setAllNodesCollapsed(false)}
                type="button"
              >
                Expand All
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setFocusPathMode((enabled) => !enabled)
                  setOpenMenu(null)
                }}
                type="button"
              >
                {focusPathMode ? 'Disable Focus Path' : 'Enable Focus Path'}
              </button>
              <button
                className="menu-item"
                disabled={!tree?.nodes?.length}
                onClick={() => {
                  fitCanvasToView()
                  setOpenMenu(null)
                }}
                type="button"
              >
                Fit View
              </button>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
        </div>

        <span className="topbar__separator">|</span>
        <div className="project-chip">{projectName || 'No project'}</div>
        <input
          ref={fileInputRef}
          accept="image/*"
          hidden
          multiple
          onChange={(event) =>
            uploadFiles(
              Array.from(event.target.files || []),
              pendingUploadParentId || selectedNode?.id,
              pendingUploadMode,
            )
          }
          type="file"
        />
        <input
          ref={importInputRef}
          accept=".zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            setImportArchiveFile(file)
            if (file && !importProjectName) {
              setImportProjectName(file.name.replace(/\.zip$/i, ''))
            }
          }}
          type="file"
        />
      </div>

      <div className="topbar__right">
        {presenceUsers?.length ? (
          <div className="topbar__presence-list">
            {presenceUsers.map((user) => (
              <span className="icon-button-wrap topbar__presence-item" key={user.userId}>
                <button
                  aria-label={user.selectedNodeName ? `${user.username}: ${user.selectedNodeName}` : user.username}
                  className="topbar__presence-chip"
                  disabled={!user.selectedNodeId}
                  onClick={() => {
                    if (user.selectedNodeId) {
                      void onPresenceSelect?.(user.selectedNodeId)
                    }
                  }}
                  style={{ '--presence-color': user.color }}
                  type="button"
                >
                  {user.initials}
                </button>
                <span aria-hidden="true" className="icon-tooltip">
                  {user.selectedNodeName ? `${user.username}: ${user.selectedNodeName}` : user.username}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        <IconButton
          aria-label="Show mobile capture session"
          className={mobileConnectionCount > 0 ? 'icon-button--connected' : ''}
          onClick={() => setSessionDialogOpen(true)}
          tooltip="Mobile Capture"
        >
          {mobileConnectionCount > 0 ? (
            <span className="icon-count-wrap">
              <PhoneIcon />
              <span className="icon-count">{mobileConnectionCount}</span>
            </span>
          ) : (
            <PhoneIcon />
          )}
        </IconButton>
        <IconButton
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
          tooltip={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </div>
    </header>
  )
}
