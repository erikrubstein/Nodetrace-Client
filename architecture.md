# Architecture

## Purpose

Nodetrace is a collaborative visual documentation tool for hierarchical photo trees. It is built for workflows where the image set itself has structure: cabinet -> subassembly -> board -> component, with each node optionally carrying attached photos.

The app is optimized for:

- browsing and editing large media trees
- collaborative project review
- template-driven identification workflows
- non-destructive image enhancement
- eventual downstream HBOM preparation

This document is intended to give another contributor enough context to extend the app without fighting its existing architecture.

## Core Mental Model

There are three layers that matter most:

1. The server owns durable truth.
   Projects, nodes, collaborators, templates, identification data, preview edit state, and per-user project preferences all live on the backend.

2. The client owns interaction and rendering.
   The React app computes layout, manages panel UI, handles drag/zoom/select workflows, and renders the tree from server-provided data.

3. The canvas is a projection of normalized tree data.
   The server returns a user-specific tree payload; the client derives display relationships and positions locally.

When adding a feature, decide first which layer owns it:

- server if it must persist, be shared, or be permission-checked
- client if it is temporary interaction state or presentation logic
- both if it is durable but has rich local interaction

## High-Level Structure

### Backend

The backend app lives in:

- [apps/server/index.js](/C:/SolaSec/Tools/Nodetrace/apps/server/index.js)

It is still orchestration-heavy. That entrypoint and its route modules handle:

- auth and sessions
- project and node CRUD
- collaborator access control
- per-user/per-project UI preferences
- identification templates and data
- AI fill orchestration
- preview edit persistence
- export/import/restore flows
- presence/collaboration endpoints
- serving the built frontend from `dist`

Local storage layout:

- database: `data/database.db`
- uploads: `data/uploads/<project-id>/...`
- temp workdirs: `data/tmp`

### Frontend

The renderer app lives in:

- [apps/renderer/src/App.jsx](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/App.jsx)

`App.jsx` wires together:

- auth/session bootstrap
- project/tree loading
- panel layout state
- canvas selection and transform state
- dialogs and menus
- API mutation helpers
- history / undo-redo
- collaborator presence
- cross-panel coordination

This file is large on purpose. It is the app shell, not a dumping ground. Complex behavior that spans panels usually gets coordinated here.

### Supporting Layers

Pure helpers live in:

- [apps/renderer/src/lib/api.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/api.js)
- [apps/renderer/src/lib/constants.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/constants.js)
- [apps/renderer/src/lib/debug.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/debug.js)
- [apps/renderer/src/lib/image.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/image.js)
- [apps/renderer/src/lib/tree.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/tree.js)
- [apps/renderer/src/lib/urlState.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/urlState.js)

Stateful workflow hooks live in:

- [apps/renderer/src/hooks/useProjectSync.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useProjectSync.js)
- [apps/renderer/src/hooks/useNodeEditing.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useNodeEditing.js)
- [apps/renderer/src/hooks/useUndoRedo.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useUndoRedo.js)
- [apps/renderer/src/hooks/useWorkspaceInteractions.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useWorkspaceInteractions.js)

Panels and presentational pieces live in:

- [apps/renderer/src/components](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/components)

### Desktop Shell

Desktop-specific orchestration lives in:

- [apps/desktop/main.js](/C:/SolaSec/Tools/Nodetrace/apps/desktop/main.js)
- [apps/desktop/preload.cjs](/C:/SolaSec/Tools/Nodetrace/apps/desktop/preload.cjs)

The Electron layer owns:

- desktop window creation
- custom title bar controls
- popped-out panel windows
- local backend process startup in desktop mode

## Domain Model

Important durable entities:

- `User`
- `Project`
- `Node`
- `Template`
- `Node Identification`
- `User Project UI Preferences`
- `Desktop Session / Presence`

### Nodes

The current product direction is a single logical `Node` with attached media:

- a node may have no photo
- a node may have one main photo
- a node may have additional attached photos

Important node properties include:

- stable node ID
- node owner
- name
- notes
- tags
- child relationships
- review status
- optional identification data
- added/created timestamps

Important media properties include:

- media ID
- owning node ID
- main-photo ordering
- original and preview file paths
- non-destructive image edits

The codebase still contains compatibility logic for older `folder/photo/variant` storage, but that should be treated as migration debt rather than the target product model.

### Templates and Data

Templates are fully custom now. There are no longer built-in templates.

A template defines:

- name
- template-level AI instructions
- template-level parent/child scope
- fields

A field defines:

