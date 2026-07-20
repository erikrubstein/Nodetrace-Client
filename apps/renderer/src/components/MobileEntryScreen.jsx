import { resolvePublicAssetUrl } from '../lib/runtimePaths'
import { CameraIcon, TreeViewIcon } from './icons'

const brandLogoUrl = resolvePublicAssetUrl('nodetrace.svg')

export default function MobileEntryScreen({ onContinueToProject, onOpenCapture }) {
  return (
    <div className="auth-screen mobile-entry-screen">
      <div className="auth-shell mobile-entry-shell">
        <div className="auth-brand">
          <img alt="Nodetrace" className="auth-brand__logo" src={brandLogoUrl} />
          <div className="auth-title">Nodetrace</div>
        </div>
        <div className="auth-card mobile-entry-card">
          <div className="mobile-entry-card__eyebrow">Mobile Device Detected</div>
          <div className="mobile-entry-card__title">Choose where you want to go.</div>
          <div className="mobile-entry-card__grid">
            <button className="mobile-entry-card__option" onClick={onOpenCapture} type="button">
              <span className="mobile-entry-card__icon" aria-hidden="true">
                <CameraIcon />
              </span>
              <span className="mobile-entry-card__option-title">Capture</span>
            </button>
            <button className="mobile-entry-card__option" onClick={onContinueToProject} type="button">
              <span className="mobile-entry-card__icon" aria-hidden="true">
                <TreeViewIcon />
              </span>
              <span className="mobile-entry-card__option-title">Project</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
