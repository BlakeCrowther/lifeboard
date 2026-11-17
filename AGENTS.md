# lifeboard

Personal life dashboard, published as a claude.ai Artifact with the `db` capability. No build step.

- `index.html`: page + styles. Loads `logic.js`, `schema.js`, `store.js`, `app.js` in that order.
- `logic.js`: pure date/task/habit/recurrence logic (TZ America/Los_Angeles). No DOM.
- `schema.js`: db collection shapes; `validate(col, doc)`.
- `store.js`: artifact-db data layer (live listeners, optimistic writes).
- `app.js`: views and actions.
- `mock.js` + `mockdata.js`: local `window.claude.use('db')` stub for testing. `mockdata.js` holds a real-data snapshot and is gitignored.

Publish: Artifact tool with `index.html` and the four scripts as `files`, to the existing lifeboard artifact URL. Data lives in the artifact db, not this repo.

Game layer derives state from db history on load (habit_sessions, checks); no scheduled jobs needed.
