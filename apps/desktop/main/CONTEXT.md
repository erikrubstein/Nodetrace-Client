# Context

## Purpose
This folder holds Electron main-process helper modules extracted from the main desktop entrypoint.

## Current Modules
- `icons.js`: icon asset resolution
- `ipcHandlers.js`: Electron IPC registration and desktop bridge wiring
- `menu.js`: native application menu construction
- `splash.js`: splash-window construction
- `workspacePersistence.js`: desktop workspace snapshot persistence helpers
- `windowing.js`: shared BrowserWindow option and lifecycle helpers

## Direction
Additional helpers should move here as the desktop shell is decomposed:

- panel window management
- proxy handling
- server profile/auth logic

## Invariants
- These modules should stay focused and composable.
- They should not become new god-files; split again when a helper starts owning multiple unrelated responsibilities.
