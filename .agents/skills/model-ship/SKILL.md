---
name: model-ship
description: Shared step, any kind. Ship a verified model: optimize the glb (models/shared/tools/optimize.sh), wrap it as base64 JS, add it to the board's roster (models/board/roster.json) with its kind, commit on a branch, publish the model files (never the page) to the lifeboard artifact. Final step of the creature and plant pipelines; refuses without a passing report.json.
---

# Creature ship

> Paths are written from the repo root. Run `pnpm board seed` first (a no-op when `models/board/` has a roster; layout: `models/README.md`). Never write a shipped model into `models/starter/`.

Precondition: `models/out/<id>/report.json` was written after the current `<id>.glb` (compare mtimes) and either has `"pass": true`, or has `"shipped_below_bar": true` with every automated gate passing and the ledger's `best --below-bar` naming this build (budget spent, nothing passed: weekly-visitor fallback 2). Otherwise stop. A below-bar ship gets `"below_bar": true` in its roster entry so a later run can see it shipped under the bar.

1. **Optimize**:
   ```bash
   models/shared/tools/optimize.sh models/out/<id>/<id>.glb models/board/assets/<id>.glb <budget.texture>
   ```
  (quantize + resize + webp as separate steps: `gltf-transform optimize` prunes the `mouth` empty.) Use quantize only. No draco or meshopt: the Ecosystem page would need a decoder. Re-run the checks on a copy beside the build (verify.sh only accepts a glb in `out/<id>/`, its `preview/` or `out/dryrun/<id>/`, and this run overwrites `out/<id>/qa/`): `cp models/board/assets/<id>.glb models/out/<id>/<id>_shipped.glb && models/shared/tools/verify.sh <id> models/out/<id>/<id>_shipped.glb`; shape-check–export-check must still pass, because quantization can break the loop seams. Scenery with shader sway: copy the shipped glb into `models/out/ship_<id>/` and run `node models/shared/tools/capture_ecosystem.ts <id> --glb models/out/ship_<id>/<id>.glb`; its sway-check must still pass (quantize puts a scale on the mesh node and stores the sway attributes as normalized ints).
2. **Wrap**: `models/board/assets/<id>-glb.js` as in model-verify page-test (scenery: `window.LB_SCENERY`).
Parallel plant subagents (season-seeds step 2) run steps 1–2 only and return the step-3 roster entry; the season-seeds orchestrator writes the roster and does steps 4–5 once for every plant.

3. **Roster**: append `{id, kind, spec, glb, js, biome, rarity, golden:false, added:<YYYY-MM-DD>}` to `models/board/roster.json` `models[]` (the entry's paths are relative to the board dir, as published: `assets/<id>-glb.js`). The spec stays at `models/board/<kind>/specs/<id>.json`.
   Then re-read the live `models/roster.json` (`Artifact read`, `out_dir` under the scratchpad) and run `pnpm board merge-roster <dir>/models/roster.json`, before any commit. Exit 1 names an id that differs between the board and the live store: stop and report, commit and publish nothing. Creatures also get `locomotion` and, when the spec has one, `rest` (without `why`) copied from the spec: specs aren't published with the board, so the runtime reads these from the roster.
4. **Commit** `models/board/` (the roster, assets and specs) on a branch `visitor/<id>` (plants: `seed/<id>`; a weekly run puts everything on one branch, the session's own when it has one). The message names the gates passed, never the species (weekly-visitor "No spoilers"). Push and open a PR (title `feat(models): weekly run <run_id>`, spoiler-free body: plots, rarities, passed or below bar, ledger numbers). Merge only when the scheduled task's instructions say so: then wait for the PR's `verify` check, and squash-merge when it passes (`gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=squash`). A red `verify` or a conflict: fix the cause on the branch, never merge red. Otherwise leave the PR for review. `models/board/` exists only in a board's own copy of the repo (it is untracked in the public template, and the public-repo check fails if it is tracked there), so that copy's `main` holds the board's model history.
5. **Publish model files only** (see lifeboard-setup "Publishing"; never send `index.html` or `dist/`). Follow AGENTS.md for the artifact URL and for whether to publish without asking ("This board's settings"; when publishing is not pre-approved, ask, or in an unattended run commit and report it unpublished); never create a new artifact URL.
   1. `Artifact list` with `scope: "files"` for the board's artifact gives the live file count and bytes. Run `pnpm -s board publish-set --ids <ids> [--biomes] --live-count <n> --live-bytes <n>` (`--biomes` when a biome-brief ran; for a batch, every id shipped this run). A warning on stderr (over 70% of the version limits) goes in the report; exit 1 (at a limit) means stop and report.
   2. Publish with the printed map as `files` (the Artifact tool keeps every file the publish leaves out). A roster entry never goes out without its asset in the same call.
6. **Announce**: return `{id, rarity, below_bar}` to the orchestrator for the weekly report. The user-facing report never names or describes it (weekly-visitor "No spoilers").
