# lifeboard

A personal life dashboard that runs as a claude.ai Artifact: tasks, habits, lists, goals and lessons on one page, with a small game on top. Your habits grow a **Garden**, finishing the day's tasks grows an **Ecosystem** that moves through biomes (underwater, land and sky) and that new creatures visit, and short daily **lessons** from things you've read bring both to life.

Your data lives in the artifact's own database, not in this repo. Claude can read and write it too, so you can say "add a dentist appointment for Friday" or "make lessons from this book" and it shows up on the board.

This repo also publishes a **demo board** on synthetic data, marked "Demo" (the `demo-board` skill), so you can look before you set up your own.

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

You need a Claude account with Artifacts and Claude Code (desktop app or CLI). Lifeboard works with Claude only for now; see [Agent support](#agent-support).

**Just the board (no terminal skills needed):**
1. Clone or download this repo and open the folder in Claude Code.
2. Say: *"Run lifeboard-setup"*. It asks a few questions (your name, timezone, week start, how strict the day's ring is) and publishes the board as your own private artifact.
3. Open the link it gives you. Pin it in claude.ai so it's one click away.

**With the 3D models** (creatures and plants made each week): setup also checks Blender, ImageMagick and Node, offers to install what's missing with `./setup.sh` (macOS, Linux and Windows; also what a cloud environment's setup script can call), and registers the weekly job. See [models/README.md](models/README.md).

**Optional extras:**
- **Lifeboard Break** (macOS): a menu-bar app that covers your screens with the board during timed breaks. Say *"run break-setup"*.
- **Lessons**: say *"make lessons from &lt;book, video, article&gt;"* (the `lesson-make` skill).

## Agent support

Lifeboard is built for Claude. Other agents are planned ([feature lifeboard#10: agent-agnostic lifeboard](https://github.com/BlakeCrowther/lifeboard/issues/10)); until then they are not supported. What each provider offers natively for the things lifeboard needs (checked 2026-11-24):

| Provider | Lifeboard | Hosted page | Page db | Agent reads/writes the db | In-page AI | Scheduled runs | Skills + `AGENTS.md` |
|---|---|---|---|---|---|---|---|
| Claude (claude.ai + Claude Code) | **supported** | yes | yes | yes | yes | yes | yes |
| ChatGPT / Codex | not yet | yes (Sites, Plus+) | yes | via a plugin on the Site | no | yes | yes |
| Cursor | not yet | yes (Apps, paid) | yes | not documented | not documented | yes | yes |
| Gemini | not yet | yes (Canvas) | yes | no (tested) | yes | not for apps | yes |
| GitHub Copilot | not yet | no | no | no | no | yes | yes |
| Grok | not yet | unverified | no | no | unverified | unverified | unverified |

The blocker everywhere else is the agent reading and writing the board's data: the weekly run and the skills depend on it.

## Working on it

`index.html` loads one built bundle, `dist/app.js` (from `src/main.ts`); the game's `garden` and `ecosystem` packages load on demand as separate chunks (`dist/chunks/`). Run `pnpm build` (or `pnpm dev`) first. Everything else lives in `src/packages/`: domain logic (dates, recurrence, tasks, habits, game), the data layer (db) and the views (ui, one folder per tab).

```bash
pnpm bootstrap   # install dev tools (Playwright for the UI check)
pnpm verify      # no stray JS, types, lint, game rules vs SPEC.md, balance sim, evals, UI smoke, python lint
```

Local preview: `pnpm dev` (port 8765, `PORT` overrides; it serves the repo root and maps `/models/...` to the board's models, the starter set and the golden assets). Outside claude.ai there is no database, so make a gitignored `test.html` that loads `dist/fake-db.js` with made-up data first (see the `lifeboard-setup` skill, "Local preview").

| Read this | For |
|---|---|
| [AGENTS.md](AGENTS.md) | How the code is laid out and the rules for changing it |
| [SPEC.md](SPEC.md) | Game rules: what earns what. The source of truth |
| [GLOSSARY.md](GLOSSARY.md) | Project terms (ring, plot, biome, visitor, …) |
| [models/README.md](models/README.md) | The 3D model pipelines |
| [LESSONS.md](LESSONS.md) | Mistakes made so far and what changed because of them |

## License

[MIT](LICENSE)
