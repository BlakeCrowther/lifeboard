---
type: Design Doc
title: Board store and model storage
description: Each board keeps its own page source, models, data and preferences in its board store (today the published claude.ai artifact and its db). The toolkit (this repo, later a plugin) ships separately and never overwrites a board, so updates never wipe a user's models or changes, and runs work the same locally or in the cloud.
status: draft
design_status: proposed
tags: [models, publishing, cloud, setup]
---

# Board store and model storage

**Goal:** everything that belongs to one board (its page source, models, data and preferences) lives in that board's own store, apart from the toolkit. A toolkit update never removes or overwrites any of it, and a weekly run behaves the same on a laptop or in a cloud session.

Companion docs: [user customization and updates](user-customization.md) (how users change their board and take toolkit updates) and [UI components](ui-components.md) (whether the page moves to React and Radix).

Terms:
- **Toolkit**: skills, the model pipeline, Blender tools, setup and the page template. Lives in this repo; later also shipped as a plugin.
- **Board**: one user's lifeboard: page source, built page, models, data and preferences.
- **Board store**: where a board lives. It holds records (tasks, habits, preferences), files (page and model files) and version history. Today the board store is the board's claude.ai artifact: its `db` holds records and its published files hold files.
- **Model files**: `models/roster.json`, `models/biomes.json`, `models/assets/*-glb.js` and `models/specs.json`, as published.
- **Page files**: `index.html`, `dist/app.js` and `dist/chunks/*.js` (built), plus `source.json` (the source they were built from).
- **Starter set**: the models and biomes committed in this repo, so a new board has something to show.
- **Hydrate**: copy a board's files into a local working folder before a run.
- **Pointer**: how a run finds its board store (today the artifact URL, looked up with `Artifact list`).

## Problem

Today this repo is the source of truth for models and page code, and every publish sends both together (`tools/live-diff.ts` `publishSet`). That breaks in four cases:

| Case | What goes wrong |
|---|---|
| Cloud run | The container is reclaimed. A model that was published but never merged is gone from `main`, and the next drift check calls live "stale". |
| A clone pulls an update | Publishing the repo's `roster.json` and page replaces the clone owner's models and page changes. |
| A clone never pulls | Its toolkit falls behind and stops getting fixes. A template repo has no way to receive updates. |
| Plugin install | No repo of the user's own exists to hold models or page changes. |

## Decision: three layers, one owner each

| Layer | Holds | Owner | Changed by |
|---|---|---|---|
| Toolkit | Skills, pipeline, tools, page template, starter set | The project | Project releases; plugin auto-update |
| Board (in its board store) | Page source and built page, models, records, preferences | The board's owner | The board's owner (directly or by asking Claude) and the board's own runs |
| Backup (optional) | A copy of the board's files and preferences | The board's owner | `board:backup`, one way: store to backup |

- **Setup copies the template into the board; from then on the board is the user's.** They can change anything, including the spec, the page and the list types, without git.
- **The board store is the one main copy.** Git is a backup, never a second main copy, so nothing needs two-way sync.
- **A backup contains no toolkit.** A clone of this repo is not a backup, because pulling an update would collide with the board's own files.
- **Toolkit updates reach a board's page only when its owner says yes** ([user customization](user-customization.md#updates)). Toolkit updates to skills and the pipeline apply at once, and must keep working with older boards (see Contract).

These follow established patterns:

| Here | Pattern | Seen in |
|---|---|---|
| Toolkit and board kept apart | App separated from user data | Obsidian (app vs vault), the XDG folder spec |
| Template copied in, then owned | Copy in, own it | shadcn/ui, Copier |
| Preferences in the board store | Settings synced with the account | VS Code Settings Sync |
| A local backup folder known only to one computer | Device-only settings | VS Code `machine`-scoped settings |
| The pointer is the only link from code to data | Config holds the backing service's address | Twelve-Factor App "Config" and "Backing services" |
| One main copy plus a one-way backup | A backup is a snapshot, not a sync | 3-2-1 backups |
| `schemaVersion` plus migrations | Versioned data formats | Database migrations |

