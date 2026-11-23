---
type: "Reference"
title: "Quickstart"
openwiki_generated: true
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-7fd1f9390baadbd987c79277
    resource: repo://tools/spec-check.ts
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---


# Quickstart

Lifeboard is a personal life dashboard published as a claude.ai Artifact. Strict TypeScript in `src/` is bundled by esbuild into `dist/`. Data lives in the artifact db, not in the repo. Read `AGENTS.md` before changing anything, and use pnpm only.

## Where to look

| If you are changing... | Read | Source |
|---|---|---|
<!-- openwiki: broken internal link [/openwiki/architecture/packages-and-boundaries.md] link "/openwiki/architecture/packages-and-boundaries.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Where new code goes, what may import what | [Packages and boundaries](/openwiki/architecture/packages-and-boundaries.md) | `src/packages/README.md`, `.dependency-cruiser.cjs` |
<!-- openwiki: broken internal link [/openwiki/architecture/data-store.md] link "/openwiki/architecture/data-store.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| A collection's shape, saving, undo, offline behavior | [Data store](/openwiki/architecture/data-store.md) | `src/packages/db/` |
<!-- openwiki: broken internal link [/openwiki/architecture/board-ui.md] link "/openwiki/architecture/board-ui.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| A view, a button, redraw behavior, boot order | [Board UI](/openwiki/architecture/board-ui.md) | `src/packages/ui/` |
<!-- openwiki: broken internal link [/openwiki/architecture/game-derivation.md] link "/openwiki/architecture/game-derivation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Garden, reef, visitors, lessons, rewards | [Game derivation](/openwiki/architecture/game-derivation.md) | `src/packages/game/`, `SPEC.md` |
<!-- openwiki: broken internal link [/openwiki/architecture/model-pipeline.md] link "/openwiki/architecture/model-pipeline.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Creature, plant or scenery models | [Model pipeline](/openwiki/architecture/model-pipeline.md) | `models/` |
<!-- openwiki: broken internal link [/openwiki/operations/build-verify-publish.md] link "/openwiki/operations/build-verify-publish.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Building, checking, previewing, publishing | [Build, verify and publish](/openwiki/operations/build-verify-publish.md) | `tools/` |

## Rules that bite

- A game mechanic change updates `SPEC.md` and `RULES` in the same commit, or `pnpm spec-check` fails.
- Packages are imported only through root entry points. `pnpm lint:boundaries` enforces it.
- Code is TypeScript only; stray `.js` files fail `pnpm verify`.
- Run `pnpm bootstrap` once in a fresh worktree, then `pnpm verify` before claiming done.
- Before publishing, diff the live artifact against a fresh build with `pnpm live-diff`.
- Name code after the db collection (`habitSessions` for `habit_sessions`). Renames stop at persisted data.

Terms are defined in `GLOSSARY.md`.
