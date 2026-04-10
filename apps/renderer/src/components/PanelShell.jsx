export default function PanelShell({
  activePanel,
  canDockBack = false,
  canPopout = false,
  desktopWindowMaximized = false,
  onClose,
  onDesktopClose,
  onDesktopMinimize,
  onDesktopToggleMaximize,
  onDockBack,
  onPopout,
  onResizeStart,
  side = 'left',
  showDesktopControls = true,
  useNativeDesktopChrome = false,
  visible = true,
  windowMode = false,
}) {
  if (!activePanel) {
    return windowMode ? <div className="sidebar-shell sidebar-shell--window sidebar-shell--empty">Panel not found.</div> : <div className={`sidebar-shell sidebar-shell--${side} ${visible ? '' : 'sidebar-shell--hidden'}`} />
  }

  const shellClassName = windowMode
    ? `sidebar-shell sidebar-shell--window ${useNativeDesktopChrome ? 'sidebar-shell--native-chrome' : ''}`.trim()
    : `sidebar-shell sidebar-shell--${side} ${visible ? '' : 'sidebar-shell--hidden'}`

  const content = (
    <>
      <div className="sidebar-shell__titlebar">
        <span className="sidebar-shell__title">{activePanel.title}</span>
        <div className="sidebar-shell__actions">
          {canDockBack ? (
            <span className="icon-button-wrap">
              <button className="sidebar-shell__action" onClick={onDockBack} type="button">
                <i aria-hidden="true" className="fa-solid fa-down-left-and-up-right-to-center" />
              </button>
              <span aria-hidden="true" className="icon-tooltip">
                Dock In Sidebar
              </span>
            </span>
          ) : null}
          {canPopout ? (
            <span className="icon-button-wrap">
              <button className="sidebar-shell__action" onClick={onPopout} type="button">
                <i aria-hidden="true" className="fa-solid fa-up-right-from-square" />
              </button>
              <span aria-hidden="true" className="icon-tooltip">
                Open In Window
              </span>
            </span>
          ) : null}
          {windowMode && showDesktopControls ? (
            <>
              <button
                aria-label="Minimize window"
                className="sidebar-shell__action desktop-window-controls__button"
                onClick={onDesktopMinimize}
                type="button"
              >
                <i aria-hidden="true" className="fa-solid fa-minus" />
              </button>
              <button
                aria-label={desktopWindowMaximized ? 'Restore window' : 'Maximize window'}
                className="sidebar-shell__action desktop-window-controls__button"
                onClick={onDesktopToggleMaximize}
                type="button"
              >
                <i aria-hidden="true" className={`fa-regular ${desktopWindowMaximized ? 'fa-clone' : 'fa-square'}`} />
              </button>
              <button
                aria-label="Close window"
                className="sidebar-shell__action desktop-window-controls__button desktop-window-controls__button--close"
                onClick={onDesktopClose}
                type="button"
              >
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </button>
            </>
          ) : !windowMode ? (
            <span className="icon-button-wrap">
              <button className="sidebar-shell__action" onClick={onClose} type="button">
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </button>
              <span aria-hidden="true" className="icon-tooltip">
                Collapse Sidebar
              </span>
              </span>
          ) : null}
        </div>
      </div>
      <div className="sidebar-shell__body">{activePanel.content}</div>
      {!windowMode ? (
        <div
          className={`sidebar-shell__resize sidebar-shell__resize--${side}`}
          onPointerDown={onResizeStart}
          role="separator"
        />
      ) : null}
    </>
  )

  if (windowMode) {
    return <div className={shellClassName}>{content}</div>
  }

  return <aside className={shellClassName}>{visible ? content : null}</aside>
}
