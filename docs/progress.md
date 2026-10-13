# Syna progress — P3.0 baseline

Backup milestone: 2026-10-13. The current implementation stops at P3.0 Library Explorer, pending product review.

## Completed stages

| Stage | Implemented scope |
| --- | --- |
| P0 | Independent Electron / React / Vite / TypeScript workspaces; contracts, composition root, restricted preload and storage worker |
| P1a | Five global destinations, Activity Bar navigation, contextual sidebar, resizing, Focus, auxiliary panel, light/dark/system appearance and responsive Shell |
| P2 | Real Note creation, CodeMirror editing, SQLite autosave, serial save queue, expectedRevision / changeSeq / idempotency, recovery drafts and work-scene restoration |
| P2.1–P2.3 | Live / Reading / Source modes, truthful save feedback, ten Slash commands, selection toolbar, UUIDv7 block links and block actions |
| P2.4 | Shared percentage-based document viewport, Centered 80% / Full Width 100%, narrow-surface adaptation and actual block geometry |
| P3.0 | Real folders and placements, unified creation, contextual actions, rename / move / favorite, seven sort modes, persistent Manual order, native drag-and-drop, Trash and safe restore |

Only Library has a real end-to-end business implementation. Other primary destinations retain Shell / Demo / empty-state capabilities. Project links have the minimal persistence and deletion-safety boundary; a Project Pipeline UI is not implemented.

## Latest acceptance record

| Check | Passed |
| --- | ---: |
| Layout / DocumentSession / dependency boundaries | 22 core tests; TypeScript and ESLint pass |
| In-memory / SQLite contracts | 13 |
| Browser regression | 41; zero unexpected failures or flaky tests |
| Production Electron Library | 10 groups |
| Production Electron editor | 13 groups |
| Development Electron editor, including CSS HMR | 14 groups |
| SQLite integrity / foreign keys | `ok` / zero violations |
| Production build | Pass; existing renderer chunk-size notice |

Coverage includes four window sizes, both themes, Focus, sidebar / auxiliary combinations, composition input, save failures, revision conflicts, recovery, folder cycles, shared project links, failed reorder rollback, migration backup and full process restart. All automated databases use isolated temporary workspaces; the old application and real user data were not modified.

## Current boundaries

- Collections, Daily Notes, References, Assets, PDF, AI, Inbox capture, Plugin SDK and old-data import are not connected.
- There is no permanent-delete operation or OS-level `syna://` activation registration.
- Complex mathematics and TeX label/reference resolution are not implemented; source text is retained.
- Undo history does not survive reopening/restart. Browser Mock data lasts only for the current page session; Electron uses real SQLite.
- Library currently loads a complete metadata snapshot. System IME candidate-window interaction still needs manual acceptance.

## Backup contents and reproduction

Git tracks source, lockfile, architecture, tests and verification scripts. It excludes dependencies, build output, `.artifacts/`, test results, local environment files and databases. Screenshots and local development notes are not included in this repository backup.

See [README](../README.md) for commands and [architecture](architecture.md) for state ownership and persistence boundaries. The P3 review gallery can be regenerated on a suitable macOS development machine:

```sh
npm ci
npm run build
npm run test:contracts
SYNA_TEST_ARTIFACTS=.artifacts/p3 npm run test:e2e
npm run test:library:electron
SYNA_TEST_ARTIFACTS=.artifacts/p3/editor-regression npm run test:editor:electron
node scripts/create-library-gallery.mjs
```
