# lifeboard

Personal life dashboard, published as a claude.ai Artifact with the `db` capability. No build step.

- `index.html`: page + styles. Loads `logic.js`, `schema.js`, `store.js`, `app.js` in that order.
- `logic.js`: pure date/task/habit/recurrence logic (TZ America/Los_Angeles). No DOM.
- `schema.js`: db collection shapes; `validate(col, doc)`.
- `store.js`: artifact-db data layer (live listeners, optimistic writes).
- `app.js`: views and actions.
- `mock.js` + `mockdata.js`: local `window.claude.use('db')` stub for testing. `mockdata.js` holds a real-data snapshot and is gitignored.

Live vs repo: the owner's published lifeboard artifact is the live copy; this repo is the template others clone. They drift when the live artifact is edited directly. Rule: before changing either, `read` the live artifact's files and diff them against `main`; port any live-only changes into the repo first (they win unless a game change replaces them), then make the change here, test with `test.html`, and publish from the repo. Never edit the live artifact without landing the same change in the repo. Others who clone own their copy from that point; only the owner keeps the two in sync.

Publish: Artifact tool with `index.html` and its scripts as `files`, to the existing lifeboard artifact URL. Data lives in the artifact db, not this repo. **Publishing is pre-approved** (owner, 2026-11-19): finished work and the weekly run publish without asking, once checks pass and the live diff (above) shows no live-only changes. If live has changes the repo lacks, port them first; if they conflict, stop and report instead of overwriting. Strip the artifact service's wrapper lines from any page pulled from live.

Game spec: `SPEC.md` is the source of truth for game mechanics (garden, habitat, lessons, rewards). Read it before touching `game.js`, `garden.js`'s `deriveGame`, rewards or anything that changes what earns what. Any mechanic change updates `SPEC.md` (rule text and the section's **Status**) in the same commit, and `node tools/spec-check.js` must pass (it checks every `RULES` number in `game.js` against the spec, both ways). No mechanic may exist only in the UI or only in the spec unmarked; UI look and wording are free to differ. The old "Lifeboard Game Spec" doc is frozen; don't edit it.

Game layer derives state from db history on load (habit_sessions, checks).

Models: `models/` holds the 3D pipelines (Blender headless → glTF) for two kinds: creatures (habitat visitors) and plants (one species per garden plant, made weekly for plots that need one; `stem_bloom` archetype; garden.js matches them to plots by `plot` + `gen`). Start at `models/README.md`. Shared: `models/STYLE.md`, `models/shared/{blender,tools}/` (build, QA gates, verify, ledger, doctor), `models/roster.json` + `models/assets/` (shipped, published with the page). Per kind: `models/<kind>/{CONTRACT.md,archetypes/,specs/,qa.py}`. Skills in `.claude/skills/`: shared `lifeboard-setup`, `model-build`, `model-verify`, `model-ship`; creature `weekly-visitor` (orchestrator) → `creature-brief` → model-build → `creature-animate` → model-verify → model-ship; plant `season-seeds` (weekly) → `plant-brief` → model-build → `plant-grow` → model-verify → model-ship. Setup for a fresh clone: `lifeboard-setup` (`models/shared/tools/doctor.sh`, `.claude/launch.json` preview on 8765, scheduled-task template `.claude/scheduled/weekly-visitor.md`; setup asks which day it runs). `models/out/` is a local work dir (gitignored).

Break overlay: `break/` is a native macOS menu-bar app (Swift, no Xcode) that covers all screens with a web view during timed breaks. `break/build.sh [--run|--now]` builds `break/out/LifeboardBreak.app`; `break/install.sh [--uninstall]` installs to ~/Applications + LaunchAgent (start at login). Skill: `break-setup`. Settings via `defaults write com.lifeboard.break` (workMinutes, breakMinutes, postponeMinutes, maxPostpones, skipDelaySeconds, url). Page bridge: `window.lifeboardBreak.{skip,postpone,done}()`, `lifeboardbreaktick` event. Escape: ⌃⌥⌘B.

## Improve as you go (verify → fix the cause → log)
Every task and every skill run in this repo ends with this loop. It's how the prompts, skills and gates get better instead of the same mistake repeating.
1. **Verify before saying done**, with the cheapest check that proves it: `node tools/spec-check.js` (game rules), `node sim/run.js` (balance), `node --check` on touched scripts, the `test.html` preview (UI), `verify.sh` + judges (models). Say what you couldn't check.
2. **Retro**: list each thing that went wrong or wasted time (a failed gate, a wrong assumption, a retry, a user correction).
3. **Fix the cause where it lives**, in the same commit: the skill step, prompt wording, gate threshold or tool that let it happen, not just this instance. Prefer a check that fails loudly (a gate, an assert, spec-check) over a sentence of advice.
4. **Log it**: one line in `LESSONS.md` (date, what happened, what changed). Read `LESSONS.md` before starting a skill run or a big change.
5. **Re-verify** the fix on the thing that failed (re-run the gate, the sim, the skill step). If it still fails, go round again; after three rounds, stop and report.
Unattended runs (the weekly check) do steps 1–5 themselves and list the fixes in their report; they never change game numbers; they do publish (pre-approved, see Publish).

<!-- dev-home:standards:start -->
<!-- Managed by dev-home sync-standards.sh. Edit repo-rules.md in dev-home, not here. -->

## Standards

Shared across Blake's repos. Repo-specific sections of this file override these rules.

### Commands

Exact commands are listed elsewhere in this file. Every repo has `setup`, `dev`, `lint`, `typecheck`, `test`, `verify`; `services` if it has backing services.

- Fresh worktree or sandbox: run `setup` first. It never starts services.
- Start services only when the task needs them (`services`, or `dev`).
- Never hardcode ports. HTTP via portless (`PORT`); databases via `*_URL` vars in `.env`.
- Run `verify` before claiming done.

### Testing

- Add a test only when it catches a failure nothing else catches. Extend an existing test before adding one.
- No tautological tests: no asserting mocks, restating the implementation, or testing the framework or type checker.
- Test behavior through public interfaces. A bug fix comes with a test that fails without it.

### Git and PRs

- Conventional Commits: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- Never push, force-push, or commit directly to the default branch. Every change lands through a PR, squash-merged. Applies even where GitHub doesn't enforce it.
- Branch `<type>/<slug>`. Rename agent-prefixed branches (`claude/`, `cursor/`, `codex/`) before the first push.
- Commit subject `<type>(<scope>): <summary>`, imperative, lowercase, no period. Body says why.
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

<!-- dev-home:standards:end -->
