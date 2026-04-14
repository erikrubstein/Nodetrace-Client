# Context

## Purpose
`shared/` holds reusable renderer primitives and assets that are not owned by a single feature.

## Contains
- shared styles
- future generic utilities or renderer primitives

## Does Not Contain
- feature-specific state or business rules

## Invariants
- If a module is only used by one feature and is semantically owned by that feature, move it out of `shared/`.
