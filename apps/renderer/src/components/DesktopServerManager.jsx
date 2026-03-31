import { useMemo, useState } from 'react'

function createEmptyEditor() {
  return {
    id: null,
    name: '',
    baseUrl: '',
  }
}

function normalizeBaseUrlInput(value) {
  return String(value || '').trim()
}

export default function DesktopServerManager({
  busy = false,
  currentUser = null,
  error = '',
  onClose = null,
  onCreateProfile,
  onDeleteProfile,
  onLogout = null,
  onOpenAccountDialog = null,
  onSelectProfile,
  onUpdateProfile,
  onUseSelectedProfile = null,
  profiles = [],
  selectedProfileId = null,
}) {
  const [mode, setMode] = useState('list')
  const [editor, setEditor] = useState(createEmptyEditor())
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  )
  const selectedProfileReady = Boolean(
    selectedProfile?.authenticated && currentUser && currentUser.id === selectedProfile.userId,
  )

  function openCreateMode() {
    setEditor(createEmptyEditor())
    setMode('create')
  }

  function openEditMode(profile) {
    setEditor({
      id: profile.id,
      name: profile.name || '',
      baseUrl: profile.baseUrl || '',
    })
    setMode('edit')
  }

  function resetEditor() {
    setEditor(createEmptyEditor())
    setMode('list')
  }

  async function handleSave() {
    const payload = {
      name: String(editor.name || '').trim(),
      baseUrl: normalizeBaseUrlInput(editor.baseUrl),
    }
    if (!payload.name || !payload.baseUrl) {
      return
    }

    if (mode === 'edit' && editor.id) {
      await onUpdateProfile?.(editor.id, payload)
    } else {
      await onCreateProfile?.(payload)
    }
    resetEditor()
  }

  return (
    <div className="dialog-backdrop desktop-account-manager-screen" role="presentation">
      <div className="dialog dialog--wide desktop-account-manager" role="dialog">
        {mode === 'list' ? (
          <>
            <div className="desktop-account-manager__header">
              <div>
                <div className="dialog__title">Manage Accounts</div>
                <div className="desktop-account-manager__lead">
                  One server, one account session.
                </div>
              </div>
            </div>

            <div className="project-picker project-picker--desktop">
              <div className="project-picker__pane project-picker__pane--servers">
                <div className="project-picker__section-title">Servers</div>
                <div className="project-list">
                  {profiles.length ? (
                    profiles.map((profile) => {
                      const selected = profile.id === selectedProfileId
                      return (
                        <button
                          key={profile.id}
                          className={`project-row project-row--server ${selected ? 'active' : ''}`}
                          disabled={busy}
                          onClick={() => void onSelectProfile?.(profile.id)}
                          type="button"
                        >
                          <span>{profile.name}</span>
                          <small>{profile.baseUrl}</small>
                          <small>{profile.authenticated ? `Signed in as ${profile.username}` : 'Not signed in'}</small>
                        </button>
                      )
                    })
                  ) : (
                    <div className="inspector__notice">No servers saved yet.</div>
                  )}
                </div>
              </div>

              <div className="project-picker__pane project-picker__pane--projects">
                <div className="project-picker__section-title">Account</div>
                {selectedProfile ? (
                  <div className="desktop-account-manager__detail-card">
                    <div className="desktop-account-manager__detail-head">
                      <div>
                        <strong>{selectedProfile.name}</strong>
                        <div className="desktop-account-manager__meta">{selectedProfile.baseUrl}</div>
                      </div>
                      <div className="desktop-account-manager__detail-actions">
                        <button
                          className="ghost-button"
                          disabled={busy}
                          onClick={() => openEditMode(selectedProfile)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="danger-button"
                          disabled={busy}
                          onClick={() => void onDeleteProfile?.(selectedProfile.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {selectedProfile.authenticated ? (
                      <>
                        <div className="desktop-account-manager__status">
                          {selectedProfileReady ? (
                            <>
                              Signed in as <strong>{selectedProfile.username}</strong>
                            </>
                          ) : (
                            'Switching to this account...'
                          )}
                        </div>
                        <div className="desktop-account-manager__account-actions">
                          <button
                            className="ghost-button"
                            disabled={busy || !selectedProfileReady}
                            onClick={() => onOpenAccountDialog?.('username')}
                            type="button"
                          >
                            Change Username
                          </button>
                          <button
                            className="ghost-button"
                            disabled={busy || !selectedProfileReady}
                            onClick={() => onOpenAccountDialog?.('password')}
                            type="button"
                          >
                            Change Password
                          </button>
                          <button
                            className="danger-button"
                            disabled={busy || !selectedProfileReady}
                            onClick={() => onOpenAccountDialog?.('delete-account')}
                            type="button"
                          >
                            Delete Account
                          </button>
                          <button
                            className="ghost-button"
                            disabled={busy || !selectedProfileReady}
                            onClick={() => void onLogout?.()}
                            type="button"
                          >
                            Logout
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="desktop-account-manager__status">No account session on this server.</div>
                        <div className="desktop-account-manager__account-actions">
                          <button
                            className="primary-button"
                            disabled={busy}
                            onClick={() => void onUseSelectedProfile?.()}
                            type="button"
                          >
                            Sign In
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="inspector__notice">Select a server to manage its account.</div>
                )}
              </div>
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={openCreateMode} type="button">
                Add Server
              </button>
              {onClose ? (
                <button className="ghost-button" disabled={busy} onClick={onClose} type="button">
                  Close
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="desktop-account-manager__header">
              <div>
                <div className="dialog__title">{mode === 'edit' ? 'Edit Server' : 'Add Server'}</div>
                <div className="desktop-account-manager__lead">
                  Save the server name and base URL.
                </div>
              </div>
            </div>

            <div className="desktop-account-manager__editor">
              <div className="field-stack auth-fields">
                <label>
                  <span>Name</span>
                  <input
                    autoFocus
                    autoCorrect="off"
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Primary Lab"
                    value={editor.name}
                  />
                </label>
                <label>
                  <span>Base URL</span>
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        baseUrl: event.target.value,
                      }))
                    }
                    placeholder="http://127.0.0.1:3001"
                    value={editor.baseUrl}
                  />
                </label>
              </div>
              <div className="dialog__actions">
                <button className="ghost-button" disabled={busy} onClick={resetEditor} type="button">
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={busy || !editor.name.trim() || !normalizeBaseUrlInput(editor.baseUrl)}
                  onClick={() => void handleSave()}
                  type="button"
                >
                  {mode === 'edit' ? 'Save Server' : 'Add Server'}
                </button>
              </div>
            </div>
          </>
        )}

        {error ? <div className="inspector__notice error">{error}</div> : null}
      </div>
    </div>
  )
}
