import { useState } from 'react'
import { resolvePublicAssetUrl } from '../lib/runtimePaths'

const brandLogoUrl = resolvePublicAssetUrl('nodetrace.svg')

function normalizeBaseUrlInput(value) {
  return String(value || '').trim()
}

export default function DesktopServerManager({
  busy = false,
  onClose = null,
  onCreateProfile,
  onDeleteProfile,
  onSelectProfile,
  onUpdateProfile,
  profiles = [],
  selectedProfileId = null,
}) {
  const [editingProfileId, setEditingProfileId] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')

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
        <div className="auth-title">Desktop Servers</div>
      </div>
      <div className="auth-card">
        <div className="desktop-server-manager__header">
          <div className="desktop-server-manager__lead">
            Add one or more Nodetrace servers for this desktop client. Each server keeps its own login session.
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
      </div>
    </div>
  )
}
