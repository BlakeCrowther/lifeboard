---
name: season-seeds
description: Kind: plant (orchestrator). Makes each garden season's plants, one per plot: hybrids of last season's crosses, then new species for the season's biome: plant-brief -> shared model-build -> plant-grow -> shared model-verify -> shared model-ship, with the run ledger, retries and fallbacks like weekly-visitor. Never ships an unverified plant; never publishes the live board without asking.
---

# Season seeds

Mirror of `weekly-visitor` for plants. Paths relative to `models/`. How 3D seeds relate to the SVG plots: SPEC.md, Garden, "Species per season".

When: once per season, in its first week (`weekly-visitor` step 1c runs it; or by hand). Rules: SPEC.md Garden, "Species per season". A plant only counts for a season if it's in the roster (`added`) by the end of that season's first week (`garden.from` + 6 days); one shipped later serves the next season.

0. Preflight `models/shared/tools/doctor.sh`; per seed, start a ledger: `python3 models/shared/tools/ledger.py start seeds-<garden.from>-<n> --builds 6 --minutes 60` (the ledger enforces it, never count in your head). If a `seeds-<garden.from>-*` run already shipped everything below, stop: this season is done.
1. Inputs: `checks/labs_reef` `value.garden` (`season`, `from`, `week`, `biome`, `plots`, `crosses` = last season's hybrid parent pairs, `last` = species used last season; else ask) and that biome's `biomes.json` entry; `game.js` `RULES.garden`; roster plants of that biome (`added` ≤ `from` + 6 days). Make, in order, until the season has `plots` plants:
   - one hybrid per pair in `crosses` with no roster plant of those `parents` yet (plant-brief "Hybrids", blend weight 0.5);
   - new species for the biome, so the plants not in `last` plus the hybrids cover `plots`.
   No more than `plots`: when builds fail, plots repeat a species this season (no buffer stock needed).
2. Per seed: `plant-brief` → `model-build` (`blender -b --factory-startup --python shared/blender/build.py -- plant/specs/<id>.json --run <run_id>`; this also rigs, animates and exports) → `plant-grow` (check + fix loop) → `model-verify` (shared gates + `plant/qa.py`, 3 fresh judges recorded in the ledger) → `model-ship` (roster entry per `plant/CONTRACT.md` Shipping: `name`, `kind: "plant"`, `biome`, `svg` fallback, `window.LB_PLANTS['<id>']`).
3. Retries/fallbacks as in weekly-visitor: route fix notes to the step that owns them; safe path = `stem_bloom` with a known-good param set (e.g. `plant/specs/mermaids_cup.json` reshaped); else quarantine `out/quarantine/<id>/` and ship nothing.
4. Report: new seeds, hybrids, gates, ledger status. Shipping adds files to the repo only; publishing to the live board is a separate step that needs the owner's yes.

G6 runtime for plants: `test.html#labs` (lifeboard-setup), a plot of the new species renders all five stages (`LBGarden.plotSVG({species:'<id>', stageName, ...}, 150)`), no console errors.
