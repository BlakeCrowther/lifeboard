---
name: scenery-make
description: Kind: scenery (orchestrator). Builds the 3D scenery props a biome lists in models/biomes.json `scenery` that are missing from the roster: spec -> shared model-build -> shared model-verify -> shared model-ship, one run ledger per piece. weekly-visitor calls it right after biome-brief (step 1b); also use to build a biome's scenery by hand. Never ships an unverified piece.
---

# Scenery make

> Paths are relative to `models/`. Contract: `scenery/CONTRACT.md`. Read `LESSONS.md` first.

Runs unattended from weekly-visitor. Decide, log, report; never ask.

## 1. What's missing
Biome B = the current biome (and B + 1 if biome-brief just added it). Missing = every `biomes.json` B `scenery[].id` and `neglect.blight` with no roster entry of `kind: "scenery"`. None missing → done. `check_biome.py B` fails until they ship; that's expected mid-run.

## 2. Per piece (start its ledger when the piece starts)
`python3 shared/tools/ledger.py start scenery-<id>-<YYYY-MM-DD> --rounds 4 --minutes 30` (the budget is judge rounds plus wall time; trial builds via `preflight.sh` are free, 5 between counted builds; look at `qa/habitat/` after the first build)
1. **Spec** `scenery/specs/<id>.json` from the biome's `look` (`owns`, `palette`, `plants`, `ground`): `kind: "scenery"`, archetype `clump` (blades, fronds, tufts; give `motion.sway`) or `solid` (shells, stones, discs, arches; static), real-world `reference`, true `size` (`height_m`, `footprint_m`), `sit {mode, why}` (reason it out from the real thing; see `scenery/CONTRACT.md` "How it rests"), swaying pieces use shader sway (`motion.sway.mode: "shader"`, archetype `sway_weights`), palette in the biome's hue family. Start from what the piece should look like (the motif, or for a blight prop the biome's `neglect.form`), then pick the archetype: a close spec in `scenery/specs/` to copy if one truly fits (never one in `scenery/specs/quarantined/`: those failed; if `quarantined/<id>.json` exists for this id, read it and its `out/quarantine/<id>/report.json` first and don't repeat what failed), else write `scenery/archetypes/<name>.py` (same `model/material/rig/animate` interface). Design first: never reshape the piece to fit `clump`/`solid` (a sand drift, a mold bloom or a cobweb is its own shape). `python3 shared/tools/check_spec.py` must pass (spec-check). Blight props: built to be seen in multiples and at growing sizes (habitat scales copies as neglect rises); judge them at both one copy and a dense patch.
2. **Build**: first `shared/tools/preflight.sh scenery/specs/<id>.json --run <run>` (uncounted trial build + code gates: size, bones, height, motion) until it passes; budget rules in `scenery/CONTRACT.md` "Budget". Then the counted build `blender -b --factory-startup --python shared/blender/build.py -- scenery/specs/<id>.json --run <run>`; then `shared/tools/verify.sh <id>` and `node shared/tools/capture_habitat.mjs <id>`, and look at `out/<id>/qa/habitat/wide.png` (the habitat's own lighting: the only look that counts; never tune colour from Blender renders).
3. **Verify**: spec-check–export-check from step 2, then judge-panel per model-verify with a fresh panel (rubric and judge prompt in `scenery/CONTRACT.md`; panel size, golden anchor and pass rule in `scenery/qa_calibration.json`), each judge recorded with `ledger.py judge ... --reply`; verdict from `judge_verdict.py scenery <run> <id>`. Before every rebuild after judging: `ledger.py notes` then `ledger.py plan` (a lowest-median criterion first); spec params first, archetype second (max 3 retries). After a PASS run model-verify "Polish rounds" before shipping.
4. **Ship** (model-ship): `shared/tools/optimize.sh out/<id>/<id>.glb assets/<id>.glb 512`, wrap as `window.LB_SCENERY["<id>"]`, roster entry `kind: "scenery"`, `out/<id>/report.json`.
5. Still failing after the budget → quarantine `out/quarantine/<id>/` and move the spec to `scenery/specs/quarantined/<id>.json` (`git mv` when tracked), leave the id in the biome's `scenery` (the placer skips ids not in the roster) and report the set as **incomplete**: every `look.owns` motif needs a shipped piece. The next weekly run retries the missing piece (it's still "missing" in step 1). Never drop an owned motif or the blight prop to make the set pass.

## 3. Check
`python3 shared/tools/check_biome.py B` PASS; habitat preview (`?visitor=<id>&phase=1`, then `phase=5`): props visible, sway plays, no console errors. Commit with the visitor; one republish covers both.

## 4. Report
Pieces built (gate results, judge-panel medians), quarantined pieces and why, ledger status per piece.
