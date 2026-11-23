---
type: Design Doc
title: Model storage in the artifact
description: The published artifact owns each board's models (roster, biomes, specs, glb assets); the repo owns code and a starter set, so code updates never wipe a user's models and runs work the same from a clone or a plugin.
status: draft
design_status: proposed
tags: [models, publishing, cloud, setup]
---

# Model storage in the artifact

**Goal:** a board's models live in its own published artifact, so republishing code (from the owner's repo or a plugin update) never removes them, and the weekly run behaves the same whether lifeboard was cloned or installed as a plugin.

Terms: **model files** = `models/roster.json`, `models/biomes.json`, `models/assets/*-glb.js`, `models/<kind>/specs/*.json` as published. **Code files** = `index.html`, `dist/app.js`, `dist/chunks/*.js`. **Starter set** = the models and biomes committed in the repo so a fresh board has something to show. **Hydrate** = copy the live model files into a local `models/` working tree before a run.

## Problem

Today the repo is the source of truth for models and every publish sends code and model files together (`tools/live-diff.ts` `publishSet`). That breaks in three ways:

| Case | What goes wrong |
|---|---|
| Cloud run | The container is reclaimed; a model that was published but never merged is gone from `main`, and the next drift check calls live "stale". |
| Someone clones the repo and later pulls an update | Publishing the repo's `roster.json` replaces their roster, so their models disappear. |
| Plugin install | No repo of their own exists to hold a roster. |

## Decision

| Owner | Files |
|---|---|
| Repo (code) | Code files; the starter set; the pipeline, skills and tools. |
| Live artifact (models) | Every model file for that board. |

The page already fetches `models/roster.json` and `models/biomes.json` at run time (`src/packages/garden/lib/roster.ts`), so the page needs no change.

The Artifact tool keeps files a publish leaves out, so the rules fall out of what each publish sends:

1. **First publish (setup):** code files plus the starter set. Seeds a new board.
2. **Code publish (a feature, a plugin update):** code files only. Live model files are kept untouched.
3. **Model ship (visitor, plant, scenery, biome):** read live `roster.json` (and `biomes.json` for a biome), add the new entry, publish only `roster.json`, `biomes.json` if changed, and the new `*-glb.js` and spec. Never code files.
4. **No merge needed to ship a model.** A model reaches the board on publish. Git is a backup, not a gate.

## Run flow (cloud or local)

```
hydrate live models -> ledger -> brief -> build -> animate -> verify -> ship (model files only) -> report
```

- **Hydrate first.** A fresh clone has only the starter set, so briefs, duplicate checks (for example the idle-loop duplicate check) and "what exists" would be wrong. Read the live model files (`Artifact read` with `paths`) into `models/` before step 1. These files are not committed (gitignored working copy).
- **Re-read the roster just before publishing** and merge by `id`. Two runs, or the owner editing, cannot silently drop each other's entries. If the same id exists live with different content, stop and report.
- **Never publish a model entry without its asset file in the same call**, and never remove one.

## Drift check

`live-diff` compares code files only. Model files are reported separately and never fail the check:
- live has models the repo lacks: expected, ignored.
- repo starter models missing from live: reported, offer to seed.

## Backup (optional, any install)

`pnpm models:backup <dir>` hydrates the live model files into a directory. A git user can point it at a folder in their own repo and commit it; a plugin user can keep a zip. Without a backup, the artifact is the only copy: deleting the artifact deletes the models.

## Plugin vs clone

No detection is needed. Both run the same flow. A clone's `models/` holds the starter set and the hydrated working copy; a plugin has no repo, so the hydrated copy is a scratch directory. Pulling a repo update changes code and the starter set only, and never touches live models.

## Work

| Step | Change |
|---|---|
| 0 | Read the live roster and diff it against the repo's; record models that are live-only. Port those into the starter set only if they should ship to everyone. |
| 1 | `tools/live-diff.ts`: split code vs model files; exit code reflects code only. |
| 2 | `tools/models-hydrate.ts` and `models:backup`: pull live model files into a directory. Test with the fake db / a fixture directory. |
| 3 | `model-ship`: replace "commit, then republish everything" with "re-read live roster, merge, publish model files only". Commit to git becomes optional. |
| 4 | `weekly-visitor` (add step 0c hydrate), `season-seeds`, `scenery-make`, `biome-brief`: hydrate first; ship via model-ship. |
| 5 | `lifeboard-setup` "Publishing" and `AGENTS.md` owner workflow and Publish: code publish sends no model files; first publish sends the starter set. |
| 6 | `.claude/scheduled/weekly-visitor.md` prompt: drop "commit on branch, do not merge or push"; say models ship to the artifact, and the report lists backup status. |
| 7 | `models/pipeline.html`: new stages (hydrate, model-only publish); regenerate its data block. |
| 8 | Dry run in a cloud session end to end, then one real week. |

## Risks and open questions

| Item | Note |
|---|---|
| Artifact loss | Models exist only there without a backup. Mitigation: backup command, mention in setup. |
| Publish conflicts | Another publish between read and write. The tool rejects the later write and hands back the live version; the run re-reads and merges. |
| Size | Each asset is base64 in a JS file; limits are 16 MB per file and 64 MB per publish. Check headroom as the roster grows (2.7 MB now). |
| Specs published | Needed for hydrate (duplicate checks). Today optional; make them required. |
| Scheduled cloud run | Reading and publishing from a scheduled session is unproven (see cloud-pipeline.md rows 14 and 17). |
