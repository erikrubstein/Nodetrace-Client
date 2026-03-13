export function renderMobileCapturePage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>PhotoMap Capture</title>
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
      button {
        width: 100%;
        border: none;
        border-radius: 8px;
        font: inherit;
      }

      select {
        background: var(--surface);
        color: var(--text);
        padding: 12px 10px;
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

      .capture-variant-button {
        background: var(--surface);
        color: var(--text);
        border-radius: 12px;
      }

      .status {
        min-height: 1.2em;
        color: var(--muted);
        font-size: 0.76rem;
      }

      .status.error {
        color: #d46868;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel">
        <div class="title">PhotoMap Capture</div>

        <label>
          <span>Project</span>
          <select id="projectSelect"></select>
        </label>

        <label>
          <span>Client in Control</span>
          <select id="clientSelect"></select>
        </label>

        <div id="status" class="status"></div>
      </section>

      <label class="capture-button" for="captureInput">Tap Anywhere To Take Photo</label>
      <input id="captureInput" class="capture-input" type="file" accept="image/*" capture="environment" />

      <div class="secondary-row">
        <button id="variantButton" class="capture-variant-button" type="button">Take Variant Photo</button>
        <button id="chooseButton" type="button">Choose Existing Photo</button>
      </div>
    </main>

    <script>
      const projectSelect = document.getElementById('projectSelect')
      const clientSelect = document.getElementById('clientSelect')
      const captureInput = document.getElementById('captureInput')
      const variantButton = document.getElementById('variantButton')
      const chooseButton = document.getElementById('chooseButton')
      const statusEl = document.getElementById('status')
      const search = new URLSearchParams(window.location.search)
      let pollHandle = null
      let uploadMode = 'child'

      function updateUrlParams() {
        const url = new URL(window.location.href)
        if (projectSelect.value) {
          url.searchParams.set('project', projectSelect.value)
        } else {
          url.searchParams.delete('project')
        }
        if (clientSelect.value) {
          url.searchParams.set('clientId', clientSelect.value)
        } else {
          url.searchParams.delete('clientId')
        }
        window.history.replaceState({}, '', url)
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

      async function loadProjects() {
        const projects = await api('/api/projects')
        projectSelect.innerHTML = ''

        for (const project of projects) {
          const option = document.createElement('option')
          option.value = project.id
          option.textContent = project.name
          projectSelect.append(option)
        }

        const requestedProjectId = search.get('project') || search.get('projectId')
        if (requestedProjectId && projects.some((project) => String(project.id) === requestedProjectId)) {
          projectSelect.value = requestedProjectId
        }

        updateUrlParams()
        await loadClients()
      }

      async function loadClients() {
        if (!projectSelect.value) {
          clientSelect.innerHTML = ''
          return
        }

        const clients = await api(\`/api/projects/\${projectSelect.value}/clients\`)
        const previousClientId = clientSelect.value
        clientSelect.innerHTML = ''

        if (clients.length === 0) {
          const option = document.createElement('option')
          option.value = ''
          option.textContent = 'No active desktop clients'
          clientSelect.append(option)
          return
        }

        for (const client of clients) {
          const option = document.createElement('option')
          option.value = client.id
          option.textContent = \`\${client.name} -> \${client.selectedNodeName}\`
          clientSelect.append(option)
        }

        const requestedClientId = search.get('clientId')
        if (requestedClientId && clients.some((client) => client.id === requestedClientId)) {
          clientSelect.value = requestedClientId
        } else if (previousClientId && clients.some((client) => client.id === previousClientId)) {
          clientSelect.value = previousClientId
        }

        updateUrlParams()
      }

      async function uploadSelectedFiles(files) {
        if (!files.length || !projectSelect.value || !clientSelect.value) {
          return
        }

        setStatus('Uploading...')

        try {
          for (const file of files) {
            const previewFile = await createPreviewFile(file)
            const formData = new FormData()
            formData.append('clientId', clientSelect.value)
            formData.append('variant', uploadMode === 'variant' ? 'true' : 'false')
            formData.append('name', '<untitled>')
            formData.append('notes', '')
            formData.append('tags', '')
            formData.append('file', file)
            if (previewFile) {
              formData.append('preview', previewFile)
            }

            await api(\`/api/projects/\${projectSelect.value}/photos\`, {
              method: 'POST',
              body: formData,
            })
          }

          captureInput.value = ''
          setStatus('Uploaded.')
          await loadClients()
        } catch (error) {
          setStatus(error.message, true)
        }
      }

      function startClientPolling() {
        window.clearInterval(pollHandle)
        pollHandle = window.setInterval(() => {
          loadClients().catch((error) => setStatus(error.message, true))
        }, 4000)
      }

      projectSelect.addEventListener('change', () => {
        updateUrlParams()
        loadClients().catch((error) => setStatus(error.message, true))
      })

      clientSelect.addEventListener('change', () => {
        updateUrlParams()
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

      loadProjects()
        .then(startClientPolling)
        .catch((error) => setStatus(error.message, true))
    </script>
  </body>
</html>`
}