## The board store interface

Skills and tools reach the store only through these operations. Today one implementation exists (the claude.ai artifact). Moving to another host replaces that implementation and nothing else.

| Operation | Artifact implementation today |
|---|---|
| Read records | `ArtifactData` get/list/query; the page uses `window.claude.use('db')` |
| Write records | `ArtifactData` update/set |
| Read files | `Artifact read` with `paths` |
| Write files | `Artifact` publish with `files` (files a publish leaves out are kept) |
| Read an earlier version | `Artifact` `files` entry with `ver` (copies a file from an earlier version) |

Why the artifact today, and when to leave it:

| | Artifact `db` | Artifact published files |
|---|---|---|
| Stands in for | A hosted database or key-value store | File storage behind a CDN (S3, R2) |
| Holds | Small records, edited often, read in parts | Large files, written rarely, read whole |
| Gains | No account, keys or billing; same access as the page; version history; the page and Claude reach the same data | Same |
| Costs | Only the page and Claude's tools can reach it | Writing a file publishes a new version; size limits; one board each, no sharing |

Leave when models reach tens of MB, something other than Claude must write, boards should share models, or the project leaves claude.ai. Then add a second implementation behind the same interface.

## What a board holds

| Item | Where | Notes |
|---|---|---|
| Built page | `index.html`, `dist/**` | What the browser runs |
| Page source | `source.json` (path to file text) | Everything `pnpm build` and the board's tests need: `src/`, `SPEC.md`, `index.html`, `capture.html`, `package.json`, `pnpm-lock.yaml`, build and test config. One file, about 1 MB, so it costs one file of the version limit |
| Install record | `board.json` | `basedOn` (the toolkit version the page source came from), `contractVersion`, and a hash of each source file as installed or last updated. Lets an update tell edited files from untouched ones without fetching anything |
| Models | Model files | `schemaVersion` in `roster.json` and `biomes.json` |
| Records | `db` collections | Tasks, habits, game data |
| Preferences | `db` settings documents | See below |

The page already fetches `models/roster.json` and `models/biomes.json` at run time (`src/packages/garden/lib/roster.ts`), so the page needs no change to read models.

The owner's own board is built from this repo, so its `source.json` matches `main`. The drift check compares the two directly.

## Where each setting lives

