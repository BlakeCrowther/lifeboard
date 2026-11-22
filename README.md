# lifeboard

A personal life dashboard that runs as a claude.ai Artifact: tasks, habits, lists, goals and lessons on one page, with a small game on top. Your habits grow a **Garden**, finishing the day's tasks grows an underwater **Ecosystem** that new creatures visit, and short daily **lessons** from things you've read bring both to life.

Your data lives in the artifact's own database, not in this repo. Claude can read and write it too, so you can say "add a dentist appointment for Friday" or "make lessons from this book" and it shows up on the board.

## What's on the page

| Tab | What it holds |
|---|---|
| **Today** | Today's tasks and the day's ring (done ÷ committed), the Ecosystem, habit plants, calendar, due lessons |
| **Plan** | The week ahead, day by day |
| **Lists** | Groceries, wish list, recipes, gifts, books, movies, shows, and any list you add |
| **Life** | Health, Money, Home & Pets, Hobbies: tasks by area, small checklists, big-day countdowns |
| **Grow** | Habits, yearly goals, and the Collection (finished biomes and pressed plants) |

How the game scores things is in [SPEC.md](SPEC.md). A new board starts with a few starter tasks that explain it as you go.

## Quick start

You need a Claude account with Artifacts and Claude Code (desktop app or CLI). Lifeboard works with Claude only for now; other agents are planned ([feature lifeboard#22: agent-agnostic lifeboard](https://github.com/BlakeCrowther/lifeboard/issues/22)).

**Just the board (no terminal skills needed):**
1. Clone or download this repo and open the folder in Claude Code.
2. Say: *"Run lifeboard-setup"*. It asks a few questions (your name, timezone, week start, how strict the day's ring is) and publishes the board as your own private artifact.
3. Open the link it gives you. Pin it in claude.ai so it's one click away.

**With the 3D models** (creatures and plants made each week): setup also checks Blender, ImageMagick and Node, offers to install what's missing with `./setup.sh` (macOS, Linux and Windows; also what a cloud environment's setup script can call), and registers the weekly job. See [models/README.md](models/README.md).

**Optional extras:**
- **Lifeboard Break** (macOS): a menu-bar app that covers your screens with the board during timed breaks. Say *"run break-setup"*.
- **Lessons**: say *"make lessons from &lt;book, video, article&gt;"* (the `lesson-make` skill).

## Working on it

`index.html` loads the built domain bundle then plain scripts (`dist/app.js` → `app.js`, plus `garden.js`, `habitat.js`); run `pnpm build` (or `pnpm dev`) first. Domain logic and the data layer live in `src/packages/` (dates, recurrence, tasks, habits, game, db).

```bash
pnpm bootstrap   # install dev tools (Playwright for the UI check)
pnpm verify      # syntax, game rules vs SPEC.md, balance sim, UI smoke test
```

Local preview: `python3 -m http.server 8765` from the repo root. Outside claude.ai there is no database, so make a gitignored `test.html` that loads `dist/fake-db.js` with made-up data first (see the `lifeboard-setup` skill, "Local preview").

| Read this | For |
|---|---|
| [AGENTS.md](AGENTS.md) | How the code is laid out and the rules for changing it |
| [SPEC.md](SPEC.md) | Game rules: what earns what. The source of truth |
| [GLOSSARY.md](GLOSSARY.md) | Project terms (ring, plot, biome, visitor, …) |
| [models/README.md](models/README.md) | The 3D model pipelines |
| [LESSONS.md](LESSONS.md) | Mistakes made so far and what changed because of them |

## License

[MIT](LICENSE)
