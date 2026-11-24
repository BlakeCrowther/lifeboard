---
name: model-ship
description: Shared step, any kind. Ship a verified model: optimize the glb (models/shared/tools/optimize.sh), wrap it as base64 JS, add it to models/roster.json with its kind, commit on a branch, republish the lifeboard artifact. Final step of the creature and plant pipelines; refuses without a passing report.json.
---

# Creature ship

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Precondition: `models/out/<id>/report.json` was written after the current `<id>.glb` (compare mtimes) and either has `"pass": true`, or has `"shipped_below_bar": true` with every automated gate passing and the ledger's `best --below-bar` naming this build (budget spent, nothing passed: weekly-visitor fallback 2). Otherwise stop. A below-bar ship gets `"below_bar": true` in its roster entry so a later run can see it shipped under the bar.

1. **Optimize**:
   ```bash
   models/shared/tools/optimize.sh out/<id>/<id>.glb assets/<id>.glb <budget.texture>
   ```
  (quantize + resize + webp as separate steps: `gltf-transform optimize` prunes the `mouth` empty.) Use quantize only. No draco or meshopt: the Ecosystem page would need a decoder. Re-run the checks on a copy beside the build (verify.sh only accepts a glb in `out/<id>/`, its `preview/` or `out/dryrun/<id>/`, and this run overwrites `out/<id>/qa/`): `cp models/assets/<id>.glb models/out/<id>/<id>_shipped.glb && models/shared/tools/verify.sh <id> models/out/<id>/<id>_shipped.glb`; shape-check–export-check must still pass, because quantization can break the loop seams. Scenery with shader sway: copy the shipped glb into `out/ship_<id>/` and run `node shared/tools/capture_ecosystem.ts <id> --glb out/ship_<id>/<id>.glb`; its sway-check must still pass (quantize puts a scale on the mesh node and stores the sway attributes as normalized ints).
2. **Wrap**: `assets/<id>-glb.js` as in model-verify page-test (scenery: `window.LB_SCENERY`).
Parallel plant subagents (season-seeds step 2) run steps 1–2 only and return the step-3 roster entry; the season-seeds orchestrator writes the roster and does steps 4–5 once for every plant.

3. **Roster**: append `{id, kind, spec, glb, js, biome, rarity, golden:false, added:<YYYY-MM-DD>}` to `roster.json` `models[]` (paths relative to `models/`). Creatures also get `locomotion` and, when the spec has one, `rest` (without `why`) copied from the spec: specs aren't published with the board, so the runtime reads these from the roster.
4. **Commit** on a branch `visitor/<id>` (plants: `seed/<id>`; a weekly run puts everything on one branch, the session's own when it has one). The message names the gates passed, never the species (weekly-visitor "No spoilers"). Push and open a PR (title `feat(models): weekly run <run_id>`, spoiler-free body: plots, rarities, passed or below bar, ledger numbers). Merge only when the scheduled task's instructions say so: then wait for the PR's `verify` check, and squash-merge when it passes (`gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=squash`). A red `verify` or a conflict: fix the cause on the branch, never merge red. Otherwise leave the PR for review. `main` must match the live board after the run, or next week's live drift check (weekly-visitor 0a) stops.
5. **Publish**: republish the main lifeboard artifact with `models/roster.json`, `models/biomes.json` (when a biome-brief ran) and every `models/assets/*-glb.js` as files (see lifeboard-setup "Publishing"). Follow AGENTS.md for the artifact URL; never create a new artifact URL.
6. **Announce**: return `{id, rarity, below_bar}` to the orchestrator for the weekly report. The user-facing report never names or describes it (weekly-visitor "No spoilers").