Settings documents live in the `checks` collection today (`checks/<id>`, see GLOSSARY.md "Profile"). [User customization](user-customization.md#settings) proposes moving them to a `settings` collection.

| Setting | Where | Reachable from |
|---|---|---|
| Name, timezone, place, pets (exist today) | `checks/profile` | Page, local and cloud runs, any device |
| Model style, backup target when it is a GitHub repo (`backup: {kind: "github", repo: "<owner>/<repo>"}`) | `checks/profile` | Same |
| Theme (exists today), icon style | `checks/ui_prefs` (board prefs, `src/packages/ui/shared/prefs.ts`) | Same |
| House rules for skills | `checks/house_rules` ([user customization](user-customization.md#house-rules)) | Same |
| Folds and list sorts (exist today) | Browser `localStorage` `lb-ui` (device prefs) | That browser only |
| Pointer (artifact URL) | Not stored. Runs find the board with `Artifact list` (as `break-setup` does today) and confirm it is not a mock build. A scheduled run gets the URL in its prompt, which lives in the user's account | Any session on the user's account |
| Local backup folder | Untracked local config, or plugin `userConfig` (type `directory`) | That computer only |

- Never in the repo: the pointer and any artifact ID (public-safe rule).
- No secrets are needed. Cloud sessions reach GitHub through the session's own GitHub access.
- Plugin `userConfig` and `${CLAUDE_PLUGIN_DATA}` are per computer. Cloud sessions do not read the user's `~/.claude/settings.json`, so neither reaches a cloud run. That is why only machine-specific paths live there.
- A model style applies to new models. Existing models keep theirs, and a run may offer to rebuild them.

## Contract

The toolkit and a board's page meet at a few fixed points. A board may be older than the toolkit, or customized, so these points carry a version.

| Contract point | Used by |
|---|---|
| `roster.json`, `biomes.json` and `specs.json` formats | Pipeline writes; page reads |
| Model asset format: base64 glb JS setting `window.LB_CREATURES[id]` or `window.LB_SCENERY[id]`; clips `idle`, `feed`, `sulk`; a `mouth` node | Pipeline writes; page plays |
| `capture.html` and `window.Ecosystem`, `?visitor=<id>` | `page-test` loads the board's own page to check a new creature |
| Settings documents the pipeline reads (`checks/game_status`, `checks/profile`) | Page writes; pipeline reads |

- `board.json` `contractVersion` is a whole number. A release that changes a contract point bumps it and ships a migration.
- The toolkit declares the range it supports (`minContract` to `maxContract`). A board inside the range works as is. A board older than the range stops the run with "update needed before the next model" and points to `update-board`. Nothing is built that the page cannot show.
- A user who changes a contract point in their own page breaks the pipeline for themselves. The run catches it, because each run builds and page-tests against the board's own source.

## Publish rules

1. **Setup:** page files (built page, `source.json`, `board.json`) plus the starter set. This seeds a new board.
2. **Page change (the owner's edit, a Claude edit on request, `update-board`):** page files only, built and tested from the board's own source. Model files stay untouched.
3. **Model ship (visitor, plant, scenery, biome):** read the store's `roster.json` (and `biomes.json` for a biome), merge the new entry by `id`, and publish only the changed model files. Never page files.
4. **No merge needed to ship a model.** A model reaches the board when it is published. Committing to git is optional.
5. **The toolkit never publishes page files on its own.** A plugin update changes no board until its owner accepts the update.

## Run flow (local or cloud)

```
find board -> contract check -> hydrate (page source, model files, migrate) -> ledger -> brief -> build -> animate -> verify (page-test on the board's own page) -> ship (model files only) -> backup -> report (incl. "update available")
```

- **Contract check first.** Outside the supported range, stop and report.
- **Hydrate.** A fresh clone or plugin folder has only the starter set, so briefs, duplicate checks (for example the idle-loop duplicate check) and "what exists" would be wrong without it. The hydrated copy goes into a gitignored working folder.
- **Re-read the roster just before publishing**, then merge by `id`. That way two runs, or a run and the owner, can't silently drop each other's entries. If the same `id` exists in the store with different content, stop and report.
- **Never publish a roster entry without its asset file in the same call**, and never remove one.
- **Backup** runs after a ship when a target is set. A local-folder target is skipped in cloud runs, and the report says "backup skipped, run locally to back up".
- **Report.** If the toolkit is newer than `basedOn`, add one line: what the update adds and fixes, and "run `update-board` to get it".

## Backup choices (asked in setup)

| Choice | Local runs | Cloud runs | Saved in |
|---|---|---|---|
| A private GitHub repo holding only the board's files and preferences (recommended) | Yes | Yes | `checks/profile` |
| A folder on this computer | Yes | Skipped, reported | Local config |
| None | Store version history only | Same | `checks/profile` |

`pnpm board:backup <target>` hydrates the board's files (page source, `board.json`, model files) and its settings documents into the target. Without a backup, deleting the artifact deletes the board. A bad publish, by contrast, can be undone from version history. Restoring a board means publishing from a backup, never rerunning setup, which would bring back the stock template.

## Drift check (owner only)

`live-diff` compares the owner's live `source.json` and built page with `main`. Model files are reported separately and never fail the check:
- The store has models the repo lacks: expected, ignored.
- Starter models are missing from the store: reported, with an offer to seed them.

## Clone vs plugin

No install detection is needed: both use the same flow and the same store. A clone's `models/` holds the starter set plus a gitignored hydrated copy. A plugin uses a scratch folder. Shipping as a plugin is separate, later work: plugin paths (`${CLAUDE_PLUGIN_ROOT}`), a prebuilt template, and a cloud environment that installs Blender. Nothing in this design changes for it.

## Work

| Step | Change |
|---|---|
| 1 | Prove access from a cloud session: read `checks/profile` and the live model files, then (on a test artifact) write a record and publish one file. Cover a scheduled run as well as an interactive one (cloud-pipeline.md rows 14 and 17). Everything below depends on this. |
| 2 | Read the store's roster and diff it against the repo's. Record models that exist only in the store. Port one into the starter set only if it should ship to everyone. |
| 3 | `tools/live-diff.ts`: compare page files only; model files are reported, never fail. |
| 4 | `tools/board-hydrate.ts` (model files plus `schemaVersion` migration) and `board:backup`. Test against a fixture folder. Add `schemaVersion` to `roster.json` and `biomes.json`. |
| 5 | `model-ship`: replace "commit, then republish everything" with "re-read roster, merge, publish model files only, then back up". Specs become required, kept in one `models/specs.json` (one file per model instead of two). Add a capacity check: count the files and bytes the new version would hold; warn in the report above 70% of either limit, refuse to ship at the limit. |
| 6 | `weekly-visitor` (find board, contract check and hydrate as step 0c), `season-seeds`, `scenery-make`, `biome-brief`: hydrate first; ship through model-ship. |
| 7 | `lifeboard-setup`: ask for the backup choice; describe how runs find the board (`Artifact list`) and the publish rules. `AGENTS.md` owner workflow and Publish: a page publish sends no model files. |
| 8 | `.claude/scheduled/weekly-visitor.md`: drop "commit on branch, do not merge or push"; say models ship to the store, and the report lists backup status. Note where the pointer comes from in a cloud run. |
| 9 | `models/pipeline.html`: add the new stages (find board, contract check, hydrate, model-only publish, backup) and regenerate its data block. |
| 10 | A dry run in a cloud session end to end, then one real week. |
| 11 | Board owns its source: `source.json` and `board.json` in setup and page publishes; hydrate pulls the board's source; `page-test` runs against it; `contractVersion` and the toolkit's supported range. Then the update flow in [user customization](user-customization.md#work). |

Steps 1 to 10 move models to the board store and can ship on their own. Step 11 is the start of board-owned source and updates.

## Risks and open questions

| Item | Note |
|---|---|
| Store access from scheduled cloud runs | Unproven; step 1. If it fails, a scheduled run cannot hydrate or ship, and runs stay local until it works. |
| Losing the artifact | Without a backup, the board exists only there. Mitigation: backup choice in setup, backup status in each report. |
| Publish conflicts | Another publish can land between a read and a write. The tool rejects the later write and returns the live version; the run re-reads and merges. |
| Size | Published files never expire: a file stays in every later version until a publish removes it (`null`). Version limits: 511 files, 256 MB (also 16 MB per file, 64 MB per publish). Models average about 230 KB, so the file count binds first: about 500 models with one specs file, years at the weekly rate. When the capacity check first warns, decide how to archive old models (remove the asset, keep it in the backup, mark the roster entry `archived`). Whether version history counts toward any quota is not documented. |
| Contract drift | The toolkit must keep working across its supported range. Each release that touches a contract point needs a migration and a test against a board at the oldest supported version. |
| Building a user's page in a run | The run installs the board's own dependencies (`pnpm install` from its lockfile), so a customized board may need packages the toolkit doesn't. |
| Tied to claude.ai | The store only works through Claude's tools; nothing outside claude.ai can read or write it. The interface above keeps a move to another store contained. |
