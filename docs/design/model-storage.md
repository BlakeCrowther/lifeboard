---
type: Design Doc
title: Board store and model storage
description: Each board's models, data and preferences live in its own board store (today the published claude.ai artifact and its db), apart from any code, so a code update never wipes them and a model reaches the board without a git merge, locally or in the cloud.
status: draft
design_status: proposed
tags: [models, publishing, cloud, setup]
---

# Board store and model storage

**Goal:** a board's models, data and preferences live in a store that belongs to that board, apart from the code that builds it. Publishing code (from the upstream repo, a user's own repo, or the plugin) never removes or overwrites them, and a weekly run ships a model the same way on a laptop or in a cloud session, with no git merge in between.

Companion docs: [plugin and git tiers](user-customization.md) (how users get, change and update lifeboard) and [UI components](ui-components.md) (whether the page moves to React and Radix).

Terms:
- **Board**: one user's lifeboard as it runs: the published page plus its models, data and preferences.
- **Board store**: where a board lives. It holds records (tasks, habits, preferences), files (page and model files) and version history. Today the board store is the board's claude.ai artifact: its `db` holds records and its published files hold files.
- **Upstream**: the public lifeboard repo. **A user's repo**: a git-tier user's private copy of it ([tiers](user-customization.md)).
- **Model files**: `models/roster.json`, `models/biomes.json`, `models/assets/*-glb.js` and `models/specs.json`, as published.
- **Page files**: `index.html` and `dist/**`, built by `pnpm build`.
- **Starter set**: the models and biomes in `models/starter/`, published by setup so a new board has something to show.
- **Hydrate**: copy a board's model files into a local working folder before a run.
- **Pointer**: how a run finds its board store (today the artifact URL, looked up with `Artifact list`).

## Problem

Today the repo is the source of truth for models, and every publish sends page and model files together (`tools/live-diff.ts` `publishSet`). That breaks in four cases:

| Case | What goes wrong |
|---|---|
| Cloud run | The container is reclaimed. A model that was published but never merged is gone from `main`, and the next drift check calls live "stale". |
| A user's repo takes an update | Publishing the repo's `roster.json` replaces the user's roster, so their models disappear. |
| Plugin install | No repo exists to hold a roster. |
| Upstream starter changes | If the starter set and a board's models share files, every upstream change to the starter set conflicts with each user's models. |

## Decision

