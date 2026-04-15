export default function IconButton({ children, tooltip, ...props }) {
  const {
    className,
    onClick,
    onPointerDown,
    onMouseDown,
    wrapperClassName,
    ...restProps
  } = props
  const buttonClassName = className ? `icon-button ${className}` : 'icon-button'
  const button = (
    <button
      {...restProps}
      className={buttonClassName}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
      }}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onMouseDown?.(event)
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onPointerDown?.(event)
      }}
      type="button"
    >
      {children}
    </button>
  )

  if (!tooltip) {
    return button
  }

  return (
    <span className={wrapperClassName ? `icon-button-wrap ${wrapperClassName}` : 'icon-button-wrap'}>
      {button}
      <span aria-hidden="true" className="icon-tooltip">
        {tooltip}
      </span>
    </span>
  )
}

