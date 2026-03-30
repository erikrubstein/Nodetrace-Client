export default function MobileEntryScreen({ onContinueToProject, onOpenCapture }) {
  return (
    <div className="auth-screen">
      <div className="auth-shell mobile-entry-shell">
        <div className="auth-brand">
          <img alt="Nodetrace" className="auth-brand__logo" src="/nodetrace.svg" />
          <div className="auth-title">Nodetrace</div>
        </div>
        <div className="auth-card mobile-entry-card">
          <div className="mobile-entry-card__eyebrow">Mobile Device Detected</div>
          <div className="mobile-entry-card__title">Choose where you want to go.</div>
          <div className="mobile-entry-card__copy">
            Use capture for quick phone uploads, or continue to the full project interface.
          </div>
          <div className="mobile-entry-card__actions">
            <button className="primary-button wide" onClick={onOpenCapture} type="button">
              Go to Capture
            </button>
            <button className="ghost-button wide" onClick={onContinueToProject} type="button">
              Go to Project
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
