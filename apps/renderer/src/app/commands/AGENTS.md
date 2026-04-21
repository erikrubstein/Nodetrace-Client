# Context

## Purpose
`commands/` holds renderer-side command modules that orchestrate multi-step actions. These modules sit between feature UI and low-level helpers.

## Contains
- app shell and desktop profile commands
- tree/media mutation commands
- future command groups extracted from `App.jsx`

## Does Not Contain
- presentational components
- feature-local form state
- low-level pure utilities

## Invariants
- Commands may depend on multiple features, but should stay cohesive around a single workflow domain.
- Prefer returning a narrow command surface from a custom hook rather than exporting one giant utility bag.
- If a command module becomes hard to scan, split it again by workflow.
