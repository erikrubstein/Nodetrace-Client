export default function SidebarRail({
  activePanelId,
  dragOver,
  open,
  onOpenContextMenu,
  panels,
  side,
  togglePanel,
  onDropPanel,
  onStartDrag,
  onEndDrag,
}) {
  return (
    <div
      className={`sidebar-rail sidebar-rail--${side} ${dragOver ? 'sidebar-rail--drag-over' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenContextMenu?.(event)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const panelId = event.dataTransfer.getData('text/panel-id')
        if (panelId) {
          onDropPanel(panelId, side)
        }
      }}
    >
      {panels.map((panel) => (
        <span key={panel.id} className="icon-button-wrap">
          <button
          key={panel.id}
          aria-label={panel.title}
          className={`sidebar-rail__button ${
            open && activePanelId === panel.id ? 'sidebar-rail__button--active' : ''
          }`}
          draggable
          onClick={(event) => {
            event.stopPropagation()
            togglePanel(panel.id)
          }}
          onDragEnd={() => onEndDrag()}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/panel-id', panel.id)
            onStartDrag(panel.id)
          }}
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          type="button"
        >
          {panel.icon}
          </button>
          <span aria-hidden="true" className="icon-tooltip">
            {panel.title}
          </span>
        </span>
      ))}
    </div>
  )
}
