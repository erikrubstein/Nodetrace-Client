export default function SettingsPanel({
  collaboratorUsername,
  addCollaborator,
  busy,
  canManageUsers,
  clearError,
  collaborators,
  currentUsername,
  error,
  ownerUsername,
  openRenameProjectDialog,
  persistProjectSettings,
  projectId,
  projectSettings,
  resetProjectSettings,
  removeCollaborator,
  setCollaboratorUsername,
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
        <div className="inspector__title">Project</div>
        <button className="ghost-button settings-panel__reset" disabled={busy} onClick={openRenameProjectDialog} type="button">
          Rename Project
        </button>
      </section>

      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Owner</div>
        <div className="settings-panel__owner-name">{ownerUsername || currentUsername || 'n/a'}</div>
      </section>

      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Access</div>
        {canManageUsers ? (
          <div className="settings-panel__collab-add">
            <input
              onChange={(event) => {
                clearError?.()
                setCollaboratorUsername(event.target.value)
              }}
              placeholder="username"
              value={collaboratorUsername}
            />
            <button
              className="ghost-button"
              disabled={busy || !collaboratorUsername.trim()}
              onClick={addCollaborator}
              type="button"
            >
              Add
            </button>
          </div>
        ) : null}

        {error ? <div className="inspector__notice error settings-panel__error">{error}</div> : null}

        <div className="settings-panel__collaborators">
          {collaborators.length > 0 ? (
            collaborators.map((collaborator) => (
              <div
                className={`settings-panel__collaborator-row ${
                  canManageUsers ? '' : 'settings-panel__collaborator-row--full'
                }`.trim()}
                key={collaborator.id}
              >
                <span>{collaborator.username}</span>
                {canManageUsers ? (
                  <button className="danger-button" onClick={() => removeCollaborator(collaborator.id)} type="button">
                    Remove
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="inspector__notice">No collaborators</div>
          )}
        </div>
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
