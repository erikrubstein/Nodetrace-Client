import {
  CloseIcon,
  DockIcon,
  MaximizeWindowIcon,
  MinusIcon,
  PopoutIcon,
  RestoreWindowIcon,
} from './icons'

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
                <DockIcon />
              </button>
              <span aria-hidden="true" className="icon-tooltip">
                Dock In Sidebar
              </span>
            </span>
          ) : null}
          {canPopout ? (
            <span className="icon-button-wrap">
              <button className="sidebar-shell__action" onClick={onPopout} type="button">
                <PopoutIcon />
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
                <MinusIcon />
              </button>
              <button
                aria-label={desktopWindowMaximized ? 'Restore window' : 'Maximize window'}
                className="sidebar-shell__action desktop-window-controls__button"
                onClick={onDesktopToggleMaximize}
                type="button"
              >
                {desktopWindowMaximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}
              </button>
              <button
                aria-label="Close window"
                className="sidebar-shell__action desktop-window-controls__button desktop-window-controls__button--close"
                onClick={onDesktopClose}
                type="button"
              >
                <CloseIcon />
              </button>
            </>
          ) : !windowMode ? (
            <span className="icon-button-wrap">
              <button className="sidebar-shell__action" onClick={onClose} type="button">
                <CloseIcon />
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
