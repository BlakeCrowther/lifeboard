# lifeboard

Personal life dashboard, published as a claude.ai Artifact with the `db` capability. Strict TypeScript in `src/` is bundled by esbuild to `dist/` (gitignored): `dist/app.js` (ES module) plus `dist/chunks/` (the garden and ecosystem packages, loaded on demand) and `dist/capture.js` (`capture.html`). Newcomer overview: `README.md`; terms: `GLOSSARY.md`.

- `src/`: TypeScript. `src/main.ts` is the bundle entry; `src/packages/<name>/` are deep modules, see [src/packages/README.md](./src/packages/README.md) before adding or importing one. Unit tests (Vitest) sit in each package's `tests/`; e2e in `tests/e2e/`. `.dependency-cruiser.cjs` enforces boundaries (`pnpm lint:boundaries`).
- Commands: `pnpm bootstrap`, `dev` (serve + watch build; `PORT` env, default 8765), `build`, `typecheck`, `lint`, `test`, `verify`, `test:ui`, `board` (a board's model files: seed, files, hydrate, merge-roster, publish-set).
- `index.html`: page + styles. Loads `dist/app.js` as a module (built from `src/main.ts` by `pnpm build`); the `garden` and `ecosystem` chunks load on demand when the game is on. `capture.html`: the Ecosystem alone for the model pipeline's headless capture (`dist/capture.js`, `window.Ecosystem`).
- `src/packages/`: strict TypeScript packages; domain ones are pure, no DOM: `dates` (day boundary in the browser's timezone, or `checks/profile.tz`), `recurrence`, `tasks`, `habits`, `game`; `ecosystem` (the three.js scene) and `garden` (Garden card, Collection), which render game state; plus `db` (zod schemas for every collection, `validate`, the store with live listeners, optimistic writes and undo, and an in-memory fake). Map: `src/packages/README.md`.
- Code names data after its db collection (`buyListItems` for `buy_list_items`, `habitSessions` for `habit_sessions`); UI labels may differ (GLOSSARY.md).
- `src/packages/ui/`: the board's views and actions (DOM). Root entry points: `boot.ts` (`bootBoard`, called by `src/main.ts`) and the pure `board-model.ts`, `quick-add.ts`, `repeat-presets.ts`, `list-kinds.ts`. One folder per tab (`today/`, `plan/`, `lists/`, `life/`, `grow/`) plus `sheet/` (add/edit sheet, chat), `actions/`, `app/` (render loop, events, navigation, drag), `game/` (game hooks, lessons) and `shared/`. ui may import any package; only `src/main.ts` imports ui.
- `package.json`: pnpm only (never npm/yarn). `pnpm verify` runs `tools/verify.sh`.
- Every new code file is TypeScript (`.ts`; Node 24 runs tools directly: `node tools/x.ts`). `pnpm verify` and the repo pre-commit hook (`tools/hooks/pre-commit`, installed by `./setup.sh`) fail on any `.js/.mjs/.cjs` outside `tools/check-no-js.ts`'s allowlist (generated `*-glb.js` model assets in `models/assets/`, `models/starter/assets/` and `models/board/assets/`, the eslint and dependency-cruiser configs). Python stays for Blender and the model gates (`pnpm lint:py`).
- `dist/fake-db.js` (from `src/fake-db-page.ts`) + `mockdata.js`: local `window.claude.use('db')` stand-in for preview and UI smoke, seeded from `window.MOCK`. `mockdata.js` holds a real-data snapshot and is gitignored. Never publish either.

Game spec: `SPEC.md` is the source of truth for game mechanics (garden, Ecosystem, lessons, rewards). Read it before touching `src/packages/game/` (rules in `lib/rules.ts`, `deriveGame` in `lib/derive-game.ts`), rewards or anything that changes what earns what. Any mechanic change updates `SPEC.md` (rule text and the section's **Status**) in the same commit, and `pnpm spec-check` (`tools/spec-check.ts`) must pass (it checks every `RULES` number in `src/packages/game/lib/rules.ts` against the spec, both ways). No mechanic may exist only in the UI or only in the spec unmarked; UI look and wording are free to differ. The old "Lifeboard Game Spec" doc is frozen; don't edit it.

Game layer derives state from db history on load (habit_sessions, checks).

Models: `models/` holds the 3D pipelines (Blender headless → glTF) for two kinds: creatures (Ecosystem visitors) and plants (one species per garden plant, made weekly for plots that need one; `stem_bloom` archetype; the garden package (`src/packages/garden`) matches them to plots by `plot` + `gen`). Start at `models/README.md`. Shared: `models/STYLE.md`, `models/shared/{blender,tools}/` (build, QA gates, verify, ledger). Layout: published paths never change (`models/roster.json`, `models/assets/x-glb.js`), but on disk a board's own models (roster, biomes, assets, specs) live in `models/board/`, which the public repo never commits (a board's own copy of the repo does, as that board's model history); the starter set is committed in `models/starter/` (`pnpm board seed` copies it into `models/board/`); `models/assets/` holds only the golden assets; pipeline files (archetypes, calibration, `specs/examples/`, `specs/quarantined/`) stay under `models/<kind>/`. The model dir in use is `models/board/` once it has a roster.json, else `models/starter/` (helpers `models/shared/tools/model-files.ts` and `model_files.py`; `pnpm board` has the commands, `models/README.md` "Layout"). Models publish separately from the page, only through `model-ship`. Per kind: `models/<kind>/{CONTRACT.md,archetypes/,specs/,qa.py}`. Skills in `.agents/skills/`: shared `lifeboard-setup`, `model-build`, `model-verify`, `model-ship`; creature `weekly-visitor` (orchestrator) → `creature-brief` → model-build → `creature-animate` → model-verify → model-ship; plant `season-seeds` (weekly) → `plant-brief` → model-build → `plant-grow` → model-verify → model-ship. Setup for a fresh clone: `lifeboard-setup` (`./setup.sh --check`, `.claude/launch.json` preview on 8765, scheduled-task template `.claude/scheduled/weekly-visitor.md`; setup asks which day it runs). Scenery (biome backdrop props, `models/scenery/`, `window.LB_SCENERY`): `scenery-make` builds the props a biome lists in biomes.json `scenery`; the Ecosystem package (src/packages/ecosystem) places them by phase. `models/out/` is a local work dir (gitignored).

Python lint/types: `pyproject.toml` (ruff + pyright; `fake-bpy-module` stubs for bpy) and `tools/lint-python.sh` over `models/**/*.py`; needs `uv`. Run it after changing any model-pipeline Python.

Pipeline map: `models/pipeline.html` is the living, visual map of the model pipeline (stages, gates, judge criteria and pass rules, loops, open weak spots). Any change to the pipeline (a stage, gate, check, judge rule, budget, or the skills that run them) updates the page's diagram and callouts in the same commit, then `python3 models/shared/tools/render_pipeline_map.py` regenerates its data block. `pnpm verify` fails if the data block is stale or pipeline files changed without the page.

Break overlay: `break/` is a native macOS menu-bar app (Swift, no Xcode) that covers all screens with a web view during timed breaks. `break/build.sh [--run|--now]` builds `break/out/LifeboardBreak.app`; `break/install.sh [--uninstall]` installs to ~/Applications + LaunchAgent (start at login). Skill: `break-setup`. Settings via `defaults write com.lifeboard.break` (workMinutes, breakMinutes, postponeMinutes, maxPostpones, skipDelaySeconds, url). Page bridge: `window.lifeboardBreak.{skip,postpone,done}()`, `lifeboardbreaktick` event. Escape: ⌃⌥⌘B.

## Which repo publishes which board
The public repo (`origin` is `github.com/BlakeCrowther/lifeboard`) is the template: it holds code, skills and the starter models, and **never publishes anyone's live board** (later it publishes a demo board on seed data, [feature lifeboard#11](https://github.com/BlakeCrowther/lifeboard/issues/11)). Every real board, the owner's included, runs from its own copy of this repo (the owner's is a private copy with an `upstream` remote pointing here) and publishes only from there. Weekly runs and their models live in that copy, so no one's models or habit names reach the public repo. In the public repo, never publish to a live board and never commit a board's models: `pnpm verify` fails if git tracks anything under `models/board/` in a checkout of the public repo (`tools/check-public-board.ts`).

## Board workflow (a board's own copy)
Cloners: your board is yours; publish it to your own artifact URL (setup does the first publish) and change it however you like.

Live vs repo: a board's published lifeboard artifact is the live copy; its own repo copy is what publishes its page. They drift when the live artifact is edited directly. Rule: before changing either, `read` the live artifact's page files and diff them against `main` (`pnpm build`, `pnpm live-diff --list` names the page files (`index.html`, `dist/app.js`, `dist/chunks/*`) to pull with `read` + `paths` into a dir, then `pnpm live-diff <dir>`; exit 1 = a page file differs: stale live or live-only edits; the exit code reflects page files only, and `--models` lists model files, informational: the store holding models the repo lacks is expected); port any live-only changes into the repo first (they win unless a game change replaces them), then make the change here, run `pnpm verify`, and publish from the repo. Never edit the live artifact without landing the same change in the repo. Each board's copy keeps itself and its artifact in sync.

Publish: a page publish (a code change) runs `pnpm build` first (dist/ is gitignored and must be fresh), then the Artifact tool with `index.html` and every file in `dist/` (including `dist/chunks/`) as `files`, to the existing lifeboard artifact URL, and sends page files only, never model files (the Artifact tool keeps files a publish leaves out, so the board's models survive it). Model files (`models/roster.json`, `models/biomes.json`, assets, specs) go only through `model-ship`, with the map from `pnpm -s board publish-set`, and never page files. The first publish (setup) sends both. Data lives in the artifact db, not this repo. **Publishing is pre-approved** (owner, 2026-11-19, for the owner's board from the owner's copy): finished work and the weekly run publish without asking, once checks pass and the live diff (above) shows no live-only changes. If live has changes the repo lacks, port them first; if they conflict, stop and report instead of overwriting. Strip the artifact service's wrapper lines from any page pulled from live.

## Subagent models (cost, while testing)
Every subagent a skill spawns uses `model: "sonnet"`, judge-panel judges included (each kind's `qa_calibration.json` `judge_model`, goldens re-judged on sonnet 2026-11-19). Exception: novel-archetype generator writing may use the session model after a sonnet attempt fails shape-check/judge-panel. Switching the judge model means re-judging each golden median-of-3 and rewriting its bar. Weekly runs follow this unattended. `lifeboard-setup` asks a fresh clone which default to use.

## Improve as you go (verify → fix the cause → log)
Every task and every skill run in this repo ends with this loop. It's how the prompts, skills and gates get better instead of the same mistake repeating.
1. **Verify before saying done**: `pnpm verify` runs the checks below (no stray JS, no board models tracked in the public repo, spec-check, sim, typecheck, lint, build, vitest, eval self-test, biomes, pipeline map, UI smoke via headless Chromium: `tests/e2e/ui-smoke.ts`, synthetic `tests/e2e/fixture.ts`, doc frontmatter, python lint) and fails if any fail. Run single ones when iterating: `pnpm test` (vitest, package tests in `src/packages/*/tests/`), `pnpm spec-check` (game rules), `pnpm sim` (balance, `tools/sim.ts`), `pnpm typecheck`, `pnpm lint:py` (ruff + pyright on models/**/*.py), `pnpm eval --self-test`, `tools/check-doc-frontmatter` (ADRs and design docs; needs `uv`), `pnpm test:ui` + the preview (UI), `verify.sh` + judges (models). Not in `verify`: visual review in the preview, model gates (`verify.sh` + judges). Say what you couldn't check.
2. **Retro**: list each thing that went wrong or wasted time (a failed gate, a wrong assumption, a retry, a user correction).
3. **Fix the cause where it lives**, in the same commit: the skill step, prompt wording, gate threshold or tool that let it happen, not just this instance. Prefer a check that fails loudly (a gate, an assert, spec-check) over a sentence of advice.
4. **Log it**: one line in `LESSONS.md` (date, what happened, what changed). Read `LESSONS.md` before starting a skill run or a big change.
5. **Re-verify** the fix on the thing that failed (re-run the gate, the sim, the skill step). If it still fails, go round again; after three rounds, stop and report.
Unattended runs (the weekly check) do steps 1–5 themselves and list the fixes in their report; they never change game numbers; they do publish (pre-approved, see Publish).

## Agent skills

### Issue tracker

GitHub Issues on this repo, with the epic/feature/task labels and Dev Board. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; ADRs use OKF frontmatter. See `docs/agents/domain.md`.

<!-- dev-home:standards:start -->
<!-- Managed by dev-home sync-standards.sh. Edit repo-rules.md in dev-home, not here. -->

## Standards

Shared across Blake's repos. Repo-specific sections of this file override these rules.

### Commands

Exact commands are listed elsewhere in this file. Every repo has `bootstrap`, `dev`, `lint`, `typecheck`, `test`, `verify`; `services` if it has backing services.

- Fresh worktree or sandbox: run `bootstrap` first. It never starts services. Never run `pnpm setup` (pnpm builtin; edits shell config).
- Start services only when the task needs them (`services`, or `dev`).
- Never hardcode ports. HTTP via portless (`PORT`); databases via `*_URL` vars in `.env`.
- Agents and sandboxes run `dev` with `PORTLESS_HTTPS=0` (no local CA or sudo) or `PORTLESS=0` (no proxy).
- Run `verify` before claiming done.
- Package managers: pnpm for JS (`packageManager` field, `pnpm-lock.yaml`; never npm or yarn), uv for Python. Commands run as `pnpm <script>`.

### Testing

- Add a test only when it catches a failure nothing else catches. Extend an existing test before adding one.
- No tautological tests: no asserting mocks, restating the implementation, or testing the framework or type checker.
- Test behavior through public interfaces. A bug fix comes with a test that fails without it.
- Prove a new check bites: make it fail once on a planted violation before trusting it. A check that warns and exits 0 checks nothing.
- Every check runs in `verify` (or CI). A check script nothing runs rots; wire it in or delete it.

### Git and PRs

- Conventional Commits: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- Never push, force-push, or commit directly to the default branch. Every change lands through a PR, squash-merged. Applies even where GitHub doesn't enforce it.
- Branch `<type>/<slug>`. Rename agent-prefixed branches (`claude/`, `cursor/`, `codex/`) before the first push.
- Commit subject `<type>(<scope>): <summary>`, imperative, lowercase, no period. Body says why.
- Issue titles are plain prose naming the outcome. Never a type prefix (`feat:`, `docs:`, `epic:`): the `epic`/`feature`/`task` label and sub-issue links carry type and hierarchy. The prefix belongs to commits, branches and PR titles only.
- PR title uses the commit subject format. PR body: Why, What, Testing, Evidence, Notes.
- Add each new PR to the Dev Board project: `gh project item-add 1 --owner BlakeCrowther --url <pr-url>` (skip if `gh` lacks the `project` scope).
- Evidence: screenshots and a short recording for UI changes; command and output for API/CLI/data changes. Media goes on the PR, never in git (`.artifacts/` is gitignored).

### Code comments

Comments are for humans. Default: none.

- Why, not what. Rename before commenting.
- No stale facts: counts, versions, dates, line numbers, caller names, "currently". Point at the source of truth.
- No history ("new", "fixed", "now"); that goes in commits.
- Contract at the boundary: inputs, outputs, invariants, errors, units.
- Tag debt: `TODO(issue):`, `FIXME:`, `HACK:` (why + exit condition), `NOTE:`.
- No dead or commented-out code. Update comments with the code.

### Naming and explaining

Written for a reader who switches in cold: the name or the first line should be enough.

- Names say what a thing is or does, in plain words. No bare codes or numbers as identity (`G5`, `g23`, `tmp2`); a number may count things, never name them.
- One name per concept everywhere (code, files, docs, UI), and one concept per name. Never reuse a name for a second thing. Rename when the meaning drifts, and update every reader in the same change.
- Renames stop at persisted data (db collections and fields, storage keys, published paths) unless the same change ships a migration.
- Refer to a GitHub item as a link with kind, repo, number and title: `[PR lifeboard#34: add pnpm verify](url)`, `[epic lifeboard#20: lifeboard for anyone](url)`. Kind is `PR`, or the issue's `epic`/`feature`/`task` label (`issue` if none). Never a bare `#N`. Shorten long titles; keep the number.
- Files and tools are named for their job (`render_contact_sheet`, not `qa_render`). Siblings follow one verb pattern.
- Define each project term once in the repo's glossary. Gloss it at first use in any doc or plan.
- Any pipeline or system of three or more stages gets a map (diagram plus table) in the repo, kept in step with renames.
- Plans, reports and status: first line is the goal or result in plain words. Say what changed, what is verified, what is not. Restate where things stand; assume the reader forgot. Use a table or diagram over a paragraph for stages and comparisons.

### Public-safe repos

Every repo may go public, and history is public with it.

- No absolute or home paths in tracked files (`/Users/...`). Use repo-relative paths; `~` or `$HOME` only in docs and setup scripts.
- The repo ships code and synthetic data, never the owner's real data. Defaults, seeds, fixtures and mocks are made up. Real snapshots and backups stay gitignored or outside the repo.
- Owner-specific labels (places, pet or people names shown in the UI) come from the app's own data or untracked config, not hardcoded. Names in docs, copy and examples are fine.
- Never commit secrets, tokens, account or artifact IDs. Use placeholders (`<id>`) and env vars.
- Verify with synthetic data. If a real-data check is needed, run it locally and commit only the result, not the data.
- Every clone runs the check on each commit: `dev-home/install-hooks.sh` installs a pre-commit hook that blocks staged lines with home paths, personal emails, artifact IDs, keys or private words (`--no-verify` only when it is meant to be public).
- Before a repo goes public: `dev-home/public-check.sh <repo> --history` must be clean. If history has hits, publish a fresh repo from a squashed commit (or rewrite history) before flipping visibility.
- Private words to scan for (names, places) go in `~/.config/dev-home/private-words`, never in a repo.

### Docs

- Decision records (`docs/adr/`) and design docs (`docs/design/`) use OKF frontmatter with a `type`; `GLOSSARY.md` stays plain. Format and status mapping: dev-home `STANDARDS.md`, "Docs convention".

### Plugins and sessions

- Personal plugin packs (pstack, Pocock, EGM, model-selector) are enabled in user settings (`~/.claude/settings.json`), so they load in every repo. Never add them to a repo's `.claude/settings.json`; declare a plugin there only if the repo can't be worked on without it.
- Start a session in the repo you're changing, so its skills, `.claude/launch.json` and `AGENTS.md` load. Start from dev-home only for work that spans repos.

<!-- dev-home:standards:end -->

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

Use the repository's documented maintenance process to refresh generated pages after source changes. Check its configuration and completed runs before relying on automatic updates. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
