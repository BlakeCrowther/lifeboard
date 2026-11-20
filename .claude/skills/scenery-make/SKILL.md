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
`python3 shared/tools/ledger.py start scenery-<id>-<YYYY-MM-DD> --builds 5 --minutes 45` (a piece on a new archetype: `--builds 8 --minutes 60`; run `verify.sh` and look at `qa/contact.png` after the first build, since `model.png` lighting hides colour problems the judges see)
1. **Spec** `scenery/specs/<id>.json` from the biome's `look` (`owns`, `palette`, `plants`, `ground`): `kind: "scenery"`, archetype `clump` (blades, fronds, tufts; give `motion.sway`) or `solid` (shells, stones, discs, arches; static), real-world `reference`, true `size` (`height_m`, `footprint_m`), palette in the biome's hue family. Start from what the piece should look like (the motif, or for a blight prop the biome's `neglect.form`), then pick the archetype: a close spec in `scenery/specs/` to copy if one truly fits, else write `scenery/archetypes/<name>.py` (same `model/material/rig/animate` interface). Design first: never reshape the piece to fit `clump`/`solid` (a sand drift, a mold bloom or a cobweb is its own shape). `python3 shared/tools/check_spec.py` must pass (spec-check). Blight props: built to be seen in multiples and at growing sizes (habitat scales copies as neglect rises); judge them at both one copy and a dense patch.
2. **Build**: `blender -b --factory-startup --python shared/blender/build.py -- scenery/specs/<id>.json --run <run>`; look at `out/<id>/model.png`.
3. **Verify**: `shared/tools/verify.sh <id>` (spec-check–export-check), then judge-panel per model-verify with 3 fresh judges (rubric in `scenery/CONTRACT.md`, anchor = the scenery golden from `scenery/qa_calibration.json`), each recorded with `ledger.py judge`. Fix notes ≥ 2 judges agree on → spec params first, archetype second; rebuild (max 3 retries). After a PASS run model-verify "Polish rounds" before shipping.
4. **Ship** (model-ship): `shared/tools/optimize.sh out/<id>/<id>.glb assets/<id>.glb 512`, wrap as `window.LB_SCENERY["<id>"]`, roster entry `kind: "scenery"`, `out/<id>/report.json`.
5. Still failing after the budget → quarantine `out/quarantine/<id>/`, leave the id in the biome's `scenery` (the placer skips ids not in the roster) and report the set as **incomplete**: every `look.owns` motif needs a shipped piece. The next weekly run retries the missing piece (it's still "missing" in step 1). Never drop an owned motif or the blight prop to make the set pass.

## 3. Check
`python3 shared/tools/check_biome.py B` PASS; habitat preview (`?visitor=<id>&phase=1`, then `phase=5`): props visible, sway plays, no console errors. Commit with the visitor; one republish covers both.

## 4. Report
Pieces built (gate results, judge-panel medians), quarantined pieces and why, ledger status per piece.