- label
- key
- input type (`text` or `multiline`)
- mode (`manual` or `ai`)

Node data uses templates to provide structure. The current model is:

- Inspector: node metadata and review status
- Data panel: template assignment, bulk template actions, single-node field editing, and AI fill

### Ownership and Collaboration

Projects have:

- one owner
- zero or more collaborators

Nodes also have owners. This is used for attribution and filtering.

If a user account is deleted:

- account deletion is blocked if the user still owns projects
- collaborator rows are removed
- node ownership is reassigned to the project owner
- some historical attribution fields are cleared

## UI Architecture

### Docked Panels

The app uses left and right docked sidebars with one active panel per side.

Panel IDs currently live in:

- [apps/renderer/src/lib/constants.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/constants.js)

Current panels:

- Preview
- Camera
- Search
- Templates
- Inspector
- Data
- Settings
- Account

Panel state is persisted per user per project:

- open/closed per side
- width per side
- active panel per side
- panel docking map

If you add a panel:

1. Add a stable panel ID in `constants.js`
2. Add a default dock side
3. Add corresponding server defaults in `apps/server/index.js`
4. Render it through `DockedSidebar` in `App.jsx`
5. Add an icon in the rails

### Canvas

The canvas renderer is:

- [apps/renderer/src/components/CanvasWorkspace.jsx](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/components/CanvasWorkspace.jsx)

Important behaviors:

- zoom/pan
- selection and multi-selection
- right-drag marquee select
- drag-and-drop reparenting
- context menus
- collapse/expand
- collaborator selection rings
- search-result isolate mode

The canvas should stay fast. Features that only affect presentation should usually be done as client-side classes or derived render state, not by mutating server data.

### Preview

The preview renderer is:

- [apps/renderer/src/components/PreviewPanel.jsx](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/components/PreviewPanel.jsx)

Preview edits are:

- non-destructive
- per-photo/media
- server-persisted

Current edits include crop, rotate, brightness, contrast, exposure, sharpness, denoise, and invert. The original uploaded file is never modified.

## State Model

### Server-Authoritative State

These are treated as durable/shared:

- auth and current user
- projects
- tree payload
- collaborators and presence
- templates
- identification field values
- preview edit state
- per-user/per-project UI preferences

### Client-Authoritative Interaction State

These are mostly local interaction concerns:

- open menus and dialogs
- drag state
- marquee state
- transient form drafts
- in-flight request guards

### Selection Model

There is still a concept of a primary selected node, but multi-selection is real.

Important rule:

- explicit selection count should reflect all explicitly selected nodes
- destructive actions often operate on a deduplicated root set to avoid double-processing descendants

This split is intentional. Do not collapse it back into “first selected node is the only real one.”

### URL vs Preferences

Current rule:

- URL stores project and primary node identity
- per-user/project UI prefs store things like canvas transform, panel layout, selected node IDs, theme, and grid

When touching startup behavior, be careful. Selection, URL sync, project load, tree load, and SSE/poll refresh can race each other.

## Important Hooks

### `useProjectSync`

Location:

- [apps/renderer/src/hooks/useProjectSync.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useProjectSync.js)

Responsibilities:

- load projects
- load tree for selected project
- restore URL-based selection
- publish mobile capture session state
- refresh project list and connection counts

Important pattern:

- request sequence refs are used to ignore stale async responses

When adding new background loads, follow that pattern. Do not let older responses overwrite newer local state.

### `useWorkspaceInteractions`

Location:

- [apps/renderer/src/hooks/useWorkspaceInteractions.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useWorkspaceInteractions.js)

Responsibilities:

- canvas pan/zoom
- preview pan
- fit/focus helpers
- drag state
- marquee selection
- context menu suppression around right-drag

This hook is where pointer-heavy behavior belongs. Avoid spreading low-level pointer logic across multiple components.

### `useNodeEditing`

Location:

- [apps/renderer/src/hooks/useNodeEditing.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useNodeEditing.js)

Responsibilities:

- debounce single-node draft saves
- patch nodes safely
- push undo/redo entries

Pattern:

- apply optimistic/local update carefully
- track save sequence per node so stale responses do not win

### `useUndoRedo`

Location:

- [apps/renderer/src/hooks/useUndoRedo.js](/C:/SolaSec/Tools/Nodetrace/apps/renderer/src/hooks/useUndoRedo.js)

Responsibilities:

- store undo/redo entries
- run undo/redo safely
- block history replay from recursively pushing more history

If a mutation should be undoable, push a history entry at the point where the mutation becomes durable.

## Data and Rendering Flow

