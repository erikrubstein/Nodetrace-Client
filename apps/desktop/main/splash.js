export function createSplashWindow({ BrowserWindow, appIconPath, fs, svgLogoPath }) {
  const splashWindow = new BrowserWindow({
    show: true,
    frame: false,
    width: 420,
    height: 240,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#1a1a1a',
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const inlineLogo = fs.readFileSync(svgLogoPath, 'utf8')
  const splashHtml = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Nodetrace</title>
      <style>
        :root { color-scheme: dark; }
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #1a1a1a;
          color: #efefef;
          font-family: Consolas, "Courier New", monospace;
        }
        body {
          display: grid;
          place-items: center;
        }
        .splash {
          display: grid;
          justify-items: center;
          gap: 14px;
        }
        .splash__logo {
          width: 64px;
          height: 64px;
          display: block;
        }
        .splash__logo svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .splash__title {
          font-size: 1.2rem;
          letter-spacing: 0.04em;
        }
        .splash__bar {
          width: 128px;
          height: 4px;
          overflow: hidden;
          border-radius: 999px;
          background: #2e2e2e;
          position: relative;
        }
        .splash__bar::after {
          content: "";
          position: absolute;
          inset: 0 auto 0 -36%;
          width: 36%;
          border-radius: inherit;
          background: #efefef;
          animation: splash-load 1s ease-in-out infinite;
        }
        @keyframes splash-load {
          from { transform: translateX(0); }
          to { transform: translateX(380%); }
        }
      </style>
    </head>
    <body>
      <div class="splash">
        <div class="splash__logo" aria-hidden="true">${inlineLogo}</div>
        <div class="splash__title">Nodetrace</div>
        <div class="splash__bar" aria-hidden="true"></div>
      </div>
    </body>
  </html>`

  splashWindow.loadURL(`data:text/html,${encodeURIComponent(splashHtml)}`).catch(() => {})
  return splashWindow
}
