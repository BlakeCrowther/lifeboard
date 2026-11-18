---
name: season-seeds
description: Kind: plant (orchestrator, OUTLINE). Each garden season, introduce new seed species (and hybrid seeds from endSeason): plant-brief -> shared model-build -> plant-grow -> shared model-verify -> shared model-ship, with the run ledger, retries and fallbacks like weekly-visitor. Never ships an unverified plant. Not runnable until a plant archetype exists.
---

# Season seeds (outline)

Mirror of `weekly-visitor` for plants. Paths relative to `models/`.

0. Preflight `models/shared/tools/doctor.sh`; start a ledger: `python3 models/shared/tools/ledger.py start <YYYY>-s<N> --builds <n> --minutes <m>` (budget TBD; ledger enforces it, never count in your head).
1. Read the garden state (`game.js` `RULES.garden`, season length `seasonWeeks`): how many new species this season, which hybrids `endSeason` produced (parents + weights), rarities.
2. Per seed: `plant-brief` → `model-build` (`build.py --run`) → `plant-grow` → `model-verify` (shared gates + `plant/qa.py`, 3 fresh judges recorded in the ledger) → `model-ship` (roster entry `kind: "plant"`).
3. Retries/fallbacks as in weekly-visitor (route fix notes; safe-path variant; else quarantine `out/quarantine/<id>/`).
4. Report: new seeds, hybrids, gates, ledger status.

Open items before this can run: first plant archetype, plant golden + `plant/qa_calibration.json`, runtime garden hook (`garden.js`), budget numbers.
