# Nodetrace Client

<p align="center">
  <img src="./apps/renderer/public/nodetrace.svg" alt="Nodetrace logo" width="140" />
</p>

<p align="center">
  Collaborative visual documentation for hierarchical photo trees.
</p>

Nodetrace Client is the front end for building, reviewing, and collaborating on structured photo trees. It ships as both a browser app and an Electron desktop app, and connects to a running Nodetrace Server for authentication, project storage, media, and collaboration.

## Highlights

- hierarchical project and node model built for real documentation workflows
- desktop and web clients backed by the same server
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

The desktop app can store multiple server profiles and switch between them.

### Web App

The browser client is served by a Nodetrace Server deployment. End users do not install this repository directly for normal web use.

## Requirements For Local Development

- Node.js 22 or newer recommended
- npm 10 or newer recommended
- a running [Nodetrace Server](../Nodetrace-Server/README.md)

## Quick Start

1. Install client dependencies:

```bash
npm install
```

2. In a separate terminal, start the server from the server repo:

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

Default local URLs:

- renderer dev server: `http://127.0.0.1:5173`
- API server: `http://127.0.0.1:3001`

## Using Nodetrace

Typical workflow:

1. Sign in or create an account on a Nodetrace Server.
2. Create a project or open an existing one.
3. Build the node tree and attach photos where needed.
4. Review notes, tags, status, and identification data in the side panels.
5. Use search, templates, and preview tools to refine the project.
6. Collaborate with other users or export the finished result.

## Development Scripts

- `npm run dev`
  Starts the web renderer in development mode.
- `npm run dev:desktop`
  Starts the renderer plus Electron desktop shell.
- `npm run dev:desktop:mac-ui`
  Runs the desktop app with the mac-specific renderer UI override for local testing on non-macOS hosts.
- `npm run dev:desktop:win-ui`
  Runs the desktop app with the Windows-specific renderer UI override.
- `npm run dev:renderer`
  Starts only the Vite renderer workspace.
- `npm run build:web`
  Builds the web renderer into `dist/`.
- `npm run preview:web`
  Serves the built renderer locally.
- `npm run dist:win`
  Builds the Windows NSIS installer.
- `npm run dist:mac`
  Builds the macOS DMG package. Must be run on macOS for real release validation.
- `npm run lint`
  Lints the whole client repo.
- `npm run test:e2e`
  Runs the Playwright smoke test. Requires a running server.

## Building Release Artifacts

Web build:

```bash
npm run build:web
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

## License

[MIT](./LICENSE)
