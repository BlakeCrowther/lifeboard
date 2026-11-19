# Lifeboard Game Spec

The source of truth for lifeboard's game: habits grow a **garden**, the daily task ring grows the **habitat**, and **lessons** bring both to life. Claude reads this before building any of it.

Moved here from the "Lifeboard Game Spec" doc on Nov 18, 2026; that doc is frozen and points here.

## How this spec stays true

- **Mechanics live in two places only: this file and `game.js`.** Every tunable number is in `RULES` in `game.js`. This file names each one in code formatting as the RULES path, an equals sign and the value (for example `garden.seasonWeeks = 4`), and `node tools/spec-check.js` fails if a number here differs from `RULES`, or if a `RULES` entry is never mentioned here.
- **Same change, same commit.** A change to how the game works (a rule, a reward, a number, a new mechanic) updates this file in the commit that changes the code. A mechanic that exists only in the UI, or only here without a **Status** saying it isn't built, is a bug.
- **UI is free to differ; mechanics are not.** Layout, colours, wording and animation can vary between copies of lifeboard. What earns what, and when, cannot.
- Each section carries a **Status**: *Built*, *Partly built* (what's missing is listed) or *Planned*.

## Core rules

**Status:** Built, except parts of lessons (see Lessons).

Each input drives exactly one thing, so no system can game another.

| Input | Drives | Never touches |
| --- | --- | --- |
| Habit sessions vs floor and target | Garden: plant growth, health, seeds | Habitat, lessons |
| Daily ring % (tasks) | Habitat: growth, phases, biomes | Garden, lessons |
| Lessons answered | Life in the scenes: creatures feeding, pollinators, book species; a perfect lesson week's rare visitor | Growth, health, ring % |

- **Game start.** The game starts at zero on the day Labs is first turned on (`labs_state/game.started`, written once). History before that is ignored; tasks already overdue then count as overdue from that day. The garden opens on the first Monday on or after the start; until then every plot is a seed and the Habits card says when season 1 starts.
- **Derived, not stored.** All game state (plants, seasons, seeds, habitat phase, biomes, dioramas, visitors due) is recomputed from db history on every load by `deriveGame` in `garden.js`. Only things that can't be recomputed are stored: the start date, titles and notes you write (`labs_keepsakes`), and visitors met (`visitors_met`). *Planned:* freezing closed days and weeks (`days`, `week_results`) so later edits, like a rescheduled task or a changed floor, never rewrite the past. Until then, a changed floor or target re-scores past weeks.
- **Surprises are decoration only.** They show up at reward moments and never change numbers.
- **Claude suggests, never changes.** Weekly-job suggestions need a tap to apply.
- **Display (Labs):** the habitat scene sits at the top of Today, with the habit plants under it in the same column. Grow → Collection holds dioramas and pressed plants (and, when built, finished lesson sources).

## Garden (habits)

**Status:** Built. Not built: herbarium titles and notes written by Claude (you can name and caption pressed plants yourself), seed placement menu, grace token.

One plant per habit, one species per habit (`daisy`, `tulip`, `sunflower`, `mushroom`, `cactus`, `fern`, `bonsai`, `lavender`, no repeats until all are used). It grows one stage per week you hit the floor, and dies the first week you don't.

**Inputs** come from fields habits already have: `streak_floor_per_week` (floor) and `target_per_week` (target).

| Week result | Effect |
| --- | --- |
| Below floor | Dies (a seed that hasn't sprouted just waits). Stays dead until the season ends. |
| Floor met | Grows one stage |
| Target met | Grows one stage, counts a target week |
| Above target | Grows one stage, counts a target week and 1 flourish |

**Stages** `garden.stages = ["seed","sprout","leafy","bud","bloom"]`, one per floor week. A season is `garden.seasonWeeks = 4` weeks, which takes a seed to bloom with no slack.

- No wilt step: `garden.wilt = false` (a first miss kills).
- Dead plots stay dead until next season: `garden.replant = false`.

**Season end:**

1. Season score per plant = flourishes + target weeks.
2. A plant that bloomed earns a seed; rarity from score: heirloom at `garden.rarity.heirloom = 4`, exotic at `garden.rarity.exotic = 7`, otherwise common.
3. A plant that died earns a common seed and leaves compost: the next seed in that plot starts already sprouted.
4. Neighbouring plants (habit order) that both bloom cross: each one's seed becomes a hybrid carrying the other's species.
5. Any seed has a `garden.mutation = 0.05` chance to mutate (odd colour, decoration only).
6. Every finished plant, bloomed or withered, becomes a **pressed plant** in Grow → Collection, where you can give it a title and note.

The season's random rolls are seeded from the habit key, so every reload agrees.

**Not built:** pick-your-seed placement (random for now), grace token (off for season 1; revisit after seeing how often weeks get missed), Claude-written titles and notes for pressed plants.

## Habitat (rings and tasks)

**Status:** Partly built. Built: Growth from the ring, adaptive phases, 8 biomes, dioramas, weekly visitor, murk, algae, bleaching. Not built: ring = done ÷ committed (the ring is still done ÷ a fixed goal of 3), overdue visitor drops, Claude-written diorama titles. Claude-invented biomes: built as the `biome-brief` skill, run by `weekly-visitor`.

Every day earns **Growth** from the day's ring %, and Growth moves the current biome through its phases. Biomes take as long as they take, independent of the garden calendar.

**Ring % = done ÷ committed** (*Planned*). Today the ring is tasks done ÷ a fixed goal of 3 (`RING_GOAL` in `app.js`), and a day with nothing done and nothing due is neutral. The planned rule:

- Committed = tasks due today + overdue tasks you pull into today with a **Today** tap.
- Overdue tasks sit in an Overdue pile. They don't count against the ring; they cloud the water.
- A pulled-in task counts for that day only. If it isn't done, it's a miss for that day and drops back to the pile the next morning; nothing is auto-committed.
- A task added and finished the same day adds 1 to both sides, so the ring moves a little (3/4 = 75% becomes 4/5 = 80%).
- A day with nothing committed is neutral: no Growth, no penalty, ignored by bleaching.

**Growth per day:** ring % × `tide.perPct = 10`, plus `tide.fullBonus = 5` for a full ring.

**Phase pacing is adaptive.** Each biome has `tide.phases = 5` phases. Thresholds come from your average Growth over the last `tide.trailingDays = 28` days, set so a biome takes `tide.targetWeeks = 4.5` weeks at your usual pace. Before there's history, the pace is `tide.defaultDaily = 9` Growth a day.

**Biomes** (`models/biomes.json`, in order; after the last, they repeat):

| # | Biome | Medium |
| --- | --- | --- |
| 0 | Coral shallows | water |
| 1 | Kelp forest | water |
| 2 | Tide pools | water |
| 3 | Mangrove edge | water |
| 4 | Twilight deep | water |
| 5 | Wildflower meadow | land |
| 6 | Cloud canopy | air |
| 7 | Jungle understory | land |

Each biome owns its shapes, palette, creatures and plants (`look` in `biomes.json`; rules in `models/STYLE.md`), and each phase adds that biome's own things. When the list runs out, the weekly job invents the next biome (`biome-brief`, validated by `models/shared/tools/check_biome.py`): it runs when the habitat is on its final phase and the next biome has no entry, or the habitat is already in a biome with no entry. The board reports its biome and phase to `checks/labs_reef` for this. Restarting with fresh biomes (`game-reset`) archives every biome and creature (`models/*.archive.json`) so every one is invented, biome 0 included; until then the habitat shows a plain "Uncharted" water scene. Biome design needs no Blender; creatures do.

Finishing the last phase saves the biome as a **diorama** (biome, days taken, full days, Growth earned) and starts the next. Dioramas show in Grow → Collection with a title and note you can edit. *Planned:* Claude names the run and sums it up.

**Visitors** (species come from the current biome's pool in `models/roster.json`; each week's visitor is logged to `visitors_met`):

| Tier | Earned by | Status |
| --- | --- | --- |
| Common | Any week the habitat isn't bleached | Built |
| Rare | `visitor.fullDaysForRare = 6` full rings in a Mon–Sun week | Built |
| Rare | A perfect lesson week (see Lessons) | Planned |
| Rare | Finishing a task `visitor.rareOverdue = 7`+ days overdue | Planned (rule in `game.js`, not wired) |
| Legendary | Finishing a task `visitor.legendaryOverdue = 30`+ days overdue | Planned (rule in `game.js`, not wired) |

Overdue drops are capped: `visitor.overdueDropsPerWeek = 1` a week and `visitor.legendaryPerBiome = 1` legendary per biome.

**Water and algae** (both gradual, both reverse as you clear tasks):

- **Murk** = how many tasks are overdue: each tints the water, fully murky at `tide.cloudyAt = 10` (1 task 10%, 5 tasks 50%).
- **Algae** = how long tasks have been neglected: tasks overdue `tide.algaeAfter = 7`+ days grow algae; `tide.algaeAt = 10` such tasks cover it.
- **Bleaching** (separate) = your rings, not your backlog. An average ring below `bleach.below = 0.25` over `bleach.days = 14` days bleaches the scene grey; it recovers when the average over `bleach.recoverDays = 7` days reaches `bleach.recoverAt = 0.5`. No visitors while bleached. It never dies.

## Lessons

**Status:** Partly built. Built: formats, ladder, daily deck, spaced repetition (per-source intervals), card actions, the habitat chip and deck (Labs), feeding/hiding, the lesson-making skill (`.claude/skills/lesson-make`). Planned: perfect lesson week, finish rewards, Collection trophy, book species, weekly rewrite of flagged lessons, pollinators.

Short daily lessons from books, videos, posts, courses and notes, resurfacing on a spaced schedule; doing them brings the scenes to life.

**Formats (start with three):**

| Format | What you do | Effort |
| --- | --- | --- |
| Tap | Read a quote or idea, tap "got it" | ~5 s |
| Recall | Fill a blank, or pick from 3 choices | ~10 s |
| Apply | Free-form one line: where could you use this today? | ~30 s |

Later candidate: **Scenario** (a short situation; pick which idea applies). Dropped: Connect, merged into Apply.

**Ladder per source:** each source picks which formats its lessons climb through, in order, and a lesson's format follows its level instead of staying fixed. A book might go Tap → Recall → Apply; Spanish skips Tap and goes Recall → Apply. A new lesson starts on the first rung; advancing moves it up a rung and lengthens the interval; a miss drops it a rung and brings it back sooner. The lesson-making skill sets the ladder and writes a prompt for every rung of every lesson.

**Feedings:** `lessons.feedings = 2` decks a day of `lessons.perFeeding = 5` lessons each, shuffled. The waking day `lessons.dayStart = 6` to `lessons.dayEnd = 22` (hours, Pacific) splits evenly between feedings (default: before 2 pm, after 2 pm); before the start counts as the first, after the end as the last. Reviews that are due come first, then new lessons. Never more than `perFeeding` per feeding: cards answered earlier in the same feeding count toward it, and a missed feeding doesn't carry over. Per-board override: `checks/lesson_rules` `{ value: { feedings, perFeeding, dayStart, dayEnd } }` (an old `{ deck }` sets `perFeeding`).

**Spaced repetition:** each lesson tracks its level. Advancing brings it back after `lessons.intervals = [3,7,21]` days for levels 1, 2 and 3; advancing past the last level **graduates** it. A source can set its own `intervals` (any length, e.g. quotes `[7,30,90]`, a language `[1,3,7,14]`); the lesson-make skill picks them by type. A missed Recall drops a level (never below the first rung) and comes back after that level's interval, or tomorrow on the first rung.

**Where it shows:** a "N lessons ▾" chip on the habitat (Labs) while any are due. Tapping it drops the deck over the water, one card at a time, about 2 minutes for 5 cards (a full-screen modal on phones). Each answered card feeds the scene. Nothing due: no chip.

**Perfect lesson week:** finishing the deck every day Monday to Sunday guarantees next week's visitor is rare or better. It adds to the full-ring rule, so a week can earn it either way.

**Card actions** (no need to message Claude):

| Action | Shown on | Effect |
| --- | --- | --- |
| Got it / Save | Tap, Apply | Advance one level |
| Answer | Recall | Auto-graded: right advances, wrong drops a level |
| Again | All | Keep the same level, comes back on the same interval |
| Drop | All (overflow menu) | Remove from the pool; counts as resolved for finishing the source |
| Skip today | All (overflow menu) | Back tomorrow, no level change |
| Flag | All (overflow menu) | Marks it unclear; the weekly job rewrites it |

**Lessons per source** = size × salience. Claude rates both when making lessons.

| Source type | Lessons | Finish reward |
| --- | --- | --- |
| Blog post, short video | 3–5 | Small: a shell or flower |
| Long article, talk, podcast | 4–8 | Small |
| Book | 10–25 | Big: a named species |

**Finished** = every lesson from the source has graduated or been dropped.

**Collection trophy:** a finished source joins Grow → Collection as a tile beside dioramas and pressed plants: title, type, dates started and finished, lessons graduated, and its finish reward. Tapping it opens the same closer-look modal, with a title and note you can edit.

**Book species:** a finished book hatches a habitat creature named after it (e.g. *Somatic Seahorse*) and a matching plant in Collection with a distinct foil skin and its best quote. Books only.

**Scene effects (decoration only):**

- Water biomes: lesson = fish food. Fish swim over, eat, glow and school. No lessons for `lessons.hideAfter = 3` days: creatures play their `sulk` loop and tuck in behind their shelter (`spec.habitat.shelter`, else `anchor`, else the nearest rock), never die; food (a lesson) brings them out. `LBLabs.lessonDone` logs `logs` kind `lesson` and drops food; hiding stays off until the first lesson is logged.
- Skipped breaks (break overlay, `break/`): each skip costs `breaks.skipCost = 5` growth (never below the current phase; per-board override in `checks/break_rules`), and creatures play their `sulk` loop for the rest of that day.
- Garden and land biomes: lesson = pollinators. Bees, butterflies, a hummingbird; flowers sway.
- Variety: a pool of ~8 animations per scene, picked at random, plus biome- and season-specific ones. Repeats are fine.

**Making lessons:** a lesson-making skill in this repo. You hand it a book, link, transcript, quote, course or note; it interviews you about what mattered and what you want to be able to do, or with "do it for me" works from the source alone. It rates size and salience, picks the source's ladder, writes the summary and lessons with a prompt per rung, and adds rows to `sources` and `lessons`. It shows the queue length first, since 2+ books a month backs up the deck.

## Surprises

**Status:** Partly built. Built: mutations. Planned: everything else.

Random, decorative, and never change numbers. Rare visitors are earned, so they're not in this list; lesson animations (Lessons) cover everyday critters like bees and hummingbirds.

| Surprise | What it is | Status |
| --- | --- | --- |
| Mutations | ~5% of seeds sprout an odd colour or pattern (`garden.mutation`) | Built |
| Notes from Claude | 1–2 lines a week from the weekly job, tied to what happened ("a crab moved into the shell you found Tuesday") | Planned |
| Real-world scene changes | The scene mirrors real conditions from lifeboard's snapshots: rain when it rains, a glowing night on an actual full moon, a big swell on a big surf day | Planned |
| Weekly event | The weekly job picks one event for one named day next week, e.g. "Thursday: coral spawning night" or "Saturday: monarch migration". Shown only that day | Planned |

**Milestones (permanent unlocks, Planned):**

| Milestone | Unlock |
| --- | --- |
| 10 straight floor weeks on a habit | A new plot shape for that habit's plant |
| 3 dioramas | You choose the next biome (or ask Claude to invent one) instead of the next in the list |

## Weekly job and season review

**Status:** Planned. What exists: the `weekly-visitor` skill and its scheduled-task template (`.claude/scheduled/weekly-visitor.md`, not registered), which builds that week's visitor creature model. Nothing writes reports yet.

One Claude routine runs Sunday evening, reads its own past reports, and writes this week's report into the db.

**Every week:**

1. Writes 1–2 notes from Claude for the scenes.
2. Suggests habit tweaks only after 4+ weeks of a pattern: above target → raise floor or target; floor barely met → lower it. It weighs how hard the habit is to scale (drumming yes, long runs maybe not). Tap to apply. (The Grow → Habits page already shows a raise/lower verdict per habit from the same pattern.)
3. Rewrites Recall lessons missed twice, and any flagged lesson, into a new format. Tap lessons are left alone.
4. Picks next week's event and its day (see Surprises).
5. Invents a new biome when the list runs out, unless you've unlocked choosing.

**On the last week of a garden season, it also:**

1. Writes a season review: per-habit weeks met, flourishes, deaths, seeds earned, pressed plants added, habitat phases reached, lessons graduated.
2. Lists seasonal actions: seeds to plant, hybrids formed, compost plots.
3. Notes the grace-token question after season 1.

## Where it lives

Everything sits in the lifeboard artifact db; no hippocampus dependency. Claude can query it with `ArtifactData`.

**Built collections** (Labs-only ones are optional: `store.js` never listens to them):

| Collection | Holds |
| --- | --- |
| `habits` | Floor, target (existing) |
| `habit_sessions` | Sessions by date (existing) |
| `tasks` | Due, deadline, status, completed_at (existing) |
| `labs_state` | `game.started`: the day the game began |
| `labs_keepsakes` | Your title and note per diorama or pressed plant |
| `visitors_met` | One doc per creature per week: creature, biome, week, rarity |
| `sources` | Book, video, post, course or note: title, type, size, salience, ladder, summary, status (active / paused / finished) |
| `lessons` | Source id, level, a prompt and answer per rung, next due, state (active / graduated / dropped), flagged |
| `lesson_answers` | Each answer and action, incl. Apply and typed Recall text |

**Planned collections:**

| Collection | Holds |
| --- | --- |
| `tasks.committed_on` (new field) | Dates the task was pulled into Today |
| `days` | Frozen per day: committed ids, done ids, ring %, Growth |
| `week_results` | Frozen per habit per week: count, floor, target, result (died / floor / target / above) |
| `reports` | Weekly and season reports, notes, events |

Seeds, plantings, the herbarium, the habitat and dioramas were planned as stored collections; they're derived from history instead (see Core rules) and only need storing if derivation stops being enough.

**Code:** private repo `BlakeCrowther/lifeboard`. Rules: `game.js`. Derivation and Collection UI: `garden.js`. Scene: `habitat.js`. Balance simulation: `sim/run.js`.

## Simulation

Before building UI, the rules became one pure module (`game.js`, no DOM, like `logic.js`) and `node sim/run.js` runs it against made-up people for 26+ weeks to find gaps and tune numbers.

**Personas (seeded random, so runs repeat):**

| Persona | Habits | Tasks |
| --- | --- | --- |
| Steady | Hits floor ~90% of weeks, target ~50% | Ring 70–100% most days |
| Bursty (ADHD) | Great weeks then 1–2 week gaps | Some 100% days, some 0% |
| Slump and recover | Normal, 3-week slump in month 3 | Same pattern |
| Overachiever | Above target most weeks | Ring ~100%, few tasks a day |
| Light user | 2 habits, low floors | 1–2 tasks a day, big overdue pile |

**What each run reports:**

- Garden: deaths per season, blooms per season, seed rarity mix, hybrids, compost plots.
- Habitat: weeks per biome (target 3–6), rare and legendary visitors per month, days of cloudy water, bleaching events.
- Lessons: deck backlog over time at 1, 2 and 4 books a month; days to finish a book; graduation rate.
- Exploits: e.g. does adding and finishing tiny tasks inflate rings? Does a low floor make death impossible?

**Pass criteria:** every persona sees at least one bloom per season and one rare visitor per month; bursty and slump personas can die but recover within one season; no persona maxes everything without effort; the lesson backlog stays flat at the expected ingest rate.

**Two passes:**

1. **Numbers (no Claude):** pure seeded statistics, so every run is repeatable and comparable after a tweak. Claude's jobs are stubbed with plain rules, which is safe because Claude never changes numbers.
2. **Playtest (Claude in the loop):** feed a few simulated weeks to the real weekly-job prompt and read what it writes. Judges tone and variety, not balance. *Not run yet.*

**Run 1 results** (200 seeds × 28 weeks; real habit data from the snapshot used as a cross-check):

| Finding | Numbers | Proposed fix |
| --- | --- | --- |
| A 4-week season leaves zero slack: one missed floor week anywhere means no bloom | Steady persona blooms 1.7 of 4 plants a season | Add a wilt step and 5-week seasons → 3.0 of 4 |
| A plot sits dead for the rest of the season after a death | 30% of plot-weeks dead (steady) | Replant a common seed the next week → 12% (2% with wilt) |
| Clearing very old tasks farms visitors | Steady: 4.3 rare + 2.9 legendary a month from overdue clears; perfect weeks give only 0.7 | Cap overdue drops at 1 a week, legendary at 1 per biome |
| Lesson deck can't keep up | 3 a day + 1 book a month: backlog grows to ~90; a book takes ~106 days | Deck of 5 and intervals 3-7-21 → backlog ~8, a book in ~80 days. 2 books a month still backs up |
| First biome is too fast | Default pace 6 pts/day; real pace ~11 → first biome 2.6 weeks | Default 9 pts/day; later biomes already land at 4.6 weeks |
| Tiny same-day tasks | No real gain: adaptive pacing absorbs it | None needed |
| Cloudy water almost always on | Cloudy 76% of days at a 10-task threshold | Raise to 20 or scale to the person's usual pile |

**Update (Nov 18, feedings):** two feedings of 5 a day → at 1 book a month the backlog stays ~0 and a book takes ~71 days (was ~14 and ~82 with one deck); 2 books a month backlog ~6.

**Decision (Nov 18):** strict death kept, 4-week seasons kept, no wilt. Everything else adopted as defaults in `game.js`: dead plots stay dead until next season, overdue rewards capped at 1 a week and legendary at 1 per biome, deck of 5 on a 3-7-21 schedule, starting pace 9 a day, water murk and algae scaled gradually. Re-run: steady still blooms 1.7 of 4 (by design), dead plot-weeks ~30%, about 3 rare and 0.5 legendary visitors a month, first biome 3.9 weeks, lesson backlog flat at 1 book a month.

**Run 2 (task cleanup added):** personas now reschedule or delete overdue tasks at their own rate. Murk = 1 task 10%, 5 tasks 50%.

| Persona | Avg overdue pile | Days 50%+ murky | Days 50%+ algae | Legendary/mo |
| --- | --- | --- | --- | --- |
| Steady | 2.8 | 22% | 5% | 0.02 |
| Slump | 5.9 | 40% | 19% | 0.11 |
| Bursty | 18 | 81% | 66% | 0.36 |
| Light | 20 | 94% | 88% | 0.39 |
| Overachiever | 0 | 0% | 0% | 0 |

Real snapshot at the time: 4 overdue, none 7+ days old → 40% murk, no algae. Steady pace matches; murk reads clearly as "a few things slipping" without being constant.

**Real habits:** 6 of 8 hit the floor every week; Journaling (4/9 weeks) and Guitar practice (3/7) would die nearly every season even at a floor of 1. They need a biweekly cadence option, since the floor can't go lower. Reading beats its target most weeks (4–6 vs 3), so it would earn exotic seeds every season; the tweak suggestion should raise its target.

## Open questions

- [ ] Grace token: decide after season 1.
- [ ] Rare-visitor threshold: 6 full rings; check after 4 weeks of real data.
- [ ] Seed placement: random now; add a pick menu later?
- [ ] Biweekly cadence for hard habits (Journaling, Guitar practice fail even a floor of 1).
- [ ] Freeze closed weeks (`week_results`) before anyone edits a floor or target mid-season, or accept that edits re-score the past.
- [x] Where lesson-making lives: a skill in this repo (decided Nov 18).
- [x] Visual direction for garden and habitat: 3D habitat scene with 8 biomes and SVG plants (built Nov 18).
