# Lifeboard Game Spec

The source of truth for lifeboard's game: habits grow a **garden**, the daily task ring grows the **ecosystem** (called the habitat in code, `habitat.js`; renamed so it doesn't read like "habit"), and **lessons** bring both to life. Claude reads this before building any of it.

Moved here from the "Lifeboard Game Spec" doc on Nov 18, 2026; that doc is frozen and points here.

## How this spec stays true

- **Mechanics live in two places only: this file and `game.js`.** Every tunable number is in `RULES` in `game.js`. This file names each one in code formatting as the RULES path, an equals sign and the value (for example `garden.bloomWeeks = 1`), and `node tools/spec-check.js` fails if a number here differs from `RULES`, or if a `RULES` entry is never mentioned here.
- **Same change, same commit.** A change to how the game works (a rule, a reward, a number, a new mechanic) updates this file in the commit that changes the code. A mechanic that exists only in the UI, or only here without a **Status** saying it isn't built, is a bug.
- **UI is free to differ; mechanics are not.** Layout, colours, wording and animation can vary between copies of lifeboard. What earns what, and when, cannot.
- Each section carries a **Status**: *Built*, *Partly built* (what's missing is listed) or *Planned*.

## Core rules

**Status:** Built, except parts of lessons (see Lessons).

Each input drives exactly one thing, so no system can game another.

| Input | Drives | Never touches |
| --- | --- | --- |
| Habit sessions vs floor and target | Garden: plant growth, health, seeds | Ecosystem, lessons |
| Daily ring % (tasks) | Ecosystem: growth, phases, biomes | Garden, lessons |
| Lessons answered | Life in the scenes: creatures feeding, pollinators, book species; a perfect lesson week's rare visitor | Growth, health, ring % |

- **Week start.** Habit weeks (streaks, the garden, the weekly check message) start on one board-wide day, `checks/week_start` (0 Sunday … 6 Saturday, default 1 Monday). `lifeboard-setup` asks for it; it's usually the same day as the weekly check. Every habit uses it, so nothing is asked per habit.
- **Game start.** The game starts at zero on the day the game is first turned on (`game_state/game.started`, written once and never overwritten; `game_state` is store-tracked so it is read only after the db fully loads). History before that is ignored; tasks already overdue then count as overdue from that day. The garden opens on the first week-start day on or after the start; until then every plot is a seed and the Habits card says when the garden opens.
- **Derived, not stored.** All game state (plants, seeds, ecosystem phase, biomes, dioramas, visitors due) is recomputed from db history on every load by `deriveGame` in `garden.js`. Only things that can't be recomputed are stored: the start date, titles and notes you write (`keepsakes`), and visitors met (`visitors_met`). Task commitments are recorded as they happen (`tasks.committed_days`, see Ring %), so rescheduling never rewrites a past day's ring. *Planned:* freezing closed weeks (`week_results`) so a changed floor or target never re-scores past weeks.
- **Surprises are decoration only.** They show up at reward moments and never change numbers.
- **Claude suggests, never changes.** Weekly-job suggestions need a tap to apply.
- **Display:** (Ecosystem and Garden each have an on/off toggle in the display menu, both on by default, synced board-wide via `checks/ui_prefs`) Today's first column is the ring card, which holds the task lists (tap a day's ring for that day: today's lists, or a past day's Done and Missed); the second column has the Lessons card, the ecosystem scene right under it, then the habit plants. On phones the task lists start folded so the scene stays near the top. Grow → Collection holds dioramas and pressed plants (and, when built, finished lesson sources).

## Garden (habits)

