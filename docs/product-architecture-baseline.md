# Product and Architecture Baseline

Status: baseline for current work. This document defines how gfbook is shaped and how new work is placed. It is not a roadmap and not a feature list.

## 1. Positioning

gfbook is an IDE for writers.

A writer's project is a book. The unit of editing is a chapter. The workspace is the library. Version control, activity, and status are first-class product surfaces, not developer extras. The product should feel like a focused editor with project tooling, not like a note app with Git attached.

## 2. Concept mapping

| IDE concept | gfbook concept | Notes |
| --- | --- | --- |
| Project | Book | Lives in its own directory, has its own repository and settings |
| File | Chapter | Markdown file under `chapters/`, addressed by a stable id |
| Workspace | Library (`~/gfbooks`) | Collection of books; global settings live here |
| Source Control view | Version tab in book settings | Branch, remote, ahead/behind, changes, commits, identity |
| Output panel | Activity tab in book settings | Commits plus application events, filterable |
| Status bar | Sidebar footer summary | Branch, sync state, uncommitted count, click opens Version |
| Dirty marker | Editor save status | saved / saving / dirty / error |
| Project-level config overriding user config | Per-book commit identity | Book `user.name` / `user.email` override global Git identity |

The mapping is intentional. When a feature has a clear IDE analogue, follow that analogue's placement and behavior. Do not invent a new surface for something that belongs in an existing IDE pane.

## 3. Surfaces and ownership

### Global (workspace level)

- Bookshelf: list of books, create/import, library location, global settings entry.
- Global settings: language, theme, proxy, default Git identity, software update.
- Cross-book dialogs: search across books, export site, Markdown import.

Global information answers "which books do I have and how does the app behave". It must not show per-book Git state except as an aggregate that is clearly labeled as such.

### Per-book

- Editor and chapter tree / diary timeline: the primary working surface.
- Book settings dialog:
  - Info: title, path, rename, delete.
  - Version: sync summary, recent commits, commit identity, changes, commit, remote, fetch/pull/push/merge, conflicts.
  - Activity: per-book commits and events with category filtering.
- Sidebar footer: one-line repository summary derived from the same state as Version.
- Search within the current book: dialog, not a page.

Per-book information answers "what is the state of this book". It must not duplicate global settings; a book-level value exists only when it overrides a global default, and the UI must say which source is active.

### When a new page is allowed

Create a new page only when all of the following are true:

1. The information needs persistent navigation or a stable URL-like context that a dialog or tab cannot provide.
2. It cannot be expressed as a panel, tab, dialog, or inline state in an existing surface.
3. It is not a single action or a short-lived result.
4. Keeping it out would force unrelated concerns into an existing page.

Otherwise prefer, in order: inline state → dialog → existing tab/panel → new page. "It would be nice to have its own page" is not sufficient.

## 4. Placement rules for new features

Each new feature must answer these questions before implementation:

1. Which surface owns it? Global or per-book.
2. What is the single source of state it reads?
3. What is the failure path and where is it shown?
4. Does it write to disk or Git? If yes, it goes through the backend write lock.
5. Does it need i18n in both Chinese and English?
6. What test or verification proves it works?

Rules:

- State comes from the backend through one command or one hook. Do not derive the same state twice in two components.
- If a feature changes repository state, refresh via the shared repository-state hook after completion. Do not patch local copies by hand.
- Action feedback is local to the action: disable the trigger while running, show a spinner or progress label, show success or failure in place, and surface errors through the shared error channel.
- Do not add a second "status" field that mirrors an existing one. Extend the existing model instead.
- Do not add a feature flag or compatibility shim for an unreleased internal surface. Change the surface.

## 5. Definition of done

A feature is done when all of the following hold:

- **State**: it reads from a single documented source (a Tauri command exposed through a hook, or local component state for purely ephemeral UI).
- **Failure**: every failure path is visible to the user. Invoke errors pass through the shared error formatter; no `console.error`-only handling for user actions.
- **Writes**: book and Git writes are serialized through the backend write lock. The UI does not fire concurrent writes for the same book.
- **Recovery**: destructive or fallible operations have a retry or reload path. Parsing failures must not write an empty document back to disk.
- **i18n**: all user-facing strings exist in both `zh` and `en`.
- **Tests**: new backend primitives or commands have at least one behavior test; frontend changes pass `tsc`/build and lint. If a behavior cannot be tested automatically, the pull request states the manual path.
- **No regressions**: the status bar, Version tab, and editor status still agree after the change.

## 6. Quality principles

1. **Single source of truth.** Repository state comes from one command and one hook. The sidebar, Version tab, and any future surface read the same object.
2. **Errors must be visible.** A failed save, commit, fetch, push, merge, or repository read is shown in the UI. Silent failure is a defect, not a fallback.
3. **Writes are serialized.** All chapter, metadata, asset, and Git writes for a book go through the per-book write lock. UI-level debounce and save state do not replace backend serialization.
4. **Identity is layered.** Global Git identity is the default. A book identity overrides it and must be labeled as such. Clearing the book override returns to the global value; never leave half an identity.
5. **No silent fallbacks.** If content cannot be parsed, block editing and saving and say why. Do not replace user content with an empty document. If a repository is missing, say so and offer to create it.
6. **Actions report their lifecycle.** Start, running, success, and failure are distinguishable. Long-running Git operations must not look frozen.
7. **Placement follows the IDE model.** New information goes to the pane that already owns that kind of information; new pages are the exception.

## 7. Current gaps and order of work

The current build already has the shared repository state, Version and Activity tabs, per-book identity, editor save states, and serialized backend writes. The following gaps are ordered by dependency and user impact.

1. **Change diff.** The Version tab lists changed files but cannot show what changed. Add a read-only diff view per file, using the existing repository state as the entry point. This is the largest missing part of the Source Control analogue.
2. **Problems panel.** There is no place for content-level diagnostics (broken links, missing assets, parse failures). Add a per-book Problems surface, likely a tab or collapsible panel, fed by one diagnostics command. Do not scatter warnings across the editor.
3. **Bookshelf-level status.** The library shows no repository health. Add a compact per-book status (clean, dirty, conflicted, no repository) sourced from the same repository-state model, without duplicating per-book detail.
4. **History and rollback.** After diff exists, add commit detail and a safe restore path. Rollback must be explicit about what is restored and must not destroy uncommitted work silently.
5. **Editor experience.** Improve long-form writing flow: save-state clarity, reliable chapter switching, and recovery from parse or asset failures. This comes after the state and diagnostics foundations are trustworthy.

Do not start items 2–5 by inventing parallel state. Each item must extend the existing repository, diagnostics, or save-state models.
