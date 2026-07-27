# Nodetrace Client

<p align="center">
  <img src="./apps/renderer/public/nodetrace.svg" alt="Nodetrace logo" width="140" />
</p>

<p align="center">
  Collaborative visual documentation for hierarchical photo trees.
</p>

Nodetrace Client is the front end for building, reviewing, and collaborating on structured photo trees. It ships as both a browser app and an Electron desktop app. The desktop app includes private Local Projects storage and can also connect to standalone Nodetrace Servers for collaboration.

## Highlights

- hierarchical project and node model built for real documentation workflows
- opt-in spatial plan workspace with location and appearance panels
- local and remote projects backed by the same server runtime and data model
- collaborative editing with presence indicators and shared project access
- non-destructive image review tools in the preview panel
- structured identification templates with optional AI-assisted field filling
- search, filtering, multi-select, and bulk editing for large projects
- export flows for full Nodetrace backups and conventional media trees

## Installation

### Desktop App

Desktop users should install a packaged release from GitHub Releases:

- Windows: download and run the latest `Nodetrace Setup *.exe`
- macOS: download the latest `.dmg` and drag Nodetrace into `Applications`

The desktop app always includes a fixed **Local Projects** profile. Its SQLite database and media are stored in the operating system's Nodetrace application-data directory. While Nodetrace is running, its bundled server listens on all network interfaces so mobile capture devices on the same network can connect. It does not advertise or discover projects. The app can also store multiple remote server profiles and switch between them.

### Web App

The browser client is served by a Nodetrace Server deployment. End users do not install this repository directly for normal web use.

## Requirements For Local Development

- Node.js 22 or newer recommended
- npm 10 or newer recommended
- a sibling [Nodetrace Server](../Nodetrace-Server/README.md) checkout for desktop development and packaging
- a running Nodetrace Server only when developing the web client or testing remote profiles

## Quick Start

1. Install client dependencies:

```bash
npm install
```

2. For web development or remote-profile testing, start the server in a separate terminal:

```bash
cd ../Nodetrace-Server
npm install
npm run dev
```

3. Start the client:

Web:

```bash
npm run dev
```

Desktop:

```bash
npm run dev:desktop
```

The desktop command prepares the server runtime from `../Nodetrace-Server`, rebuilds native SQLite support for Electron, and starts Local Projects automatically. If the server checkout is elsewhere, set `NODETRACE_SERVER_SOURCE_DIR` to its absolute path.

Default local URLs:

- renderer dev server: `http://127.0.0.1:5173`
- API server: `http://127.0.0.1:3001`

The web and desktop development clients load persistent connection settings from `.env` in the client repo root:

```dotenv
VITE_HOST=127.0.0.1
VITE_PORT=5173
VITE_API_BASE_URL=http://127.0.0.1:3001
```

Shell environment variables override values from this file. Restart the client after changing it.

## Using Nodetrace

Typical workflow:

1. Choose Local Projects or sign in to a remote Nodetrace Server.
2. Create a project or open an existing one.
3. Build the node tree and attach photos where needed.
4. Enable plans in Project Settings when a project needs spatial documentation.
5. Use the centered canvas tools to switch views, then manage plans, appearance, and locations from the side panels.
6. Review notes, tags, status, and identification data in the side panels.
7. Use search, templates, and preview tools to refine the project.
8. Collaborate with other users or export the finished result.

## Development Scripts

- `npm run dev`
  Starts the web renderer in development mode.
- `npm run dev:desktop`
  Prepares the bundled local server, then starts the renderer plus Electron desktop shell.
- `npm run dev:desktop:mac-ui`
  Runs the desktop app with the mac-specific renderer UI override for local testing on non-macOS hosts.
- `npm run dev:desktop:win-ui`
  Runs the desktop app with the Windows-specific renderer UI override.
- `npm run dev:renderer`
  Starts only the Vite renderer workspace.
- `npm run build:web`
  Builds the web renderer into `dist/`.
- `npm run bundle:web`
  Builds the hosted web bundle zip for deployment into a server repo.
- `npm run preview:web`
  Serves the built renderer locally.
- `npm run dist:win`
  Builds the Windows NSIS installer.
- `npm run dist:mac`
  Builds the signed and notarized macOS DMG package. Must be run on macOS with Apple signing credentials for real release validation.
