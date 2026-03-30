# Nodetrace QA Checklist

Use this before calling a build or release candidate "good".

## Core Flows

- Start web dev: `npm run dev`
- Start desktop dev: `npm run dev:desktop`
- Build web renderer: `npm run build`
- Run lint: `npm run lint`
- Run e2e smoke: `npm run test:e2e`

## Product Checks

- Register a new user
- Create a new project
- Open an existing project
- Delete a project
- Add a node
- Add a photo node
- Add an additional photo to an existing node
- Delete a node
- Apply a template
- Clear a template
- Edit tags in Inspector and verify undo/redo
- Open Search, change filters, close it, and confirm session-persistent search state
- Use pinned Search scope and confirm it does not follow later selection changes
- Open Preview and:
  - switch between attached photos
  - make a photo primary
  - delete a photo
  - extract a photo into its own node
- Shift-drag a node onto another node and confirm the merge warning appears
- Open Camera and confirm:
  - connected cameras are detected
  - `Take Photo Node` works
  - `Add Photo` works
  - optional template selection works
- Open `/capture` from a phone and confirm:
  - manual connect only
  - `Take New Photo Node` works
  - `Take Additional Photo` works
  - both "choose existing" tool buttons work

## Desktop Checks

- Main Electron window opens from `npm run dev:desktop`
- Custom title bar controls work: minimize, maximize/restore, close
- Left and right sidebars dock correctly
- Pop out each major panel and confirm:
  - it opens in its own window
  - it docks back correctly
  - layout matches the docked shell
  - selection sync works
  - popped-out Search focuses the main canvas correctly
- Mobile capture works while desktop dev is running

## Data / Migration Checks

- Export a project archive
- Import that project archive into a new project
- Restore a project from an archive
- Delete a subtree, undo it, and confirm the restored subtree still has its photos
- Confirm old projects with additional photos still render correctly after upgrade
