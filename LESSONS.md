# Lessons

One line per lesson: date, what went wrong, what changed (file). Newest first. Read before a skill run or a big change (AGENTS.md "Improve as you go").

- 2026-11-19 Rarity names differed (plants heirloom/exotic, creatures rare/legendary). → One set everywhere: common/rare/exotic; schema still accepts old 'legendary'.
- 2026-11-19 season-seeds started all 8 per-seed ledgers up front; they expired together and nothing shipped. → Start each plant's ledger when that plant starts (season-seeds step 2).
- 2026-11-19 Hybrids and 4-week seasons fought the per-habit design (plots finish at different times; new habits waited for a season). → Per-plot lifecycle, calendar seasons, no hybrids (game.js plotWeek, SPEC.md Garden).
- 2026-11-18 Judges scored good creatures under the golden's own bar (golden itself varies 3.17–3.67). → Open: calibrate with 5 judges and bar 3.17 (models/creature/qa_calibration.json).
- 2026-11-18 Briefs defaulted to reusing archetypes; little variety. → Novel-first briefs, a generator per species, polish rounds after G5 (creature-brief, weekly-visitor).
- 2026-11-18 A branch committed the artifact service's wrapper lines into index.html. → Strip wrapper lines before publishing/committing pages pulled from the live artifact.
- 2026-11-19 The game start (`labs_state/game`) was a one-shot onSnapshot read; an early empty or error read rewrote it to today on many loads (version 58), so yesterday's life points vanished. → Start lives in store-tracked `game_state`, read only after the db is ready, and is only created when missing (app.js `gameStart`).
