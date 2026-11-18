---
name: weekly-visitor
description: Kind: creature (orchestrator). Runs the weekly autonomous habitat visitor: reads the game state, starts the run ledger, then creature-brief -> shared model-build -> creature-animate -> shared model-verify -> shared model-ship with retries and fallbacks, and reports. The weekly scheduled task calls this. Never ships an unverified creature.
---

# Weekly visitor

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Runs unattended. Do not ask the user anything; decide, log, and report.

## 0. Preflight
`models/shared/tools/doctor.sh`. If anything required fails, there's no visitor this week. Report the failing line and point to the lifeboard-setup skill.

## 0b. Start the run ledger
`python3 models/shared/tools/ledger.py start <run_id> --builds 6 --minutes 90` (run_id e.g. `2026-w47`, dry run `dry-<id>-<date>`). The ledger, not you, counts the budget: never track builds or minutes in your head. `ledger.py status <run_id>` whenever you need the numbers (and in the final report).

## 1. Should a visitor come?
Read the game state from the lifeboard artifact db (see AGENTS.md / `game.js`):
- current `biome`;
- this week's visitor result (`weekVisitor` → `rare`, or common by default);
- overdue drops (`overdueReward` → `rare` or `legendary`, capped per week and per biome).

The most rare earned this week wins. If the game says no visitor (for example the habitat is bleached), skip and report why.

## 2. Pipeline (each step is its own skill; pass ids and paths, not prose)
```
creature-brief(biome, rarity) → id
model-build(id) → creature-animate(id) → model-verify(id)
```
Retry loop, driven by `report.json.fix_notes`:
- route each fix note to the step that owns it;
- re-run from that step;
- max 2 retries (3 for a novel archetype).
- **Every** build goes through the ledger: `blender -b --factory-startup --python models/shared/blender/build.py -- <spec> [outdir] --run <run_id>`. Never call build.py without `--run` in a pipeline run.
- A G1 (spec) failure caught before the build (`build.py` runs check_spec first and exits 3) is a brief fix, not a build attempt: it is not recorded and does not count toward the budget.
- `build.py` exits 4 and prints `BUDGET EXHAUSTED` when the ledger says the run is spent: stop immediately, no more builds or retries, go to the "no visitor" branch (quarantine + report). Do not work around it (no build without `--run`, no new run id, no hand-run Blender).
- Verify signature: `models/shared/tools/verify.sh <id> [glb] [spec]` (defaults `out/<id>/<id>.glb`; QA goes to `<glb dir>/qa`).

## 3. Fallbacks (in order)
1. Still failing → brief a **safe-path** variant: proven archetype, new species/palette/params. Run build → animate → verify again (2 retries).
2. Still failing → no visitor this week. Move `out/<id>` to `out/quarantine/<id>/` (dry run: `out/dryrun/quarantine/<id>/`).

## 4. Ship
On PASS → model-ship.

## 5. Report (the run's final message)
- **Visitor arrived:** name, rarity, lore, the contact sheet image, gates passed, and attempts used.
- **No visitor:** the reason, which gate failed and where the quarantine is.
- Always: the `ledger.py status <run_id>` numbers (builds used/max, minutes, judges).
- Always: runtime minutes and the archetype path (safe or novel), plus whether a new archetype joined the library.

Keep it short. The surprise is the point.

## Dry run (`--dry-run <event-json>`)
Tests the whole pipeline on a simulated week without touching anything live.
- Get events with `node sim/run.js 1 28 --visitors=steady:1000`. Pass one event, e.g. `{"week":11,"biome":2,"rarity":"rare"}`, in place of step 1.
- Run steps 2–3 fully: real Blender, real gates, retries and fallbacks.
- **Skip ship.** No roster edit, no commit, no publish. All dry-run work goes in `models/out/dryrun/<id>/` (spec as `spec.json`, build outdir = that folder: `build.py out/dryrun/<id>/spec.json out/dryrun/<id>`), not `creature/specs/` or `out/<id>/`, unless a human promotes it. Verify with `verify.sh <id> out/dryrun/<id>/<id>.glb`. Dry-run quarantine: `out/dryrun/quarantine/<id>/`.
- G6 runs if the habitat page has the `?visitor=` hook; otherwise mark it `"skipped: no runtime hook"` (the dry run still counts as PASS on G1–G5).
- Report like a normal run, plus timings per step and every fix note, so the pipeline itself can be improved.

## Budget
90 minutes of wall time or 6 Blender build attempts in total (pre-build G1 failures don't count), whichever comes first, **enforced by `models/shared/tools/ledger.py`** (`out/runs/<run_id>.json`). `BUDGET EXHAUSTED` from build.py or `ledger.py build` is final for the run. Every G5 judge is recorded with `ledger.py judge` (see model-verify), which refuses a reused judge agent. Judges are cheap (~15 s each) and do not count toward the build budget: each G5 attempt uses 3 fresh judges (median-of-3); the ledger records all of them.
