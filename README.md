# Nodetrace

<p align="center">
  <img src="./public/nodetrace.svg" alt="Nodetrace logo" width="120" />
</p>

Nodetrace is a collaborative visual documentation tool for building and reviewing hierarchical photo trees.

It is built for workflows where a flat folder of images is not enough: cabinet to subassembly to board to component, with enough structure to support inspection, teardown review, collaboration, AI-assisted identification, and eventual HBOM preparation.

## What It Does

Nodetrace lets you:

- organize work into a true node tree
- attach zero, one, or many photos to each node
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
- `Node`
  The primary structural item in the tree. A node may have no photo, one main photo, or additional attached photos.

Every node also has:

- a unique node ID
- an owner user
- notes
- tags
- review status
- optional structured identification data

Every attached photo can also carry:

- original and preview files
- non-destructive image edits
- main-photo ordering within the node

## Major Features

### Collaboration

- username/password accounts
- project owners and collaborators
- per-project access control
- live collaborator presence in the top bar
- colored node outlines showing what other users currently have selected
- click a collaborator chip to jump to the node they are viewing

### Tree Editing

- create empty nodes and photo nodes
- add additional photos to existing nodes
- drag-and-drop reparenting
- convert a node into an additional photo on another node
- convert an attached photo into its own sibling photo node
- collapse and expand branches
- multi-select nodes for bulk operations
- right-drag marquee selection on the canvas
- bulk template application and template clearing
- undo/redo support for project edits

### Canvas Workflow

- zoomable and pannable visual tree
- fit-to-view and focus-selected actions
- optional background grid
- selected-node path display
- selection-aware layout changes that keep the selected node anchored during collapse/expand
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
- filter by photo presence
- filter by pinned selection scope
- batch-select all results
- isolate search results on the canvas
- show completed nodes with a visual checkmark in the results list
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
- attached photos are always included for in-scope nodes
- template-level instructions guide how AI uses bounded context

AI assistance is meant to provide a starting point, not final truth. Human review is still the workflow.

### Preview and Image Enhancement

The Preview panel supports non-destructive, per-photo image adjustments:

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

- add empty nodes, photo nodes, and additional photos directly in the app
- drag image files into the tree
- use the Camera panel for live capture

#### Mobile

Nodetrace exposes a `/capture` page for phone uploads tied to the current desktop session.

- connect a phone to the active desktop session
- capture photos directly on the phone
- create a new photo node under the selected node
- add an additional photo to the selected node
- choose existing photos for either path

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

## Transition Note

Nodetrace is currently in the final stages of moving from an older `folder/photo/variant` storage model to a simpler `node + attached media` model. The visible app already behaves primarily through the newer model, but some compatibility logic still exists internally so older projects can be preserved safely during migration.

## Tech Stack

- React
- Vite
- Electron desktop shell
- Express
- SQLite via `better-sqlite3`
- local filesystem media storage

Repo layout:

- `apps/server` - Express + SQLite backend
- `apps/renderer` - React + Vite UI
- `apps/desktop` - Electron shell and panel-window orchestration
- `packages/shared` - shared defaults and sizing metadata

## Development

Install dependencies:

```bash
npm install
```

Run the normal development setup:

```bash
npm run dev
```

Run desktop development:

```bash
npm run dev:desktop
```

By default:

- dev frontend: `http://localhost:5173`
- backend/API: `http://localhost:3001`

Release-oriented manual verification lives in [QA_CHECKLIST.md](C:/SolaSec/Tools/Nodetrace/QA_CHECKLIST.md).

Useful root scripts:

- `npm run dev` - backend + renderer web dev
- `npm run dev:desktop` - renderer + Electron desktop dev
- `npm run dev:server` - backend only
- `npm run dev:renderer` - renderer only
- `npm run start:server` - backend only, non-watch
- `npm run start:desktop` - Electron app
- `npm run build` - build the renderer into `dist`
- `npm run preview:web` - preview the built renderer
- `npm run lint` - lint the whole repo
- `npm run test:e2e` - Playwright smoke test

## Environment Notes

Normal local use does not require much configuration, but AI key storage does.

Nodetrace reads `.env` automatically on server startup.

For project-scoped OpenAI API key storage, define:

```env
NODETRACE_SECRET_KEY=replace-this-with-a-long-random-secret
```

That key is used only to encrypt stored project API keys on the server.

## Contributor Notes

For implementation details and contribution guidance, see:

- [architecture.md](./architecture.md)

That document explains:

- how the app is structured
- how client and server responsibilities are split
- where new feature logic should live
- the patterns already used for panels, hooks, persistence, and async state

## Intended Use

Nodetrace is especially useful for:

- industrial equipment inspection
- teardown documentation
- board and component photography
- structured evidence capture
- collaborative reverse-engineering workflows
- HBOM preparation

It is not intended to be a general photo gallery. It is a structured visual trace tool for documenting real-world systems.
