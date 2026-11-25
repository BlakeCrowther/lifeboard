# lifeboard

A personal life dashboard that runs as a claude.ai Artifact (a page published on claude.ai, with its own database): tasks, habits, lists, goals and lessons on one page, with a small game on top. Claude can read and change your board too, so "add a dentist appointment for Friday" or "make lessons from this book" shows up on the page.

The game: your habits grow a **Garden** (one plant per habit), finishing the day's tasks grows an **Ecosystem** (a 3D scene that moves through biomes and that a new creature visits each week), and short daily **lessons** from things you've read feed its creatures. Every term is defined in [GLOSSARY.md](GLOSSARY.md); the rules are in [SPEC.md](SPEC.md).

**See it:** open this repo in Claude Code and say *"run demo-board"*. It publishes a demo board on made-up data, marked "Demo", to your own claude.ai account, so you can look around before setting up yours.

## What's on the page

| Tab | What it holds |
|---|---|
| **Today** | Today's tasks and the day's ring (done ÷ committed), the Ecosystem, habit plants, calendar, due lessons |
| **Plan** | The week ahead, day by day |
| **Lists** | Groceries, wish list, recipes, gifts, books, movies, shows, and any list you add |
| **Life** | Health, Money, Home & Pets, Hobbies: tasks by area, small checklists, big-day countdowns |
| **Grow** | Habits, yearly goals, and the Collection (finished biomes and pressed plants) |

A new board starts with a few starter tasks that explain the scoring as you go, and info buttons (tips) on the cards.

## Start your board

You need a Claude account with Artifacts and Claude Code (the desktop app, claude.ai/code, or the CLI), and a GitHub account to hold your private copy of the repo. GitHub is required in a cloud session (claude.ai/code), because the cloud machine is thrown away afterwards; only a session on your own computer can keep the copy there instead. Lifeboard works only with Claude; see [Agent support](#agent-support).

**Not technical? Three steps, no terminal.**
1. Open this repo in Claude Code: start a session on `github.com/BlakeCrowther/lifeboard`.
2. Say *"run lifeboard-setup"* and choose **do it all**. It makes your own private copy of the repo, picks sensible settings, publishes your board as your own private artifact, and sets up the weekly run. (Choose **a few choices** or **everything** instead to set your name, timezone, week start and the rest yourself.)
3. Open the link it gives you and pin it in claude.ai. From then on, start Claude Code sessions in your copy, not here.

**Technical? Clone and run it locally first.** You need git, Node 24 or newer, pnpm (`corepack enable`) and python3; `pnpm verify` also runs the Python lint and doc checks when [uv](https://docs.astral.sh/uv/) is installed (it skips them otherwise).
```bash
git clone https://github.com/BlakeCrowther/lifeboard && cd lifeboard
pnpm bootstrap   # install dependencies and the headless browser for the UI check
pnpm demo:mock   # write made-up board data to mockdata.js (gitignored)
pnpm dev         # build, watch, and serve on port 8765 (PORT overrides)
```
Open http://127.0.0.1:8765/test.html: the page running on the made-up data, with an in-memory stand-in for the database (the real one exists only on claude.ai). Run `pnpm verify` before you call a change done. To publish a real board, say *"run lifeboard-setup"* in Claude Code from this clone; it turns the clone into your board copy and publishes from there.

**Optional extras:**
- **3D models**: a new creature each week and a plant for each habit, made by the weekly run. Setup checks Blender, ImageMagick and Node, offers to install them with `./setup.sh` (macOS, Linux, Windows, or a cloud environment's setup script) and registers the weekly run. See [models/README.md](models/README.md).
- **Lifeboard Break** (macOS): a menu-bar app that covers your screens with the board during timed breaks. Say *"run break-setup"*.
- **Lessons**: say *"make lessons from &lt;book, video, article&gt;"* (the `lesson-make` skill).
- **Not sure how to fit an idea in?** Say *"I want something that…"* and the `suggest` skill offers two or three ways to build it into your board.

## How your board works

| Piece | What it is | How it changes |
|---|---|---|
| **Your board copy** | Your own private copy of this repo, made by setup: the code, the skills, and your board's 3D models (`models/board/`) | You and Claude change it; it publishes your board |
| **Your board's artifact** | The page on claude.ai and its database, which holds all your data (tasks, habits, lessons) | You use the page; Claude reads and writes the database |
| **Updates** | New versions of lifeboard from this repo (**upstream**) | Say *"run lifeboard-update"* in your copy: it merges them in and keeps your models and changes |
| **Contributing** | A fix you made in your copy, sent back here | Say *"run lifeboard-contribute"*: it sends only that change, checked for personal data. See [CONTRIBUTING.md](CONTRIBUTING.md) |
| **The demo board** | This repo's own board, on made-up data | The `demo-board` skill; this repo never publishes anyone's real board |

Your data never enters any repo: it lives in your artifact's database. Your models live in your copy, never here.

## Agent support

Lifeboard is built for Claude. Other agents are planned ([feature lifeboard#10: agent-agnostic lifeboard](https://github.com/BlakeCrowther/lifeboard/issues/10)) and not supported yet. What each provider offers natively for the things lifeboard needs (checked 2026-11-24):

| Provider | Lifeboard | Hosted page | Page db | Agent reads/writes the db | In-page AI | Scheduled runs | Skills + `AGENTS.md` |
|---|---|---|---|---|---|---|---|
| Claude (claude.ai + Claude Code) | **supported** | yes | yes | yes | yes | yes | yes |
| ChatGPT / Codex | not yet | yes (Sites, Plus+) | yes | via a plugin on the Site | no | yes | yes |
| Cursor | not yet | yes (Apps, paid) | yes | not documented | not documented | yes | yes |
| Gemini | not yet | yes (Canvas) | yes | no (tested) | yes | not for apps | yes |
| GitHub Copilot | not yet | no | no | no | no | yes | yes |
| Grok | not yet | unverified | no | no | unverified | unverified | unverified |

The blocker everywhere else is the agent reading and writing the board's data: the weekly run and the skills depend on it.

## Working on the code

`index.html` loads one bundle, `dist/app.js` (built from `src/main.ts` by `pnpm build` or `pnpm dev`); the `garden` and `ecosystem` packages load on demand from `dist/chunks/`. The code lives in `src/packages/`: domain logic (dates, recurrence, tasks, habits, game), the data layer (db) and the views (ui, one folder per tab).

| Read this | For |
|---|---|
| [AGENTS.md](AGENTS.md) | How the code is laid out and the rules for changing it |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Sending a change to this repo, opening an issue |
| [SPEC.md](SPEC.md) | Game rules: what earns what. The source of truth |
| [GLOSSARY.md](GLOSSARY.md) | Project terms (ring, plot, biome, visitor, board copy, …) |
| [models/README.md](models/README.md) | The 3D model pipelines |
| [LESSONS.md](LESSONS.md) | Mistakes made so far and what changed because of them |

## License

[MIT](LICENSE)