- `npm run prepare:local-server`
  Copies the runtime source from the sibling server checkout into the generated desktop bundle input.
- `npm run prepare:desktop-runtime`
  Prepares the server source and rebuilds native dependencies for Electron development.
- `npm run lint`
  Lints the whole client repo.
- `npm run test:e2e`
  Runs the Playwright smoke test. Requires a running server.

## Building Release Artifacts

Web build:

```bash
npm run build:web
```

Hosted web bundle zip:

```bash
npm run bundle:web
```

Windows installer:

```bash
npm run dist:win
```

macOS package:

```bash
npm run dist:mac
```

Generated desktop installers are written to `release/`.
The hosted web bundle zip is written to `release/web/`.

Desktop packaging requires the server repository at `../Nodetrace-Server` by default. Set `NODETRACE_SERVER_SOURCE_DIR` when CI or a local checkout uses a different layout.

### macOS Signing And Notarization

The macOS DMG is configured for Developer ID signing through Electron Builder. The release workflow imports the Developer ID certificate into a temporary keychain, signs the DMG container, then notarizes, staples, and validates the DMG with Apple's `notarytool` and `stapler`. The workflow reads these GitHub Actions secrets:

- `MACOS_CERTIFICATE_BASE64`: base64-encoded `.p12` export of a Developer ID Application certificate
- `MACOS_CERTIFICATE_PASSWORD`: password for the `.p12` export
- `CODE_SIGN_IDENTITY`: optional certificate identity from the exported certificate, for example `Developer ID Application: Example, LLC (ABCDE12345)`

For the explicit notarization step, use App Store Connect API credentials:

- `APPLE_API_KEY_BASE64`: base64-encoded `.p8` App Store Connect API key
- `APPLE_API_KEY_ID`: key ID
- `APPLE_API_ISSUER_ID`: issuer ID

For compatibility with older Nodetrace repository secrets, the workflow also accepts these legacy names:

- `MAC_CSC_LINK` as a fallback for `MACOS_CERTIFICATE_BASE64`
- `MAC_CSC_KEY_PASSWORD` as a fallback for `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_API_KEY` as a fallback for `APPLE_API_KEY_BASE64`
- `APPLE_API_ISSUER` as a fallback for `APPLE_API_ISSUER_ID`

These secrets are not used by this repo's current build:

- `KEYCHAIN_PASSWORD`: not needed; the workflow creates a temporary signing keychain with a generated password.
- `SPARKLE_PRIVATE_KEY`: only needed for Sparkle-style auto-update signatures; Nodetrace currently publishes DMG artifacts and does not configure Sparkle auto-update.

The release workflow maps the certificate secrets into the macOS installer build and decodes the API key secret for the notarization step. After building locally on macOS, verify the app and DMG with:

```bash
spctl --assess --verbose --type exec release/mac/Nodetrace.app
xcrun stapler validate release/Nodetrace-macOS-arm64-v0.1.2.dmg
codesign --verify --deep --strict --verbose=2 release/mac/Nodetrace.app
codesign --verify --verbose=2 release/Nodetrace-macOS-arm64-v0.1.2.dmg
```

## Testing

Lint:

```bash
npm run lint
```

Smoke test against a running local server:

PowerShell:

```powershell
$env:NODETRACE_E2E_SERVER_URL='http://127.0.0.1:3001'
npm run test:e2e
```

Bash:

```bash
NODETRACE_E2E_SERVER_URL=http://127.0.0.1:3001 npm run test:e2e
```

## Repository Layout

- `apps/renderer/`
  React + Vite web client
- `apps/desktop/`
  Electron desktop shell, preload bridge, and main-process integrations
- `packages/shared/`
  Shared defaults and project metadata used by the client runtimes
- `tests/e2e/`
  Playwright smoke coverage

## Contributing

1. Read the nearest relevant [AGENTS.md](./AGENTS.md) files before editing code.
2. Keep changes within the folder that actually owns the behavior.
3. Update `AGENTS.md` files when boundaries or responsibilities materially change.
4. Run the relevant validation commands before opening a pull request:
   - `npm run build:web`
   - `npm run lint`
   - `npm run test:e2e` when the change affects primary user flows
