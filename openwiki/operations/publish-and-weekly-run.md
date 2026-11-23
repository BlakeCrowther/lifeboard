---
type: Operations
title: Publishing and the weekly run
description: How the board is published as a claude.ai Artifact, the live-versus-repo drift rule, setup and its health check, the scheduled weekly job that makes visitors and plants, and how game status is handed to Claude through the db.
tags: [publish, artifact, weekly-run, scheduled-task, setup, game-status]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T20:10:38.978Z
sources:
  - id: openwiki-source-4ebd3c72c0984747086af6f8
    resource: repo://.claude/scheduled/weekly-visitor.md
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-9005c3a4fb20b3672372b9c0
    resource: repo://setup.sh
  - id: openwiki-source-6cd1f358e4b527ced9a43d84
    resource: repo://src/packages/ui/game/game.ts
generated: { by: "claude-code", at: "2026-11-22T17:23:06.062Z" }
---

# Publishing and the weekly run

Lifeboard is published as a claude.ai Artifact with the `db` capability. The repo is the template; the owner's published artifact is the live copy. Data lives in the artifact db, never in this repo ([Data layer](../architecture/data-layer.md)). The rules below are the owner workflow in `AGENTS.md`; people who clone the repo publish to their own artifact URL.

## Publish

1. `pnpm build` so `dist/` is fresh (it is gitignored; see [Build and bundle](../architecture/build-and-bundle.md)).
2. Publish with the Artifact tool: `index.html` plus every file in `dist/` (including `dist/chunks/`) as `files`, to the existing artifact URL. `dist/fake-db.js` and `mockdata.js` are never published. Chunk names carry no hash precisely so the file list is complete by name.
3. Publishing is pre-approved for the owner once checks pass and the live diff below shows no live-only changes. Wrapper lines added by the artifact service must be stripped from any page pulled from live.

### Live versus repo

The live artifact can drift if it is edited directly. Before changing either, read the live artifact's files and diff them against `main`; port live-only changes into the repo first, then change here, run `pnpm verify` ([Verification and CI](./verification-and-ci.md)), and publish from the repo. If live holds changes the repo lacks and they conflict, stop and report instead of overwriting.

## Setup

`./setup.sh` installs and checks the local toolchain for a fresh clone: Blender, ImageMagick, a recent Node (the export optimizer needs one), gltf-transform, the judge-rule self-checks and the local preview. `./setup.sh --check` only runs the checks and installs nothing; the weekly run uses the same checks as its preflight, so any failure means no visitor that week. The `lifeboard-setup` skill drives it: it asks for name, timezone, week start and ring strictness, publishes the board as the user's own artifact, optionally installs the model toolchain, and registers the weekly job. `.claude/launch.json` provides the preview server on port 8765.

## The weekly run

`.claude/scheduled/weekly-visitor.md` is a **template**; nothing runs until `lifeboard-setup` registers it as a Claude desktop scheduled task.

- **When:** cron `0 <hour> * * <day>`, with the day set to the board's week start (default Sunday 06:00 local). The Mac must be awake with the Claude app running, because Blender is a local app.
- **What it runs:** the `weekly-visitor` skill (design, build, animate, verify and ship this week's creature, retries and fallbacks included) and its step for garden plants (`season-seeds`) ([3D model pipeline](../models/model-pipeline.md)). It starts a run ledger first, so the budget is enforced by code rather than by the agent counting.
- **Unattended rules:** no questions; it ships only on a full gate pass, commits on a `visitor/<id>` branch, never merges or pushes to `main`, and republishes only the existing artifact URL. It does not change game numbers.
- **Retro:** every run ends with the "Improve as you go" loop from `AGENTS.md`: fix the skill or gate that tripped it in the same commit and add a line to `LESSONS.md`. Subagents default to the cheaper model and judges are pinned per kind in `qa_calibration.json`.

Other skills in `.agents/skills/` support the run: `biome-brief` and `scenery-make` when the Ecosystem reaches a new biome, `lesson-make` for lessons, `game-reset` to restart the game after a backup, and `break-setup` for the [break overlay](../integrations/break-overlay.md).

## How the weekly run learns the game state

The page tells the agent what it needs through the db. After each render the board calls `writeGameStatus`, which writes `checks/game_status` (only when its content changes) with the Ecosystem's biome, phase and bleach state, the current visitor, the garden's season, and `garden.needs`: the plots whose current or next plant has no 3D model yet (a new habit, or a plant that was just pressed). `weekly-visitor` reads this to decide whether a biome is finished and a new one must be designed, and `season-seeds` builds a plant for each plot in `needs`. The derivation behind these values is in [Game derivation](../game/game-derivation.md), and the call site is described in [Board UI](../architecture/board-ui.md). The board must be opened once after a change for fresh status to exist; a model shipped by the run appears after the next publish because the page reads `roster.json` at runtime ([Ecosystem and Garden rendering](../game/ecosystem-and-garden.md)).
