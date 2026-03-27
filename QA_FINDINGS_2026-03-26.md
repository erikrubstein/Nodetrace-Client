# QA Findings - 2026-03-26

This document captures a broad QA pass across the current Nodetrace workspace.

Scope of review:
- static review of the active app structure under `apps/server`, `apps/renderer`, `apps/desktop`, and `packages/shared`
- spot checks of key UI surfaces and workflow code
- repo/documentation/script review
- validation commands:
  - `npm run lint`
  - `npm run build`

This is not a full manual exploratory test run. Findings below are based on code review plus current project structure and behavior assumptions.

## Summary

Overall state:
- The project is usable and actively evolving.
- The current codebase has a clear product direction and many thoughtful workflow improvements.
- The main quality risks are now around model-transition drift, UI consistency, and lack of automated regression coverage.

Highest-value next moves:
1. Finish the remaining terminology/model cleanup around `folder/variant/photo` across code, docs, and exports/imports.
2. Stabilize desktop panel windows so every popped-out panel behaves like its docked version.
3. Add at least a thin automated regression suite around the highest-risk workflows.

## Highest-Risk Findings

### 1. The data model transition is incomplete and still leaks legacy assumptions in many places

Severity: High

Evidence:
- `apps/server/index.js`
- `apps/server/db/bootstrap.js`
- `apps/server/routes/nodeRoutes.js`
- `apps/server/routes/projectFileRoutes.js`
- `apps/renderer/src/App.css`
- `README.md`
- `architecture.md`

Observed issues:
- The app has moved toward "node with attached media", but the codebase still retains a lot of `variant_of_id`, `type`, `folder`, and `variant` logic.
- There are still active server routes like `POST /api/nodes/:id/promote-variant`.
- The database schema still treats nodes as `folder` or `photo`.
- Export/import logic still models folders, photos, and variants explicitly.
- Renderer styling and behavior still depend on `folder-node`, `photo-node`, and `variant-node`.
- The public docs still describe the old mental model as if it were current truth.

Why this matters:
- This is the single biggest future-regression source.
- It makes the product harder to reason about for users and contributors.
- It raises the chance that one workflow follows the new node-media model while another silently follows the old variant model.

Recommendation:
- Maintain a written cleanup checklist and burn it down intentionally.
- Separate "temporary compatibility layer" code from "long-term domain code" even more aggressively.
- Prioritize removing live user-facing variant conversion flows and dead-end legacy pathways before adding more new features on top.

### 2. Documentation is materially stale relative to the current app

Severity: High

Evidence:
- `README.md`
- `architecture.md`

Examples:
- `README.md` still describes folders, variants, and variant workflows as if they are the current primary model.
- `architecture.md` still documents the old node taxonomy (`folder`, `photo`, `variant`) as the intended domain model.
- Current workflows such as photo-attached nodes, photo extraction, and media operations are not represented accurately.

Why this matters:
- New contributors will make the wrong assumptions.
- It increases the odds of reintroducing old workflows or bugs.
- It makes QA harder because the docs no longer match expected behavior.

Recommendation:
- Update `README.md` and `architecture.md` as a first-class follow-up task, not as optional cleanup.
- Treat docs updates as part of the node-media migration completion criteria.

### 3. There is effectively no meaningful automated regression coverage

Severity: High

Evidence:
- `package.json` includes `playwright` but the repo does not contain a real automated test suite.
- No actual test/spec files were found in the current workspace beyond false-positive filename matches.

Why this matters:
- This project is now rich in stateful UI workflows, panel modes, desktop shell behavior, and migration-sensitive backend logic.
- Many recent fixes have been in the category of "specific workflow broke under a particular state combination".

High-value test targets:
- create node / create photo node / add photo
- delete project and delete node
- apply template / clear template / bulk template operations
- search panel filtering and pinned selection scope
- preview media operations
- mobile capture route
- desktop popout panel selection sync

Recommendation:
- Start small.
- Even 5-10 Playwright smoke tests would significantly reduce regression risk.

## Functional / Product Findings

### 4. Desktop popped-out panels still likely need another consistency pass

Severity: Medium

Evidence:
- `apps/renderer/src/App.jsx`
- `apps/renderer/src/App.css`
- `apps/desktop/main.js`

What looks improved:
- Popped-out panels now share more shell behavior with docked sidebars.
- Window controls and scroll/body behavior have been converging.

