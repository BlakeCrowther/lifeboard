---
name: lifeboard-setup
description: Set up a new lifeboard board, or health-check an existing one. Starts by asking how much to decide (do it all with defaults, a few choices, or everything), then makes the board's own copy of the repo, asks only that level's questions (name, timezone, week start, commit lock, Ecosystem and Garden, tips, models), publishes the board as the user's own artifact, and optionally installs the 3D model toolchain (Blender, ImageMagick, Node) and the weekly run. Use when someone first opens this repo, says "set up lifeboard", moves to a new machine, or a model skill fails with a tooling error.
---

# Lifeboard setup (fresh clone)

## How much to decide (ask first, always)
One question, with AskUserQuestion when available:
- **Do it all (Recommended)**: sensible defaults, no more questions. Includes making your private copy, publishing your board and the weekly 3D run.
- **A few choices**: the handful that matter most (marked "few" below).
- **Let me choose everything**: every setting below.

Then follow the steps, asking only the questions the chosen level includes; every other setting takes its default without asking. "Do it all" never asks anything after this question and never needs the user to type in a terminal: Claude runs every command. Remember the level for this run only.

| Setting | Default | Asked at | Saved in | Step |
|---|---|---|---|---|
| Where your copy lives | GitHub, private, when `gh auth status` succeeds; otherwise this computer only | few, all | the copy itself | 0 |
| Your first name | none (plain "Good morning.") | few, all | `checks/profile.name` | Your labels |
| Timezone | the one this machine reports | all | `checks/profile.tz` | Your labels |
| Place for the conditions card | none ("Local conditions") | all | `checks/profile.place` | Your labels |
| Pets | none (pet filter hidden) | all | `checks/profile.pets` | Your labels |
| Week start | Monday | few, all | `checks/week_start` | Weekly scheduled task |
| Commit lock | right away (`0`) | all | `checks/ui_prefs.commitLock` | Ecosystem and Garden toggles |
| Ecosystem and Garden | both on | all | `checks/ui_prefs.eco`, `.garden` | Ecosystem and Garden toggles |
| Theme | auto | all | `checks/ui_prefs.theme` | (the page's display settings) |
| Tips | on | all | `checks/ui_prefs.tips` | (the page's display settings) |
| Lessons a day | the defaults in `RULES.lessons` | all | `checks/lesson_rules` | (lesson-make) |
| Weekly 3D models | on: install the toolchain (`./setup.sh`) and register the weekly run | few, all | the scheduled task | 1, Weekly scheduled task |
| When the weekly run happens | the night before the week starts, 22:43 local | all | the scheduled task | Weekly scheduled task |
| Subagent model | Sonnet | all | this copy's `AGENTS.md` | Subagent model |

Fixed, never asked: seasons, game rules and numbers (SPEC.md), what earns points.

**Changing a setting later.** The owner can re-run setup (it skips what's done and asks the level again) or say "change <setting>" ("change my week start", "turn tips off", "move my weekly run to Saturday"): go straight to that row's step, ask just that question, write it where the table says, and stop.

Order: 0 your own copy → 1 toolchain (`./setup.sh`) → 2 local preview → 3 Ecosystem/Garden toggles + commitment lock → 4 publishing → 5 runtime test hook → 6 weekly scheduled task. Run `./setup.sh` first; it says exactly what is missing:

```bash
./setup.sh                             # install what's missing (macOS brew, Linux apt/dnf, Windows winget), then check
./setup.sh --check                     # checks only, installs nothing
```

## 0. Your own copy (first, once)
A board runs from its own copy of this repo, never from the public template (AGENTS.md "Which repo publishes which board"). If `git remote get-url origin` is `github.com/BlakeCrowther/lifeboard`, make the copy before anything else:
1. Ask where it lives (one question): **GitHub, private (Recommended)**: works for cloud sessions and the weekly cloud run; needs a GitHub account. **This computer only**: no GitHub; local runs only.
2. GitHub:
   ```bash
   git fetch --tags origin main
   git clone --branch <newest v* tag, or main if none> https://github.com/BlakeCrowther/lifeboard my-lifeboard && cd my-lifeboard
   git switch -c main 2>/dev/null || git switch main
   git remote rename origin upstream
   gh api user/repos -f name=my-lifeboard -F private=true
   git remote add origin https://github.com/<their login>/my-lifeboard && git push -u origin main
   ```
   (In a cloud session, attach the new repo with the session's repo tools before pushing.) This computer only: the same without `gh api` and the last line; keep `upstream`.
3. From here on, work in the copy. Tell the user to start future sessions in it, and that `lifeboard-update` brings in upstream changes later.
4. Seed the board's models: `pnpm board seed` (copies the starter set into `models/board/`), commit it (`git add models/board && git commit -m "chore: seed this board's models"`).

The demo board (seed data, "Demo" badge) is the public repo's own; a copy doesn't need it.

## 1. Toolchain (model pipelines)
### Required
| Tool | Why | Install |
|---|---|---|
| Blender ≥ 5.3 | Headless modeling, rigging, animation, baking, QA renders, glTF export (`blender -b`) | `./setup.sh` (free, GPL) |
| ImageMagick | Contact sheets for the visual judge | `./setup.sh` |
| Node ≥ 20 + `npx @gltf-transform/cli@4` | Validate + optimize `.glb` | `./setup.sh` (gltf-transform fetched by npx) |
| Scheduled tasks (cloud or desktop app) | Runs `weekly-visitor`: cloud = a fresh session per run in the lifeboard environment (setup script runs `./setup.sh`); Mac = desktop app, Mac must be awake | `.claude/scheduled/weekly-visitor.md` |

### Optional (interactive development only)
**Blender MCP** (official, Blender Lab) lets Claude drive a live Blender window. The weekly run does NOT use it.
1. Claude desktop → Extensions → install "Blender" (Blender Lab).
2. In Blender: Edit → Preferences → Get Extensions → add repository `https://lab.blender.org/` → install + enable "MCP". Its settings live under Preferences → Add-ons → MCP (no N-panel tab); "Auto Start" is on by default (port 9876).
3. Restart Claude (⌘Q). Test: ask Claude for the Blender scene summary.

## Known gotchas
- `npx` gltf-transform/sharp needs node >= 20; under node 18 export-check fails with `SyntaxError: Unexpected token 'with'`. Put a newer node first on PATH (nvm) before verify.sh; `./setup.sh --check` fails on an older node. (seen on this Mac, Nov 2026)
- **Blender MCP extension fails with `pydantic-core`/`rpds-py` build errors.** `uv` picked a too-new Python (3.15) with no wheels, then tried to compile with Rust. Fix: pin 3.12 in the extension folder (`./setup.sh --check` prints the exact command) and/or `uv python pin --global 3.12`. Reinstalling the extension wipes the folder pin.
- **Rust "can't find crate for core" on Apple Silicon.** rustup default toolchain is x86_64. `rustup default stable-aarch64-apple-darwin`.
- **Artifacts won't serve `.glb`.** Ship models as base64 JS (`assets/<id>-glb.js` in the board dir) and parse with `GLTFLoader.parseAsync`. `model-ship` does this.
- **Blender MCP vs. ahujasid `blender-mcp`.** Different projects. This repo assumes the official Blender Lab one (or none).
- **Third-party add-on safety.** Any Blender MCP runs arbitrary Python inside Blender; only keep it connected while using it.

## Local preview
- `.claude/launch.json` (in the repo) runs `pnpm dev` (config name `lifeboard`): it serves the **repo root** on 8765 and maps `/models/<path>` to `models/board/`, then `models/starter/`, then `models/` (so the preview shows the board's models, or the starter set on a fresh clone). In Claude: `preview_start` with name `lifeboard`, then open `http://127.0.0.1:8765/`. By hand: `pnpm dev` (`PORT` overrides the port).
- In a git worktree, `preview_start` `lifeboard` may serve the **main checkout**, not your worktree. Serve the worktree on another port (`PORT=8766 pnpm dev` in the worktree, then `preview_start` with that url) and confirm with `fetch('/the Ecosystem package (src/packages/ecosystem)')` that the page has your change before judging a screenshot.
- The real page talks to the artifact db through `window.claude.use('db')`, which only exists inside claude.ai. Locally, `dist/fake-db.js` (built by `pnpm build` from `src/fake-db-page.ts`) stands in with an in-memory db (`onSnapshot`, `doc().set/update/delete`) seeded from `window.MOCK`.
- `mockdata.js` = `window.MOCK = { <collection>: { <docId>: {...doc} } }`. The owner's file is a personal data snapshot and is **gitignored**; you won't have it. Make your own: start with `window.MOCK={}` (empty dashboard) or add a few docs per collection using the shapes in `src/packages/db/lib/schemas.ts` (`tasks`, `habits`, `habit_sessions`, `checks`, `list_items`, …). Keep it out of git.
- Load order for a local test page (also gitignored: `test.html`): copy `index.html` and insert `<script src="mockdata.js"></script><script src="dist/fake-db.js"></script>` before `dist/app.js` (run `pnpm build` first).
- `./setup.sh --check` checks that `.claude/launch.json` exists and reports `mockdata.js` as optional.

## Ecosystem and Garden toggles
The game (reef points, garden, visitors) starts at 0 on the day the game is first turned on: that date is written once to db `game_state/game.started` and earlier history is ignored. The reef/Ecosystem counts from that day and never resets weekly; the garden runs Mon–Sun weeks from the first Monday on/after it (plots stay seeds until then). Delete that doc to restart from 0.
The display-settings popover (sliders icon) has **Ecosystem** and **Garden** toggles (both on by default; they and the theme are saved board-wide in db `checks/ui_prefs` as `{eco, garden, theme}` so every device matches, newest change wins) that shows the experimental Ecosystem (creatures) and garden (plants) cards. Turn it on to see models in the page; the rest of lifeboard works without it. With either on, Grow gets a third view, **Collection**: one diorama per finished biome (plus the one growing now; tap to inspect dates, stats, signature and visitors) and the pressed habit plants.


**Commit lock** (ask once, with AskUserQuestion when available; SPEC.md "Ring %"). A task is committed to a day when that day arrives with it due (or it's put on today); the lock is how long after that you can still move it off today without it counting as missed. Options: "Right away (Recommended)" = `0`, "5 minutes" = `5`, "3 hours" = `180` (a morning planning window), "End of day" = `"end"` (free re-planning, but a late-night move keeps the ring full); accept any other duration as minutes. Write it into the board prefs without dropping the other keys: `ArtifactData` update `checks/ui_prefs` → `value.commitLock` and `updated_at` = now (read the doc first; skip if it already holds that value). Default when unset: `0`.

**Biome identity.** `models/board/biomes.json` (the starter's until the board has its own) gives every biome a `look` (shape language, palette, owned motifs, creature/plant style, motion) under shared `identity_rules`. creature-brief and plant-brief design to it, the Ecosystem package (src/packages/ecosystem) builds its scene frame and pieces from the same identity, and the Collection diorama draws from its palette. A new biome needs a `look`, a `scene` builder in the Ecosystem package (src/packages/ecosystem) `tiers` + `FRAME` + `LOOKS`, and a diorama `MOTIF` in garden.js.

## Publishing
- The page is one claude.ai Artifact with the `db` capability, published with the Artifact tool to the **existing** lifeboard artifact URL (never a new URL; AGENTS.md). The page and the board's models publish separately and never overlap (the Artifact tool keeps files a publish leaves out). **First publish**: `pnpm build`, `pnpm board seed`, then `index.html` + `dist/app.js` + `dist/chunks/*.js` **plus** the files `pnpm -s board publish-set --all` maps (`models/roster.json`, `models/biomes.json`, every roster `js` asset and `spec` json; a spec gives locomotion/name, default swim). **A page publish** (a code change): `pnpm build`, then `index.html` and `dist/**` only, never model files. **A model publish** is model-ship's alone (`publish-set --ids`). three.js r170 loads from cdn.jsdelivr.net via the importmap in `index.html`, only when the Ecosystem is on. Optional db collection `visitors_met` is written only with the Ecosystem on. Models are files of the same artifact; there is no separate model artifact.
- Never publish `dist/fake-db.js`, `mockdata.js`, `test.html` or anything under `models/out/`.
- Someone cloning the repo publishes to an artifact of their own (first publish creates it; reuse that URL afterwards).

## Runtime test hook
The Ecosystem supports `?visitor=<id>`, `#visitor=<id>` and `#visitor-<id>` (use the last one in the published artifact, which only passes plain `#name` hashes); any of them turns the Ecosystem on for that visit only. `#eco` turns it on without a visitor. It it injects a candidate creature (from `window.LB_CREATURES[<id>]`, e.g. a wrapped `models/out/<id>/<id>-glb.js`) into the Ecosystem so page-test (model-verify) can check it in the real page before it ships.

## Subagent model
Ask once (AskUserQuestion): which model skill subagents default to. Options: "Sonnet (Recommended, cheaper)", "Same as session (judges too)", "Haiku (cheapest, weaker briefs)". Write the answer into this clone's `AGENTS.md` "Subagent models" line. judge-panel judges follow the same default; changing it means re-judging each golden (see AGENTS.md).

## Your labels (checks/profile)
Owner-specific labels and ids live in the board, never the repo. Ask (all optional): their first name (the Today greeting and prompts; without it the greeting is plain "Good morning."), the timezone (default: the one this machine reports, e.g. `America/Los_Angeles`; the board's day boundary, otherwise the viewer's browser zone), the place name for the conditions card, and pet names with kind (dog/cat). Write `ArtifactData` update `checks/profile` = `{value: {name, tz, place, pets: [{name, kind}]}, updated_at: <ms>}` (keep fields already there, e.g. `duet_trigger`, the owner's own scheduled agent's trigger id, which shows "Send to Duet" on tasks). Without a place the card says "Local conditions"; without pets the pet filter is hidden.

A brand-new board seeds a few starter tasks on first open that teach how points work (`seedStarterTasks` in `src/packages/ui/shared/commitments.ts`); nothing to do here.

## Weekly scheduled task (the weekly check)
`.claude/scheduled/weekly-visitor.md` holds the prompt and the cron shape (`0 <hour> * * <day>`). The weekly check makes the visitor and the garden plants that bloomed or died that week need (SPEC.md Weekly job).
1. **Ask which day the week starts** (one question, with AskUserQuestion when available): the day habit streaks reset, garden plants grow, and the weekly check runs (early that morning, so the week that just closed is in). Options: "Monday (Recommended)", "Today (<weekday>)", "Sunday", or another day. Write it to the board: `ArtifactData` set `checks/week_start` = `{value: <0 Sun .. 6 Sat>, updated_at: <ms>}` on the lifeboard artifact (skip if it already holds that day). Ask the time only if they care (default 06:00).
2. Check nothing is registered yet (scheduled-tasks list; or ask). Then, on their yes, register it with the cron for that day and hour (`0 <hour> * * <day>`, same day as `checks/week_start`), the prompt from the template and working directory = this board's copy, never the public template (cloud: create the task in claude.ai with the copy's repo and the environment attached; Mac: desktop app → Scheduled). Never register without that yes.
3. The Mac must be awake at run time (the template says how). Changing the day later: re-run this step and update the existing task; don't add a second one.

## Repo hygiene
- A copy of the repo made before models moved to `models/board/` moves its models over with `lifeboard-update` (`tools/board-legacy.ts`, PR lifeboard#30); setup does not.
- `models/out/` (builds, QA renders, run ledgers, quarantine) is gitignored local work; `models/board/` (roster, assets, specs) is what ships and is untracked in the public template (a board's own copy commits it); `models/starter/` is the starter set seeded into it; `models/assets/` holds the golden assets.

## Sharing checklist
Someone cloning this repo needs: the tools above, `./setup.sh` passing, their own `mockdata.js` for local preview, a lifeboard artifact of their own (see AGENTS.md + Publishing), and (optionally) the weekly check registered on the day they chose.
