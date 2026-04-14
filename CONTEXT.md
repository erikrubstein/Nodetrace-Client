# Context

## Purpose
This repo contains the Nodetrace client applications:

- the shared renderer used by web and desktop
- the Electron desktop shell
- the small shared package for cross-workspace values

## Current Direction
The codebase is being refactored away from a few oversized orchestration files into domain-oriented modules with explicit folder boundaries.

The immediate hotspots are:

- `apps/renderer/src/App.jsx`
- `apps/renderer/src/App.css`
- `apps/renderer/src/components/AppDialogs.jsx`
- `apps/desktop/main.js`

## Boundary Rules
- `apps/renderer/src/app/` owns renderer-wide orchestration and cross-feature composition.
- `apps/renderer/src/features/` owns feature-specific UI, logic, and local helpers.
- `apps/renderer/src/shared/` owns primitives and reusable utilities that are not feature-specific.
- `apps/renderer/src/platform/` is for renderer-side platform integration.
- `apps/desktop/main/` owns Electron main-process helpers. `apps/desktop/main.js` should become composition-only.

## Invariants
- New feature logic should not be dumped back into a giant top-level file if a clearer feature boundary exists.
- Shared modules must stay generic. If a helper knows too much about a specific feature, move it closer to that feature.
- `CONTEXT.md` files describe real boundaries, not aspirational ones.

## Workflow For Future Editors
1. Read the nearest relevant `CONTEXT.md` files before making changes.
2. Place changes in the narrowest folder that clearly owns them.
3. If a significant change affects ownership, invariants, or change paths, update the relevant `CONTEXT.md` files in the same change.
4. If a file grows large because it holds multiple concerns, stop and split it into a new module boundary or subdirectory before continuing to add more behavior.

## Notes For Agents
- Prefer domain-first placement over `components/hooks/lib` dumping.
- If a refactor creates a new stable subsystem, add a `CONTEXT.md` at that boundary.
- If a change cannot be placed cleanly, that is a signal the architecture needs another boundary, not a signal to ignore the structure.
