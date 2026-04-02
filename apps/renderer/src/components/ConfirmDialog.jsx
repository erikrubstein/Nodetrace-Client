export default function ConfirmDialog({
  busy = false,
  cancelLabel = 'Cancel',
  children,
  confirmLabel = 'Confirm',
  confirmTone = 'primary',
  disabled = false,
  onCancel,
  onConfirm,
  onKeyDown,
  title,
}) {
  const confirmClassName =
    confirmTone === 'danger' ? 'danger-button' : confirmTone === 'ghost' ? 'ghost-button' : 'primary-button'
  const showCancel = typeof onCancel === 'function'

  return (
    <div className="dialog" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown} role="dialog">
      <div className="dialog__title">{title}</div>
      {children}
      <div className="dialog__actions">
        {showCancel ? (
          <button className="ghost-button" disabled={busy} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
        ) : null}
        <button className={confirmClassName} disabled={busy || disabled} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
