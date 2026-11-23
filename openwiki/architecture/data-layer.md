---
type: Architecture
title: Data layer (db package)
description: Collection schemas and validation, the live store with optimistic writes, per-document write queues, rollback and undo, the DbAdapter seam to the artifact db, and the in-memory fake.
tags: [db, store, zod, optimistic-writes, undo]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-22T17:23:06.062Z
sources:
  - id: openwiki-source-8fe86d54865d37498642d252
    resource: repo://evals/lesson-make/grade.ts
  - id: openwiki-source-b2135c74abd8d95d81440d16
    resource: repo://src/packages/db/lib/adapter.ts
  - id: openwiki-source-d461e16a9fb171d0a4c279df
    resource: repo://src/packages/db/lib/fake-db.ts
  - id: openwiki-source-096ad1c90d697648f157c0fe
    resource: repo://src/packages/db/lib/schemas.ts
  - id: openwiki-source-d2cac64cc584449d3b6aa075
    resource: repo://src/packages/db/lib/store.ts
  - id: openwiki-source-d900da1b5328cb072fb99287
    resource: repo://src/packages/db/lib/validate.ts
generated: { by: "claude-code", at: "2026-11-22T17:23:06.062Z" }
---

# Data layer (`db` package)

The `db` package defines the shape of every stored document and the only code that talks to the artifact database. It is independent of the domain packages: domain code never imports it, and collection types come only from its zod schemas (`z.infer`). The board's own data lives in the artifact db, never in this repo; see [Publishing and the weekly run](../operations/publish-and-weekly-run.md).

## Entry points

| File | Exports |
|---|---|
| `schema.ts` | `COLLECTION_SCHEMAS`, `STORE_COLLECTIONS`, `OPTIONAL_COLLECTIONS`, inferred types, `validate`, `ruleError` |
| `index.ts` | `createStore`, `InvalidDocError`, the `DbAdapter` types |
| `fake.ts` | `createFakeDb`, the in-memory adapter for tests and `dist/fake-db.js` |

## Schemas and validation

`lib/schemas.ts` holds one zod schema per collection (tasks, habits, habit_sessions, lists, goals, logs, checks, snapshots, countdowns, game_state, keepsakes, sources, lessons, lesson_answers, visitors_met, …). Documents are `looseObject`s: unknown extra fields are allowed so older docs keep working, but known fields must have the right type, and optional fields may be missing or null. Numeric rule fields accept anything that coerces to an integer in range (`"3"` as well as `3`), because stored rules always have. Recurrence rules are a discriminated union over eight kinds (`interval`, `monthly_*`, `yearly_*`). A lesson's rungs must be non-empty and a `recall` rung needs an answer string. The schemas import `zod/mini` because the full build bundles every locale and would blow the first-load budget (see [Build and bundle](./build-and-bundle.md)).

`validate(collection, doc)` returns the first problem in schema order as a short reason (`missing <field>`, `bad <field>`, `unknown collection`, `not an object`) or `null`. Recurrence rules get their own message through `ruleError`. The schema collection names are also the code names: `buy_list_items` is `buyListItems` in code ([GLOSSARY.md](../../GLOSSARY.md)).

### Store collections vs optional collections

`STORE_COLLECTIONS` (tasks, habits, habit_sessions, groceries, recipes, list_items, buy_list_items, gift_ideas, goals, logs, checks, snapshots, countdowns, game_state) get a live listener in the store. `OPTIONAL_COLLECTIONS` (`visitors_met`, `keepsakes`, `sources`, `lessons`, `lesson_answers`) are game and lesson data the page reads on demand; the store never listens to them (see [Board UI](./board-ui.md)).

## The adapter seam

`DbAdapter` mirrors what `window.claude.use('db')` returns: `collection(name)` gives a ref with `doc(id?)` (`set`, `update`, `delete`) and `onSnapshot`. It is the only boundary the store crosses. `update` merges nested objects key by key, which matters for writes (below).

## The store

`createStore({ connect })` returns `start`, reads (`all`, `get`, `skipped`), writes (`create`, `put`, `patch`, `remove`, `undo`, `newId`), a `state` object and a `ready` flag.

**Loading.** `start(changed)` calls `connect()`; a null adapter or a throw sets status `nodb`. Otherwise it attaches one `onSnapshot` listener per store collection. Every snapshot is validated doc by doc; valid docs replace the collection's map, invalid ones are skipped, warned about and counted per collection (the page shows a note when any were skipped). Status moves `loading → ready` once every collection has delivered, `loading → slow` after `slowAfterMs` (default 10 s), and goes to `error` if any listener fails.

**Optimistic writes.** Each write validates the full new body first (rejecting with `InvalidDocError`, code `invalid_doc`), records the prior state into the caller's `UndoRecord`, updates the local map and notifies the page immediately, then sends the write. If the db refuses, the local change is rolled back and the error rethrown. `create` stamps `created_at` when missing and uses the db's generated id when connected. `patch` is a no-op when nothing actually changes, and it writes the whole merged doc with `set` when the patch carries an object (such as `recurrence_rule`), because the db's `update` would merge nested keys and leave stale rule keys behind.

**Write ordering.** Writes are queued per document (`collection/id`) as a promise chain, so two quick edits to one doc reach the db in order; an in-flight counter per document lets an incoming snapshot keep the optimistic body for docs whose writes have not settled, so a snapshot cannot flicker an unsaved change away.

**Undo.** An `UndoRecord` lists every doc a write touched with its `before` body (null if it did not exist). `undo` replays it newest first: existing docs are `put` back, newly created ones are removed.

## In-memory fake

`createFakeDb(seed)` implements `DbAdapter` over a plain object, so tests and the preview exercise the real store. It fires listeners after each write, deep-merges on `update` like the real db, and adds test hooks: `failNextWrites(count, code)` makes the next writes reject without changing data (to test rollback), and `remoteWrite` simulates a change from another device. Snapshots are delivered asynchronously on subscribe.

## Testing and extension

Tests in `src/packages/db/tests/` go through the entry points only. To add a collection, add its schema, include it in `STORE_COLLECTIONS` or `OPTIONAL_COLLECTIONS`, and add it to the glossary; the board model and UI then read it through the store ([Board UI](./board-ui.md)). The agent skills that write rows (such as `lesson-make`) are graded against the same `validate` in the skill evals ([Verification and CI](../operations/verification-and-ci.md)).