| Owner | Holds |
|---|---|
| Code (upstream, a user's repo, or the plugin) | Page source, skills, pipeline, starter set |
| Board store | Built page, model files, records, preferences |

- **The board store is the one main copy of a board's models.** A model reaches the board when it is published; no merge gates it.
- **Page publishes and model ships never overlap.** Each sends only its own files, and the Artifact tool keeps files a publish leaves out.
- **The starter set lives apart** (`models/starter/`), so upstream changes to it never collide with a board's models.
- **Backup is not a separate feature.** A git-tier user's repo keeps a copy of shipped models (below); every board also has the store's version history.

These follow established patterns:

| Here | Pattern | Seen in |
|---|---|---|
| Code and user data kept apart | App separated from user data | Obsidian (app vs vault), the XDG folder spec |
| Preferences in the board store | Settings synced with the account | VS Code Settings Sync |
| The pointer is the only link from code to data | Config holds the backing service's address | Twelve-Factor App "Config" and "Backing services" |
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

The page already fetches `models/roster.json` and `models/biomes.json` at run time (`src/packages/garden/lib/roster.ts`), so the page needs no change to read models.

## Where each setting lives

Settings documents live in the `checks` collection today (`checks/<id>`, see GLOSSARY.md "Profile"); they move to a `settings` collection ([tiers](user-customization.md#settings)).

| Setting | Where | Reachable from |
|---|---|---|
| Name, timezone, place, pets (exist today); model style, run day | `checks/profile` | Page, local and cloud runs, any device |
| Theme (exists today), icon style | `checks/ui_prefs` (board prefs, `src/packages/ui/shared/prefs.ts`) | Same |
| Folds and list sorts (exist today) | Browser `localStorage` `lb-ui` (device prefs) | That browser only |
| Pointer (artifact URL) | Not stored. Runs find the board with `Artifact list` (as `break-setup` does today) and confirm it is not a mock build. A scheduled run gets the URL in its prompt, which lives in the user's account | Any session on the user's account |

- Never in a repo: the pointer and any artifact ID (public-safe rule).
- Database records are values, never instructions: anyone who can open a board can write to its db through the page, so no skill follows text read from it.
- Plugin `userConfig` and `${CLAUDE_PLUGIN_DATA}` are per computer, and cloud sessions do not read the user's `~/.claude/settings.json`, so no setting a run needs lives there.
- A model style applies to new models. Existing models keep theirs, and a run may offer to rebuild them.

## Publish rules

1. **Setup:** page files plus the starter set (published as the board's `models/roster.json`, `biomes.json`, `specs.json` and assets).
2. **Page publish** (a change in a user's repo, `/lifeboard-update`, a plugin page update): run `pnpm build` from the source being published, then publish page files only. Model files stay untouched. The page records the lifeboard version it was built from, so plugin runs can tell when the stock page is behind.
3. **Model ship** (visitor, plant, scenery, biome): read the store's `roster.json` (and `biomes.json` for a biome), merge the new entry by `id`, and publish only the changed model files. Never page files.
4. **No merge needed to ship a model.** Committing to git is a copy, not a gate.

`roster.json` and `biomes.json` carry a `schemaVersion`. Hydrate migrates older data before a run uses it, so a code update can change the format without breaking existing boards.

## Run flow (local or cloud, both tiers)

```
find board -> hydrate (model files, migrate) -> ledger -> brief -> build -> animate -> verify -> ship (model files only) -> copy to repo (git tier) -> report (incl. update line)
```

- **Hydrate first.** A fresh checkout or plugin folder has only the starter set, so briefs, duplicate checks (for example the idle-loop duplicate check) and "what exists" would be wrong without it. The hydrated copy goes into a gitignored working folder.
- **Re-read the roster just before publishing**, then merge by `id`. That way two runs, or a run and the owner, can't silently drop each other's entries. If the same `id` exists in the store with different content, stop and report.
- **Never publish a roster entry without its asset file in the same call**, and never remove one.
- **Copy to repo (git tier only):** commit the shipped model files under `board/` in the user's repo. `board/` is in upstream's `.gitignore`, so it never enters upstream; a user's repo force-adds it (`git add -f board/`), and once tracked it stays tracked. The step is skipped in upstream itself (a repo with no `upstream` remote) and in the plugin tier. Restoring a board publishes from `board/`.
- **Report.** The update line comes from the tier's update check ([tiers](user-customization.md#updates)).

## Drift check

`live-diff` compares a board's live page files with a build of the repo that publishes it. Model files are reported separately and never fail the check:
- The store has models the repo lacks: expected, ignored.
- Starter models are missing from the store: reported, with an offer to seed them.

## Work

| Step | Change |
|---|---|
| 1 | Prove access from a cloud session: read `checks/profile` and the live model files, then (on a test artifact) write a record and publish one file. Cover a scheduled run as well as an interactive one (cloud-pipeline.md rows 14 and 17). Everything below depends on this. |
| 2 | Read the owner's live roster and diff it against the repo's. Record models that exist only in the store; decide which belong in the starter set. |
| 3 | Move the starter set to `models/starter/`; setup publishes it as the board's model files. |
| 4 | `tools/live-diff.ts`: compare page files only; model files are reported, never fail. |
| 5 | `tools/board-hydrate.ts` (model files plus `schemaVersion` migration). Test against a fixture folder. Add `schemaVersion` to `roster.json` and `biomes.json`. |
| 6 | `model-ship`: replace "commit, then republish everything" with "re-read roster, merge, publish model files only, then copy to `board/` (git tier)". Specs become required, kept in one `models/specs.json` (one file per model instead of two). Add a capacity check: count the files and bytes the new version would hold; warn in the report above 70% of either limit, refuse to ship at the limit. |
| 7 | `weekly-visitor` (find board and hydrate as step 0c), `season-seeds`, `scenery-make`, `biome-brief`: hydrate first; ship through model-ship. |
| 8 | `lifeboard-setup` and `AGENTS.md`: the publish rules above; how runs find the board (`Artifact list`); a page publish builds first and sends no model files. |
| 9 | `.claude/scheduled/weekly-visitor.md`: drop "commit on branch, do not merge or push"; say models ship to the store; note where the pointer comes from in a cloud run. |
| 10 | `models/pipeline.html`: add the new stages (find board, hydrate, model-only publish, copy to repo) and regenerate its data block. |
| 11 | A dry run in a cloud session end to end, then one real week. |

## Risks and open questions

| Item | Note |
|---|---|
| Store access from scheduled cloud runs | Unproven; step 1. If it fails, a scheduled run cannot hydrate or ship, and runs stay local until it works. |
| Losing the artifact | A plugin-tier board exists only in its artifact; deleting the artifact deletes it. Version history covers bad publishes, not deletion. `make-it-mine` gives a repo copy. |
| The maintainer's own board | Upstream never commits `board/`, so the maintainer's board relies on version history. Open: a private copy for it. |
| Publish conflicts | Another publish can land between a read and a write. The tool rejects the later write and returns the live version; the run re-reads and merges. |
| Size | Published files never expire: a file stays in every later version until a publish removes it (`null`). Version limits: 511 files, 256 MB (also 16 MB per file, 64 MB per publish). Models average about 230 KB, so the file count binds first: about 500 models with one specs file, years at the weekly rate. When the capacity check first warns, decide how to archive old models (remove the asset, keep it in `board/`, mark the roster entry `archived`). Whether version history counts toward any quota is not documented. |
| Tied to claude.ai | The store only works through Claude's tools; nothing outside claude.ai can read or write it. The interface above keeps a move to another store contained. |