**Status:** Built (per-plot plant lifecycle and calendar seasons, Nov 19; new habits planted the day they're created, Nov 21; 3D plants made per plant by the weekly job). Not built: rarity looks and accessories on 3D plants, herbarium titles and notes written by Claude (you can name and caption pressed plants yourself), grace token.

One plot per habit, one plant at a time. Each plant is its own species, made for that plot (below); until its model exists the plot shows an SVG species (`daisy`, `tulip`, `sunflower`, `mushroom`, `cactus`, `fern`, `bonsai`, `lavender`, no repeats until all are used). A plant grows one stage per week you hit the floor, and dies the first week you don't. Everything is per plot: a new habit gets a plot (and a seed) the day it's created, even mid-week. That first partial week is scored against the full floor (daily habits: only the days from creation on, each at the floor, total scored against that many days × floor / target): hit it and the seed sprouts; miss it and the seed just waits, as any unsprouted seed does. Nothing waits for other plots.

**Inputs** come from habit fields: `streak_floor_per_week` (floor), `target_per_week` (target) and `cadence` (`week`, default, or `day`).

| Week result | Effect | Points |
| --- | --- | --- |
| Below floor | Dies (a seed that hasn't sprouted just waits). | – |
| Floor met | Grows one stage | `garden.points.floor = 1` |
| Target met | Grows one stage | `garden.points.target = 2` |
| Above target | Grows one stage | `garden.points.above = 3` |

**Daily habits** (`cadence: "day"`): floor and target are per day. A day below the floor kills the plant right away (it shows withered the rest of that week) and breaks that week's streak; the next seed, already sprouted, goes in at the next week start (no extra withered week). A week with every day at the floor is scored on its total against 7 × floor / target. The habit card shows one pip per day.

**Stages** `garden.stages = ["seed","sprout","leafy","bud","bloom"]`, one per floor week, so a seed blooms after 4 floor weeks. No wilt step: `garden.wilt = false` (a first miss kills).

**When a plant finishes** (blooms or dies):

1. It stays on show: a bloom for `garden.bloomWeeks = 1` week, a withered plant for `garden.restWeeks = 1` week. Sessions those weeks still count for streaks but not for the garden.
2. Then it is **pressed**: it joins Grow → Collection, where you can give it a title and note.
3. The next plant goes in the same plot. Its seed comes from the finished plant's score (the points of its growing weeks): a bloom earns rare at `garden.rarity.rare = 6`, exotic at `garden.rarity.exotic = 10`, otherwise common. Four floor weeks score 4 (common); two weeks at target or one above target make it rare; exotic needs most weeks above target. A dead plant earns a common seed and leaves compost: the next seed starts already sprouted.
4. Any seed has a `garden.mutation = 0.05` chance to mutate (odd colour, decoration only).

The random rolls are seeded from the habit key, so every reload agrees. There are no hybrids: plots finish at different times, so there's no pair to cross.

**Seasons** are the real calendar seasons, meteorological, for `garden.hemisphere = "north"` (Mar–May spring, Jun–Aug summer, Sep–Nov fall, Dec–Feb winter; flipped for "south"). They don't end plants. They name the time on the Habits card and pressed plants, and shape new plants: a species in its prime that season, a seasonal finish (frosted, russet), and a seasonal twist on a rare plant's accessory.

**3D plants, one per plant.** The weekly job (`season-seeds`) makes a model for each plant that needs one: `checks/game_status.garden.needs` lists the plant growing now in a plot that has no model (a new habit), plus the next plant for each plot showing a bloom or withered plant (it goes in Monday). Each lists the plot (habit key and name), its `gen` (0 for the plot's first plant), the seed's rarity, and the biome. A roster plant (`models/roster.json`, `kind: "plant"`) with `plot` = habit key and `gen` is that plant's species. Rare seeds (rare, exotic) get a creative plant: something playful tied to the habit, like a tiny hat, a running shoe leaf or a book-page petal. No stock is modelled ahead.

**3D plots.** A plot whose plant has a model shows it at the plot's stage (`stage_<n>`, `sway_<n>` idle, `tend` when a session is logged); thirsty and withered plots, and any plot before its model loads, use the plant's SVG fallback shape (roster `svg`). Rarity and mutation recolours show on the SVG shapes only.

**Not built:** rarity/mutation looks on 3D plants beyond what the model itself has, grace token (revisit after seeing how often weeks get missed), Claude-written titles and notes for pressed plants.

### Habit pips

Each habit tile shows its week at a glance (`habitPips` in app.js). Daily and weekly habits look different on purpose. In the garden, daily plots come first under a small Daily heading, then weekly plots under Weekly (headings only when both kinds exist).

- **Daily: water drops**, one per day of the week, day letters under them. A drop fills 0 to floor = bottom half, floor to target = top half (floor 1, target 3: 50%, 75%, 100%). A dotted line marks the floor (halfway) until the drop is full. Floor hit: bolder blue outline. A past day under floor: red outline. Above target: a rainbow behind the drop. Today sits on a soft accent card. Future days are faint outlines.
- **Weekly: honeycomb**, one cell per session up to the target. Filled cells are honey; floor slots keep a dashed outline (darker once filled), so a met floor stays visible. Each session over target adds a deep-honey cell with a drip and a bee. Cells sit in a staggered zigzag (a strip of comb) and shrink to fit the tile as the target grows. Garden tiles are at least 140px wide so seven drops stay readable.

## Ecosystem (rings and tasks)

**Status:** Partly built. Built: Growth from the ring, ring = done ÷ committed with recorded commitments (`tasks.committed_days`) and the commitment lock, adaptive phases, 8 biomes, dioramas, weekly visitor, aged-task visitor drops, murk, blight from task age (per-biome look via `neglect`), bleaching. Not built: Claude-written diorama titles. Claude-invented biomes: built as the `biome-brief` skill, run by `weekly-visitor`.

Every day earns **Growth** from the day's ring %, and Growth moves the current biome through its phases. Biomes take as long as they take, independent of the garden calendar.

**Ring % = done ÷ committed** (built: `LBGame.ringTally` / `ringPct` in `game.js`, used by the rings, ring history and Life points; no fixed goal).

- **Commitment.** A task is committed to a day when that day arrives with the task due on it (its due date, or its deadline if that's earlier), or when it's put on today. The board records each such date in `tasks.committed_days`, so moving a task later never erases the day it was committed to. Putting a task on a day in the future commits nothing until that day comes (moving it from next month to next week changes nothing).
- **Commit lock** (`checks/ui_prefs.commitLock`, asked by `lifeboard-setup`): how long after a task lands on today you can still move it off without it counting as missed: minutes (`0` = locked at once, the default; e.g. `5`, `180`), or `"end"` (never locks during the day). A task already due when the day begins lands at midnight; one put on today lands when you put it there. Today's tasks inside the window show "Locks in 2h 10m".
- Committed for a day = tasks committed to that day that weren't finished earlier + every task finished that day. Tasks with no recorded commitments (older ones) use their current date.
- Overdue tasks don't count against today. To commit one to today, reschedule it to today.
- **Day statuses** (shown per day in the ring card): **Done** (finished that day) and **Missed** (committed, not finished that day). A missed task is now one of: **Done late**, **Moved** (has a new date), **Slipped** (due date passed, deadline still ahead) or **Overdue** (deadline passed, or due date passed with no deadline).
- **Age** = days since a task was first committed (its earliest `committed_days`); pushing it to another day never resets it. A task is never committed to a day before it was created, so giving a new task a past date makes it overdue from its creation day, not older. Open tasks show it as "Missed Nd" (plus "pushed N×" when moved), whether they sat overdue or kept getting pushed. Only the days a task was committed to count against the ring: a task left overdue doesn't count against later days (murk and blight cover the backlog), so a long backlog can't sink every ring.
- Adding a task for today raises committed, so today's % drops until it's done. A task added and finished the same day adds 1 to both sides (3/4 = 75% becomes 4/5 = 80%).
- A day with nothing due where you finish anything is a full ring.
- A day with nothing committed is neutral: no Growth, no penalty, ignored by bleaching.

**Life points per day:** ring % × `tide.perPct = 10`, plus `tide.fullBonus = 5` for a full ring.

**Phase pacing is adaptive.** Each biome has `tide.phases = 5` phases. Thresholds come from your average life points over the last `tide.trailingDays = 28` days, set so a biome takes `tide.targetWeeks = 4.5` weeks at your usual pace. Before there's history, the pace is `tide.defaultDaily = 9` life points a day.

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

Each biome owns its shapes, palette, creatures and plants (`look` in `biomes.json`; rules in `models/STYLE.md`), and each phase adds that biome's own things. When the list runs out, the weekly job invents the next biome (`biome-brief`, validated by `models/shared/tools/check_biome.py`): it runs when the ecosystem is on its final phase and the next biome has no entry, or the ecosystem is already in a biome with no entry. The board reports its biome and phase to `checks/game_status` for this. Restarting with fresh biomes (`game-reset`) archives every biome and creature (`models/*.archive.json`) so every one is invented, biome 0 included; until then the ecosystem shows a plain "Uncharted" water scene. Biome design needs no Blender; creatures do.

Finishing the last phase saves the biome as a **diorama** (biome, days taken, full days, Growth earned) and starts the next. Dioramas show in Grow → Collection with a title and note you can edit. *Planned:* Claude names the run and sums it up.

**Visitors** (species come from the current biome's pool in `models/roster.json`; each week's visitor is logged to `visitors_met`):

| Tier | Earned by | Status |
| --- | --- | --- |
| Common | Any week the ecosystem isn't bleached | Built |
| Rare | `visitor.fullDaysForRare = 6` full rings in a Mon–Sun week | Built |
| Rare | A perfect lesson week (see Lessons) | Planned |
| Rare | Finishing a task `visitor.rareOverdue = 7`+ days after it was first committed (age; pushes don't reset it) | Built |
| Exotic | Finishing a task `visitor.exoticOverdue = 30`+ days after it was first committed | Built |

Aged-task drops are capped: `visitor.overdueDropsPerWeek = 1` a week and `visitor.exoticPerBiome = 1` exotic per biome.

**Murk and blight** (both gradual, both reverse as you clear tasks):

- **Murk** = how many tasks are overdue: each fouls the water or air, fully murky at `tide.cloudyAt = 10` (1 task 10%, 5 tasks 50%).
- **Blight** = how long tasks have been neglected: open tasks first committed `tide.blightAfter = 4`+ days ago grow blight, whether they sit overdue or keep getting pushed (the task's "Missed Nd" chip turns red at that age); `tide.blightAt = 10` such tasks cover it.
- **Each biome shows them its own way** (`biomes.json` `neglect`): murk is the biome's own fouling (silt, dust haze, spore fog, tannin) in its own colour, and blight is a scenery prop made for that biome (hair algae on a reef, weeds in a meadow, mold in a cave, sand drifts in a desert, ash fall on a volcano). More copies appear and grow as blight rises; clearing old tasks makes them recede. Biomes without a `neglect` entry fall back to generic green tufts and a green tint.
- **Bleaching** (separate) = your rings, not your backlog. An average ring below `bleach.below = 0.25` over `bleach.days = 14` days bleaches the scene grey; it recovers when the average over `bleach.recoverDays = 7` days reaches `bleach.recoverAt = 0.5`. No visitors while bleached. It never dies.

## Lessons

**Status:** Partly built. Built: formats, ladder, daily deck, spaced repetition (per-source intervals), card actions, the Lessons card above the ecosystem (the deck is answered inside it, so the scene stays in view), feeding/hiding, the lesson-making skill (`.agents/skills/lesson-make`). Planned: perfect lesson week, finish rewards, Collection trophy, book species, weekly rewrite of flagged lessons, pollinators.

Short daily lessons from books, videos, posts, courses and notes, resurfacing on a spaced schedule; doing them brings the scenes to life.

**Formats (start with three):**

| Format | What you do | Effort |
| --- | --- | --- |
| Tap | Read a quote or idea, tap "got it" | ~5 s |
| Recall | Fill a blank, or pick from 3 choices | ~10 s |
| Apply | Free-form one line: where could you use this today? | ~30 s |

Later candidate: **Scenario** (a short situation; pick which idea applies). Dropped: Connect, merged into Apply.

**Ladder per source:** each source picks which formats its lessons climb through, in order, and a lesson's format follows its level instead of staying fixed. A book might go Tap → Recall → Apply; Spanish skips Tap and goes Recall → Apply. A new lesson starts on the first rung; advancing moves it up a rung and lengthens the interval; a miss drops it a rung and brings it back sooner. The lesson-making skill sets the ladder and writes a prompt for every rung of every lesson.

**Feedings:** `lessons.feedings = 2` decks a day of `lessons.perFeeding = 5` lessons each, shuffled. The waking day `lessons.dayStart = 6` to `lessons.dayEnd = 22` (hours, board timezone) splits evenly between feedings (default: before 2 pm, after 2 pm); before the start counts as the first, after the end as the last. Reviews that are due come first, then new lessons. Never more than `perFeeding` per feeding: cards answered earlier in the same feeding count toward it, and a missed feeding doesn't carry over. Per-board override: `checks/lesson_rules` `{ value: { feedings, perFeeding, dayStart, dayEnd } }` (an old `{ deck }` sets `perFeeding`).

**Spaced repetition:** each lesson tracks its level. Advancing brings it back after `lessons.intervals = [3,7,21]` days for levels 1, 2 and 3; advancing past the last level **graduates** it. A source can set its own `intervals` (any length, e.g. quotes `[7,30,90]`, a language `[1,3,7,14]`); the lesson-make skill picks them by type. A missed Recall drops a level (never below the first rung) and comes back after that level's interval, or tomorrow on the first rung.

**Where it shows:** a "N lessons ▾" chip on the ecosystem while any are due. Tapping it drops the deck over the water, one card at a time, about 2 minutes for 5 cards (a full-screen modal on phones). Each answered card feeds the scene. Nothing due: no chip.

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

**Book species:** a finished book hatches a ecosystem creature named after it (e.g. *Somatic Seahorse*) and a matching plant in Collection with a distinct foil skin and its best quote. Books only.

**Scene effects (decoration only):**

- Water biomes: lesson = fish food. Fish swim over, eat, glow and school. No lessons for `lessons.hideAfter = 3` days: creatures play their `sulk` loop and tuck in behind their shelter (`spec.habitat.shelter`, else `anchor`, else the nearest rock), never die; food (a lesson) brings them out. `LBGame.lessonDone` logs `logs` kind `lesson` and drops food; hiding stays off until the first lesson is logged.
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

## Weekly job

**Status:** Partly built. Built: the `weekly-visitor` and `season-seeds` skills and the scheduled-task template (`.claude/scheduled/weekly-visitor.md`; `lifeboard-setup` asks which day it runs and registers it). Not built: written reports.

One Claude routine runs once a week on the day you pick at setup (default Sunday), reads its own past reports, and writes this week's report into the db.

**Every week:**

1. Makes this week's visitor (`weekly-visitor`).
2. Makes 3D plants for the plots that need one (`season-seeds`, from `checks/game_status.garden.needs`); plants still growing are left alone.
3. Writes 1–2 notes from Claude for the scenes.
4. Suggests habit tweaks only after 4+ weeks of a pattern: above target → raise floor or target; floor barely met → lower it. It weighs how hard the habit is to scale (drumming yes, long runs maybe not). Tap to apply. (The Grow → Habits page already shows a raise/lower verdict per habit from the same pattern.)
5. Rewrites Recall lessons missed twice, and any flagged lesson, into a new format. Tap lessons are left alone.
6. Picks next week's event and its day (see Surprises).
7. Invents a new biome when the list runs out, unless you've unlocked choosing.

**In the first week of a calendar season, it also** writes a season review of the last one: per-habit weeks met, blooms, deaths, seeds earned, pressed plants, ecosystem phases reached, lessons graduated.

## Where it lives

Everything sits in the lifeboard artifact db; no hippocampus dependency. Claude can query it with `ArtifactData`.

**Built collections** (game-only ones are optional: `store.js` never listens to them):

| Collection | Holds |
| --- | --- |
| `habits` | Floor, target, `hidden` (hidden habits leave the board and garden; history kept) |
| `habit_sessions` | Sessions by date (existing) |
| `tasks` | Due, deadline, status, completed_at (existing) |
| `game_state` | `game.started`: the day the game began |
| `tasks.committed_days` | Dates each task was committed to (Ring %); its first date is the task's age start |
| `keepsakes` | Your title and note per diorama or pressed plant |
| `visitors_met` | One doc per creature per week: creature, biome, week, rarity |
| `sources` | Book, video, post, course or note: title, type, size, salience, ladder, summary, status (active / paused / finished) |
| `lessons` | Source id, level, a prompt and answer per rung, next due, state (active / graduated / dropped), flagged |
| `lesson_answers` | Each answer and action, incl. Apply and typed Recall text |

**Planned collections:**

| Collection | Holds |
| --- | --- |
| `week_results` | Frozen per habit per week: count, floor, target, result (died / floor / target / above) |
| `reports` | Weekly and season reports, notes, events |

Seeds, plantings, the herbarium, the ecosystem and dioramas were planned as stored collections; they're derived from history instead (see Core rules) and only need storing if derivation stops being enough.

**Code:** this repo. Rules: `game.js`. Derivation and Collection UI: `garden.js`. Scene: `habitat.js`. Balance simulation: `sim/run.js`.

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

- Garden: deaths and blooms per plot per month, new plants a week (the weekly job's build load), seed rarity mix, dead plot-weeks.
- Ecosystem: weeks per biome (target 3–6), rare and exotic visitors per month, days of cloudy water, bleaching events.
- Lessons: deck backlog over time at 1, 2 and 4 books a month; days to finish a book; graduation rate.
- Exploits: e.g. does adding and finishing tiny tasks inflate rings? Does a low floor make death impossible?

**Pass criteria:** every persona sees at least one bloom a month across its plots and one rare visitor per month; bursty and slump personas can die but bloom again within two months; no persona maxes everything without effort; the lesson backlog stays flat at the expected ingest rate.

**Two passes:**

1. **Numbers (no Claude):** pure seeded statistics, so every run is repeatable and comparable after a tweak. Claude's jobs are stubbed with plain rules, which is safe because Claude never changes numbers.
2. **Playtest (Claude in the loop):** feed a few simulated weeks to the real weekly-job prompt and read what it writes. Judges tone and variety, not balance. *Not run yet.*

**Run 1 results** (200 seeds × 28 weeks; real habit data from the snapshot used as a cross-check):

| Finding | Numbers | Proposed fix |
| --- | --- | --- |
| A 4-week season leaves zero slack: one missed floor week anywhere means no bloom | Steady persona blooms 1.7 of 4 plants a season | Add a wilt step and 5-week seasons → 3.0 of 4 |
| A plot sits dead for the rest of the season after a death | 30% of plot-weeks dead (steady) | Replant a common seed the next week → 12% (2% with wilt) |
| Clearing very old tasks farms visitors | Steady: 4.3 rare + 2.9 exotic a month from overdue clears; perfect weeks give only 0.7 | Cap overdue drops at 1 a week, exotic at 1 per biome |
| Lesson deck can't keep up | 3 a day + 1 book a month: backlog grows to ~90; a book takes ~106 days | Deck of 5 and intervals 3-7-21 → backlog ~8, a book in ~80 days. 2 books a month still backs up |
| First biome is too fast | Default pace 6 pts/day; real pace ~11 → first biome 2.6 weeks | Default 9 pts/day; later biomes already land at 4.6 weeks |
| Tiny same-day tasks | No real gain: adaptive pacing absorbs it | None needed |
| Cloudy water almost always on | Cloudy 76% of days at a 10-task threshold | Raise to 20 or scale to the person's usual pile |

**Update (Nov 18, feedings):** two feedings of 5 a day → at 1 book a month the backlog stays ~0 and a book takes ~71 days (was ~14 and ~82 with one deck); 2 books a month backlog ~6.

**Decision (Nov 18):** strict death kept, 4-week seasons kept, no wilt. Everything else adopted as defaults in `game.js`: dead plots stay dead until next season, overdue rewards capped at 1 a week and exotic at 1 per biome, deck of 5 on a 3-7-21 schedule, starting pace 9 a day, water murk and blight scaled gradually. Re-run: steady still blooms 1.7 of 4 (by design), dead plot-weeks ~30%, about 3 rare and 0.5 exotic visitors a month, first biome 3.9 weeks, lesson backlog flat at 1 book a month.

**Run 2 (task cleanup added):** personas now reschedule or delete overdue tasks at their own rate. Murk = 1 task 10%, 5 tasks 50%.

| Persona | Avg overdue pile | Days 50%+ murky | Days 50%+ blight | Exotic/mo |
| --- | --- | --- | --- | --- |
| Steady | 2.8 | 22% | 5% | 0.02 |
| Slump | 5.9 | 40% | 19% | 0.11 |
| Bursty | 18 | 81% | 66% | 0.36 |
| Light | 20 | 94% | 88% | 0.39 |
| Overachiever | 0 | 0% | 0% | 0 |

A typical board (a few tasks overdue, none 7+ days old) sits around 40% murk with no blight. Steady pace matches; murk reads clearly as "a few things slipping" without being constant.

**Hard habits:** habits done less than weekly (e.g. a 3-of-7-weeks pace) would die nearly every season even at a floor of 1. They need a biweekly cadence option, since the floor can't go lower. A habit that beats its target most weeks (4–6 vs 3) earns exotic seeds every season; the tweak suggestion should raise its target.

**Run 3 (Nov 19, per-plot plants, 200 seeds × 28 weeks):** no seasons ending plants; each plot finishes on its own and is replanted after a week on show. Dead plot-weeks fall from ~30% to 12% (steady), 16% bursty, 20% light. Blooms per plot a month: steady 0.46, overachiever 0.70, light 0.29. Seed mix after the points change (Nov 19; common/rare/exotic % of blooms): steady 30/67/3, bursty 24/68/8, overachiever 2/53/45, light 36/63/0. Rare at 7 instead would give steady 54/43/3. A composted plant (3 growing weeks, max 9) can't earn exotic. The weekly job makes ~0.9 new plants a week for 4 habits (0.5 for the light user), so one or two builds a week.

## Open questions

- [ ] Grace token: decide after a few months of real data.
- [ ] Rare-visitor threshold: 6 full rings; check after 4 weeks of real data.
- [ ] Seed placement: random now; add a pick menu later?
- [ ] Biweekly cadence for hard habits (ones done less than weekly fail even a floor of 1).
- [ ] Freeze closed weeks (`week_results`) before anyone edits a floor or target, or accept that edits re-score the past.
- [x] Where lesson-making lives: a skill in this repo (decided Nov 18).
- [x] Visual direction for garden and ecosystem: 3D ecosystem scene with 8 biomes and SVG plants (built Nov 18).
