# lifeboard

Personal life dashboard, published as a claude.ai Artifact with the `db` capability. No build step.

- `index.html`: page + styles. Loads `logic.js`, `schema.js`, `store.js`, `app.js` in that order.
- `logic.js`: pure date/task/habit/recurrence logic (TZ America/Los_Angeles). No DOM.
- `schema.js`: db collection shapes; `validate(col, doc)`.
- `store.js`: artifact-db data layer (live listeners, optimistic writes).
- `app.js`: views and actions.
- `mock.js` + `mockdata.js`: local `window.claude.use('db')` stub for testing. `mockdata.js` holds a real-data snapshot and is gitignored.

Publish: Artifact tool with `index.html` and the four scripts as `files`, to the existing lifeboard artifact URL. Data lives in the artifact db, not this repo.

Game layer derives state from db history on load (habit_sessions, checks).

Models: `models/` holds the 3D pipelines (Blender headless → glTF) for two kinds: creatures (habitat visitors) and plants (garden seeds; contract drafted, no generator yet). Start at `models/README.md`. Shared: `models/STYLE.md`, `models/shared/{blender,tools}/` (build, QA gates, verify, ledger, doctor), `models/roster.json` + `models/assets/` (shipped, published with the page). Per kind: `models/<kind>/{CONTRACT.md,archetypes/,specs/,qa.py}`. Skills in `.claude/skills/`: shared `lifeboard-setup`, `model-build`, `model-verify`, `model-ship`; creature `weekly-visitor` (orchestrator) → `creature-brief` → model-build → `creature-animate` → model-verify → model-ship; plant (outline) `season-seeds` → `plant-brief` → model-build → `plant-grow` → model-verify → model-ship. Setup for a fresh clone: `lifeboard-setup` (`models/shared/tools/doctor.sh`, `.claude/launch.json` preview on 8765, scheduled-task template `.claude/scheduled/weekly-visitor.md`, not registered). `models/out/` is a local work dir (gitignored).
