import { useState } from 'react'
import { resolvePublicAssetUrl } from '../lib/runtimePaths'

const brandLogoUrl = resolvePublicAssetUrl('nodetrace.svg')

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
  const [editingProfileId, setEditingProfileId] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || null
  const selectedProfileUsername = selectedProfile?.username || currentUser?.username || ''
  const selectedProfileReady = Boolean(
    selectedProfile?.authenticated && currentUser && currentUser.id === selectedProfile.userId,
  )

  function resetEditor() {
    setEditingProfileId(null)
    setNameInput('')
    setBaseUrlInput('')
  }

  async function handleSubmit() {
    const payload = {
      name: String(nameInput || '').trim(),
      baseUrl: normalizeBaseUrlInput(baseUrlInput),
    }
    if (!payload.name || !payload.baseUrl) {
      return
    }

    if (editingProfileId) {
      await onUpdateProfile?.(editingProfileId, payload)
    } else {
      await onCreateProfile?.(payload)
    }
    resetEditor()
  }

  return (
    <div className="auth-shell auth-shell--server-manager">
      <div className="auth-brand">
        <img alt="Nodetrace" className="auth-brand__logo" src={brandLogoUrl} />
        <div className="auth-title">Manage Accounts</div>
      </div>
      <div className="auth-card">
        <div className="desktop-server-manager__header">
          <div className="desktop-server-manager__lead">
            Save one or more Nodetrace servers for this desktop client. Each server keeps its own account session and project list.
          </div>
          {onClose ? (
            <button className="ghost-button" onClick={onClose} type="button">
              Close
            </button>
          ) : null}
        </div>

        <div className="desktop-server-manager__list">
          {profiles.length ? (
            profiles.map((profile) => {
              const selected = profile.id === selectedProfileId
              const editing = profile.id === editingProfileId
              return (
                <div
                  className={`desktop-server-item${selected ? ' is-selected' : ''}`}
                  key={profile.id}
                >
                  <div className="desktop-server-item__meta">
                    <div className="desktop-server-item__name-row">
                      <strong>{profile.name}</strong>
                      {selected ? <span className="desktop-server-item__badge">Active</span> : null}
                    </div>
                    <div className="desktop-server-item__url">{profile.baseUrl}</div>
                    <div className="desktop-server-item__status">
                      {profile.authenticated ? `Signed in as ${profile.username}` : 'Not signed in'}
                    </div>
                  </div>
                  <div className="desktop-server-item__actions">
                    <button
                      className="ghost-button"
                      disabled={busy || selected}
                      onClick={() => void onSelectProfile?.(profile.id)}
                      type="button"
                    >
                      Use
                    </button>
                    <button
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => {
                        setEditingProfileId(profile.id)
                        setNameInput(profile.name || '')
                        setBaseUrlInput(profile.baseUrl || '')
                      }}
                      type="button"
                    >
                      {editing ? 'Editing' : 'Edit'}
                    </button>
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => {
                        if (editingProfileId === profile.id) {
                          resetEditor()
                        }
                        void onDeleteProfile?.(profile.id)
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="inspector__notice">No desktop servers saved yet.</div>
          )}
        </div>

        {selectedProfile ? (
          <div className="desktop-server-manager__account">
            <div className="desktop-server-manager__form-title">Selected Account</div>
            <div className="desktop-server-manager__account-card">
              <div>
                <strong>{selectedProfile.name}</strong>
                <div className="desktop-server-item__url">{selectedProfile.baseUrl}</div>
              </div>
              {selectedProfile.authenticated ? (
                <>
                  <div className="desktop-server-manager__account-status">
                    {selectedProfileReady ? (
                      <>
                        Signed in as <strong>{selectedProfileUsername}</strong>
                      </>
                    ) : (
                      'Switching to this account...'
                    )}
                  </div>
                  <div className="desktop-server-manager__account-actions">
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
                  <div className="desktop-server-manager__account-status">
                    This server does not have an active account session.
                  </div>
                  {onUseSelectedProfile ? (
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void onUseSelectedProfile()}
                      type="button"
                    >
                      Sign In To This Server
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="desktop-server-manager__form">
          <div className="desktop-server-manager__form-title">
            {editingProfileId ? 'Edit Server' : 'Add Server'}
          </div>
          <div className="field-stack auth-fields">
            <label>
              <span>Name</span>
              <input
                autoCorrect="off"
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Primary Lab"
                value={nameInput}
              />
            </label>
            <label>
              <span>Base URL</span>
              <input
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(event) => setBaseUrlInput(event.target.value)}
                placeholder="http://127.0.0.1:3001"
                value={baseUrlInput}
              />
            </label>
          </div>
          <div className="desktop-server-manager__form-actions">
            <button
              className="primary-button"
              disabled={busy || !nameInput.trim() || !normalizeBaseUrlInput(baseUrlInput)}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {editingProfileId ? 'Save Server' : 'Add Server'}
            </button>
            {editingProfileId ? (
              <button className="ghost-button" disabled={busy} onClick={resetEditor} type="button">
                Cancel
              </button>
            ) : null}
          </div>
        </div>
        {error ? <div className="inspector__notice error">{error}</div> : null}
      </div>
    </div>
  )
}
