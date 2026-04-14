# Context

## Purpose
This folder owns renderer-wide style foundations and any future split stylesheet domains.

## Current Scope
- `tokens.css`: theme variables and palette tokens
- `base.css`: global base behavior and foundational layout rules
- `auth.css`: auth, mobile-entry, capture, and desktop account-manager flows
- `app-shell.css`: topbar, window controls, sidebars, and shell layout
- `workspace.css`: canvas, graph nodes, captions, context menus, and inspector primitives
- `preview.css`: preview, camera, settings/template panel styling, and preview controls
- `forms.css`: shared form controls, buttons, menus, and tooltip primitives
- `dialogs.css`: dialog and project-picker layouts
- `search.css`: search panel and filter/result styling
- `responsive.css`: shared responsive overrides

## Direction
`App.css` is now only the ordered import entrypoint. New global or reusable styles should go into the appropriate domain file here instead of growing a new monolith.

## Invariants
- Theme variables belong in `tokens.css`.
- Base/global behavior belongs in `base.css`.
- Keep import order stable when moving styles between files so the cascade does not drift.
- If a stylesheet starts owning multiple unrelated domains, split it again and update this context file.
