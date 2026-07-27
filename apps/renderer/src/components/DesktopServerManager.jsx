import { useEffect, useMemo, useRef, useState } from 'react'
import IconButton from './IconButton'
import {
  CloseIcon,
  MaximizeWindowIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RestoreWindowIcon,
  SpinnerIcon,
  TrashIcon,
  WarningIcon,
} from './icons'
import { resolvePublicAssetUrl } from '../lib/runtimePaths'

const nodetraceLogoUrl = resolvePublicAssetUrl('nodetrace.svg')

function createEmptyEditor() {
  return {
    id: null,
    baseUrl: '',
    username: '',
    password: '',
    confirmPassword: '',
    authMode: 'login',
  }
}

function normalizeBaseUrlInput(value) {
  return String(value || '').trim()
}

function normalizeUsernameInput(value) {
  return String(value || '').trim().toLowerCase()
}

function getConnectionLabel(profile) {
  if (profile?.connectionStatus === 'connecting') {
    return 'Connecting'
  }
  if (profile?.connectionStatus === 'connected') {
    return 'Connected'
  }
  if (profile?.connectionStatus === 'invalid_login') {
    return 'Invalid Login'
  }
  return 'Disconnected'
}

function getConnectionDescription(profile) {
  if (profile?.connectionStatus === 'connecting') {
    return profile?.kind === 'local'
      ? 'Starting the Local Projects service on this device.'
      : 'Trying to reach the server and validate the saved credentials.'
  }
  if (profile?.connectionStatus === 'connected') {
    return profile?.kind === 'local'
      ? 'Projects are stored privately on this device.'
      : 'The server is reachable and the saved credentials are valid.'
  }
  if (profile?.connectionStatus === 'invalid_login') {
    return 'The server is reachable, but the saved username or password is not valid.'
  }
  return profile?.kind === 'local'
    ? 'The Local Projects service could not be started.'
    : 'The server could not be reached from this desktop client.'
}

function getProfileName(profile) {
  return profile?.displayName || profile?.username || profile?.baseUrl || 'Server Profile'
}

