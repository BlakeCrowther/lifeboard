---
type: operations
title: Build, verify and publish
description: How lifeboard is bundled with esbuild, previewed locally against a fake db, checked by pnpm verify, and published to the live artifact with a drift check first.
tags: [build, esbuild, verify, publish, live-diff, dev-server]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-ea7f34966b0f3d893efc5c50
    resource: repo://tools/build.ts
  - id: openwiki-source-d914a7d6a9b91f470f74a6d6
    resource: repo://tools/dev.ts
  - id: openwiki-source-11812d6a06b8e540b44f5573
    resource: repo://tools/live-diff.ts
  - id: openwiki-source-102efd484e3f82713aef710e
    resource: repo://tools/verify.sh
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---

# Build, verify and publish

## Build

`pnpm build` runs `tools/build.ts` (Node 24 runs the TypeScript directly). esbuild produces, into the gitignored `dist/`:

- `dist/app.js` from `src/main.ts` and `dist/capture.js` from `src/capture-page.ts`, as ES modules with code splitting. Shared chunks, including the garden and ecosystem packages, land in `dist/chunks/` without content hashes, because publishing lists every dist file by name.
- `dist/fake-db.js` from `src/fake-db-page.ts`, a classic script.

`three` is external, resolved by the page's import map. The build fails if `dist/app.js` exceeds a 300,000 byte first-load budget. The budget is raised deliberately, never to get past a failure. Game chunks load later and are not counted.

## Local preview

`pnpm dev` (`tools/dev.ts`) runs the esbuild watcher and a Python static server on `PORT` (default 8765) bound to 127.0.0.1. Outside claude.ai there is no artifact db, so the preview injects `dist/fake-db.js` plus the gitignored `mockdata.js` (a local data snapshot) to stand in for `window.claude.use('db')`. Neither file may be published.

## Verify

`pnpm verify` (`tools/verify.sh`) runs every cheap check, continues after failures, prints a PASS, FAIL or SKIP table and exits 1 if any failed. A check whose tool is missing is skipped, not failed. The checks:

- no stray JavaScript (TypeScript-only repo, with a small allowlist)
- game rules versus `SPEC.md` (`spec-check`) and the balance sim
- typecheck, eslint plus dependency-cruiser boundaries, build and vitest
- eval grader self-test and `biomes.json` validity
- break-overlay timer pacing (needs `swiftc`)
- model pipeline map freshness
- UI smoke in headless Chromium against a synthetic fixture
- doc frontmatter and Python lint (both need `uv`)

Visual review in the preview and the model gates are not part of `verify`.

## Publish and drift check

The owner's live artifact is the published copy and the repo is the template, so the two can drift when the live artifact is edited directly. `pnpm live-diff --list` prints the publish set: `index.html`, `dist/app.js`, `dist/chunks/*.js`, `models/roster.json`, `models/biomes.json` and every roster model file. `pnpm live-diff <dir>` compares live files pulled into `<dir>` against a fresh build. Exit 0 means live matches. Exit 1 means a file differs or is missing, meaning live is stale or has live-only edits to port first. Exit 2 means bad usage or no build. The artifact service's document wrapper is stripped from `index.html` before hashing.

Publishing is pre-approved in the repo's agent instructions once checks pass and the live diff shows no live-only changes. Publish after a fresh `pnpm build`, sending `index.html` and every file in `dist/`, including chunks, to the existing artifact URL.

<!-- openwiki: broken internal link [/openwiki/architecture/data-store.md] link "/openwiki/architecture/data-store.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/architecture/model-pipeline.md] link "/openwiki/architecture/model-pipeline.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
See also: [data store](/openwiki/architecture/data-store.md), [model pipeline](/openwiki/architecture/model-pipeline.md).
