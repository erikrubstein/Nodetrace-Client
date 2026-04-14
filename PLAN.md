# Refactor Plan

## Purpose

This file is the working source of truth for the current Nodetrace client refactor.

The goal is not cosmetic cleanup. The goal is to make the codebase easier to change safely by:

- reducing the number of oversized files
- creating real directory boundaries around domains
- making module ownership clearer
- adding layered `CONTEXT.md` files so a new engineer or agent can orient quickly
- defining a maintenance workflow so the structure stays healthy as the app grows

This plan should be updated if the direction changes materially.

## Current Problems

The current project is not unmanageably large, but complexity is concentrated in a few heavy files:

- `apps/renderer/src/App.jsx`
- `apps/renderer/src/App.css`
- `apps/renderer/src/components/AppDialogs.jsx`
- `apps/desktop/main.js`

These files currently mix too many concerns:

- app shell orchestration
- project loading and sync
- desktop/web branching
- dialog rendering
- command handling
- panel/window behavior
- styling for unrelated UI domains
- Electron windowing, menus, IPC, persistence, and proxy behavior

The result is that even targeted changes often require touching multiple unrelated areas, which increases regression risk and makes work harder for both humans and AI agents.

## Refactor Principles

The refactor should follow these principles:

1. Organize by domain, not just by file type.
2. Move code only when the destination boundary is clear.
3. Prefer small modules with explicit ownership.
4. Keep shared utilities generic; feature-specific logic should stay with the feature.
5. Avoid speculative abstraction. Extract only real seams.
6. `CONTEXT.md` files must describe real boundaries, not aspirational ones.
7. If a file grows large because it owns multiple concerns, split it before continuing feature work in that area.

## Target Client Structure

The renderer should move toward this structure:

```text
apps/renderer/src/
  CONTEXT.md

  app/
    CONTEXT.md
    App.jsx
    app-shell/
    commands/
    state/
    routing/

  features/
    CONTEXT.md
    project-picker/
    server-profiles/
    workspace/
    node-editing/
    preview/
    search/
    capture/
    project-settings/
    dialogs/
    collaboration/
    panels/

  shared/
    CONTEXT.md
    ui/
    tree/
    image/
    styles/
    utils/

  platform/
    CONTEXT.md
    desktop/
      CONTEXT.md
```

This is intentionally feature-first. The existing `components/hooks/lib` split is not enough on its own because it hides domain boundaries.

### Boundary Intent

- `app/`
  - application-level orchestration only
  - no deep feature internals
- `features/`
  - feature-owned UI, logic, local state, and side effects
- `shared/`
  - reusable primitives and utilities with no feature-specific knowledge
- `platform/desktop/`
  - renderer-side desktop bridge and desktop-only integration helpers

## Target Electron Main Process Structure

The desktop main process should move toward this structure:

```text
apps/desktop/
  CONTEXT.md
  launcher.cjs
  preload.cjs
  main.js

  main/
    CONTEXT.md
    bootstrap.js
    windowing.js
    splash.js
    menu.js
    panelWindows.js
    workspacePersistence.js
    serverProfiles.js
    authState.js
    desktopProxy.js
    ipcHandlers.js
    clipboard.js
    icons.js
```

### Boundary Intent

- `main.js`
  - entrypoint and high-level composition only
- `main/windowing.js`
  - BrowserWindow construction and lifecycle
- `main/menu.js`
  - native app menu definition and menu command dispatch
- `main/panelWindows.js`
  - popped-out panel window management
- `main/workspacePersistence.js`
  - persisted desktop workspace state
- `main/serverProfiles.js`
  - profile storage and profile/account operations
- `main/desktopProxy.js`
  - local proxy behavior and API bridging
- `main/ipcHandlers.js`
  - IPC registration only

## Styling Plan

`apps/renderer/src/App.css` should stop acting as the stylesheet for the entire app.

The style system should move toward:

```text
shared/styles/
  CONTEXT.md
  tokens.css
  base.css
  app-shell.css
  dialogs.css
  workspace.css
  preview.css
  search.css
  panels.css
  forms.css
  desktop.css
```

### Styling Rules

- `tokens.css` owns theme variables and global tone definitions.
- `base.css` owns global resets and shared element behavior.
- feature styles belong in the nearest meaningful stylesheet, not in one monolithic file.
- new styling should not go back into a giant global stylesheet unless the style is truly global.

## CONTEXT.md Strategy

`CONTEXT.md` files should be layered and become more specific as the directory gets narrower.

### What a root-level `CONTEXT.md` should contain

- overall architecture
- repo purpose
- major boundaries
- global design rules
- refactor/maintenance workflow

### What a deeper `CONTEXT.md` should contain

- the responsibility of that folder
- what belongs there
- what does not belong there
- dependencies in/out
- key invariants
- common change paths
- notes for future editors/agents

### What `CONTEXT.md` files should not become

- changelogs
- giant essays
- repeated file inventories
- stale implementation summaries

Each `CONTEXT.md` should stay directional and scoped to its folder.

## Planned Phases

This refactor should happen in controlled phases.

### Phase 1: Establish Boundaries

- create the new directories
- extract obvious utilities and helper modules
- split dialog groups
- split style domains
- split desktop main-process responsibilities

### Phase 2: Stabilize Orchestration

- reduce the size of `App.jsx`
- move command logic into owned modules
- move project UI storage helpers out of the top-level app file
- keep `App.jsx` focused on app composition

### Phase 3: Document the New Shape

- add root and subsystem `CONTEXT.md` files
- describe boundaries, dependencies, invariants, and change paths
- ensure the documentation reflects the actual structure, not the intended one from before the split

### Phase 4: Enforce the Workflow

- use the new structure as the standard path for future changes
- update relevant `CONTEXT.md` files when boundaries or responsibilities materially change
- split files again when they accumulate too many unrelated concerns

## Maintenance Workflow

Future editors and agents should follow this workflow:

1. Read the nearest relevant `CONTEXT.md` files before changing code in a subsystem.
2. Prefer the most local folder that clearly owns the change.
3. If a change crosses boundaries, update the owning boundary docs.
4. If a file becomes too large because it owns multiple concerns, stop and split it before continuing to pile changes into it.
5. If a new domain appears repeatedly, create a new directory for it instead of burying it in a generic bucket.
6. When a refactor materially changes structure or ownership, update the affected `CONTEXT.md` files in the same change.

## Explicit Rule For Future Growth

The codebase should not be allowed to drift back into oversized, ambiguous files.

If a change is significant enough to affect:

- folder purpose
- module ownership
- change paths
- important invariants
- platform-specific behavior

then the relevant `CONTEXT.md` files must be updated as part of that work.

If an area starts becoming hard to reason about because one file is absorbing too many responsibilities, that is a signal to re-architect the boundary:

- create a new subdirectory if needed
- move cohesive logic into smaller modules
- add or update `CONTEXT.md`

## Immediate Focus

The first concrete extraction targets are:

- `apps/renderer/src/App.jsx`
- `apps/renderer/src/components/AppDialogs.jsx`
- `apps/renderer/src/App.css`
- `apps/desktop/main.js`

The refactor should prioritize high-payoff, low-risk splits first:

- reusable storage/state helpers
- grouped dialog modules
- grouped style modules
- desktop main-process helper modules

The deeper `App.jsx` orchestration split should happen after those seams are established.
