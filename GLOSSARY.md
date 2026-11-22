# Glossary

One meaning per term, used the same way in code, docs and UI. Code names data after its db collection (`buyListItems` for `buy_list_items`); where the UI label differs, the term below names the collection. Shapes: `src/packages/db/lib/schemas.ts`. Game rules and numbers live in [SPEC.md](SPEC.md); model-pipeline terms (kind, archetype, gate, golden, roster) in [models/README.md](models/README.md#terms).

## The board

- **Board**: one person's lifeboard: the published artifact plus its database. Each person who clones the repo publishes their own.
- **Live board**: the owner's own published board. The repo is the template; see "Owner workflow" in AGENTS.md.
- **Profile**: `checks/profile` in the board's database (collection `checks`, doc `profile`): the owner's name, timezone, conditions place, pets and optional agent trigger. Anything owner-specific lives here, never in code.
- **Starter tasks**: the few tasks a brand-new, empty board gets once, explaining how lifeboard scores things.
- **Countdown** (`countdowns`): a dated event to count down to. In code, `countdownsByKind.big` and `.glance`.
- **Big days**: UI label for countdowns of any kind but `glance` (weddings, trips, birthdays), on Life → Home & Pets and in the Today header. **Glance**: countdowns with kind `glance`, the small ones shown only in the header.
- **Buy list** (`buy_list_items`, code `buyListItems`): things to buy, each with a wait tag (need, love, like, one day) that sets how long it waits before it's ready.
- **Gift ideas** (`gift_ideas`, code `giftIdeas`): ideas per person, marked given.
- **Lists** (`list_items`, code `listItemsByKey`): books, films and other lists, grouped by `list_key`.
- **Groceries** (`groceries`), **Recipes** (`recipes`), **Goals** (`goals`), **Logs** (`logs`): same name in code and UI.
- **Snapshot** (`snapshots`): fetched outside data (calendar, conditions) the page shows.
- **Duet**: the owner's own scheduled Claude agent. Tasks show "Send to Duet" only when the profile has a `duet_trigger`.

## Tasks and the ring

- **Task** (`tasks`).
- **Committed**: a task counts toward a day once that day arrives with the task due (or it's put on today). Recorded in `tasks.committed_days`; never before the task was created.
- **Ring**: a day's done ÷ committed. Drawn as a ring per day on Today.
- **Commit lock**: how long after a task lands on today you can still move it off without it counting as missed.
- **Age**: days since a task was first committed. Pushing it later never resets it.
- **Overdue / Slipped / Moved / Done late**: what a missed task became (SPEC.md, Ring %).

## Ecosystem

- **Ecosystem**: the scene the ring grows (`src/packages/ecosystem`). One name in code, files, docs and UI; not "habitat" (it reads like "habit").
- **Life points**: what a day's ring earns; they move the current biome through its phases.
- **Biome**: one stage of the Ecosystem (e.g. a seagrass lagoon), listed in `models/biomes.json`. Each has **phases**; finishing the last saves a **diorama** to the Collection.
- **Visitor** (met ones in `visitors_met`): a creature that arrives in the Ecosystem: one a week, plus rare and exotic ones for full-ring weeks and for finishing old tasks. **Rarity**: common, rare, exotic.
- **Murk**: haze from overdue tasks. **Blight**: biome-specific growth from tasks neglected `tide.blightAfter`+ days. **Bleaching**: the scene greys out after a long run of low rings (`bleach.*`). All three reverse. Thresholds: SPEC.md, "Murk and blight".

## Garden

- **Garden**: one **plot** per habit, one plant at a time.
- **Habit** (`habits`). **Habit session** (`habit_sessions`, code `habitSessions`): one logged session of a habit on a date. A session logged after its week counts only with an exception (reason + evidence); the rest are `voidHabitSessions`.
- **Floor**: the fewest sessions a week (or day) that keeps a habit's plant alive. **Target**: the number you're aiming for. Beating it earns rarer seeds.
- **Seed**: the next plant for a plot, its rarity set by how the last one did.
- **Pressed plant**: a finished plant (bloomed or withered), kept in the Collection.
- **Collection**: Grow → Collection: dioramas and pressed plants (notes on them in `keepsakes`). Not a db collection.
- **Game start** (`game_state`): the day the game began.

## Lessons

- **Source** (`sources`): a book, video, article, talk or note that lessons are made from (the `lesson-make` skill).
- **Lesson** (`lessons`, answers in `lesson_answers`): one short card from a source, resurfacing on a spaced schedule. Its **ladder** is the sequence of formats it climbs as you get it right.
- **Feeding**: one deck of lessons; a day has a few, spread across waking hours. Answering them feeds the Ecosystem's creatures; it never changes growth or points.

## Agents and jobs

- **Weekly check**: the scheduled run (`weekly-visitor`, which also runs `season-seeds`) that makes the week's visitor and the plants plots need, then publishes.
- **Skill**: an agent instruction set in `.agents/skills/`, named for its job (`lifeboard-setup`, `lesson-make`, …).

## Code structure

- **Package**: a folder under `src/packages/` whose root files are its public entry points; subfolders (`lib/`) are private. See [ADR 0001](docs/adr/0001-modernize-typescript-deep-modules.md).
- **Entry point**: a root file of a package; the only thing other code may import.
- **Seam**: the public interface a test exercises.
- **Eval**: a fixed input (a **case**) fed to one skill in a throwaway sandbox, then graded by script checks plus a short LLM rubric (`evals/README.md`). Costs tokens, so it is not in `pnpm verify`. The judge-panel goldens grade 3D models; evals grade skills whose output is data.

## Code terms (ui package)

- **Board model** (`model`, built by `buildBoardModel`): everything the views read, rebuilt from the store's docs on every change. Its row types (`BoardTask`, `BoardHabit`, …) derive from the db docs.
- **View state** (`viewState`): what the page shows now: tab, selected day, open sheet, sub-views. Not saved to the db.
- **Board prefs** / **device prefs**: UI choices saved per board (folds, sorts, game on/off) or per browser (theme).
- **Redraw registry** (`shared/redraw.ts`): `render` / `scheduleRender` without importing the render loop, so views and actions avoid import cycles.
- **Quick add** (`parseQuickAdd`): the sheet's one-line task box; reads a date, time and repeat out of plain text.
- **Repeat preset** (`REPEAT_PRESETS`, `ruleForPreset`): an entry in the sheet's Repeats menu and the recurrence rule it starts from.
- **Grocery aisle** (`GroceryAisle`, `guessAisle`): the section a grocery is filed under; guessed from its name.
- **List kind** (`ListKind`, `listKindsFor`): one list on the Lists tab (built-in, or one per extra `list_key`).
- **Run write** (`runWrite`): every db write from the UI; shows the toast with Undo and reports failures.
- **Lesson run** (`lessonRun`): the open lesson deck and the current card.
