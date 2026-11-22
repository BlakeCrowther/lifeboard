# Glossary

One meaning per term, used the same way in code, docs and UI. Game rules and numbers live in [SPEC.md](SPEC.md); model-pipeline terms (kind, archetype, gate, golden, roster) in [models/README.md](models/README.md#terms).

## The board

- **Board**: one person's lifeboard: the published artifact plus its database. Each person who clones the repo publishes their own.
- **Live board**: the owner's own published board. The repo is the template; see "Owner workflow" in AGENTS.md.
- **Profile**: `checks/profile` in the board's database: the owner's name, timezone, conditions place, pets and optional agent trigger. Anything owner-specific lives here, never in code.
- **Starter tasks**: the few tasks a brand-new, empty board gets once, explaining how lifeboard scores things.
- **Big days**: countdowns to dated events (weddings, trips, birthdays) on Life → Home & Pets and in the Today header. **Glance** countdowns are the small ones shown only in the header.
- **Duet**: the owner's own scheduled Claude agent. Tasks show "Send to Duet" only when the profile has a `duet_trigger`.

## Tasks and the ring

- **Committed**: a task counts toward a day once that day arrives with the task due (or it's put on today). Recorded in `tasks.committed_days`; never before the task was created.
- **Ring**: a day's done ÷ committed. Drawn as a ring per day on Today.
- **Commit lock**: how long after a task lands on today you can still move it off without it counting as missed.
- **Age**: days since a task was first committed. Pushing it later never resets it.
- **Overdue / Slipped / Moved / Done late**: what a missed task became (SPEC.md, Ring %).

## Ecosystem (habitat in code)

- **Ecosystem**: the scene the ring grows. Called the habitat in code (`habitat.js`) so it doesn't read like "habit".
- **Life points**: what a day's ring earns; they move the current biome through its phases.
- **Biome**: one stage of the Ecosystem (e.g. a seagrass lagoon), listed in `models/biomes.json`. Each has **phases**; finishing the last saves a **diorama** to the Collection.
- **Visitor**: a creature that arrives in the Ecosystem: one a week, plus rare and exotic ones for full-ring weeks and for finishing old tasks. **Rarity**: common, rare, exotic.
- **Murk**: haze from overdue tasks. **Blight**: biome-specific growth from tasks neglected `tide.blightAfter`+ days. **Bleaching**: the scene greys out after a long run of low rings (`bleach.*`). All three reverse. Thresholds: SPEC.md, "Murk and blight".

## Garden

- **Garden**: one **plot** per habit, one plant at a time.
- **Floor**: the fewest sessions a week (or day) that keeps a habit's plant alive. **Target**: the number you're aiming for. Beating it earns rarer seeds.
- **Seed**: the next plant for a plot, its rarity set by how the last one did.
- **Pressed plant**: a finished plant (bloomed or withered), kept in the Collection.
- **Collection**: Grow → Collection: dioramas and pressed plants.

## Lessons

- **Source**: a book, video, article, talk or note that lessons are made from (the `lesson-make` skill).
- **Lesson**: one short card from a source, resurfacing on a spaced schedule. Its **ladder** is the sequence of formats it climbs as you get it right.
- **Feeding**: one deck of lessons; a day has a few, spread across waking hours. Answering them feeds the Ecosystem's creatures; it never changes growth or points.

## Agents and jobs

- **Weekly check**: the scheduled run (`weekly-visitor`, which also runs `season-seeds`) that makes the week's visitor and the plants plots need, then publishes.
- **Skill**: an agent instruction set in `.agents/skills/`, named for its job (`lifeboard-setup`, `lesson-make`, …).

## Code structure

- **Package**: a folder under `src/packages/` whose root files are its public entry points; subfolders (`lib/`) are private. See [ADR 0001](docs/adr/0001-modernize-typescript-deep-modules.md).
- **Entry point**: a root file of a package; the only thing other code may import.
- **Seam**: the public interface a test exercises.
- **Eval**: a fixed input plus a script grader that scores a skill's output. Lives in `evals/<skill>/`, outside `pnpm verify`.
