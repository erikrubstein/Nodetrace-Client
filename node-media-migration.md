# Node Media Migration

This document tracks the temporary compatibility layer used to move Nodetrace from:

- legacy model: `folder` / `photo` nodes plus `variant` nodes

to:

- current target model: one logical node with zero or more attached photos in `node_media`

The app now behaves primarily through the node-media model, but legacy variant rows are still retained underneath so existing data is not lost during the transition.

## Current State

- Server schema includes `node_media`.
- Existing node image fields and variant nodes are mirrored into `node_media`.
- Renderer normalizes server trees and hides legacy variant rows from the visible app model.
- Photo actions now target the selected node as attached media.
- Preview works against individual `media[]` entries.

## Temporary Compatibility Layer

These areas still exist only to preserve legacy data during migration:

- [`apps/server/db/bootstrap.js`](C:/SolaSec/Tools/Nodetrace/apps/server/db/bootstrap.js)
  - `ensureNodeMediaSchema(...)`
  - one-time backfill from legacy node image fields and variant rows into `node_media`

- [`apps/server/index.js`](C:/SolaSec/Tools/Nodetrace/apps/server/index.js)
  - `syncLegacyNodeMedia(...)`
  - `resequenceNodeMedia(...)`
  - `assertNodeMedia(...)`
  - dual-write behavior between `nodes` image columns and `node_media`
  - delete/move/promote compatibility that still understands legacy variant rows

- [`apps/server/routes/nodeRoutes.js`](C:/SolaSec/Tools/Nodetrace/apps/server/routes/nodeRoutes.js)
  - some legacy move/storage compatibility still remains for old hidden variant rows

- [`apps/server/routes/projectFileRoutes.js`](C:/SolaSec/Tools/Nodetrace/apps/server/routes/projectFileRoutes.js)
  - photo-node creation still uses legacy node records plus dual-write compatibility
  - additional-photo upload is direct `node_media`, but archive/subtree restore may still recreate hidden variant rows when preserving old per-photo metadata

- [`apps/renderer/src/lib/tree.js`](C:/SolaSec/Tools/Nodetrace/apps/renderer/src/lib/tree.js)
  - `normalizeServerTree(...)` filters legacy variant rows out of the visible tree

## Cleanup Criteria

The compatibility layer can be removed only after all of the following are true:

1. New photo uploads create `node_media` rows directly without creating legacy variant nodes.
2. Import/export no longer serializes or restores legacy variant rows as first-class nodes.
3. No renderer workflow depends on `variant_of_id`, `isVariant`, or `variants`.
4. Media primary-selection logic no longer relies on legacy node image columns.
5. Existing projects have been migrated or archived so variant-node-only metadata is no longer needed for rollback.

## Active Cleanup Checklist

- [~] Rename remaining API/workflow semantics that still say `variant` when they now mean `additional photo`.
  - Renderer uploads, camera capture, mobile capture, and move payloads now speak in `photo_node` / `additional_photo`.
  - Legacy route names and storage fields still remain underneath for rollback compatibility.
- [~] Remove live renderer dependencies on `isVariant` and `variant_of_id` outside migration-only compatibility paths.
  - Visible canvas and selection flows no longer branch on `isVariant`.
  - Tree shaping and archive compatibility still retain legacy `variant_of_id` handling underneath.
- [~] Rework upload and mobile-capture flows so attached-photo creation no longer relies on legacy variant-node creation under the hood.
  - Additional-photo uploads in the app and mobile capture now create `node_media` rows directly.
  - Photo-node creation still uses the legacy node record shape and dual-write compatibility layer.
- [~] Update import/export formats to serialize node media as first-class attached photos instead of visible variant nodes.
  - Project archives and subtree snapshots now serialize `media[]` per node instead of top-level variant rows.
  - Import/restore still supports old archives and may recreate hidden compatibility rows when preserving legacy per-photo metadata.
- [~] Remove legacy variant move/promote endpoints once all visible workflows are migrated.
  - Dead `POST /api/nodes/:id/promote-variant` route removed from the live API.
  - Legacy move/storage compatibility still remains under `variant_of_id`.
- [ ] Remove legacy node image columns as source-of-truth fields once project migration is complete.
- [ ] Delete compatibility filtering in the renderer after legacy variant rows are no longer produced or needed.
- [ ] Rewrite public docs and architecture notes whenever a checklist item changes the visible model.

## Suggested Removal Order

1. API/workflow terminology cleanup
2. upload and capture flow cleanup
3. renderer dependency cleanup
4. import/export format cleanup
5. remove rollback-only hidden variant restoration
6. endpoint and schema cleanup

## Final Cleanup Targets

Once the criteria above are met, remove or rewrite:

- `nodes.variant_of_id`
- `nodes.type` photo/folder branching
- `nodes.image_path`
- `nodes.preview_path`
- `nodes.original_filename`
- `nodes.image_edits_json` as the source of truth for photos
- legacy variant routes and variant move/promote logic
- renderer filtering that hides legacy variant rows

## Important Risk

Legacy variant rows may still contain their own:

- notes
- tags
- review status
- identification/template data

That data is why the migration currently preserves those rows rather than deleting them immediately.
