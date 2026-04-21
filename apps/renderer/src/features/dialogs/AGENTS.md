# Context

## Purpose
This folder owns renderer dialog groupings and dialog-specific UI composition.

## Contains
- app-level utility dialogs
- account dialogs
- project dialogs
- template and node dialogs

## Does Not Contain
- the mutations those dialogs trigger
- unrelated panel rendering

## Invariants
- Keep dialog bodies grouped by concern.
- `components/AppDialogs.jsx` should remain a thin coordinator, not a monolithic dialog dump again.
