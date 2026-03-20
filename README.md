# Nodetrace

<p align="center">
  <img src="./public/nodetrace.svg" alt="Nodetrace logo" width="120" />
</p>

Nodetrace is a collaborative visual documentation tool for building and reviewing hierarchical photo trees.

It is built for workflows where a flat folder of images is not enough: cabinet to subassembly to board to component, with enough structure to support inspection, teardown review, collaboration, AI-assisted identification, and eventual HBOM preparation.

## What It Does

Nodetrace lets you:

- organize photos and folders into a true node tree
- keep alternate views of the same item as variants
- collaborate with other users on the same project
- assign structured identification templates to nodes
- review field values one field at a time
- use AI to assist with field completion
- inspect and enhance images non-destructively in the preview panel
- search and filter large projects quickly
- export either a full Nodetrace backup or a normal media tree

## Core Model

- `Project`
  A complete job with its own hierarchy, templates, settings, collaborators, and media.
- `Folder`
  A structural node for grouping other nodes.
- `Photo`
  A node backed by an image. Photos can also have children.
- `Variant`
  An alternate view of the same item. Variants are lateral to a main node rather than children.

Every node also has:

- a unique node ID
- an owner user
- notes
- optional structured identification data
- optional non-destructive image edits if it is backed by a photo

## Major Features

### Collaboration

- username/password accounts
- project owners and collaborators
- per-project access control
- live collaborator presence in the top bar
- colored node outlines showing what other users currently have selected
- click a collaborator chip to jump to the node they are viewing

### Tree Editing

- create folders, photos, and variant photos
- drag-and-drop reparenting
- convert between variants and structural children
- promote a variant to become the main node
- collapse and expand branches
- multi-select nodes for bulk operations
- undo/redo support for project edits

### Canvas Workflow

- zoomable and pannable visual tree
- fit-to-view and focus-selected actions
- optional background grid
- selected-node path display
- per-user per-project saved canvas position and zoom

### Docked Panels

The UI uses left and right docked sidebars with one active panel per side. Panels can be moved between sides.

Current panels include:

- Preview
- Camera
- Search
- Templates
- Inspector
- Data
- Settings
- Account

Layout is saved per user and per project.

### Search and Filtering

The Search panel supports:

- name search
- filter by review status
- filter by notes presence
- filter by one or more owners
- filter by one or more templates
- batch-select all results
- click a result to select it and focus it on the canvas

### Structured Identification

Nodetrace supports template-driven identification workflows.

Templates define fields such as:

- part number
- manufacturer
- identifiers
- material description
- confidence

Per node, you can:

- apply a template
- fill or edit field values
- mark fields reviewed individually
- use AI Fill on AI-assisted fields

Templates support:

- manual fields
- AI-assisted fields
- template-level AI instructions
- template-level parent/child scope limits

### AI Assistance

AI Fill is project-scoped and uses the project OpenAI API key managed by the project owner.

Current behavior:

- reviewed fields are never overwritten
- reviewed field values are still used as trusted context
- scoped node text is provided before images
- variants are always included for in-scope nodes
- template-level instructions guide how AI uses bounded context

AI assistance is meant to provide a starting point, not final truth. Human review is still the workflow.

### Preview and Image Enhancement

The Preview panel supports non-destructive, per-node image adjustments:

- zoom and pan
- fit view
- crop
- rotate 90 degrees
- brightness
- contrast
- exposure
- sharpness
- denoise
- invert colors
- reset crop
- reset adjustments
- copy image
- download image

These edits do not modify the original uploaded file.

### Capture Workflows

#### Desktop

- add folders and photos directly in the app
- drag image files into the tree
- use the Camera panel for live capture and crop

#### Mobile

Nodetrace exposes a `/capture` page for phone uploads tied to the current desktop session.

- connect a phone to the active desktop session
- capture photos directly on the phone
- upload normal photos or variants
- send them straight into the selected node context

## Storage

By default Nodetrace stores local data in:

- database: `data/database.db`
- uploaded media: `data/uploads/<project-id>/...`

Each image keeps:

- an original-resolution file
- a lower-resolution preview image for fast rendering

## Export Options

### Export Project

Creates a full backup archive intended for re-import into Nodetrace.

Includes:

- project metadata
- hierarchy
- settings
- collaborators and templates
- identification data
- original images
- preview images
- non-destructive image edit state

### Export Media Tree

Creates a normal folder-based `.zip` that mirrors the project structure for users who do not use Nodetrace.

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

Run the normal development setup:

```bash
npm run dev
```

By default:

- dev frontend: `http://localhost:5173`
- backend/API: `http://localhost:3001`

### Shared Backend Workflow

If you want other users on the stable built frontend while you continue working on a separate dev frontend against the same backend data:

1. Build the frontend when you want to publish a stable UI snapshot:

```bash
npm run build
```

2. Run the shared backend, which also serves the built frontend:

```bash
npm run serve:shared
```

Users can then stay on:

- `http://<host>:3001`

3. In another terminal, run only the Vite frontend:

```bash
npm run dev:client
```

You can then work from:

- `http://<host>:5173`

Important:

- this isolates frontend work, not backend changes
- if you restart or change the backend, everyone sharing that backend feels it immediately

## Environment Notes

Normal local use does not require much configuration, but AI key storage does.

Nodetrace reads `.env` automatically on server startup.

For project-scoped OpenAI API key storage, define:

```env
NODETRACE_SECRET_KEY=replace-this-with-a-long-random-secret
```

That key is used only to encrypt stored project API keys on the server.

## Intended Use

Nodetrace is especially useful for:

- industrial equipment inspection
- teardown documentation
- board and component photography
- structured evidence capture
- collaborative reverse-engineering workflows
- HBOM preparation

It is not intended to be a general photo gallery. It is a structured visual trace tool for documenting real-world systems.
