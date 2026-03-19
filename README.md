# Nodetrace

<p align="center">
  <img src="./public/nodetrace.svg" alt="Nodetrace logo" width="120" />
</p>

Nodetrace is a visual documentation tool for hierarchical photo capture workflows.

It is designed for jobs where you need to document complex physical systems in layers: cabinet -> subassembly -> box -> board -> component, with enough structure that the images remain usable later for inspection, teardown review, export, and downstream HBOM work.

## Purpose

Nodetrace solves a specific problem: once you take hundreds of inspection photos, a normal folder of images is no longer enough. You need a way to:

- organize photos into a true hierarchy
- keep alternate views of the same item as variants
- navigate visually through a large structure
- add notes and tags to each item
- capture photos quickly from desktop, phone, or live camera input
- export both a full app backup and a normal media tree for people who do not use the app

## Core Concepts

- `Project`
  A complete inspection job. Each project has its own settings, hierarchy, media, and exports.
- `Folder`
  A structural node used to group other nodes.
- `Photo`
  A node backed by an image. Photos can also have children.
- `Variant`
  An alternate view of the same item. Variants are lateral to a node rather than children of it.
- `Collapsed Group`
  A visual summary used to compress large child branches without deleting structure.

## Main Features

- Multiple projects in one app
- Root-folder-first project structure
- Nested folders and photos
- Variant photo support
- Notes and tags on nodes
- Drag-and-drop reparenting
- Bulk selection for move and delete operations
- Collapsible branches and focus-path viewing
- Compact and classic layout modes
- Right-growing and down-growing tree directions
- Zoomable and pannable canvas
- Preview panel with high-resolution image view
- Camera panel for live crop capture from a connected camera
- Mobile capture endpoint for direct phone-based uploads
- Undo/redo for project edits
- Export/import of complete project backups
- Export of a normal folder-based media tree

## Interface Overview

The UI is built around a canvas-first workflow:

- top app menu for file, edit, and view actions
- top-edge canvas actions for adding folders, photos, variants, fit view, and grid toggle
- dockable left and right sidebars for inspector, settings, account, preview, and camera panels

The canvas is the primary workspace. Nodes can be selected, moved, collapsed, expanded, and inspected without switching to a separate tree-management view.

## Capture Workflows

### Desktop

- Add folders and photos directly in the canvas
- Drag image files into the app to upload quickly
- Use the Camera panel to capture a crop from a live video input

### Mobile

Nodetrace exposes a `/capture` endpoint for streamlined phone uploads.

- pair a phone to the current desktop session with a short session code
- take photos directly on the phone
- send the image to the currently selected node on desktop
- capture normal photos or variant photos

## Storage Model

Nodetrace stores data locally by default.

- Database: `data/database.db`
- Uploaded media: `data/uploads/<project-id>/...`

Each uploaded photo stores:

- the original-resolution image
- a lower-resolution preview image for canvas rendering

This keeps the main graph responsive even with large projects.

## Export Options

Nodetrace supports two different export paths:

### Export Project

Creates a full backup archive that contains:

- project metadata
- settings
- node hierarchy
- notes and tags
- original images
- preview images

This export is intended for re-import into Nodetrace.

### Export Media Tree

Creates a normal `.zip` with folders and images arranged to mimic the project structure.

This is intended for sharing with people who do not use Nodetrace.

## Tech Stack

- React
- Vite
- Express
- SQLite via `better-sqlite3`
- local filesystem media storage

## Development

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

By default:

- frontend: `http://localhost:5173`
- backend/API: `http://localhost:3001`

### Shared Backend Workflow

If you want other people using a stable built frontend while you keep developing against the same backend data, use this split:

1. Build the frontend when you want to publish an updated stable UI:

```bash
npm run build
```

2. Run the shared backend, which also serves the built `dist/` frontend:

```bash
npm run serve:shared
```

People using:

- `http://<host>:3001`

will get the last built frontend plus the live backend/API.

3. In a separate terminal, run only the Vite dev frontend:

```bash
npm run dev:client
```

You can then use:

- `http://<host>:5173`

for live frontend development while everyone else stays on the last built UI at `3001`.

Important:

- both frontends still share the same backend and database
- frontend-only changes stay isolated until you run `npm run build`
- backend code changes are not isolated in this setup; if you edit and restart the backend, everyone using the shared instance will feel that immediately

Run production build:

```bash
npm run build
npm start
```

## Repo Notes

- `data/` is gitignored and contains local projects and media
- `dist/` is gitignored
- no environment configuration is required for normal local use

## Intended Use

Nodetrace is especially useful for:

- industrial equipment inspection
- teardown documentation
- cabinet and board photography
- structured field evidence capture
- HBOM preparation workflows

It is not meant to be a general photo gallery. It is a structured visual trace tool for documenting real-world systems.
