---
type: Architecture
title: Build and bundle
description: How strict TypeScript in src/ is bundled by esbuild into dist/, which entry points exist, how chunks and the three.js import map work, and the first-load size budget.
tags: [build, esbuild, bundle, dev-server]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-24T16:14:32.981Z
sources:
  - id: openwiki-source-70d20c615440765c1162734d
    resource: repo://capture.html
  - id: openwiki-source-f8d10828394c4129061d5b0e
    resource: repo://index.html
  - id: openwiki-source-a5e85d559310f47547b34206
    resource: repo://src/capture-page.ts
  - id: openwiki-source-5130c65d15cae21b338b70c1
    resource: repo://src/fake-db-page.ts
  - id: openwiki-source-ea7f34966b0f3d893efc5c50
    resource: repo://tools/build.ts
  - id: openwiki-source-d914a7d6a9b91f470f74a6d6
    resource: repo://tools/dev.ts
generated: { by: "claude-code", at: "2026-11-22T17:23:06.062Z" }
---

# Build and bundle

`pnpm build` runs `tools/build.ts` (Node strips the types, so it runs directly); `dist/` is gitignored and must be fresh before anything is published or smoke-tested (see [Publishing and the weekly run](../operations/publish-and-weekly-run.md) and [Verification and CI](../operations/verification-and-ci.md)).

## Outputs

| Entry (`src/`) | Output (`dist/`) | Format | Used by |
|---|---|---|---|
| `main.ts` | `app.js` | ES module, code-split | `index.html`, the board page |
| `capture-page.ts` | `capture.js` | ES module, shares chunks | `capture.html`, the Ecosystem alone for the model pipeline |
| `fake-db-page.ts` | `fake-db.js` | IIFE classic script | local preview and UI smoke only; never published |

`app` and `capture` are built together with `splitting: true`, so the `garden` and `ecosystem` packages become shared chunks in `dist/chunks/` that load on demand when the game is on (see [Board UI](./board-ui.md)). Chunk names have no content hash on purpose: publishing lists every `dist` file by name. All outputs are minified with sourcemaps, target `es2023`.

`src/main.ts` is a single call, `bootBoard()`. `index.html` loads `dist/app.js` as a module, and `capture.html` loads `dist/capture.js`.

## three.js is not bundled

`three` and `three/addons/*` are marked external. Both HTML pages declare an import map pointing the bare `three` specifier at a pinned CDN build, so the ecosystem and garden chunks resolve it at runtime. In `index.html` the map is inert (nothing downloads) until the Ecosystem is on and its card is visible.

## Size budget

After a one-shot build, `tools/build.ts` fails the build (exit 1) if `dist/app.js` exceeds 300 000 bytes. The budget guards the board's first load: a dependency that drags in locales or a duplicate copy of itself shows up here first. Game chunks load later and are not counted. The `db` schemas import `zod/mini` for the same reason (the full zod build bundles every locale). The budget is meant to be raised deliberately, never to get a change past it.

## fake-db and capture bundles

- `fake-db.js` defines `window.claude.use('db')` as an in-memory `createFakeDb` seeded from `window.MOCK`, so the page runs outside claude.ai. Load it before `dist/app.js`.
- `capture.js` mounts the Ecosystem full-window with a synthetic game state and exposes `window.Ecosystem` for the model pipeline's headless tools (see [3D model pipeline](../models/model-pipeline.md) and [Ecosystem and Garden rendering](../game/ecosystem-and-garden.md)).

## Dev server

`pnpm dev` runs `tools/dev.ts`, which spawns `tools/build.ts --watch` and a plain `python3 -m http.server` bound to 127.0.0.1 on `PORT` (default 8765, matching `.claude/launch.json`). Stopping either child stops both. The server serves the repo root, so `index.html` and `models/` are reachable beside `dist/`.

## Toolchain facts

- `tsconfig.json` is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`; imports carry explicit `.ts` extensions; `tsc` only type-checks (`noEmit`).
- pnpm only; `pnpm bootstrap` enables corepack, installs, and downloads Chromium for the UI smoke test.
- Layering and import rules over `src/` are in [Package layering and boundaries](./package-boundaries.md).