function sortProfiles(left, right) {
  if (left?.kind === 'local' && right?.kind !== 'local') {
    return -1
  }
  if (right?.kind === 'local' && left?.kind !== 'local') {
    return 1
  }
  return getProfileName(left).localeCompare(getProfileName(right), undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

function resolveInitialProfileId(profiles, focusProfileId, selectedProfileId) {
  const requestedId = String(focusProfileId || '').trim()
  if (requestedId && profiles.some((profile) => profile.id === requestedId)) {
    return requestedId
  }
  const activeId = String(selectedProfileId || '').trim()
  if (activeId && profiles.some((profile) => profile.id === activeId)) {
    return activeId
  }
  return profiles[0]?.id || null
}

export default function DesktopServerManager({
  busy = false,
  desktopWindowMaximized = false,
  error = '',
  focusProfileId = null,
  onClose = null,
  onCreateProfile,
  onDesktopClose = null,
  onDesktopMinimize = null,
  onDesktopToggleMaximize = null,
  onDeleteProfile,
  onOpenAccountDialog = null,
  onUpdateProfile,
  profiles = [],
  selectedProfileId = null,
  showDesktopControls = false,
}) {
  const openedAtRef = useRef(0)
  const hasProfiles = profiles.length > 0
  const [mode, setMode] = useState('details')
  const [editor, setEditor] = useState(createEmptyEditor())
  const [editorSubmitAttempted, setEditorSubmitAttempted] = useState(false)
  const [manualInspectedProfileId, setManualInspectedProfileId] = useState(() =>
    resolveInitialProfileId(profiles, focusProfileId, selectedProfileId),
  )
  const [urlPromptState, setUrlPromptState] = useState({ profileId: null, value: '', open: false })
  const sortedProfiles = useMemo(
    () => [...profiles].sort(sortProfiles),
    [profiles],
  )
  const inspectedProfileId =
    manualInspectedProfileId && sortedProfiles.some((profile) => profile.id === manualInspectedProfileId)
      ? manualInspectedProfileId
      : resolveInitialProfileId(sortedProfiles, focusProfileId, selectedProfileId)

  const inspectedProfile = useMemo(
    () => sortedProfiles.find((profile) => profile.id === inspectedProfileId) || null,
    [inspectedProfileId, sortedProfiles],
  )
  const serverUrlDraft =
    urlPromptState.profileId === inspectedProfileId ? urlPromptState.value : inspectedProfile?.baseUrl || ''
  const serverUrlPromptOpen = Boolean(urlPromptState.open && urlPromptState.profileId === inspectedProfileId)
  const serverUrlChanged = Boolean(
    inspectedProfile && normalizeBaseUrlInput(serverUrlDraft) !== String(inspectedProfile.baseUrl || ''),
  )

  function openCreateMode() {
    setEditor(createEmptyEditor())
    setEditorSubmitAttempted(false)
    setMode('edit')
  }

  function openEditMode(profile) {
    if (!profile || profile.kind === 'local') {
      return
    }
    setEditor({
      id: profile.id,
      baseUrl: profile.baseUrl || '',
      username: profile.username || '',
      password: '',
      confirmPassword: '',
      authMode: 'login',
    })
    setEditorSubmitAttempted(false)
    setMode('edit')
  }

  function closeEditor() {
    setEditor(createEmptyEditor())
    setEditorSubmitAttempted(false)
    setMode('details')
  }

  function openUrlPrompt() {
    if (!inspectedProfile) {
      return
    }
    setUrlPromptState({
      profileId: inspectedProfile.id,
      value: inspectedProfile.baseUrl || '',
      open: true,
    })
  }

  function closeUrlPrompt() {
    setUrlPromptState({
      profileId: inspectedProfile?.id || null,
      value: inspectedProfile?.baseUrl || '',
      open: false,
    })
  }

  async function saveServerUrl() {
    if (!inspectedProfile) {
      return
    }
    const nextBaseUrl = normalizeBaseUrlInput(serverUrlDraft)
    if (!nextBaseUrl || nextBaseUrl === inspectedProfile.baseUrl) {
      return
    }
    const saved = (await onUpdateProfile?.(inspectedProfile.id, { baseUrl: nextBaseUrl })) !== false
    if (!saved) {
      return
    }
    setUrlPromptState({ profileId: inspectedProfile.id, value: nextBaseUrl, open: false })
  }

  function handleManagerEnter(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return
    }
    if (event.defaultPrevented) {
      return
    }
    const targetTag = String(event.target?.tagName || '').toLowerCase()
    if (targetTag === 'textarea') {
      return
    }
    if (serverUrlPromptOpen) {
      if (busy || !serverUrlChanged || !normalizeBaseUrlInput(serverUrlDraft)) {
        return
      }
      event.preventDefault()
      void saveServerUrl()
      return
    }
    if (effectiveMode === 'edit') {
      if (!canSaveProfile) {
        return
      }
      event.preventDefault()
      void handleSave()
    }
  }

  async function handleSave() {
    setEditorSubmitAttempted(true)
    const payload = {
      baseUrl: normalizeBaseUrlInput(editor.baseUrl),
      username: normalizeUsernameInput(editor.username),
      authMode: editor.authMode === 'register' ? 'register' : 'login',
    }
    const normalizedPassword = String(editor.password || '')
    if (normalizedPassword) {
      payload.password = normalizedPassword
    }

    const requiresPasswordConfirmation = payload.authMode === 'register'
    if (
      !payload.baseUrl ||
      !payload.username ||
      !normalizedPassword ||
      (requiresPasswordConfirmation && normalizedPassword !== String(editor.confirmPassword || ''))
    ) {
      return
    }

    let saved = false
    if (editor.id) {
      saved = (await onUpdateProfile?.(editor.id, payload)) !== false
      setManualInspectedProfileId(editor.id)
      setUrlPromptState({ profileId: editor.id, value: payload.baseUrl, open: false })
    } else {
      saved = (await onCreateProfile?.({ ...payload, password: normalizedPassword })) !== false
    }
    if (!saved) {
      return
    }
    closeEditor()
  }

  async function inspectProfile(profile) {
    setManualInspectedProfileId(profile.id)
    setMode('details')
    setUrlPromptState({ profileId: profile.id, value: profile.baseUrl || '', open: false })
  }

  const registerPasswordsMatch =
    editor.authMode !== 'register' || String(editor.password || '') === String(editor.confirmPassword || '')
  const effectiveMode = hasProfiles ? mode : 'edit'
  const canSaveProfile =
    !busy &&
    Boolean(normalizeBaseUrlInput(editor.baseUrl)) &&
    Boolean(normalizeUsernameInput(editor.username)) &&
    Boolean(editor.password) &&
    (editor.authMode !== 'register' || Boolean(editor.confirmPassword))

  useEffect(() => {
    openedAtRef.current = Date.now()
  }, [])

  return (
    <div
      className="dialog-backdrop"
      onClick={() => {
        if (Date.now() - openedAtRef.current < 400) {
          return
        }
        if (!busy) {
          onClose?.()
        }
      }}
      role="presentation"
    >
      {showDesktopControls ? (
        <div className="desktop-window-controls desktop-window-controls--modal">
          <button
            aria-label="Minimize window"
            className="desktop-window-controls__button"
            onClick={(event) => {
              event.stopPropagation()
              void onDesktopMinimize?.()
            }}
            type="button"
          >
            <MinusIcon />
          </button>
          <button
            aria-label={desktopWindowMaximized ? 'Restore window' : 'Maximize window'}
            className="desktop-window-controls__button"
            onClick={(event) => {
              event.stopPropagation()
              void onDesktopToggleMaximize?.()
            }}
            type="button"
          >
            {desktopWindowMaximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}
          </button>
          <button
            aria-label="Close window"
            className="desktop-window-controls__button desktop-window-controls__button--close"
            onClick={(event) => {
              event.stopPropagation()
              void onDesktopClose?.()
            }}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      <div
        className={`dialog dialog--wide dialog--frameless project-picker-dialog project-picker-dialog--accounts ${!hasProfiles ? 'project-picker-dialog--accounts-empty' : ''}`.trim()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleManagerEnter}
        role="dialog"
      >
        {!hasProfiles ? (
          <div className="project-picker__brand desktop-account-manager__brand">
            <img alt="Nodetrace" className="project-picker__brand-logo" src={nodetraceLogoUrl} />
            <div className="project-picker__brand-title">Nodetrace</div>
          </div>
        ) : null}
        <div className={`project-picker ${hasProfiles ? 'project-picker--desktop' : 'project-picker--desktop-empty'}`}>
          {hasProfiles ? (
            <div className="project-picker__card project-picker__card--servers">
              <div className="project-picker__card-header">
                <div className="project-picker__section-title">Manage Server Profiles</div>
                <IconButton className="tool-button" disabled={busy} onClick={openCreateMode} tooltip="Add Server Profile">
                  <PlusIcon />
                </IconButton>
              </div>
              <div className="project-picker__card-body project-picker__card-body--top">
                <div className="project-list project-list--fill">
                  {sortedProfiles.map((profile) => {
                    const selected = profile.id === inspectedProfileId
                    const warning = profile.connectionStatus !== 'connected'
                    const warningClass =
                      profile.connectionStatus === 'connecting'
                        ? 'project-row__warning-inline project-row__warning-inline--connecting'
                        : profile.connectionStatus === 'invalid_login'
                        ? 'project-row__warning-inline project-row__warning-inline--invalid'
                        : 'project-row__warning-inline project-row__warning-inline--disconnected'
                    return (
                      <button
                        key={profile.id}
                        className={`project-row project-row--account ${selected ? 'active' : ''} ${warning ? 'project-row--warning' : ''}`}
                        disabled={busy}
                        onClick={() => {
                          void inspectProfile(profile)
                        }}
                        type="button"
                      >
                        <span className="project-row__account-meta">
                          <span>{getProfileName(profile)}</span>
                          <small>{profile.kind === 'local' ? profile.description || 'Stored on this device' : profile.baseUrl}</small>
                        </span>
                        {warning ? (
                          <span className={warningClass} aria-hidden="true">
                            {profile.connectionStatus === 'connecting' ? (
                              <SpinnerIcon />
                            ) : (
                              <WarningIcon />
                            )}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className={`project-picker__card project-picker__card--projects ${!hasProfiles ? 'project-picker__card--empty-account' : ''}`.trim()}>
              <div className="project-picker__card-header">
                <div className="project-picker__section-title">
                  {!hasProfiles
                  ? 'Create Server Profile'
                  : effectiveMode === 'edit'
                    ? (editor.id ? 'Edit Server Profile' : 'Add Server Profile')
                    : 'Server Profile Details'}
                </div>
              {hasProfiles && inspectedProfile?.kind !== 'local' ? (
                <IconButton
                  className="tool-button"
                  disabled={busy || !inspectedProfile}
                  onClick={() => void onDeleteProfile?.(inspectedProfile?.id)}
                  tooltip="Remove Saved Server Profile"
                >
                  <TrashIcon />
                </IconButton>
              ) : null}
            </div>

            <div className="project-picker__card-body project-picker__card-body--details">
              {effectiveMode === 'edit' ? (
                <div className="desktop-account-manager__editor desktop-account-manager__panel">
                  <div className="field-stack auth-fields">
                    <label>
                      <span>Server URL</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoFocus
                        onChange={(event) =>
                          {
                            setEditorSubmitAttempted(false)
                            setEditor((current) => ({
                              ...current,
                              baseUrl: event.target.value,
                            }))
                          }
                        }
                        placeholder="http://127.0.0.1:3001"
                        value={editor.baseUrl}
                      />
                    </label>
                    <div className="project-picker__filters">
                      <button
                        className={`project-picker__filter ${editor.authMode === 'login' ? 'is-active' : ''}`}
                        disabled={busy}
                        onClick={() =>
                          {
                            setEditorSubmitAttempted(false)
                            setEditor((current) => ({ ...current, authMode: 'login', confirmPassword: '' }))
                          }
                        }
                        type="button"
                      >
                        Login
                      </button>
                      <button
                        className={`project-picker__filter ${editor.authMode === 'register' ? 'is-active' : ''}`}
                        disabled={busy}
                        onClick={() => {
                          setEditorSubmitAttempted(false)
                          setEditor((current) => ({ ...current, authMode: 'register' }))
                        }}
                        type="button"
                      >
                        Register
                      </button>
                    </div>
                    <label>
                      <span>Username</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          {
                            setEditorSubmitAttempted(false)
                            setEditor((current) => ({
                              ...current,
                              username: event.target.value,
                            }))
                          }
                        }
                        placeholder="username"
                        value={editor.username}
                      />
                    </label>
                    <label>
                      <span>Password</span>
                      <input
                        onChange={(event) =>
                          {
                            setEditorSubmitAttempted(false)
                            setEditor((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                          }
                        }
                        placeholder={editor.authMode === 'register' ? 'Create a password' : 'Password'}
                        type="password"
                        value={editor.password}
                      />
                    </label>
                    {editor.authMode === 'register' ? (
                      <label>
                        <span>Retype Password</span>
                        <input
                          onChange={(event) =>
                            {
                              setEditorSubmitAttempted(false)
                              setEditor((current) => ({
                                ...current,
                                confirmPassword: event.target.value,
                              }))
                            }
                          }
                          placeholder="Retype password"
                          type="password"
                          value={editor.confirmPassword}
                        />
                      </label>
                    ) : null}
                  </div>
                  {!error && editor.authMode === 'register' && editorSubmitAttempted && !registerPasswordsMatch ? (
                    <div className="inspector__notice error">Passwords do not match.</div>
                  ) : null}
                  {error ? <div className="inspector__notice error">{error}</div> : null}
                </div>
              ) : inspectedProfile ? (
                <div className="desktop-account-manager__detail-card desktop-account-manager__panel">
                  <div className="desktop-account-manager__identity">
                    <strong>{getProfileName(inspectedProfile)}</strong>
                    <div className="desktop-account-manager__meta">
                      {inspectedProfile.kind === 'local'
                        ? inspectedProfile.description || 'Stored on this device'
                        : inspectedProfile.baseUrl}
                    </div>
                  </div>

                  <section className="desktop-account-manager__section">
                    <div className="desktop-account-manager__section-title">Status</div>
                    <div
                      className={`desktop-account-manager__status desktop-account-manager__status--${inspectedProfile.connectionStatus || 'disconnected'}`}
                    >
                      <strong>{getConnectionLabel(inspectedProfile)}</strong>
                      <span>{getConnectionDescription(inspectedProfile)}</span>
                    </div>
                  </section>

                  {inspectedProfile.kind === 'local' ? (
                    <section className="desktop-account-manager__section">
                      <div className="desktop-account-manager__section-title">Storage</div>
                      <div className="desktop-account-manager__value">
                        Nodetrace manages this profile and its local sign-in automatically.
                      </div>
                    </section>
                  ) : (
                    <>
                      <section className="desktop-account-manager__section">
                        <div className="desktop-account-manager__section-heading">
                          <div className="desktop-account-manager__section-title">Server</div>
                          <IconButton
                            className="tool-button desktop-account-manager__server-edit-button"
                            disabled={busy}
                            onClick={openUrlPrompt}
                            tooltip="Edit Server URL"
                          >
                            <PencilIcon />
                          </IconButton>
                        </div>
                        <div className="desktop-account-manager__value">{inspectedProfile.baseUrl}</div>
                        {serverUrlPromptOpen ? (
                          <div className="desktop-account-manager__prompt">
                            <input
                              autoCapitalize="none"
                              autoCorrect="off"
                              autoFocus
                              disabled={busy}
                              onChange={(event) =>
                                setUrlPromptState((current) => ({
                                  ...current,
                                  value: event.target.value,
                                }))
                              }
                              value={serverUrlDraft}
                            />
                            <div className="desktop-account-manager__prompt-actions">
                              <button className="ghost-button" disabled={busy} onClick={closeUrlPrompt} type="button">
                                Cancel
                              </button>
                              <button
                                className="ghost-button"
                                disabled={busy || !serverUrlChanged || !normalizeBaseUrlInput(serverUrlDraft)}
                                onClick={() => void saveServerUrl()}
                                type="button"
                              >
                                Save URL
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </section>

                      <section className="desktop-account-manager__section">
                        <div className="desktop-account-manager__section-title">Account</div>
                        <div className="desktop-account-manager__value">{inspectedProfile.username || 'Unknown'}</div>
                        <div className="desktop-account-manager__account-primary">
                          <button
                            className="ghost-button wide"
                            disabled={busy}
                            onClick={() => openEditMode(inspectedProfile)}
                            type="button"
                          >
                            Re-authenticate
                          </button>
                        </div>
                        {inspectedProfile.connectionStatus === 'connected' ? (
                          <div className="desktop-account-manager__account-secondary">
                            <button
                              className="ghost-button"
                              disabled={busy}
                              onClick={() => onOpenAccountDialog?.('username', inspectedProfile.id)}
                              type="button"
                            >
                              Change Username
                            </button>
                            <button
                              className="ghost-button"
                              disabled={busy}
                              onClick={() => onOpenAccountDialog?.('password', inspectedProfile.id)}
                              type="button"
                            >
                              Change Password
                            </button>
                            <button
                              className="danger-button"
                              disabled={busy}
                              onClick={() => onOpenAccountDialog?.('delete-account', inspectedProfile.id)}
                              type="button"
                            >
                              Delete Account
                            </button>
                          </div>
                        ) : null}
                      </section>
                    </>
                  )}

                  {error ? <div className="inspector__notice error">{error}</div> : null}
                </div>
              ) : (
                <div className="inspector__notice">Select a server profile to view its details.</div>
              )}

              <div className="project-picker__card-actions">
                {effectiveMode === 'edit' ? (
                  <>
                    {hasProfiles ? (
                      <button className="ghost-button" disabled={busy} onClick={closeEditor} type="button">
                        Cancel
                      </button>
                    ) : null}
                    <button
                      className="primary-button"
                      disabled={!canSaveProfile}
                      onClick={() => void handleSave()}
                      type="button"
                    >
                      {busy ? <SpinnerIcon className="button-spinner" /> : null}
                      {editor.id ? 'Save Server Profile' : 'Add Server Profile'}
                    </button>
                  </>
                ) : onClose ? (
                  <button className="ghost-button" disabled={busy} onClick={onClose} type="button">
                    Close
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
