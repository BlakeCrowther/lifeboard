---
type: architecture
title: Packages and boundaries
description: The deep-module package layout under src/packages, the layering between domain, scene, db and ui packages, and how dependency-cruiser enforces it.
tags: [packages, deep-modules, dependency-cruiser, layering]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-739d3ff1d3f2cc6c1de83f4b
    resource: repo://.dependency-cruiser.cjs
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---

# Packages and boundaries

Code in `src/` is strict TypeScript organised as flat deep modules under `src/packages/<name>/`. A package has a few root files that form its public entry points (such as `index.ts`), plus private subfolders: `lib/` for implementation and `tests/` for tests. `src/main.ts` is the page entry and imports only `ui`.

## Layering

```
dates <- recurrence <- tasks, habits <- game
db            (independent of the domain packages)
ecosystem, garden   (render game state; may import domain packages)
ui            (top layer; only src/main.ts imports it)
```

- **Domain packages** (`dates`, `recurrence`, `tasks`, `habits`, `game`) are pure: no DOM, no db, no scene, no ui.
- `db` never imports a domain package, and they never import it. Collection types come only from its zod schemas.
- `ecosystem` (the three.js scene) and `garden` render game state. They may import domain packages but never `ui` or `db`.
- `ui` may import everything below it. The garden and ecosystem packages load as separate lazy chunks through dynamic import.

## Enforcement

`.dependency-cruiser.cjs` turns these into error-severity rules, run by `pnpm lint:boundaries` (part of `pnpm lint` and `pnpm verify`):

- Code outside a package may import only that package's root files, never a subfolder.
- One package reaches another only through its entry points. Its own files import each other freely.
- Tests import only entry points and their own `tests/` fixtures, never any `lib/`, not even their own package's.
- A `tests/` folder is importable only from tests.
- No dependency cycles.
- Layering rules: domain packages may not import `ui`, `ecosystem`, `garden` or `db`; `ecosystem` and `garden` may not import `ui` or `db`; only `ui` and `src/main.ts` may import `ui`; `db` may not import domain packages.

DOM globals are restricted separately in `eslint.config.mjs`, which keeps the pure packages DOM-free. When a new package lands, add its layering rule to the dependency-cruiser config and `src/packages/README.md`.

## Why it matters

Pure domain packages are shared between the page and node tools such as the balance sim and `spec-check`. Tests exercise behavior through the same entry points as production callers, so internals can be refactored without breaking them.

<!-- openwiki: broken internal link [/openwiki/architecture/data-store.md] link "/openwiki/architecture/data-store.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/architecture/game-derivation.md] link "/openwiki/architecture/game-derivation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/architecture/board-ui.md] link "/openwiki/architecture/board-ui.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
See also: [data store](/openwiki/architecture/data-store.md), [game derivation](/openwiki/architecture/game-derivation.md), [board UI](/openwiki/architecture/board-ui.md).
