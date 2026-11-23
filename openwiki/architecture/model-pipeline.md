---
type: architecture
title: 3D model pipeline
description: The headless Blender pipelines that build, verify and ship creature, plant and scenery models, their shared gates and judge rule, and how the page consumes the roster.
tags: [models, blender, pipeline, gates, roster]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-52e269b6c098f325787e1ee5
    resource: repo://models/README.md
  - id: openwiki-source-11812d6a06b8e540b44f5573
    resource: repo://tools/live-diff.ts
  - id: openwiki-source-102efd484e3f82713aef710e
    resource: repo://tools/verify.sh
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---

# 3D model pipeline

`models/` holds autonomous pipelines that design, build, animate, verify and ship glTF models with no human in the loop. Start at `models/README.md`; `models/pipeline.html` is the living visual map.

## Kinds

Three kinds share one toolchain, each with its own contract, QA and archetypes under `models/<kind>/`:

| Kind | What it is | Orchestrating skill |
|---|---|---|
| creature | a weekly Ecosystem visitor, one `.glb` with `idle`, `feed` and `sulk` animations | `weekly-visitor` |
| plant | one species per garden plant (a habit's plot and generation) | `season-seeds` |
| scenery | a backdrop prop a biome places many times | `scenery-make` |

A spec (`<kind>/specs/<id>.json`) is the design. It names an archetype, which is a parametric Python generator in `<kind>/archetypes/` exposing `model`, `material`, `rig` and `animate`. The shared `shared/blender/build.py` dispatches on the spec's `kind` to load the archetype and run the Blender stages: model, topology cleanup, UVs, material, bake, rig, animate and export.

## Gates

A model ships only if every gate passes: spec-check, shape-check, motion-check and export-check run as code through `shared/tools/verify.sh`. Creatures also pass page-test in the real Ecosystem page. A fresh-eyes judge-panel scores contact-sheet renders against the kind's golden reference. A failed attempt is quarantined, and a run can fall back to a safe variant or ship nothing.

The judge pass rule for each kind lives only in that kind's `qa_calibration.json` (`pass_rule`). `shared/tools/judge_verdict.py` is the only code that applies it, and `check_judge_rule.py` fails if a doc restates a rule number. This is deliberate: the design doc records that scoring near the bar was close to a coin flip, so the rule is kept in one place.

## Roster and consumption

`ledger.py` keeps a run ledger per model. `model-ship` optimizes the glb, wraps it as base64 JS in `models/assets/`, adds it to `models/roster.json` with its kind, commits on a branch and republishes the board. The page reads `roster.json` and `biomes.json`, and `live-diff` includes the roster, biomes and every model JS file in the publish set. The Ecosystem package places scenery by phase, and the garden package matches plant models to plots by plot and generation.

Biomes live in `models/biomes.json`, validated by `check_biome.py` as part of `pnpm verify`. Retired biomes and models move to archive files so new designs do not repeat them.

## Keeping the map current

Any change to a stage, gate, check, judge rule, budget or the skills that run them updates `models/pipeline.html` in the same commit. `render_pipeline_map.py` regenerates its data block, and `pnpm verify` fails when that block is stale.

<!-- openwiki: broken internal link [/openwiki/operations/build-verify-publish.md] link "/openwiki/operations/build-verify-publish.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/architecture/game-derivation.md] link "/openwiki/architecture/game-derivation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
See also: [build, verify and publish](/openwiki/operations/build-verify-publish.md), [game derivation](/openwiki/architecture/game-derivation.md).
