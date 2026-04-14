# Context

## Purpose
This folder contains the renderer application used by both the web client and the Electron desktop client.

## Main Boundaries
- `app/`: top-level composition and renderer-wide state helpers
- `features/`: feature-owned modules
- `shared/`: reusable renderer primitives
- `platform/`: platform-specific renderer integration

## Does Not Contain
- Electron main-process code
- server-side behavior

## Common Change Paths
- Cross-feature orchestration: start in `app/`
- Feature behavior or UI: start in `features/`
- Generic reusable helpers or styles: start in `shared/`

## Notes For Agents
- Avoid adding new renderer-wide logic directly to `App.jsx` unless it truly belongs at the app shell level.
- If a feature starts owning multiple files, create or reuse a feature directory rather than putting them back under generic buckets.
