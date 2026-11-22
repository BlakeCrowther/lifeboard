# Packages

Every package here is a deep module: a lot of behaviour behind a small interface. Vocabulary: the `codebase-design` skill.

```
src/packages/<name>/
  index.ts      entry point (public). Import this from outside.
  client.ts     another entry point. A package may expose several.
  lib/          implementation: private, files import each other freely.
  tests/        co-located tests and fixtures (a subfolder, so private).
```

Packages are flat: one tier of children under `src/packages/`. A package's internals may nest; a package may not contain a package. The page entry is `src/main.ts`, bundled to `dist/app.js` by `pnpm build`.

Import only through a package's entry points (its root files), never its subfolders. Prefer several small entry points over one barrel `index.ts` that re-exports a subtree. Imports use explicit `.ts` extensions.

## The four rules (all errors, `.dependency-cruiser.cjs`)

1. **Entry-point boundary**: code outside a package (app code or another package) may import only that package's root files, never anything in its subfolders.
2. **Intra-package freedom**: a package's own files import each other freely.
3. **Tests through entry points** (`tests-through-entrypoints`): files in `<pkg>/tests/` may import any package's entry points and their own `tests/` fixtures, never any package's `lib/` or other subfolder, not even their own.
4. **No cycles**.

## Layering (`.dependency-cruiser.cjs`, DOM globals in `eslint.config.mjs`)

```
dates  <-  recurrence  <-  tasks, habits  <-  game
```

| Package | Entry points | Owns | May import |
|---|---|---|---|
| `dates` | `index.ts` (zone-free 'YYYY-MM-DD' math, labels), `clock.ts` (board day boundary, time zone, clock labels) | calendar dates | nothing |
| `recurrence` | `index.ts` | rule kinds, next due date, rule labels | dates |
| `tasks` | `index.ts` (state, ordering, commitment, ring tally, age), `icons.ts` (title icon, wish list tags) | tasks | dates, recurrence |
| `habits` | `index.ts` | session counts, floor-met weeks, streaks | dates, recurrence |
| `game` | `index.ts` (RULES, garden plots, habitat growth, visitors, lessons), `derive.ts` (`deriveGame`) | game mechanics (SPEC.md) | all of the above |
| `db` | `schema.ts` (zod schema per collection, inferred types, `validate`), `index.ts` (`createStore`, `DbAdapter`), `fake.ts` (`createFakeDb`, in-memory adapter for tests and `dist/fake-db.js`) | collection shapes, the store | nothing (reaches the artifact db only through a `DbAdapter`) |

`db` is independent of those and they never import it; collection types come only from its zod schemas (`z.infer`); `ui`/`ecosystem`/`garden` may import domain packages; no domain package imports `ui`, `db` or the DOM. Add a rule when a new package lands.

Check: `pnpm lint:boundaries` (also part of `pnpm lint` and `pnpm verify`).
