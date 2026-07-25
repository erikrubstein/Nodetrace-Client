# Context

## Purpose
This folder owns editing behavior centered on a selected node or template editing state.

## Contains
- template form state normalization
- the shared node context menu used by tree and plan workspaces
- future inspector and node-editing helpers

## Invariants
- Helpers here should reflect editor semantics, not generic UI helpers.
- Workspace-specific behavior, such as independent expand/collapse state, must be supplied by the calling workspace.
