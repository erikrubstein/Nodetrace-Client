import IconButton from './IconButton'
import { CloseIcon } from './icons'

export default function SettingsPanel({
  busy,
  canManageProjectSecrets,
  clearProjectOpenAiKey,
  hasProjectOpenAiKey,
  openAiApiKeyMask,
  openOpenAiKeyDialog,
  openDeleteProjectDialog,
  openRenameProjectDialog,
  persistProjectSettings,
  projectId,
  projectSettings,
  resetProjectSettings,
}) {
  return (
    <div className="settings-panel">
      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Display</div>
        <div className="settings-panel__grid">
          <label>
            <span>Direction</span>
            <select
              value={projectSettings.orientation}
              onChange={(event) =>
                persistProjectSettings({
                  ...projectSettings,
                  orientation: event.target.value,
                })
              }
            >
              <option value="horizontal">Right</option>
              <option value="vertical">Down</option>
            </select>
          </label>
          <label>
            <span>Image mode</span>
            <select
              value={projectSettings.imageMode}
              onChange={(event) =>
                persistProjectSettings({
                  ...projectSettings,
                  imageMode: event.target.value,
                })
              }
            >
              <option value="original">Original Ratio</option>
              <option value="square">Square</option>
            </select>
          </label>
          <label>
            <span>Layout</span>
            <select
              value={projectSettings.layoutMode}
              onChange={(event) =>
                persistProjectSettings({
                  ...projectSettings,
                  layoutMode: event.target.value,
                })
              }
            >
              <option value="compact">Compact</option>
              <option value="classic">Classic</option>
            </select>
          </label>
        </div>

        <div className="settings-panel__range-group">
          <label className="settings-panel__range-row">
            <span>Horizontal spacing</span>
            <div className="settings-panel__range-control">
              <input
                max="220"
                min="24"
                onChange={(event) =>
                  persistProjectSettings({
                    ...projectSettings,
                    horizontalGap: Number(event.target.value),
                  })
                }
                type="range"
                value={projectSettings.horizontalGap}
              />
              <strong>{projectSettings.horizontalGap}</strong>
            </div>
          </label>
          <label className="settings-panel__range-row">
            <span>Vertical spacing</span>
            <div className="settings-panel__range-control">
              <input
                max="180"
                min="16"
                onChange={(event) =>
                  persistProjectSettings({
                    ...projectSettings,
                    verticalGap: Number(event.target.value),
                  })
                }
                type="range"
                value={projectSettings.verticalGap}
              />
              <strong>{projectSettings.verticalGap}</strong>
            </div>
          </label>
        </div>

        <button className="ghost-button settings-panel__reset" disabled={busy} onClick={resetProjectSettings} type="button">
          Reset
        </button>
      </section>

      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Features</div>
        <div className="settings-panel__grid">
          <label>
            <span>Floor plans</span>
            <select
              aria-label="Floor plans"
              disabled={busy}
              onChange={(event) =>
                persistProjectSettings({
                  ...projectSettings,
                  floorPlanEnabled: event.target.value === 'enabled',
                })
              }
              value={projectSettings.floorPlanEnabled ? 'enabled' : 'disabled'}
            >
              <option value="disabled">Off</option>
              <option value="enabled">On</option>
            </select>
          </label>
        </div>
        <div className="inspector__notice">
          Turning this off hides the spatial workspace and its panels. Existing floor plans and placements are retained.
        </div>
      </section>

      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Project</div>
        <button className="ghost-button settings-panel__reset" disabled={busy} onClick={openRenameProjectDialog} type="button">
          Rename Project
        </button>
        <button className="danger-button" disabled={busy || !projectId} onClick={openDeleteProjectDialog} type="button">
          Delete Project
        </button>
      </section>

      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">AI</div>
        <div className="settings-panel__meta-row settings-panel__meta-row--actions">
          <span>OpenAI API Key</span>
          <div className="settings-panel__meta-actions">
            <strong>{hasProjectOpenAiKey ? openAiApiKeyMask || 'Configured' : 'Not Set'}</strong>
            {canManageProjectSecrets && hasProjectOpenAiKey ? (
              <IconButton
                aria-label="Remove OpenAI API key"
                className="tool-button"
                disabled={busy}
                onClick={clearProjectOpenAiKey}
                tooltip="Remove Key"
              >
                <CloseIcon />
              </IconButton>
            ) : null}
          </div>
        </div>
        {canManageProjectSecrets ? (
          !hasProjectOpenAiKey ? (
            <button className="ghost-button settings-panel__reset" disabled={busy} onClick={openOpenAiKeyDialog} type="button">
              Set Key
            </button>
          ) : null
        ) : (
          <div className="inspector__notice">The project owner manages this key.</div>
        )}
      </section>

      <section className="inspector__section settings-panel__section inspector__footer">
        <div className="settings-panel__meta-row">
          <span>Project ID</span>
          <strong>{projectId || 'n/a'}</strong>
        </div>
      </section>
    </div>
  )
}
