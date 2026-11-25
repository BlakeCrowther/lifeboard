---
name: demo-board
description: Publish or refresh the lifeboard demo board from the public template repo: a board on synthetic seed data, marked "Demo", titled "Lifeboard Demo". Use when asked to publish, update or reseed the demo board. Never touches anyone's real board.
---

# Demo board

The public repo publishes only this board (AGENTS.md "Which repo publishes which board"). It holds synthetic data from `demo/seed.json` and shows a Demo badge because its `checks/profile` has `demo: true`. Refreshing is the same steps; reseeding replaces the demo documents.

1. **Confirm the checkout.** `git remote get-url origin` must be `BlakeCrowther/lifeboard` (the public template), not a board's own copy. Otherwise stop: a board's copy publishes its real board with AGENTS.md "Publish".
2. **Build.** `pnpm build` (`dist/` is gitignored and must be fresh).
3. **Find the artifact.** `Artifact list` and pick the one titled exactly "Lifeboard Demo". Never use any other artifact, and never the user's live board, even if the demo is missing.
4. **Publish the page.** The Artifact `title` parameter is ignored when the page has its own `<title>`, so publish a copy: write `index.html` with `<title>lifeboard</title>` replaced by `<title>Lifeboard Demo</title>` to a scratch dir (never in the repo) and map it as `index.html` in `files`. With no artifact found, publish a new one with the `db` capability (load `artifact-capabilities` first); otherwise republish to its URL. Files: that `index.html` and everything under `dist/` that `pnpm live-diff --list` names (`dist/app.js`, `dist/chunks/*.js`), plus the starter model files: `pnpm -s board publish-set --all` maps published paths to `models/starter/...`. Never publish `dist/fake-db.js`, `mockdata.js` or `models/out/`.
5. **Confirm it is a demo board, before any db write.** `ArtifactData` `get` `checks/profile` on that artifact. Continue only when `value.demo` is `true` or there is no profile yet; otherwise stop and report, since it is not a demo board.
6. **Seed the database.** Reseeding must not collide with existing docs, so first `ArtifactData` `list` each seeded collection (`checks`, `tasks`, `habits`, `habit_sessions`, `goals`, `list_items`, `countdowns`) with `out_dir` into one scratch dir (`<dir>/<collection>/<doc_id>.json`, each with its `version`). Then run `pnpm demo:seed --existing <dir> --out <scratch>/demo-batch` (`--today YYYY-MM-DD` to pin the date; the default is today in the seed profile's time zone; without `--out` the files go to the OS temp dir). It prints the batch files: `set` entries carry `if_version` for docs that exist, and docs in those collections that the seed lacks (the page's starter tasks, old sessions) get a pinned `delete`. It also seeds `checks/starter` so the page adds no starter tasks. Apply each file with `ArtifactData` `batch`. On a fresh artifact the dump is empty: omit `--existing`.
7. **Report** the artifact URL to the user. Never commit it: no artifact ids or URLs in the repo (AGENTS.md "Public-safe repos").
