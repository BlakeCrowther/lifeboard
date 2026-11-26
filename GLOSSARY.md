# Glossary

One meaning per term, used the same way in code, docs and UI. Code names data after its db collection (`buyListItems` for `buy_list_items`); where the UI label differs, the term below names the collection. Shapes: `src/packages/db/lib/schemas.ts`. Game rules and numbers live in [SPEC.md](SPEC.md); more model-pipeline terms (kind, archetype, gate, roster) in [models/README.md](models/README.md#terms).

## The board and its repos

- **Artifact**: a page published on claude.ai. Lifeboard's page runs as one, with its own database (the `db` capability).
- **Board**: one person's lifeboard: its published artifact plus that artifact's database. Each person publishes their own.
- **Owner**: the person a board belongs to. Owner-specific settings live in their board's profile, never in code.
- **Live board**: a board's published artifact, as opposed to the repo files that publish it. The two drift when the artifact is edited directly; AGENTS.md "Board workflow" says how to keep them in step.
- **Upstream**: the public lifeboard repo (`github.com/BlakeCrowther/lifeboard`), the template every board copy comes from. It holds code, skills and the starter set, and publishes only the demo board. **Maintainer**: the person who owns upstream.
- **Board copy**: one board's own git repo, made from upstream by `lifeboard-setup` (README calls it "your own copy"), with an `upstream` remote. It holds that board's models and publishes that board. `lifeboard-update` brings upstream changes in; `lifeboard-contribute` sends a fix back.
- **Demo board**: the one board upstream publishes, titled "Lifeboard Demo", on synthetic seed data (`demo/seed.json`). Its profile has `demo: true`, which shows a Demo badge. Made and refreshed with the `demo-board` skill.
- **Starter set**: the models a fresh board shows before it has its own, committed in `models/starter/` (roster, biomes, assets, specs). `pnpm board seed` copies it into the board dir.
- **Board dir** (`models/board/`): one board's own models (roster, biomes, assets, specs), laid out as published. A board copy commits it as the board's model history; upstream never does (`pnpm verify` fails if it tracks any). Layout: [models/README.md](models/README.md), "Layout".
- **Profile**: `checks/profile` in the board's database (collection `checks`, doc `profile`): the owner's name, timezone, conditions place, pets, `demo` flag and optional Duet trigger.
- **Tips**: short "how does this work" notes behind an info button, shown only while the board's Tips setting (`checks/ui_prefs.tips`, in the display menu next to Theme, on by default) is on. Numbers in them come from `RULES`.
- **Starter tasks**: the few tasks a brand-new, empty board gets once, explaining how lifeboard scores things.

## Board data

- **Countdown** (`countdowns`): a dated event to count down to. In code, `countdownsByKind.big` and `.glance`.
- **Big days**: UI label for countdowns of any kind but `glance` (weddings, trips, birthdays), on Life → Home & Pets and in the Today header. **Glance**: countdowns with kind `glance`, the small ones shown only in the header.
- **Buy list** (`buy_list_items`, code `buyListItems`): things to buy, each with a wait tag (need, love, like, one day) that sets how long it waits before it's ready.
- **Gift ideas** (`gift_ideas`, code `giftIdeas`): ideas per person, marked given.
- **Lists** (`list_items`, code `listItemsByKey`): books, films and other lists, grouped by `list_key`.
- **Groceries** (`groceries`), **Recipes** (`recipes`), **Goals** (`goals`), **Logs** (`logs`): same name in code and UI.
- **Snapshot** (`snapshots`): fetched outside data (calendar, conditions) the page shows.
- **Conditions card**: the weather and surf for the profile's place, from `snapshots/conditions`, on Today under "At a glance"; titled with the place, or "Local conditions" without one.
- **Duet**: an owner's own scheduled Claude agent. Tasks show "Send to Duet" only when the profile has a `duet_trigger`.

## Tasks and the ring

- **Task** (`tasks`).
- **Committed**: a task counts toward a day once that day arrives with the task due (or it's put on today). Recorded in `tasks.committed_days`; never before the task was created.
- **Ring**: a day's done ÷ committed. Drawn as a ring per day on Today.
- **Commit lock** (`checks/ui_prefs.commitLock`): how long after a task lands on today you can still move it off without it counting as missed.
- **Age**: days since a task was first committed. Pushing it later never resets it.
- **Overdue / Slipped / Moved / Done late**: what a missed task became (SPEC.md, Ring %).

## Ecosystem

- **Ecosystem**: the 3D scene the ring grows (`src/packages/ecosystem`). One name in code, files, docs and UI.
- **Habitat**: not a lifeboard term (it reads like "habit"); say Ecosystem.
- **Life points**: what a day's ring earns; they move the current biome through its phases. SPEC.md calls their total Growth.
- **Biome**: one stage of the Ecosystem (e.g. a seagrass lagoon), listed in the board's `biomes.json`. Each has **phases**; finishing the last saves a **diorama** to the Collection.
- **Visitor** (met ones in `visitors_met`): a 3D creature that arrives in the Ecosystem: one a week (none while bleached), a rare one for a week of full rings or for finishing an old task, an exotic one for finishing a very old task (SPEC.md, Visitors). **Rarity**: common, rare, exotic.
- **Murk**: haze from overdue tasks. **Blight**: biome-specific growth from tasks neglected `tide.blightAfter`+ days. **Bleaching**: the scene greys out after a long run of low rings (`bleach.*`). All three reverse. Thresholds: SPEC.md, "Murk and blight".

## Garden

- **Garden**: the habits card's game: one **plot** per habit, one plant at a time in each plot.
- **Habit** (`habits`). **Habit session** (`habit_sessions`, code `habitSessions`): one logged session of a habit on a date. A session logged after its week counts only with an exception (reason + evidence); the rest are `voidHabitSessions`.
- **Floor**: the fewest sessions a week (or day) that keeps a habit's plant alive. **Target**: the number you're aiming for. Beating it earns rarer seeds.
- **Seed**: the next plant for a plot, its rarity set by how the last one did.
- **Gen**: which plant of its plot a plant is (0 for the plot's first). A 3D plant model is matched to its plot by `plot` + `gen`.
- **Pressed plant**: a finished plant (bloomed or withered), kept in the Collection.
- **Collection**: Grow → Collection: dioramas and pressed plants (notes on them in `keepsakes`). Not a db collection.
- **Game start** (`game_state`): the day the game began.

## Lessons

- **Source** (`sources`): a book, video, article, talk or note that lessons are made from (the `lesson-make` skill).
- **Lesson** (`lessons`, answers in `lesson_answers`): one short card from a source, resurfacing on a spaced schedule. Its **ladder** is the sequence of formats it climbs as you get it right.
- **Feeding**: one deck of lessons; a day has a few, spread across waking hours. Answering them feeds the Ecosystem's creatures; it never changes growth or points.

## Agents and jobs

- **Lifeboard Break**: an optional macOS menu-bar app (`break/`, skill `break-setup`) that covers every screen with the board during timed breaks.
- **Skill**: an agent instruction set in `.agents/skills/`, named for its job (`lifeboard-setup`, `lesson-make`, …). Claude Code finds them through `.claude/skills`.
- **Weekly run**: the scheduled task (template `.claude/scheduled/weekly-visitor.md`, registered by `lifeboard-setup`) that runs `weekly-visitor` once a week in a board copy: it makes the week's visitor and, through `season-seeds`, the plants plots need, then publishes the models when the board's settings pre-approve it (AGENTS.md "This board's settings"). Rules: SPEC.md, "Weekly run".
- **Pipeline**: the chain of skills that turns a spec into a shipped 3D model (brief → build → animate or grow → verify → ship). Map: [models/pipeline.html](models/pipeline.html); stages: [models/README.md](models/README.md).
- **Golden**: a kind's reference model (`golden` in `models/<kind>/qa_calibration.json`). Its judge-panel scores anchor the judges and set the bar a new model must reach.
- **Judge panel** (gate `judge-panel`): fresh AI judges that score a model's renders against the golden; the kind's pass rule turns their scores into a verdict. Run by `model-verify`.
- **Page-test** (gate `page-test`): a creature loaded into the real Ecosystem page in headless Chromium before it ships (`models/shared/tools/page-test.ts`).
- **Run ledger**: one pipeline run's record and budget (`models/shared/tools/ledger.py`, saved in `models/out/runs/<run>.json`): every build and judge round counts against it, and a run stops when it is spent. Details: [models/README.md](models/README.md), "Run ledger".

## Code structure

- **Package**: a folder under `src/packages/` whose root files are its public entry points; subfolders (`lib/`) are private. See [ADR 0001](docs/adr/0001-modernize-typescript-deep-modules.md).
- **Entry point**: a root file of a package; the only thing other code may import.
- **Seam**: the public interface a test exercises.
- **Eval**: a fixed input (a **case**) fed to one skill in a throwaway sandbox, then graded by script checks plus a short LLM rubric (`evals/README.md`). Costs tokens, so it is not in `pnpm verify`. The judge-panel goldens grade 3D models; evals grade skills whose output is data.

## Code terms (ui package)

- **Board model** (`model`, built by `buildBoardModel`): everything the views read, rebuilt from the store's docs on every change. Its row types (`BoardTask`, `BoardHabit`, …) derive from the db docs.
- **View state** (`viewState`): what the page shows now: tab, selected day, open sheet, sub-views. Not saved to the db.
- **Board prefs** / **device prefs**: UI choices saved per board in `checks/ui_prefs`, so every device matches (Ecosystem, Garden, Tips, theme, commit lock), or per browser in localStorage (folds, list sorts). See `shared/prefs.ts`.
- **Redraw registry** (`shared/redraw.ts`): `render` / `scheduleRender` without importing the render loop, so views and actions avoid import cycles.
- **Quick add** (`parseQuickAdd`): the sheet's one-line task box; reads a date, time and repeat out of plain text.
- **Repeat preset** (`REPEAT_PRESETS`, `ruleForPreset`): an entry in the sheet's Repeats menu and the recurrence rule it starts from.
- **Grocery aisle** (`GroceryAisle`, `guessAisle`): the section a grocery is filed under; guessed from its name.
- **List kind** (`ListKind`, `listKindsFor`): one list on the Lists tab (built-in, or one per extra `list_key`).
- **Run write** (`runWrite`): every db write from the UI; shows the toast with Undo and reports failures.
- **Lesson run** (`lessonRun`): the open lesson deck and the current card.
