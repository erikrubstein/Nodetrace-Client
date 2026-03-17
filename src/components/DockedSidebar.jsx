export default function DockedSidebar({
  activePanel,
  onClose,
  onResizeStart,
  side,
  visible,
}) {
  if (!activePanel) {
    return <div className={`sidebar-shell sidebar-shell--${side} ${visible ? '' : 'sidebar-shell--hidden'}`} />
  }

  return (
    <aside className={`sidebar-shell sidebar-shell--${side} ${visible ? '' : 'sidebar-shell--hidden'}`}>
      {visible ? (
        <>
          <div className="sidebar-shell__titlebar">
            <span className="sidebar-shell__title">{activePanel.title}</span>
            <div className="sidebar-shell__actions">
              <button className="sidebar-shell__action" onClick={onClose} title="Collapse sidebar" type="button">
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>
          <div className="sidebar-shell__body">{activePanel.content}</div>
          <div
            className={`sidebar-shell__resize sidebar-shell__resize--${side}`}
            onPointerDown={onResizeStart}
            role="separator"
          />
        </>
      ) : null}
    </aside>
  )
}
