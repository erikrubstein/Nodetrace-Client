import IconButton from './IconButton'
import {
  CameraIcon,
  GearIcon,
  MoonIcon,
  PhoneIcon,
  PreviewIcon,
  SunIcon,
  WrenchIcon,
} from './icons'

export default function TopBar({
  busy,
  cameraOpen,
  fileInputRef,
  focusPathMode,
  historyState,
  importInputRef,
  importProjectName,
  inspectorOpen,
  mobileConnectionCount,
  openMenu,
  pendingUploadMode,
  pendingUploadParentId,
  previewOpen,
  projectName,
  redo,
  selectedNode,
  selectedProjectId,
  setAllNodesCollapsed,
  setCameraOpen,
  setDeleteNodeOpen,
  setDeleteProjectText,
  setExportFileName,
  setImportArchiveFile,
  setImportProjectName,
  setInspectorOpen,
  setOpenMenu,
  setPreviewOpen,
  setSessionDialogOpen,
  setSettingsOpen,
  setShowProjectDialog,
  setFocusPathMode,
  settingsOpen,
  theme,
  tree,
  undo,
  uploadFiles,
  fitCanvasToView,
  setTheme,
}) {
  return (
    <header className="topbar">
      <div className="topbar__left">
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
              <button
                className="menu-item danger-text"
                disabled={!tree?.project || busy}
                onClick={() => {
                  setDeleteProjectText('')
                  setShowProjectDialog('delete')
                  setOpenMenu(null)
                }}
                type="button"
              >
                Delete Project
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
          <button
            className={`menu-trigger ${openMenu === 'window' ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === 'window' ? null : 'window'))}
            type="button"
          >
            Window
          </button>
          {openMenu === 'window' ? (
            <div className="menu-panel">
              <button
                className="menu-item"
                onClick={() => {
                  setPreviewOpen((open) => !open)
                  setOpenMenu(null)
                }}
                type="button"
              >
                {previewOpen ? 'Hide Preview' : 'Show Preview'}
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setCameraOpen((open) => !open)
                  setOpenMenu(null)
                }}
                type="button"
              >
                {cameraOpen ? 'Hide Camera' : 'Show Camera'}
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setInspectorOpen((open) => !open)
                  setOpenMenu(null)
                }}
                type="button"
              >
                {inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setSettingsOpen((open) => !open)
                  setOpenMenu(null)
                }}
                type="button"
              >
                {settingsOpen ? 'Hide Settings' : 'Show Settings'}
              </button>
            </div>
          ) : null}
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
        <IconButton
          aria-label={previewOpen ? 'Close preview' : 'Open preview'}
          onClick={() => setPreviewOpen((open) => !open)}
          tooltip="Preview"
        >
          <PreviewIcon />
        </IconButton>
        <IconButton
          aria-label={cameraOpen ? 'Close camera' : 'Open camera'}
          onClick={() => setCameraOpen((open) => !open)}
          tooltip="Camera"
        >
          <CameraIcon />
        </IconButton>
        <IconButton
          aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'}
          onClick={() => setInspectorOpen((open) => !open)}
          tooltip="Inspector"
        >
          <WrenchIcon />
        </IconButton>
        <IconButton
          aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
          onClick={() => setSettingsOpen((open) => !open)}
          tooltip="Settings"
        >
          <GearIcon />
        </IconButton>
        <span aria-hidden="true" className="topbar__toolbar-divider" />
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
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          tooltip={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </div>
    </header>
  )
}
