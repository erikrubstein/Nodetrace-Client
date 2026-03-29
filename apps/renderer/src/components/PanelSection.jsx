export default function PanelSection({ actions = null, children, className = '', title = null }) {
  const sectionClassName = className ? `inspector__section ${className}` : 'inspector__section'

  return (
    <div className={sectionClassName}>
      {title || actions ? (
        actions ? (
          <div className="inspector__section-header">
            {title ? <div className="inspector__title">{title}</div> : <span />}
            {actions}
          </div>
        ) : (
          <div className="inspector__title">{title}</div>
        )
      ) : null}
      {children}
    </div>
  )
}
