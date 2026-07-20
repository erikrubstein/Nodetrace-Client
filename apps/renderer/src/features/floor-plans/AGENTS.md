# Context

## Purpose
This feature owns the spatial floor-plan workspace, its API helpers, local layout helpers, and feature-specific styling.

## Invariants
- The hierarchy remains canonical; floor-plan placements only reference existing nodes.
- Shared plan assets and marker coordinates are server-backed project data.
- Floor-plan appearance is non-destructive metadata; never rewrite the original upload to apply a theme treatment.
- Active plan, view mode, viewport transforms, and expansion state are per-user UI concerns.
- The feature is opt-in through Project Settings. Disabling it hides its workspace tools and panels without deleting data.
- Locations and plan appearance belong in the standard panel system; only canvas-native tool buttons should float over the workspace.
- Floor-plan interactions must not change a node's parent or reuse tree drag semantics.
