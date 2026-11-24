---
name: season-seeds
description: Kind: plant (orchestrator). Weekly: makes a 3D plant for each garden plot that needs one (a new habit's plot, or the next plant after one bloomed or died), from checks/game_status garden.needs: plant-brief -> shared model-build -> plant-grow -> shared model-verify -> shared model-ship, with a run ledger per plant, retries and fallbacks like weekly-visitor. Plants still growing are left alone. Never ships an unverified plant; publishes the live board after a PASS (pre-approved).
---

# Season seeds (weekly plants)

Mirror of `weekly-visitor` for plants. Paths relative to `models/`. Rules: SPEC.md Garden ("When a plant finishes", "3D plants, one per plant"). Each plot (habit) grows one plant at a time; when it blooms or dies it shows that for a week, then the next plant goes in. Every plant gets its own species, made here, just in time. No stock is made ahead.

When: every week, after the visitor (`weekly-visitor` step 1c), or by hand.

No spoilers (weekly-visitor "No spoilers"): messages call each plant by its plot and gen, never its species, name or look.

0. Preflight `./setup.sh --check`.
1. Inputs: `checks/game_status` `value.garden` (`season` = calendar season name, `biome`, `needs`; else ask). `needs` = `[{plot, habit, gen, rarity, mutated, biome, sown}]`: one entry per plant with no model yet. Skip an entry whose roster plant (`plot` + `gen`) already exists. Empty → report "no plants needed" and stop. Also read that biome's `biomes.json` entry and the roster's plants.
2. Per entry, in list order (rare seeds first if time is short). **Start this plant's ledger only when you start this plant**, never all up front (they expire together): `python3 models/shared/tools/ledger.py start plant-<plot>-g<gen> --rounds 4 --minutes 30` (the ledger enforces it, never count in your head).
   `plant-brief` (biome, rarity, habit name, season, plot, gen) → `model-build` (`blender -b --factory-startup --python shared/blender/build.py -- plant/specs/<id>.json --run <run_id>`; also rigs, animates, exports) → `plant-grow` (check + fix loop) → `model-verify` (shared gates + `plant/qa.py`, a fresh judge panel recorded in the ledger, verdict from `judge_verdict.py`) → `model-ship` (roster entry per `plant/CONTRACT.md` Shipping, with `plot`, `gen`, `habit`).
3. After a judge-panel PASS run model-verify "Polish rounds". Retries/fallbacks as in weekly-visitor: route fix notes to the step that owns them. Fallback: drop the accessory / novel parts and ship the plain species on the closest proven generator (`stem_bloom`, e.g. `plant/specs/mermaids_cup.json` reshaped). Budget spent without a PASS → ship the best attempt below the bar (weekly-visitor fallback 2: `ledger.py best <run> <id> --below-bar`; automated gates must pass). Only when no build passed the automated gates → quarantine `out/quarantine/<id>/`, move the spec to `plant/specs/quarantined/<id>.json` (`git mv` when tracked), and move to the next entry. The plot keeps its SVG species; next week's run tries again (the entry stays in `needs`).
4. Report: plants shipped (plot, habit, gen, rarity, passed or below bar), gates, ledger status, anything quarantined. No species, name, look or accessory. model-ship publishes the live board (pre-approved; AGENTS.md Publish).
5. Retro (AGENTS.md "Improve as you go"): one line per problem this run hit, and the fix to this skill, plant-brief, a gate or a tool, made in the same commit.

page-test runtime for plants: `test.html#eco` (lifeboard-setup), a plot of the new species renders all five stages in the Garden card (garden package `plotSVG`), no console errors.
