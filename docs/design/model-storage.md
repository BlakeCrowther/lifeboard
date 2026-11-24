---
type: Design Doc
title: Model storage in the board store
description: Each board's models and preferences live in its own board store (today the published claude.ai artifact and its db); the code (repo or plugin) ships separately and never overwrites them, so updates never wipe a user's models and runs work the same locally or in the cloud.
status: draft
design_status: proposed
tags: [models, publishing, cloud, setup]
---

# Model storage in the board store

**Goal:** a board's models and preferences live in a store that belongs to that board, apart from the code. Updating the code (the owner's repo, a clone pulling changes, or a plugin update) never removes or overwrites them, and a weekly run behaves the same on a laptop or in a cloud session.

Terms:
- **Board store**: where one board's data lives. It holds three things: records (task, habit and preference data), files (model files) and version history. Today the board store is the board's claude.ai artifact: its `db` holds records and its published files hold files.
- **Model files**: `models/roster.json`, `models/biomes.json`, `models/assets/*-glb.js` and `models/<kind>/specs/*.json`, as published.
- **Code files**: `index.html`, `dist/app.js` and `dist/chunks/*.js`.
- **Starter set**: the models and biomes committed in the repo, so a new board has something to show.
- **Hydrate**: copy the board's model files into a local working folder before a run.
- **Pointer**: how a run finds its board store (today the artifact URL, looked up with `Artifact list`).

## Problem

Today the repo is the source of truth for models, and every publish sends code and model files together (`tools/live-diff.ts` `publishSet`). That breaks in four cases:

| Case | What goes wrong |
|---|---|
| Cloud run | The container is reclaimed. A model that was published but never merged is gone from `main`, and the next drift check calls live "stale". |
| A clone pulls an update | Publishing the repo's `roster.json` replaces the clone owner's roster, so their models disappear. |
| A clone never pulls | Its code falls behind and stops getting fixes. A template repo has no way to receive updates. |
| Plugin install | No repo of the user's own exists to hold a roster. |

## Decision: three layers, one owner each

| Layer | Holds | Owner | Changed by |
|---|---|---|---|
| Code | Skills, pipeline, tools, page code, starter set | The project (this repo; later a plugin) | Project releases |
| Board store | Records (tasks, habits, preferences) and model files | The board's owner | The page and the board's own runs |
| Backup (optional) | A copy of the model files and preferences | The board's owner | `models:backup`, one way: store to backup |

- The board store is the **one main copy**. Git is a backup, never a second main copy, so nothing needs two-way sync.
- A backup contains **no code**. A clone of the code repo is not a backup, because pulling an update would collide with the user's models.

These follow established patterns:

| Here | Pattern | Seen in |
|---|---|---|
| Code and user data kept apart | App separated from user data | Obsidian (app vs vault), the XDG folder spec |
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

The page already fetches `models/roster.json` and `models/biomes.json` at run time (`src/packages/garden/lib/roster.ts`), so the page needs no change to read models.

## Where each setting lives

The board's db already uses one collection, `checks`, for single settings documents, each with an id (`checks/<id>`, see GLOSSARY.md "Profile"). Preferences extend the two that exist; no new collection is needed.

| Setting | Where | Reachable from |
|---|---|---|
| Name, timezone, place, pets (exist today) | `checks/profile` | Page, local and cloud runs, any device |
| Model style, backup target when it is a GitHub repo (`backup: {kind: "github", repo: "<owner>/<repo>"}`) | `checks/profile` | Same |
| Theme (exists today), icon style | `checks/ui_prefs` (board prefs, `src/packages/ui/shared/prefs.ts`) | Same |
| Folds and list sorts (exist today) | Browser `localStorage` `lb-ui` (device prefs) | That browser only |
| Pointer (artifact URL) | Not stored. Runs find the board with `Artifact list` (as `break-setup` does today) and confirm it is not a mock build. An unattended scheduled run gets the URL in its prompt, which lives in the user's account | Any session on the user's account |
| Local backup folder | Untracked local config, or plugin `userConfig` (type `directory`) | That computer only |

Never in the repo: the pointer and any artifact ID (public-safe rule). No secrets are needed. Cloud sessions reach GitHub through the session's own GitHub access.

Plugin `userConfig` and `${CLAUDE_PLUGIN_DATA}` are per computer. Cloud sessions do not read the user's `~/.claude/settings.json`, so neither reaches a cloud run. That is why only machine-specific paths live there.

Themes and styles are settings that one shared page reads and applies as it loads. A preference change needs no republish, and every board still runs the same code, so updates reach everyone. A model style applies to new models. Existing models keep theirs, and a run may offer to rebuild them.

## Plugin-first, and user changes

Design rule: assume the user has no copy of the code and never edits it. Everything that differs per user is data in the board store. A clone is the developer path, not the user path.

| A user wants to | How | Survives code updates? |
|---|---|---|
| Pick a theme, style or backup | A preference | Yes |
| Add their own fields to a record | Allowed: collections are `z.looseObject` and settings writes merge (`{...current, ...patch}`), so unknown fields pass through | Yes, under the rule below |
| Change the page, add a collection, change rules | Fork the code. They own their fork and merge upstream changes like any fork | Only as well as their merges go |

Rule for all code: never delete or rewrite fields or documents it does not own. Migrations (`schemaVersion`) change only the fields the code defines. This keeps a user's extra fields, and data written by a newer version, intact.

