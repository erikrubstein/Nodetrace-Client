import IconButton from '../../components/IconButton'
import { FloorPlanIcon, TreeViewIcon } from '../../components/icons'

export default function WorkspaceModeTools({ busy, mode, onModeChange }) {
  return (
    <div aria-label="Workspace view" className="workspace-mode-tools" role="group">
      <IconButton
        aria-label="Tree view"
        className={`canvas-tool-button ${mode === 'tree' ? 'is-active' : ''}`}
        disabled={busy}
        onClick={() => onModeChange('tree')}
        tooltip="Tree View"
      >
        <TreeViewIcon />
      </IconButton>
      <IconButton
        aria-label="Floor plan view"
        className={`canvas-tool-button ${mode === 'floor-plan' ? 'is-active' : ''}`}
        disabled={busy}
        onClick={() => onModeChange('floor-plan')}
        tooltip="Floor Plan"
      >
        <FloorPlanIcon />
      </IconButton>
    </div>
  )
}
