export function renderMobileCapturePage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Nodetrace Capture</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #121212;
        --panel: #1d1d1d;
        --surface: #262626;
        --text: #f4f4f0;
        --muted: #9a9a9a;
      }

      @media (prefers-color-scheme: light) {
        :root {
          --bg: #efefea;
          --panel: #f7f7f2;
          --surface: #ffffff;
          --text: #161616;
          --muted: #6f6f6a;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        height: 100svh;
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: "JetBrains Mono", ui-monospace, monospace;
      }

      .shell {
        height: 100svh;
        display: flex;
        flex-direction: column;
        padding: 12px;
        gap: 10px;
      }

      .shell.connect-only {
        justify-content: center;
      }

      .shell.connected {
        justify-content: flex-start;
      }

      .panel {
        background: var(--panel);
        border-radius: 10px;
        padding: 10px;
        display: grid;
        gap: 8px;
      }

      .title {
        font-size: 0.92rem;
      }

      label {
        display: grid;
        gap: 6px;
        font-size: 0.76rem;
        color: var(--muted);
      }

      select,
      input,
      button {
        width: 100%;
        border: none;
        border-radius: 8px;
        font: inherit;
      }

      select,
      input {
        background: var(--surface);
        color: var(--text);
        padding: 12px 10px;
        font-size: 16px;
      }

      input {
        text-transform: lowercase;
      }

      button {
        background: var(--surface);
        color: var(--text);
        padding: 12px 10px;
      }

      .capture-input {
        display: none;
      }

      .capture-button {
        flex: 1;
        min-height: 0;
        border-radius: 14px;
        background: var(--text);
        color: var(--bg);
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-size: 1.05rem;
        font-weight: 700;
        padding: 24px;
      }

      .secondary-row {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr;
      }

      .capture-shell {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .connect-actions {
        display: grid;
        gap: 10px;
      }

      .capture-variant-button {
        background: var(--surface);
        color: var(--text);
        border-radius: 12px;
      }

      button:disabled,
      .capture-button.disabled {
        opacity: 0.45;
        pointer-events: none;
      }

      .status {
        min-height: 1.2em;
        color: var(--muted);
        font-size: 0.76rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status.error {
        color: #d46868;
      }

      .hidden {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <main id="shell" class="shell connect-only">
      <section id="connectPanel" class="panel">
        <div class="title">Nodetrace Capture</div>

        <label>
          <span>Session</span>
          <input id="sessionInput" type="text" maxlength="5" autocomplete="off" autocapitalize="none" spellcheck="false" />
        </label>

        <div id="status" class="status"></div>
        <div class="connect-actions">
          <button id="connectButton" type="button">Connect</button>
        </div>
      </section>

      <section id="captureShell" class="capture-shell hidden">
        <section class="panel">
          <div class="title">Connected</div>
          <div id="sessionReadout" class="status"></div>
          <button id="disconnectButton" type="button">Disconnect</button>
        </section>
        <label class="capture-button" for="captureInput">Tap Anywhere To Take Photo</label>
        <input id="captureInput" class="capture-input" type="file" accept="image/*" capture="environment" />

        <div class="secondary-row">
          <button id="variantButton" class="capture-variant-button" type="button">Take Variant Photo</button>
          <button id="chooseButton" type="button">Choose Existing Photo</button>
        </div>
      </section>
    </main>

    <script>
      const shell = document.getElementById('shell')
      const connectPanel = document.getElementById('connectPanel')
      const captureShell = document.getElementById('captureShell')
      const sessionInput = document.getElementById('sessionInput')
      const connectButton = document.getElementById('connectButton')
      const captureInput = document.getElementById('captureInput')
      const captureButton = document.querySelector('.capture-button')
      const variantButton = document.getElementById('variantButton')
      const chooseButton = document.getElementById('chooseButton')
      const disconnectButton = document.getElementById('disconnectButton')
      const sessionReadout = document.getElementById('sessionReadout')
      const statusEl = document.getElementById('status')
      const search = new URLSearchParams(window.location.search)
      let pollHandle = null
      let uploadMode = 'child'
      let sessionInfo = null
      let hasConnectedSession = false
      const connectionId = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)).toLowerCase()

      function updateUrlParams() {
        const url = new URL(window.location.href)
        if (sessionInput.value) {
          url.searchParams.set('session', sessionInput.value)
        } else {
          url.searchParams.delete('session')
        }
        window.history.replaceState({}, '', url)
      }

      function setConnectedState(connected) {
        shell.classList.toggle('connect-only', !connected)
        shell.classList.toggle('connected', connected)
        connectPanel.classList.toggle('hidden', connected)
        captureShell.classList.toggle('hidden', !connected)
      }

      function setCaptureEnabled(enabled) {
        captureButton.classList.toggle('disabled', !enabled)
        variantButton.disabled = !enabled
        chooseButton.disabled = !enabled
      }

      function setStatus(message, isError = false) {
        statusEl.textContent = message
        statusEl.className = isError ? 'status error' : 'status'
      }

      async function api(url, options = {}) {
        const response = await fetch(url, options)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Request failed')
        }

        if (response.status === 204) {
          return null
        }

        return response.json()
      }

      async function heartbeatConnection() {
        const sessionId = sessionInput.value.trim().toLowerCase()
        if (!sessionId || !sessionInfo?.id) {
          return
        }

        await api('/api/sessions/' + sessionId + '/connections/' + connectionId, {
          method: 'PATCH',
        })
      }

      async function disconnectSession() {
        const sessionId = sessionInput.value.trim().toLowerCase()
        window.clearInterval(pollHandle)
        if (sessionId) {
          await fetch('/api/sessions/' + sessionId + '/connections/' + connectionId, {
            method: 'DELETE',
          }).catch(() => {})
        }
        sessionInfo = null
        hasConnectedSession = false
        sessionInput.value = ''
        sessionReadout.textContent = ''
        updateUrlParams()
        setConnectedState(false)
        setCaptureEnabled(false)
        setStatus('Enter a session code.')
      }

      function releaseConnection() {
        const sessionId = sessionInput.value.trim().toLowerCase()
        if (!sessionId || !hasConnectedSession) {
          return
        }

        const url = '/api/sessions/' + sessionId + '/connections/' + connectionId
        if (navigator.sendBeacon) {
          const blob = new Blob([], { type: 'application/octet-stream' })
          navigator.sendBeacon(url + '/release', blob)
          return
        }

        fetch(url, {
          method: 'DELETE',
          keepalive: true,
        }).catch(() => {})
      }

      async function createPreviewFile(file) {
        const imageUrl = URL.createObjectURL(file)

        try {
          const image = await new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = imageUrl
          })

          const maxDimension = 640
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

          const context = canvas.getContext('2d')
          context.drawImage(image, 0, 0, canvas.width, canvas.height)

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
          if (!blob) {
            return null
          }

          const baseName = file.name.replace(/\\.[^.]+$/, '') || 'preview'
          return new File([blob], \`\${baseName}-preview.jpg\`, { type: 'image/jpeg' })
        } finally {
          URL.revokeObjectURL(imageUrl)
        }
      }

      async function refreshSession() {
        const sessionId = sessionInput.value.trim().toLowerCase()
        if (!sessionId) {
          sessionInfo = null
          hasConnectedSession = false
          setConnectedState(false)
          setCaptureEnabled(false)
          setStatus('Enter a session code.')
          return
        }

        sessionInput.value = sessionId

        try {
          sessionInfo = await api(\`/api/sessions/\${sessionId}\`)
          if (sessionInfo?.ok === false) {
            throw new Error(sessionInfo.error || 'Session is not active')
          }
          await heartbeatConnection()
          hasConnectedSession = true
          updateUrlParams()
          setConnectedState(true)
          setCaptureEnabled(true)
          sessionReadout.textContent = \`Session \${sessionId} | \${sessionInfo.projectName} -> \${sessionInfo.selectedNodeName}\`
          setStatus(\`\${sessionInfo.projectName} -> \${sessionInfo.selectedNodeName}\`)
        } catch (error) {
          sessionInfo = null
          setCaptureEnabled(false)
          if (!hasConnectedSession) {
            setConnectedState(false)
          } else {
            setConnectedState(true)
            sessionReadout.textContent = \`Session \${sessionId} | connection lost\`
          }
          setStatus(error.message, true)
        }
      }

      async function uploadSelectedFiles(files) {
        if (!files.length || !sessionInfo?.id) {
          return
        }

        setStatus('Uploading...')

        try {
          for (const file of files) {
            const previewFile = await createPreviewFile(file)
            const formData = new FormData()
            formData.append('variant', uploadMode === 'variant' ? 'true' : 'false')
            formData.append('name', '<untitled>')
            formData.append('notes', '')
            formData.append('tags', '')
            formData.append('file', file)
            if (previewFile) {
              formData.append('preview', previewFile)
            }

            await api(\`/api/sessions/\${sessionInfo.id}/photos\`, {
              method: 'POST',
              body: formData,
            })
          }

          captureInput.value = ''
          await refreshSession()
          setStatus(\`Uploaded to \${sessionInfo?.selectedNodeName || 'selected node'}.\`)
        } catch (error) {
          setStatus(error.message, true)
        }
      }

      function startSessionPolling() {
        window.clearInterval(pollHandle)
        pollHandle = window.setInterval(() => {
          refreshSession().catch((error) => setStatus(error.message, true))
        }, 4000)
      }

      sessionInput.addEventListener('input', () => {
        sessionInput.value = sessionInput.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
      })

      connectButton.addEventListener('click', () => {
        refreshSession()
          .then(() => {
            if (hasConnectedSession) {
              startSessionPolling()
            }
          })
          .catch((error) => setStatus(error.message, true))
      })

      captureInput.addEventListener('change', () => {
        uploadSelectedFiles(Array.from(captureInput.files || []))
      })

      variantButton.addEventListener('click', () => {
        uploadMode = 'variant'
        captureInput.setAttribute('capture', 'environment')
        captureInput.click()
      })

      chooseButton.addEventListener('click', () => {
        uploadMode = 'child'
        captureInput.removeAttribute('capture')
        captureInput.click()
        window.setTimeout(() => {
          captureInput.setAttribute('capture', 'environment')
        }, 0)
      })

      document.querySelector('.capture-button').addEventListener('click', () => {
        uploadMode = 'child'
      })

      disconnectButton.addEventListener('click', () => {
        disconnectSession().catch((error) => setStatus(error.message, true))
      })

      window.addEventListener('pagehide', releaseConnection)
      window.addEventListener('beforeunload', releaseConnection)

      sessionInput.value = (search.get('session') || '').trim().toLowerCase()
      setConnectedState(false)
      setCaptureEnabled(false)
      setStatus(sessionInput.value ? 'Tap Connect to join this session.' : 'Enter a session code.')
    </script>
  </body>
</html>`
}
