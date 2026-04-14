# Context

## Purpose
`features/` holds domain-owned modules. A feature folder should own its UI, local helpers, and nearby logic whenever possible.

## Current Feature Areas
- `dialogs/`
- `collaboration/`
- `node-editing/`

Additional feature folders should be created as refactoring continues.

## Invariants
- Feature modules should prefer local ownership over pushing logic back to the app shell.
- Shared utilities only belong in `shared/` if they are truly reusable across feature boundaries.
