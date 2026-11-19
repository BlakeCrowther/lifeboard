---
name: season-seeds
description: Kind: plant (orchestrator). Introduce new seed species for the current biome (and hybrid seeds from endSeason crosses): plant-brief -> shared model-build -> plant-grow -> shared model-verify -> shared model-ship, with the run ledger, retries and fallbacks like weekly-visitor. Never ships an unverified plant; never publishes the live board without asking.
---

# Season seeds

Mirror of `weekly-visitor` for plants. Paths relative to `models/`. How 3D seeds relate to the SVG plots: SPEC.md, Garden, "3D seed species".

0. Preflight `models/shared/tools/doctor.sh`; start a ledger: `python3 models/shared/tools/ledger.py start <YYYY>-s<N> --builds 6 --minutes 60` (per seed; the ledger enforces it, never count in your head).
1. Inputs: current biome (habitat state reported to `checks/labs_reef`; else ask) and its `biomes.json` entry; `game.js` `RULES.garden` (stages, `seasonWeeks`, rarity thresholds); roster plants already in that biome. Default: 1 new common species per biome per season, plus one per hybrid cross that `endSeason` produced (parents + weight).
2. Per seed: `plant-brief` → `model-build` (`blender -b --factory-startup --python shared/blender/build.py -- plant/specs/<id>.json --run <run_id>`; this also rigs, animates and exports) → `plant-grow` (check + fix loop) → `model-verify` (shared gates + `plant/qa.py`, 3 fresh judges recorded in the ledger) → `model-ship` (roster entry `"kind": "plant"`, `biome`, `window.LB_PLANTS['<id>']`).
3. Retries/fallbacks as in weekly-visitor: route fix notes to the step that owns them; safe path = `stem_bloom` with a known-good param set (e.g. `plant/specs/mermaids_cup.json` reshaped); else quarantine `out/quarantine/<id>/` and ship nothing.
4. Report: new seeds, hybrids, gates, ledger status. Shipping adds files to the repo only; publishing to the live board is a separate step that needs the owner's yes.

Still open: a plant golden + `plant/qa_calibration.json` (until then G5 judges have no plant side-by-side), and the `garden.js` hookup that shows roster plants in plots.
