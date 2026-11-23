---
type: "Reference"
title: "Data store over the artifact db"
openwiki_generated: true
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-096ad1c90d697648f157c0fe
    resource: repo://src/packages/db/lib/schemas.ts
  - id: openwiki-source-d2cac64cc584449d3b6aa075
    resource: repo://src/packages/db/lib/store.ts
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---


# Data store over the artifact db

All board data lives in the claude.ai artifact db, not in the repo. The `db` package (`src/packages/db/`) is the only way the page touches it. It is independent of the domain packages: they never import it, and it reaches the artifact db only through a `DbAdapter` (`lib/adapter.ts`).

## Schemas and validation

`lib/schemas.ts` defines one zod schema per collection in `COLLECTION_SCHEMAS`. Schemas are loose objects, so unknown fields pass through and collection types come only from `z.infer`. `validate(collection, doc)` returns an error string or null.

Collections split in two:

- `STORE_COLLECTIONS` (tasks, habits, habit_sessions, groceries, recipes, list_items, buy_list_items, gift_ideas, goals, logs, checks, snapshots, countdowns, game_state) get a live listener at start.
- `OPTIONAL_COLLECTIONS` (visitors_met, keepsakes, sources, lessons, lesson_answers) are game and lesson data the page reads on demand; the store never listens to them.

## Store lifecycle

`createStore({ connect })` (`lib/store.ts`) returns `start`, reads (`all`, `get`, `skipped`), writes (`create`, `put`, `patch`, `remove`), `undo` and `state`.

`start` calls `connect()`. A null adapter or a throw sets status `nodb` (the page is outside claude.ai). Otherwise it attaches an `onSnapshot` listener per store collection. Each snapshot is validated doc by doc: valid docs are kept, invalid ones are skipped and counted (surfaced as a footnote by the UI), never repaired. The status becomes `ready` once every store collection has delivered, `slow` after a timeout (10 s default) if still loading, and `error` if a listener fails.

## Writes

Writes are optimistic. The local copy changes and `onChange` fires at once, then the db write is queued. If the db rejects, the local copy rolls back to its prior value. Each write is validated first and rejected with `InvalidDocError` before touching state.

- A per-document promise chain serializes writes to one doc. An in-flight counter lets a snapshot keep the optimistic body of a doc whose write has not settled, so a stale snapshot does not flicker it away.
- `patch` merges into the loaded doc and uses `update`, unless a changed value is a plain object (such as `recurrence_rule`). Then it writes the whole doc with `set`, because the db's update merges nested objects and would leave stale rule keys.
- `create` stamps `created_at` if missing.

## Undo

Write calls accept an optional `UndoRecord`. The first write to each doc records its prior body (null if it did not exist). `undo` replays the record newest first, using `put` to restore or `remove` to delete.

## Fake db

`lib/fake-db.ts` is an in-memory `DbAdapter` used by tests and by `dist/fake-db.js`, the local preview stand-in for `window.claude.use('db')` seeded from `window.MOCK`. It must never be published.

<!-- openwiki: broken internal link [/openwiki/architecture/board-ui.md] link "/openwiki/architecture/board-ui.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/operations/build-verify-publish.md] link "/openwiki/operations/build-verify-publish.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
See also: [board UI](/openwiki/architecture/board-ui.md), [build, verify and publish](/openwiki/operations/build-verify-publish.md).