## Publish rules

1. **First publish (setup):** code files plus the starter set. This seeds a new board.
2. **Code publish (a feature, a clone pulling an update, a plugin update):** code files only. Model files in the store stay untouched.
3. **Model ship (visitor, plant, scenery, biome):** read the store's `roster.json` (and `biomes.json` for a biome), merge the new entry by `id`, and publish only the changed model files. Never code files.
4. **No merge needed to ship a model.** A model reaches the board when it is published. Committing to git is optional.

Version fields:
- `roster.json` and `biomes.json` carry a `schemaVersion`. Hydrate migrates older data before a run uses it, so a code update can change the format without breaking existing boards.
- The page records the code version it was built from. A run compares it with its own code and offers a code publish when the board is behind.

## Run flow (local or cloud)

```
hydrate (find board, read model files, migrate) -> ledger -> brief -> build -> animate -> verify -> ship (model files only) -> backup -> report
```

- **Hydrate first.** A fresh clone or plugin folder has only the starter set, so briefs, duplicate checks (for example the idle-loop duplicate check) and "what exists" would be wrong without it. The hydrated copy goes into a gitignored working folder.
- **Re-read the roster just before publishing**, then merge by `id`. That way two runs, or a run and the owner, can't silently drop each other's entries. If the same `id` exists in the store with different content, stop and report.
- **Never publish a roster entry without its asset file in the same call**, and never remove one.
- **Backup** runs after a ship when a target is set. A local-folder target is skipped in cloud runs, and the report says "backup skipped, run locally to back up".

## Backup choices (asked in setup)

| Choice | Local runs | Cloud runs | Saved in |
|---|---|---|---|
| A private GitHub repo holding only model files and preferences (recommended) | Yes | Yes | `checks/profile` |
| A folder on this computer | Yes | Skipped, reported | Local config |
| None | Store version history only | Same | `checks/profile` |

`pnpm models:backup <target>` hydrates the model files and `checks/profile` into the target. Without a backup, deleting the artifact deletes the models. A bad publish, by contrast, can be undone from version history.

## Drift check

`live-diff` compares code files only. Model files are reported separately and never fail the check:
- The store has models the repo lacks: expected, ignored.
- Starter models are missing from the store: reported, with an offer to seed them.

## Clone vs plugin

No install detection is needed: both use the same flow and the same store. A clone's `models/` holds the starter set plus a gitignored hydrated copy. A plugin uses a scratch folder. Shipping as a plugin is a separate, later piece of work: plugin paths (`${CLAUDE_PLUGIN_ROOT}`), a prebuilt page, and a cloud environment that installs Blender. Nothing in this design changes for it.

## Work

| Step | Change |
|---|---|
| 1 | Prove access from a cloud session: read `checks/profile` and the live model files, then (on a test artifact) write a record and publish one file. Cover a scheduled run as well as an interactive one (cloud-pipeline.md rows 14 and 17). Everything below depends on this. |
| 2 | Read the store's roster and diff it against the repo's. Record models that exist only in the store. Port one into the starter set only if it should ship to everyone. |
| 3 | `tools/live-diff.ts`: split code files from model files; the exit code reflects code only. |
| 4 | `tools/models-hydrate.ts` (hydrate plus `schemaVersion` migration) and `models:backup`. Test against a fixture folder. Add `schemaVersion` to `roster.json` and `biomes.json`. |
| 5 | `model-ship`: replace "commit, then republish everything" with "re-read roster, merge, publish model files only, then back up". Specs become required, kept in one `models/specs.json` (one file per model instead of two). Add a capacity check: count the files and bytes the new version would hold; warn in the report above 70% of either limit, refuse to ship at the limit. |
| 6 | `weekly-visitor` (hydrate as a new step 0c), `season-seeds`, `scenery-make`, `biome-brief`: hydrate first; ship through model-ship. |
| 7 | `lifeboard-setup`: ask for the backup choice; describe how runs find the board (`Artifact list`) and the publish rules. `AGENTS.md` owner workflow and Publish: a code publish sends no model files. |
| 8 | `.claude/scheduled/weekly-visitor.md`: drop "commit on branch, do not merge or push"; say models ship to the store, and the report lists backup status. Note where the pointer comes from in a cloud run. |
| 9 | `models/pipeline.html`: add the new stages (hydrate, model-only publish, backup) and regenerate its data block. |
| 10 | A dry run in a cloud session end to end, then one real week. |

## Risks and open questions

| Item | Note |
|---|---|
| Store access from scheduled cloud runs | Unproven; step 1. If it fails, a scheduled run cannot hydrate or ship, and runs stay local until it works. |
| Losing the artifact | Without a backup, the models exist only there. Mitigation: backup choice in setup, backup status in each report. |
| Publish conflicts | Another publish can land between a read and a write. The tool rejects the later write and returns the live version; the run re-reads and merges. |
| Size | Published files never expire: a file stays in every later version until a publish removes it (`null`). Version limits: 511 files, 256 MB (also 16 MB per file, 64 MB per publish). Models average about 230 KB, so the file count binds first: about 500 models with one specs file, years at the weekly rate. When the capacity check first warns, decide how to archive old models (remove the asset, keep it in the backup, mark the roster entry `archived`). Whether version history counts toward any quota is not documented. |
| Tied to claude.ai | The store only works through Claude's tools; nothing outside claude.ai can read or write it. The interface above keeps a move to another store contained. |
