export default function CollaboratorsPanel({
  collaboratorUsername,
  addCollaborator,
  busy,
  canManageUsers,
  clearError,
  collaborators,
  currentUsername,
  error,
  isPublic,
  ownerUsername,
  persistProjectAccess,
  removeCollaborator,
  setCollaboratorUsername,
}) {
  return (
    <div className="settings-panel">
      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Owner</div>
        <div className="settings-panel__owner-name">{ownerUsername || currentUsername || 'n/a'}</div>
      </section>

      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Access</div>
        {canManageUsers ? (
          <div className="project-picker__filters settings-panel__access-toggle">
            <button
              className={`project-picker__filter ${!isPublic ? 'is-active' : ''}`}
              disabled={busy}
              onClick={() => persistProjectAccess?.(false)}
              type="button"
            >
              Private
            </button>
            <button
              className={`project-picker__filter ${isPublic ? 'is-active' : ''}`}
              disabled={busy}
              onClick={() => persistProjectAccess?.(true)}
              type="button"
            >
              Public
            </button>
          </div>
        ) : null}
        <div className="inspector__notice">
          {isPublic
            ? 'Anyone with access to this server can view this project.'
            : 'Only the owner and listed collaborators can view this project.'}
        </div>
        {error ? <div className="inspector__notice error settings-panel__error">{error}</div> : null}
      </section>

      {!isPublic ? (
        <section className="inspector__section settings-panel__section">
          <div className="inspector__title">Collaborators</div>
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
      ) : null}
    </div>
  )
}
