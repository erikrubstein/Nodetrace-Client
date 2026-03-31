import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { createPreviewFile } from '../lib/image'

function getInitialSessionId() {
  if (typeof window === 'undefined') {
    return ''
  }
  return (new URLSearchParams(window.location.search).get('session') || '').trim().toLowerCase()
}

export default function CaptureScreen() {
  const [sessionInput, setSessionInput] = useState(() => getInitialSessionId())
  const [sessionInfo, setSessionInfo] = useState(null)
  const [hasConnectedSession, setHasConnectedSession] = useState(false)
  const [status, setStatus] = useState(() =>
    getInitialSessionId() ? 'Tap Connect to join this session.' : 'Enter a session code.',
  )
  const [statusIsError, setStatusIsError] = useState(false)
  const [uploadEnabled, setUploadEnabled] = useState(false)
  const fileInputRef = useRef(null)
  const pollHandleRef = useRef(null)
  const connectionIdRef = useRef(
    (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)).toLowerCase(),
  )
  const sessionInputRef = useRef(sessionInput)
  const sessionInfoRef = useRef(sessionInfo)
  const hasConnectedSessionRef = useRef(hasConnectedSession)
  const uploadModeRef = useRef('photo_node')

  useEffect(() => {
    document.title = 'Nodetrace Capture'
    document.documentElement.classList.add('capture-route')
    document.body.classList.add('capture-route')
    return () => {
      document.documentElement.classList.remove('capture-route')
      document.body.classList.remove('capture-route')
    }
  }, [])

  useEffect(() => {
    sessionInputRef.current = sessionInput
  }, [sessionInput])

  useEffect(() => {
    sessionInfoRef.current = sessionInfo
  }, [sessionInfo])

  useEffect(() => {
    hasConnectedSessionRef.current = hasConnectedSession
  }, [hasConnectedSession])

  const setStatusMessage = useCallback((message, isError = false) => {
    setStatus(message)
    setStatusIsError(isError)
  }, [])

  const updateUrlParams = useCallback((nextSessionId) => {
    if (typeof window === 'undefined') {
      return
    }
    const url = new URL(window.location.href)
    if (nextSessionId) {
      url.searchParams.set('session', nextSessionId)
    } else {
      url.searchParams.delete('session')
    }
    window.history.replaceState({}, '', url)
  }, [])

  const heartbeatConnection = useCallback(async (sessionIdArg, sessionInfoArg = null) => {
    const sessionId = String(sessionIdArg || '').trim().toLowerCase()
    if (!sessionId || !(sessionInfoArg || sessionInfoRef.current)?.id) {
      return
    }

    await api(`/api/sessions/${sessionId}/connections/${connectionIdRef.current}`, {
      method: 'PATCH',
    })
  }, [])

  const refreshSession = useCallback(async () => {
    const sessionId = sessionInputRef.current.trim().toLowerCase()
    if (!sessionId) {
      setSessionInfo(null)
      setHasConnectedSession(false)
      setUploadEnabled(false)
      setStatusMessage('Enter a session code.')
      return
    }

    setSessionInput(sessionId)

    try {
      const nextSessionInfo = await api(`/api/sessions/${sessionId}`)
      if (nextSessionInfo?.ok === false) {
        throw new Error(nextSessionInfo.error || 'Session is not active')
      }
      await heartbeatConnection(sessionId, nextSessionInfo)
      setSessionInfo(nextSessionInfo)
      setHasConnectedSession(true)
      setUploadEnabled(true)
      updateUrlParams(sessionId)
      setStatusMessage('')
    } catch (error) {
      setSessionInfo(null)
      setUploadEnabled(false)
      if (hasConnectedSessionRef.current) {
        setHasConnectedSession(true)
      } else {
        setHasConnectedSession(false)
      }
      setStatusMessage(error.message, true)
    }
  }, [heartbeatConnection, setStatusMessage, updateUrlParams])

  const disconnectSession = useCallback(async () => {
    const sessionId = sessionInputRef.current.trim().toLowerCase()
    window.clearInterval(pollHandleRef.current)
    pollHandleRef.current = null
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}/connections/${connectionIdRef.current}`, {
        method: 'DELETE',
      }).catch(() => {})
    }
    setSessionInfo(null)
    setHasConnectedSession(false)
    setSessionInput('')
    setUploadEnabled(false)
    updateUrlParams('')
    setStatusMessage('Enter a session code.')
  }, [setStatusMessage, updateUrlParams])

  const releaseConnection = useCallback(() => {
    const sessionId = sessionInputRef.current.trim().toLowerCase()
    if (!sessionId || !hasConnectedSessionRef.current) {
      return
    }

    const url = `/api/sessions/${sessionId}/connections/${connectionIdRef.current}`
    if (navigator.sendBeacon) {
      const blob = new Blob([], { type: 'application/octet-stream' })
      navigator.sendBeacon(`${url}/release`, blob)
      return
    }

    fetch(url, {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.addEventListener('pagehide', releaseConnection)
    window.addEventListener('beforeunload', releaseConnection)
    return () => {
      window.removeEventListener('pagehide', releaseConnection)
      window.removeEventListener('beforeunload', releaseConnection)
      window.clearInterval(pollHandleRef.current)
    }
  }, [releaseConnection])

  const startSessionPolling = useCallback(() => {
    window.clearInterval(pollHandleRef.current)
    pollHandleRef.current = window.setInterval(() => {
      refreshSession().catch((error) => setStatusMessage(error.message, true))
    }, 4000)
  }, [refreshSession, setStatusMessage])

  useEffect(() => {
    if (!sessionInputRef.current.trim()) {
      return
    }

    refreshSession()
      .then(() => {
        if (sessionInputRef.current.trim()) {
          startSessionPolling()
        }
      })
      .catch((error) => setStatusMessage(error.message, true))
  }, [refreshSession, setStatusMessage, startSessionPolling])

  const uploadSelectedFiles = useCallback(async (files) => {
    const nextFiles = Array.from(files || [])
    if (!nextFiles.length || !sessionInfoRef.current?.id) {
      return
    }

    setStatusMessage('Uploading...')

    try {
      for (const file of nextFiles) {
        const previewFile = await createPreviewFile(file)
        const formData = new FormData()
        formData.append('uploadMode', uploadModeRef.current)
        if (uploadModeRef.current === 'additional_photo') {
          formData.append('additionalPhoto', 'true')
        }
        formData.append('name', '<untitled>')
        formData.append('notes', '')
        formData.append('tags', '')
        formData.append('file', file)
        if (previewFile) {
          formData.append('preview', previewFile)
        }

        await api(`/api/sessions/${sessionInfoRef.current.id}/photos`, {
          method: 'POST',
          body: formData,
        })
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await refreshSession()
      setStatusMessage(`Uploaded to ${sessionInfoRef.current?.selectedNodeName || 'selected node'}.`)
    } catch (error) {
      setStatusMessage(error.message, true)
    }
  }, [refreshSession, setStatusMessage])

  function openPicker(nextMode, captureFromCamera) {
    uploadModeRef.current = nextMode
    const input = fileInputRef.current
    if (!input) {
      return
    }
    if (captureFromCamera) {
      input.setAttribute('capture', 'environment')
    } else {
      input.removeAttribute('capture')
    }
    input.click()
    if (!captureFromCamera) {
      window.setTimeout(() => {
        input.setAttribute('capture', 'environment')
      }, 0)
    }
  }

  return (
    <div className="capture-screen">
      <main className={`capture-shell-app ${hasConnectedSession ? 'is-connected' : 'is-connect-only'}`}>
        {!hasConnectedSession ? (
          <div className="auth-screen mobile-entry-screen capture-connect-screen">
            <div className="auth-shell mobile-entry-shell">
              <div className="auth-brand">
                <img alt="Nodetrace" className="auth-brand__logo" src="/nodetrace.svg" />
                <div className="auth-title">Nodetrace</div>
              </div>
              <section className="auth-card mobile-entry-card capture-connect-card">
                <div className="mobile-entry-card__eyebrow">Mobile Capture</div>
                <div className="mobile-entry-card__title">Enter session code</div>
                <label className="capture-field">
                  <span>Session</span>
                  <input
                    autoCapitalize="none"
                    autoComplete="off"
                    className="capture-input-field"
                    inputMode="text"
                    maxLength={5}
                    onChange={(event) =>
                      setSessionInput(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5))
                    }
                    spellCheck="false"
                    type="text"
                    value={sessionInput}
                  />
                </label>
                <div className={`capture-status ${statusIsError ? 'is-error' : ''}`}>{status}</div>
                <button
                  className="primary-button wide"
                  onClick={() => {
                    refreshSession()
                      .then(() => {
                        if (sessionInputRef.current.trim()) {
                          startSessionPolling()
                        }
                      })
                      .catch((error) => setStatusMessage(error.message, true))
                  }}
                  type="button"
                >
                  Connect
                </button>
              </section>
            </div>
          </div>
        ) : (
          <section className="capture-layout">
            <section className="capture-panel capture-panel--session">
              <div className="capture-title">Connected</div>
              <div className="capture-status">
                {sessionInfo
                  ? `Session ${sessionInput} | ${sessionInfo.projectName} -> ${sessionInfo.selectedNodeName}`
                  : `Session ${sessionInput} | connection lost`}
              </div>
              <div className={`capture-status ${statusIsError ? 'is-error' : ''}`}>{status}</div>
              <button className="capture-secondary-button" onClick={() => void disconnectSession()} type="button">
                Disconnect
              </button>
            </section>

            <section className="capture-primary">
              <div className="capture-card capture-card--primary">
                <button
                  className="capture-primary-button"
                  disabled={!uploadEnabled}
                  onClick={() => openPicker('photo_node', true)}
                  type="button"
                >
                  Take New Photo Node
                </button>
                <button
                  aria-label="Upload existing photo for new photo node"
                  className="capture-tool-button"
                  disabled={!uploadEnabled}
                  onClick={() => openPicker('photo_node', false)}
                  type="button"
                >
                  <i aria-hidden="true" className="fa-solid fa-image" />
                </button>
              </div>
            </section>

            <section className="capture-secondary-row">
              <div className="capture-card capture-card--secondary">
                <button
                  className="capture-secondary-action"
                  disabled={!uploadEnabled}
                  onClick={() => openPicker('additional_photo', true)}
                  type="button"
                >
                  Take Additional Photo
                </button>
                <button
                  aria-label="Upload existing additional photo"
                  className="capture-tool-button"
                  disabled={!uploadEnabled}
                  onClick={() => openPicker('additional_photo', false)}
                  type="button"
                >
                  <i aria-hidden="true" className="fa-solid fa-image" />
                </button>
              </div>
            </section>

            <input
              ref={fileInputRef}
              accept="image/*"
              className="capture-native-input"
              onChange={(event) => {
                void uploadSelectedFiles(event.target.files || [])
              }}
              type="file"
            />
          </section>
        )}
      </main>
    </div>
  )
}
