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

Layering (which package may depend on which) is a commented stub in `.dependency-cruiser.cjs`: `dates <- recurrence <- tasks/habits <- game`; `db` independent of those; `ui`/`ecosystem`/`garden` may import domain packages; no domain package imports `ui`, `db` or the DOM. Uncomment each rule as its packages land.

Check: `pnpm lint:boundaries` (also part of `pnpm lint` and `pnpm verify`).