Typical feature flow looks like this:

1. Server mutates durable state.
2. Client applies local optimistic state if needed.
3. Tree/project payload refreshes.
4. `App.jsx` reconciles state.
5. `tree.js` derives render data.
6. Panels/canvas render from that derived state.
7. In desktop mode, Electron may mirror that state into panel windows through the desktop bridge.

For visual-only features, skip step 1 and keep it client-side.

For shared/project features, the server should remain authoritative.

## Conventions That Matter

### 1. Prefer stable IDs over labels

Template field keys, panel IDs, user IDs, project IDs, and node IDs all matter. Do not use display names as durable references.

### 2. Separate structure from presentation

Do not overload node type or tree structure to represent UI state. Use dedicated preferences or derived render state.

### 3. Keep AI assist non-authoritative

AI fill is meant to help populate fields, not replace review. Avoid features that implicitly treat AI output as final truth.

### 4. Be careful with races

This app has several places where stale async state can overwrite newer local intent:

- project list refresh
- tree refresh
- preference saves
- presence polling
- preview/field local drafts

If you add async workflows, think explicitly about stale responses.

### 5. Prefer local visual toggles over expensive reloads

Search result isolation is a good example: non-result nodes are visually muted client-side instead of forcing a data reload.

### 6. Bulk behavior should be explicit

If a feature behaves differently for one node vs many nodes, make that obvious in the UI. Do not silently apply single-node assumptions to bulk selection.

## How to Implement New Features

### Add a New Durable Feature

Use this path when the feature should persist or be shared:

1. Add/normalize the server schema and serialization.
2. Add API routes or extend existing payloads.
3. Extend client defaults if the feature is part of user/project UI prefs.
4. Thread the new data through `App.jsx`.
5. Keep rendering logic in components and pure helpers in `lib`.
6. Add race protection if background refresh can overwrite local changes.

Examples:

- new project-level settings
- node metadata
- template features
- collaborator-related state

### Add a New Interaction-Only Feature

Use this path for local behavior:

1. Add state in `App.jsx` or the most relevant hook.
2. Put pointer/drag logic in `useWorkspaceInteractions` if applicable.
3. Render via existing components.
4. Avoid server writes unless the feature truly needs persistence.

Examples:

- new canvas tool buttons
- temporary overlays
- local filtering views
- preview interaction tweaks

### Add a New Panel

1. Create the panel component in `src/components`
2. Add a stable panel ID in `constants.js`
3. Update default docks on client and server
4. Add sidebar rail icon and labels
5. Render it through `DockedSidebar` in `App.jsx`

### Extend Search

Search is currently client-side over loaded tree data. If you add a filter:

1. Keep it in `SearchPanel` if it can be derived locally
2. Prefer simple booleans/sets over remote round-trips
3. Make the result list and isolate mode still work together

## Validation and Workflow

Routine validation:

```bash
npm run lint
```

Build only when intentionally publishing a new stable frontend:

```bash
npm run build
```

Current development workflow intentionally treats builds as a release step, not an every-edit step.

Useful scripts:

- `npm run dev` - backend + renderer web dev
- `npm run dev:desktop` - renderer + Electron desktop dev
- `npm run dev:server` - backend only
- `npm run dev:renderer` - renderer only
- `npm run start:server` - backend only, non-watch
- `npm run start:desktop` - Electron app
- `npm run build` - build the renderer
- `npm run preview:web` - preview the built renderer
- `npm run test:e2e` - Playwright smoke test

## Recommended Contribution Style

When contributing, prefer these boundaries:

- `apps/server/index.js` and `apps/server/routes`: persistence, permissions, serialization, shared business rules
- `apps/renderer/src/App.jsx`: orchestration and cross-panel coordination
- `apps/renderer/src/hooks`: reusable stateful workflows
- `apps/renderer/src/lib`: pure transformations and helpers
- `apps/renderer/src/components`: rendering and narrow UI interactions
- `apps/desktop`: desktop-specific shell and window management

If a change feels like it is fighting that split, stop and reassess before adding more code.

## Current Rough Edges

A contributor should know these up front:

- `apps/server/index.js` is still large and central even after route extraction
- `App.jsx` is orchestration-heavy and can be easy to destabilize
- AI workflows are intentionally in flux and should be treated as assistive, not final
- multi-tab behavior is not fully isolated; per-user/project preferences can still interact across tabs in some cases
- some storage-level migration debt still exists under the current node-media model

That is not a reason to avoid working in these areas. It is a reason to change them carefully and in small, coherent steps.
