---
name: weekly-visitor
description: Kind: creature (orchestrator). Runs the weekly autonomous Ecosystem visitor: reads the game state, starts the run ledger, then creature-brief -> shared model-build -> creature-animate -> shared model-verify -> shared model-ship with retries and fallbacks, and reports. The weekly scheduled task calls this. Never ships an unverified creature.
---

# Weekly visitor

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Runs unattended. Do not ask the user anything; decide, log, and report.

**No spoilers.** The board reveals each new model; nothing else may. In every message the user can read (progress updates, the final report, questions), call the visitor "this week's visitor" (`<run_id>` visitor) and a plant by its plot ("the Drumming plot's plant, gen 0"). Never write its species, common name, `name`, `lore`, colours, body plan, parts or any hint of them, and don't attach or link its contact sheet or renders. Ids and names stay in files, ledgers, commit bodies and judge prompts. Gate results, scores, budgets and fix notes are fine when the fix notes are summarised by criterion ("species_read: denser outgrowths" is a hint: say "species_read low").

## 0. Preflight
`./setup.sh --check`. If anything required fails, there's no visitor this week. Report the failing line and point to the lifeboard-setup skill.

## 0a. Live drift check
`pnpm build`, then pull the files `pnpm live-diff --list` names from the live artifact (Artifact `read` with `paths`, `out_dir` under the scratchpad) and run `pnpm live-diff <dir>`. Exit 0: live matches `main`. Exit 1 on a clean `main` checkout: live is stale (a merge never got published); publish it (AGENTS.md "Publish", pre-approved) and say so in the report. If a differing file is one `main` never had (live-only edit), port it first or stop and report; never overwrite it.

## 0b. Start the run ledger
`python3 models/shared/tools/ledger.py start <run_id> --rounds 4 --minutes 30` (run_id e.g. `2026-w47`, dry run `dry-<id>-<date>`). The ledger, not you, counts the budget: never track builds or minutes in your head. `ledger.py status <run_id>` whenever you need the numbers (and in the final report).

## 1. Should a visitor come?
Read the game state from the lifeboard artifact db (see AGENTS.md / `src/packages/game/`). The board writes the Ecosystem's status to `checks/game_status` whenever it changes: `value = { biome, phase, phases, bleached, dioramas, visitor, visitorWeek }` (ArtifactData `get`). If it's missing, try the old name `checks/labs_reef` (boards before Nov 19 2026); if both are missing (the game was never opened), use biome 0 and common.
- current `biome`;
- this week's visitor result (`value.visitor`: `rare`, `common`, or null when bleached);
- overdue drops (`overdueReward` → `rare` or `exotic`, capped per week and per biome).

The most rare earned this week wins. If the game says no visitor (for example the Ecosystem is bleached), skip and report why.

## 1b. New biome?
If `models/biomes.json` has no entry for `biome`, or `phase == phases - 1` (final phase) and there is no entry for `biome + 1`: run **biome-brief** for that id first (it validates with `check_biome.py`). It doesn't count toward the build budget. If it fails twice, report it and brief this week's creature for the current biome as usual. A biome brief needs no visitor: run it even when the Ecosystem is bleached.

## 1b2. Biome scenery
Right after 1b (and every week): if the current biome (or the one biome-brief just made) lists `scenery` ids or a `neglect.blight` id with no roster entry of kind `scenery`, run **scenery-make** for them. Own ledger per piece; it doesn't spend the visitor's budget. A biome with no `scenery` uses its `scene` builder and needs nothing.

## 1c. Garden plants
Every week: if `checks/game_status` `value.garden.needs` is non-empty, run **season-seeds**. It runs one subagent per plant in parallel, each with its own ledger (`plant-<plot>-g<gen>`), so it doesn't spend the visitor's budget. Spawn its plant subagents right after step 1 (they run in the background), run the visitor's pipeline meanwhile, and do season-seeds step 3b when they return: the plants and the visitor share the machine's build slots (`shared/tools/slots.py`) instead of the plants waiting for the visitor to finish. Commit its plants on the same branch; one republish covers both.

