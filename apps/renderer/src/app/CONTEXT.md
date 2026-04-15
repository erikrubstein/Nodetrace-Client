# Context

## Purpose
`app/` owns renderer-wide orchestration, storage helpers, and composition logic that spans multiple features.

## Contains
- project UI storage helpers
- client-global panel layout storage helpers
- runtime gating helpers
- app-shell and mutation command modules
- future app-shell composition modules

## Does Not Contain
- feature-specific panel logic
- feature-local state that only one subsystem uses

## Invariants
- Keep modules here focused on composition or cross-feature concerns.
- If logic is only used by one feature, move it into that feature instead of leaving it here.
- Project UI persistence and client-global panel layout persistence are separate concerns and should not be collapsed back into one snapshot.
