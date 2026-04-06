import IconButton from './IconButton'
import { resolvePublicAssetUrl } from '../lib/runtimePaths'
import {
  MoonIcon,
  PhoneIcon,
  SunIcon,
} from './icons'

const brandLogoUrl = resolvePublicAssetUrl('nodetrace.svg')

export default function TopBar({
  appVersion = '0.0.0',
  busy,
  canCollapseRecursively = false,
  canCollapseSelected = false,
  canExpandRecursively = false,
  canExpandSelected = false,
  canvasIsolationMode = 'none',
  desktopWindowMaximized = false,
  fileInputRef,
  fitCanvasToView,
  focusPathMode,
  historyState,
  importInputRef,
  importProjectName,
  mobileConnectionCount,
  openNewNodeDialog,
  openMenu,
  pendingUploadMode,
  pendingUploadParentId,
  onPresenceSelect,
  presenceUsers,
  projectLoading = false,
  projectName,
  redo,
  appendChildren,
  appendParents,
  appendSearchResults,
  invertSelection,
  selectedNode,
  selectedProjectId,
  selectionCount,
  setCollapsedRecursively,
  setCollapsedSelected,
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
  theme,
  triggerAddPhoto,
  triggerAddPhotoNode,
  toggleTheme,
  togglePathIsolation,
  toggleSearchIsolation,
  tree,
  undo,
  uploadFiles,
  onCheckForUpdates = null,
  onOpenSettings = null,
  onDesktopClose,
  onDesktopMinimize,
  onDesktopToggleMaximize,
  showDesktopControls = false,
  style,
}) {
  return (
    <header className={`topbar ${showDesktopControls ? 'topbar--desktop' : ''}`} style={style}>
      <div className="topbar__left topbar__no-drag">
        <img alt="Nodetrace" className="topbar__logo" src={brandLogoUrl} />
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
                onClick={() => {
                  setShowProjectDialog('open')
                  setOpenMenu(null)
                }}
                type="button"
              >
                Open Project
              </button>
              <div className="menu-submenu-wrap">
                <button className="menu-item" disabled={busy} type="button">
                  <span>Import</span>
                  <span aria-hidden="true" className="menu-submenu-caret">
                    <i className="fa-solid fa-chevron-right" />
                  </span>
                </button>
                <div className="menu-panel menu-panel--submenu">
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
                    Project
                  </button>
                </div>
              </div>
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
                      setExportFileName(tree?.project?.name || 'project')
                      setShowProjectDialog('export')
                      setOpenMenu(null)
                    }}
                    type="button"
                  >
                    Project
                  </button>
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
                    Media Tree
                  </button>
                </div>
              </div>
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
                disabled={!selectedNode || busy}
                onClick={() => {
                  setOpenMenu(null)
                  openNewNodeDialog()
                }}
                type="button"
              >
                Add Node
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || busy}
                onClick={() => {
                  setOpenMenu(null)
                  triggerAddPhotoNode()
                }}
                type="button"
              >
                Add Photo Node
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || busy}
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
                disabled={busy}
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
                disabled={busy}
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
            className={`menu-trigger ${openMenu === 'tree' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'tree' ? null : 'tree'))}
            type="button"
          >
            Tree
          </button>
          {openMenu === 'tree' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                disabled={!tree?.nodes?.length || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void setAllNodesCollapsed(true)
                }}
                type="button"
              >
                Collapse All
              </button>
              <button
                className="menu-item"
                disabled={!canCollapseSelected || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void setCollapsedSelected(true)
                }}
                type="button"
              >
                Collapse Selected
              </button>
              <button
                className="menu-item"
                disabled={!canCollapseRecursively || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void setCollapsedRecursively(true)
                }}
                type="button"
              >
                Collapse Recursively
              </button>
              <button
                className="menu-item"
                disabled={!tree?.nodes?.length || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void setAllNodesCollapsed(false)
                }}
                type="button"
              >
                Expand All
              </button>
              <button
                className="menu-item"
                disabled={!canExpandSelected || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void setCollapsedSelected(false)
                }}
                type="button"
              >
                Expand Selected
              </button>
              <button
                className="menu-item"
                disabled={!canExpandRecursively || busy}
                onClick={() => {
                  setOpenMenu(null)
                  void setCollapsedRecursively(false)
                }}
                type="button"
              >
                Expand Recursively
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
                disabled={busy}
                onClick={() => {
                  setOpenMenu(null)
                  toggleSearchIsolation()
                }}
                type="button"
              >
                {canvasIsolationMode === 'search' ? 'Show All Nodes' : 'Show Results Only'}
              </button>
              <button
                className="menu-item"
                disabled={!selectedNode || busy}
                onClick={() => {
                  setOpenMenu(null)
                  togglePathIsolation()
                }}
                type="button"
              >
                {canvasIsolationMode === 'path' ? 'Show All Nodes' : 'Show Ancestors Only'}
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
          <button
            className={`menu-trigger ${openMenu === 'settings' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'settings' ? null : 'settings'))}
            type="button"
          >
            Settings
          </button>
          {openMenu === 'settings' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                onClick={() => {
                  onOpenSettings?.()
                  setOpenMenu(null)
                }}
                type="button"
              >
                Open Settings
              </button>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
          <button
            className={`menu-trigger ${openMenu === 'help' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'help' ? null : 'help'))}
            type="button"
          >
            Help
          </button>
          {openMenu === 'help' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                disabled={busy}
                onClick={() => {
                  onCheckForUpdates?.()
                  setOpenMenu(null)
                }}
                type="button"
              >
                Check For Updates
              </button>
              <button className="menu-item" disabled type="button">
                {`Version ${appVersion}`}
              </button>
            </div>
          ) : null}
        </div>

        <span className="topbar__separator">|</span>
        <div className={`project-chip ${projectLoading ? 'project-chip--loading' : ''}`.trim()}>
          <span className="project-chip__label">{projectName || 'No project'}</span>
          {projectLoading ? (
            <span aria-hidden="true" className="project-chip__loading-indicator">
              <span className="project-chip__loading-bar" />
            </span>
          ) : null}
        </div>
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

      <div className="topbar__right topbar__no-drag">
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
        {showDesktopControls ? (
          <div className="desktop-window-controls">
            <button
              aria-label="Minimize window"
              className="desktop-window-controls__button"
              onClick={() => void onDesktopMinimize?.()}
              type="button"
            >
              <i aria-hidden="true" className="fa-solid fa-minus" />
            </button>
            <button
              aria-label={desktopWindowMaximized ? 'Restore window' : 'Maximize window'}
              className="desktop-window-controls__button"
              onClick={() => void onDesktopToggleMaximize?.()}
              type="button"
            >
              <i aria-hidden="true" className={`fa-regular ${desktopWindowMaximized ? 'fa-clone' : 'fa-square'}`} />
            </button>
            <button
              aria-label="Close window"
              className="desktop-window-controls__button desktop-window-controls__button--close"
              onClick={() => void onDesktopClose?.()}
              type="button"
            >
              <i aria-hidden="true" className="fa-solid fa-xmark" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