What still looks risky:
- Popped-out panels still render through a distinct `isPanelWindow` path.
- Some panel content assumes a docked-sidebar environment and may still behave differently when isolated in a separate window.
- Any panel with complex keyboard handling, focus handling, or viewport-dependent content is still a likely source of subtle desktop-only issues.

Recommendation:
- Do a focused panel-window QA matrix:
  - Search
  - Preview
  - Inspector
  - Data
  - Templates
  - Camera
- Verify:
  - layout parity
  - keyboard shortcuts
  - scroll behavior
  - focus behavior
  - selection sync
  - resizing behavior

### 5. Search panel has become powerful, but the mental model is getting dense

Severity: Medium

Evidence:
- `apps/renderer/src/components/SearchPanel.jsx`

Observations:
- Search now supports many filters and a pinned scope feature.
- Session persistence is good.
- The filter UI is increasingly dense for a compact panel.

UX opportunities:
- Add a small summary strip for active filters, especially the pinned scope.
- Add a visible "Clear Scope" or "Recapture Scope" action rather than overloading one toggle.
- Consider showing the names/count of pinned seed nodes in a subtle secondary line.
- Consider grouping filters visually into:
  - content
  - ownership
  - structure/media
  - scope

### 6. The Templates panel likely needs stronger affordances around imported/copied templates

Severity: Medium

Evidence:
- `apps/renderer/src/components/TemplatesPanel.jsx`
- `apps/renderer/src/components/AppDialogs.jsx`
- `apps/renderer/src/App.jsx`

Observations:
- Importing a template from another project is now supported via UI.
- This is good, but users may not realize whether the import:
  - creates a linked template
  - copies a snapshot
  - overwrites an existing template

Recommendation:
- Clarify in the import dialog that this creates a copied local template in the current project.
- Consider suffixing imported names on conflict, or warning if the exact name already exists.

### 7. The camera workflow still has naming and mode complexity

Severity: Medium

Evidence:
- `apps/renderer/src/components/CameraPanel.jsx`
- `apps/renderer/src/hooks/useWorkspaceInteractions.js`
- `apps/server/mobileCapturePage.js`
- `apps/server/routes/projectFileRoutes.js`

Observations:
- The camera panel now has separate actions for creating a photo node versus adding a photo.
- That is directionally better.
- Under the hood, some of the API semantics still use the old `variant` flag for "add photo to node".

Why this matters:
- The UI language and the API language are now diverging.
- That makes future maintenance error-prone.

Recommendation:
- Rename the server/client mode flags to match the current product language.
- Example:
  - `child` -> `photo_node`
  - `variant` -> `additional_photo`

### 8. Bulk workflows are improving, but a few confirmation patterns still feel fragmented

Severity: Medium

Evidence:
- `apps/renderer/src/components/AppDialogs.jsx`
- `apps/renderer/src/components/FieldsPanel.jsx`
- `apps/renderer/src/App.jsx`

Observations:
- Native browser confirms were removed, which is good.
- Dialog usage is more consistent now.
- But "confirmation before choosing" vs "confirmation after choosing" still varies by workflow.

Recommendation:
- Standardize confirmation behavior:
  - selection first
  - then explicit confirm dialog
- Do this consistently for:
  - template apply
  - template clear
  - destructive merge-to-photo
  - delete workflows

## UI / UX Improvements

### 9. A lightweight shared UI layer would reduce drift

Severity: Medium

Evidence:
- Panel internals are mostly custom compositions.
- Dialogs are centralized, but panel sections and toolbars are mostly CSS conventions instead of reusable building blocks.

Recommendation:
- Extract a small shared UI layer:
  - `ConfirmDialog`
  - `PanelSection`
  - `PanelToolbar`
  - `MetaRow`
  - `ToolActionButton`

This would reduce repeated ad hoc layout bugs and make the desktop/docked panel parity easier to maintain.

### 10. Inspector footer metadata is helpful, but could go further

Severity: Low

Evidence:
- `apps/renderer/src/components/InspectorPanel.jsx`

Opportunities:
- Add relative date hover/secondary display for `Date Added`.
- Show last modified time if useful for review workflows.
- Consider making `Node ID` copyable with a tool button.

### 11. Search results could benefit from richer secondary metadata

Severity: Low

Evidence:
- `apps/renderer/src/components/SearchPanel.jsx`

Suggestions:
- Show tags as chips when present.
- Show photo count in results.
- Show pinned scope indicator outside the popover so users do not forget the search is scoped.

### 12. Templates panel toolbar iconography is functional but not yet self-explanatory

