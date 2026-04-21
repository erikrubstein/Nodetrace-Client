# Context

## Purpose
This folder contains the Electron desktop shell.

## Main Boundaries
- `main.js`: desktop entrypoint and composition
- `preload.cjs`: renderer bridge
- `main/`: extracted main-process helpers

## Invariants
- New Electron main-process helpers should go into `main/` when they represent a stable concern.
- `main.js` should trend toward bootstrap/composition rather than accumulating every desktop concern directly.
