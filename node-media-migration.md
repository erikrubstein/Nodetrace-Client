# Node Media Migration

This document records the completed migration that moved Nodetrace from:

- legacy model: `folder` / `photo` nodes plus `variant` nodes

to:

- current target model: one logical node with zero or more attached photos in `node_media`

The temporary compatibility layer has now been removed. The server runs on a node-plus-`node_media` model only, and the destructive cleanup has already removed the old legacy data from the live database.

## Current State

- Server schema and runtime use `node_media` as the only photo storage model.
- Legacy variant rows have been deleted from the live database.
- Legacy node image columns have been cleared and are no longer used as runtime source-of-truth fields.
- Tree payloads are node-only, with attached `media[]`.
- Photo actions target the selected node as attached media.
- Preview works against individual `media[]` entries.

## Removed Compatibility Layer

These legacy compatibility paths have been removed from the live runtime:

- [`db/bootstrap.js`](C:/SolaSec/Tools/Nodetrace/Nodetrace-Server/db/bootstrap.js)
  - destructive cleanup now folds any remaining legacy node image data into `node_media`
  - legacy variant rows are deleted during initialization

- [`index.js`](C:/SolaSec/Tools/Nodetrace/Nodetrace-Server/index.js)
  - no dual-write behavior remains between `nodes` image columns and `node_media`
  - tree serialization, import/export, and media operations are node-plus-media only

- [`routes/nodeRoutes.js`](C:/SolaSec/Tools/Nodetrace/Nodetrace-Server/routes/nodeRoutes.js)
  - move and media routes no longer understand legacy variant rows

- [`routes/projectFileRoutes.js`](C:/SolaSec/Tools/Nodetrace/Nodetrace-Server/routes/projectFileRoutes.js)
  - photo-node creation writes node plus `node_media` directly
  - archive/subtree restore no longer recreates hidden variant rows

## Cleanup Result

The following are now true:

1. New photo uploads create `node_media` rows directly.
2. Import/export serializes attached `media[]` only.
3. No renderer workflow depends on `variant_of_id`, `isVariant`, or `variants`.
4. Media primary-selection logic no longer relies on legacy node image columns.
5. Existing live data has been destructively migrated after a manual backup.

## Completed Checklist

- [x] Rename visible workflows to `photo_node` / `additional_photo`.
- [x] Remove live renderer dependencies on `isVariant` and `variant_of_id`.
- [x] Rework upload and mobile-capture flows so attached-photo creation is direct `node_media`.
- [x] Update import/export formats to serialize `media[]` per node.
- [x] Remove legacy variant move/promote behavior from the live API.
- [x] Remove legacy node image columns as source-of-truth fields.
- [x] Delete compatibility filtering in the renderer.
- [x] Rewrite public docs and architecture notes for the current model.

## Final Cleanup Targets

These were the main legacy targets of the migration:

- `nodes.variant_of_id`
- `nodes.type` photo/folder branching
- `nodes.image_path`
- `nodes.preview_path`
- `nodes.original_filename`
- `nodes.image_edits_json` as the source of truth for photos
- legacy variant routes and variant move/promote logic
- renderer filtering that hides legacy variant rows
