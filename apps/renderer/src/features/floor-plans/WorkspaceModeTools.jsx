import IconButton from '../../components/IconButton'
import { FloorPlanIcon, TreeViewIcon } from '../../components/icons'

export default function WorkspaceModeTools({ busy, mode, onModeChange }) {
  return (
    <div aria-label="Workspace view" className="workspace-mode-tools" role="group">
      <IconButton
        aria-label="Tree View"
        className={`canvas-tool-button ${mode === 'tree' ? 'is-active' : ''}`}
        disabled={busy}
        onClick={() => onModeChange('tree')}
        tooltip="Tree View"
      >
        <TreeViewIcon />
      </IconButton>
      <IconButton
        aria-label="Plan View"
        className={`canvas-tool-button ${mode === 'floor-plan' ? 'is-active' : ''}`}
        disabled={busy}
        onClick={() => onModeChange('floor-plan')}
        tooltip="Plan View"
      >
        <FloorPlanIcon />
      </IconButton>
    </div>
  )
}