## 2. Pipeline (each step is its own skill; pass ids and paths, not prose)
```
creature-brief(biome, rarity) → id
model-build(id) → creature-animate(id) → model-verify(id)
```
Retry loop, driven by `report.json.fix_notes` (fix the cause: a trait the judges say is missing gets built into the species generator, not approximated with parameters):
- route each fix note to the step that owns it;
- re-run from that step;
- max 2 retries (3 for a novel archetype).
- **Every** build goes through the ledger: `blender -b --factory-startup --python models/shared/blender/build.py -- <spec> [outdir] --run <run_id>`. Never call build.py without `--run` in a pipeline run.
- A spec-check failure caught before the build (`build.py` runs check_spec first and exits 3) is a brief fix, not a build attempt: it is not recorded and does not count toward the budget.
- `build.py` exits 4 and prints `BUDGET EXHAUSTED` when the ledger says the run is spent: stop immediately, no more builds or retries, go to fallback 2 (ship the best attempt below the bar) or, if no build passed the automated gates, fallback 3 (quarantine + report). Do not work around it (no build without `--run`, no new run id, no hand-run Blender).
- Verify signature: `models/shared/tools/verify.sh <id> [glb] [spec]` (defaults `out/<id>/<id>.glb`; the glb must be in `out/<id>/` or `out/dryrun/<id>/`, and QA goes to that folder's `qa/`).

## 3. Fallbacks (in order)
1. Still failing → if the first attempt was **novel**, keep the species idea and simplify the new archetype once (fewer parts, proven rig pieces from lib.py) before giving up on it. Only then brief a **safe-path** variant: proven archetype, new species/palette/params, and a species the archetype can genuinely express (not a recolor of a past miss). Run build → animate → verify again (2 retries).
2. Budget spent and still no PASS → **never empty-handed**: ship the best attempt anyway. `ledger.py best <run_id> <id> --below-bar` names the highest-mean judged build (it refuses while budget remains or when a build passed); restore it into `out/<id>/` if it isn't the latest, set `report.json` `"pass": false, "shipped_below_bar": true` and run model-ship. Every automated gate (spec, shape, motion, export, page-test) must still pass on that build: they guard a model that loads and behaves, the judges only grade looks.
3. No build passed the automated gates at all (nothing loadable to show) → no visitor this week. Move `out/<id>` to `out/quarantine/<id>/` and the spec to `creature/specs/quarantined/<id>.json` (`git mv` when tracked), so no later brief or check treats it as live (dry run: move `out/dryrun/<id>/`, spec included, to `out/dryrun/quarantine/<id>/`).

## 3b. Polish rounds
model-verify "Polish rounds" (shared by every kind).

## 4. Ship
On PASS (after polish) → model-ship the best version. Budget spent without a PASS → model-ship the best attempt (fallback 2), marked below bar.

## 5. Report (the run's final message)
- **Visitor arrived:** rarity, gates passed, attempts used, and whether it passed the judges or shipped below the bar (with its mean). No name, lore, look or contact sheet (see No spoilers): the board is the reveal.
- **No visitor:** the reason, which gate failed and where the quarantine is (path only).
- Always: the `ledger.py status <run_id>` numbers (builds used/max, minutes, judges).
- Always: runtime minutes and the archetype path (safe or novel), plus whether a new archetype joined the library.

Keep it short. The surprise is the point.

## Dry run (`--dry-run <event-json>`)
Tests the whole pipeline on a simulated week without touching anything live.
- Get events with `pnpm -s sim 1 28 --visitors=steady:1000`. Pass one event, e.g. `{"week":11,"biome":2,"rarity":"rare"}`, in place of step 1.
- Run steps 2–3 fully: real Blender, real gates, retries and fallbacks.
- **Skip ship.** No roster edit, no commit, no publish. All dry-run work goes in `models/out/dryrun/<id>/` (spec as `spec.json`, build outdir = that folder: `build.py out/dryrun/<id>/spec.json out/dryrun/<id>`), not `creature/specs/` or `out/<id>/`, unless a human promotes it. Verify with `verify.sh <id> out/dryrun/<id>/<id>.glb`. Dry-run quarantine: `out/dryrun/quarantine/<id>/`.
- page-test runs if the Ecosystem page has the `?visitor=` hook; otherwise mark it `"skipped: no runtime hook"` (the dry run still counts as PASS on the first five gates).
- Report like a normal run, plus timings per step and every fix note, so the pipeline itself can be improved.

## Budget
4 judge rounds (a counted build the judges saw), 30 minutes of wall time (less time queued for a build slot, `shared/tools/slots.py`), or rounds + 2 counted builds, whichever comes first (uncounted `preflight.sh` trial builds and pre-build spec-check failures don't count), **enforced by `models/shared/tools/ledger.py`** (`out/runs/<run_id>.json`). `BUDGET EXHAUSTED` from build.py or `ledger.py build` is final for building (no more builds); the run then ships its best attempt (fallback 2). Every judge is recorded with `ledger.py judge --reply` (see model-verify), which refuses a reused judge agent; `judge_verdict.py` gives the verdict. Judges are cheap (~15 s each) but each judge round counts toward the round budget: each judge-panel attempt uses a fresh panel (size: the kind's `pass_rule.judges`); the ledger records all of them.