Severity: Low

Evidence:
- `apps/renderer/src/components/TemplatesPanel.jsx`

Suggestions:
- Add tooltips for import and create if not already surfaced consistently in the app shell.
- Consider a slightly more explicit import icon treatment if users do not discover it naturally.

### 13. Search sort behavior and canvas child sort behavior should eventually be exposed consistently

Severity: Low

Evidence:
- `apps/renderer/src/components/SearchPanel.jsx`
- `apps/renderer/src/lib/tree.js`

Observation:
- Search sort is explicit.
- Canvas child order is now opinionated but not directly user-configurable.

Suggestion:
- If users care about ordering, consider one future project-level display setting for canvas child order:
  - no-photo first / photo first
  - name
  - date added

## Code / Architecture Findings

### 14. There is still a lot of migration-era coupling inside `apps/server/index.js`

Severity: Medium

Evidence:
- `apps/server/index.js`

Observation:
- The repo split into apps/packages was a good move, but `apps/server/index.js` is still a very dense center of gravity:
  - persistence
  - serialization
  - migration compatibility
  - media helpers
  - tree building
  - destructive transactions

Recommendation:
- Continue the decomposition already started.
- The best next extraction targets are:
  - `nodeMediaService`
  - `treeSerialization`
  - `importExportService`
  - `nodeLifecycleService`

### 15. Root-level legacy directories create avoidable confusion

Severity: Medium

Evidence:
- The repo still contains a root `server/` directory alongside `apps/server`.

Why this matters:
- It creates ambiguity about which path is authoritative.
- It increases the chance of someone editing or reading the wrong entrypoint.

Recommendation:
- Remove or archive obsolete top-level app directories once the split is fully stabilized.
- If they must remain temporarily, add a README marker that they are legacy/non-authoritative.

### 16. Export/import and archive flows are still deeply tied to the old node taxonomy

Severity: Medium

Evidence:
- `apps/server/index.js`
- `apps/server/routes/projectFileRoutes.js`

Observation:
- Export/import still models folders/photos/variants structurally.
- This may be correct for backward compatibility, but it should be treated as migration debt, not target architecture.

Recommendation:
- Decide explicitly whether archive format v2 should exist.
- If yes, define it around:
  - nodes
  - attached media
  - primary media
  - per-node metadata

### 17. Renderer tree assembly is now more explicit, which is good, but ordering logic is purely client-side

Severity: Low

Evidence:
- `apps/renderer/src/lib/tree.js`

Observation:
- Child ordering is now handled in the client.
- That is fine, but it means:
  - server responses are not authoritative about order
  - different clients could theoretically diverge if sorting logic changes

Recommendation:
- This is acceptable for now, but if manual ordering is ever introduced, it needs to become durable server state.

## Repo Hygiene Findings

### 18. README and architecture are now the biggest contributor to contributor confusion

Severity: High

This is worth repeating because it affects every future change.

If only one hygiene fix happens soon, it should be this one:
- rewrite the docs to match the current product truth
- document the remaining compatibility layer explicitly
- note which flows are legacy and scheduled for removal

### 19. Playwright is installed but unused

Severity: Low

Evidence:
- `package.json`

Recommendation:
- Either add a minimal Playwright suite or remove the dependency until ready.
- Right now it signals test coverage that the repo does not actually provide.

### 20. The codebase would benefit from a standing QA checklist

Severity: Low

Recommendation:
- Add a short checklist for release-quality verification:
  - web dev
  - desktop dev
  - project create/delete
  - node create/delete
  - template apply/clear
  - preview media ops
  - search filters
  - mobile capture
  - desktop panel popouts

## Suggested Priority Order

### Priority 1
- update README and architecture docs to current model
- define and track removal of remaining variant/folder compatibility logic
- add a small automated smoke suite

### Priority 2
- finish desktop popout parity
- standardize dialog/confirmation flows
- clean API naming around `variant` vs `additional photo`

### Priority 3
- extract small shared renderer UI primitives
- improve search/scope discoverability
- improve template import/duplication clarity

## Final Assessment

Nodetrace is past the "toy app" stage. It now behaves like a real specialized desktop/web hybrid product with a custom workflow model, and the biggest risks are the ones typical of that stage:
- migration drift
- product-language inconsistency
- subtle state regressions
- lack of automated safety nets

The core product direction is strong. The best quality improvement from here is not just more features, but tightening consistency around the current model and locking down regression-prone workflows.
