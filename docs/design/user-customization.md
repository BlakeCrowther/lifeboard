---
type: Design Doc
title: User customization and updates
description: Users change their board however they like (settings, house rules for Claude, or the page source itself), and toolkit updates arrive as proposals that update-board merges with their changes, never overwriting them silently.
status: draft
design_status: proposed
tags: [setup, customization, updates, plugin]
---

# User customization and updates

**Goal:** a user can change anything about their board (settings, how Claude runs their skills, the spec, the page, new tabs and list types) without git, and still take toolkit updates later. An update never overwrites their changes; it arrives as a proposal that Claude merges with their changes and the user approves.

Builds on [board store and model storage](model-storage.md): the board holds its own page source (`source.json`), its install record (`board.json`: `basedOn`, `contractVersion`, file hashes) and its settings documents. Terms (toolkit, board, board store, contract) are defined there.

## Ways to customize

| The user wants to | How | On a toolkit update |
|---|---|---|
| Pick a theme, style, backup, or change a game number | A **setting** (below) | Their value wins for each field they set; defaults change underneath. If a default they overrode changes, the run report says so |
| Change how Claude does something ("visitors are birds only", "skip plant runs in December") | A **house rule** (below) | Survives; the run report flags a rule that no longer fits |
| Add fields to their own data | Allowed: collections are `z.looseObject` and settings writes merge (`{...current, ...patch}`) | Survives, under the rule below |
| Change the page, the spec, a list type; add a tab or a feature | Ask Claude to **edit the board's source**. Claude hydrates `source.json`, edits, runs the board's tests, builds and publishes (page files only) | Edited files are merged by `update-board`; untouched files update quietly |
| Add their own skills or automation | A plugin of their own, next to lifeboard's | Unaffected |

Rule for all toolkit code and migrations: never delete or rewrite fields or documents it does not own. This keeps a user's extra fields, and data written by a newer version, intact.

Not offered: overriding single toolkit files (copies go stale quietly) and turning plugin auto-update off (users would also miss pipeline fixes; the page is already protected by rule 5 in [model storage](model-storage.md#publish-rules)). Users can still turn auto-update off per marketplace in `/plugin`, or pin a marketplace to a git tag.

## Settings

Three levels already exist in the code:

| Level | Where | For |
|---|---|---|
| Device | Browser `localStorage` `lb-ui` | Folds, list sorts |
| Board | `checks/ui_prefs` | How the page looks: theme, Ecosystem and Garden on or off, commit lock; later icon style |
| Owner | `checks/profile` | Who the owner is and how runs behave: name, timezone, place, pets; later model style and backup target |

Rule overrides already follow the settings pattern: `checks/lesson_rules` and `checks/break_rules` override `RULES` field by field (`src/packages/ui/game/lessons.ts`, `src/packages/ui/game/game.ts`). Generalize this: one list of the rules a user may change, each with an allowed range, validated when the page loads so a bad value cannot break the game. `SPEC.md` and `pnpm spec-check` keep defining the defaults. Unattended runs still never change game numbers; only the user can.

### Rename `checks` to `settings` (open)

`checks` began as checkbox state (one document per checkbox, with a `week` field) and became a catch-all for settings, rule overrides and computed game status. Proposal:

| Today | Proposed |
|---|---|
| Checkbox documents in `checks` | Stay in `checks` |
| `checks/profile`, `ui_prefs`, `week_start`, `lesson_rules`, `break_rules`, `house_rules` | `settings/<id>` |
| `checks/game_status` | `game_state` (the collection exists) |

Migration, run once per board when the page loads, with no fallback reads:
1. Read the board's data version (`settings/_schema`).
2. If behind, run each missing migration in order (copy `checks/<id>` to `settings/<id>`), then save the new version.
3. From then on, read only the new place.
4. A tab still running older code sees a newer code version is live, shows "lifeboard updated, reload" and stops writing.

Migrations stay in the code, because boards update on their own schedule and a long-skipped board must still migrate. If the list grows long, set a minimum supported version and route older boards through a stepping-stone release.

Do this as its own change, before themes and styles add more settings.

## House rules

One settings document, `checks/house_rules` (`settings/house_rules` after the rename), holding plain-language instructions:

```json
{ "value": { "all": ["Keep reports short."], "creature-brief": ["Visitors are birds only."], "season-seeds": ["Skip runs in December."] }, "updated_at": 0 }
```

- Every lifeboard skill reads its entry and `all` as its first step.
- Order of precedence: quality gates and safety, then house rules, then the skill's defaults. A house rule never loosens a gate.
- When a rule conflicts with a skill step or no longer applies after an update, the run follows the gate or the skill and says so in its report.
- Stored in the board, not in a local file, so cloud runs see it.

## Updates

### What a release ships

| Item | For |
|---|---|
| A version tag in the public repo | The merge base: the template exactly as a board at that version had it |
| Upgrade notes written for an agent | What changed and why, file by file, so Claude can apply a fix to a user's edited version of a file |
| Migrations | Data and contract changes, run the same way every time |
| A one-line summary | "Adds X, fixes Y", shown in run reports |
| Supported contract range | So older boards keep working, or are told to update |

### Flow

```
toolkit release -> plugin auto-updates -> a skill runs -> sees toolkit > basedOn -> report line "update available: adds X, fixes Y" -> user runs update-board -> preview -> user approves -> publish -> basedOn updated
```

1. **Detect.** Every lifeboard skill starts by comparing the toolkit version with the board's `basedOn`. Claude Code has no plugin-update event, and plugin hooks are not documented to run in cloud sessions, so the check lives in the skills, where it works everywhere.
2. **Notify.** The skill finishes its own work, then adds one line to its report or reply. If the board is outside the supported contract range, the skill stops first and asks for the update.
3. **`update-board`** (a skill, run by the user):
   1. Hydrate the board's source and `board.json`.
   2. Files whose hash still matches `board.json` (untouched): take the new version.
   3. Files the user edited: three-way merge of the template at `basedOn`, the user's version and the new template. Claude resolves conflicts using the upgrade notes.
   4. Run the release's migrations, then the board's tests and a build.
   5. Show a preview and a summary of what changed and what was merged.
   6. On approval: publish page files, update `basedOn` and the file hashes. On a failed test or a no: publish nothing.
4. **Undo.** A bad result is rolled back from the board's version history.
5. **Never automatic.** Even a clean merge changes something the user built, so it is always a proposal, like a Renovate pull request.

If the user never runs it, their page stays at its version and keeps working while the toolkit supports its contract version.

### Precedents

No AI-agent toolkit checked does all of record, notify and merge. Each part has a precedent:

| Part | Precedent | What it does |
|---|---|---|
| Record what was installed | Agent OS (installed version in `config.yml`), GitHub Spec Kit (a list of managed files) | Knows what the project came from |
| Cheap "am I behind?" check | Cruft (`cruft check` fails when the project is behind) | Detection without changing anything |
| Untouched files update, edited files are not overwritten | Spec Kit (`specify integration upgrade` stops on an edited file unless forced) | Safety |
| Three-way merge plus migrations | Copier (`copier update` rebuilds the stock project and reapplies the user's changes; conflicts marked inline; pre- and post-migrations) | The merge |
| Ask before applying | Agent OS, Copier, Cruft | Consent |

New here: Claude resolves merge conflicts from the release's upgrade notes, and skills announce updates instead of the user having to know to check. Sources: Spec Kit `docs/upgrade.md`, Agent OS `CHANGELOG.md`, Copier `docs/updating.md`, Cruft `README.md` (each on GitHub).

## Work

| Step | Change |
|---|---|
| 1 | `checks` to `settings` migration (own change; see above). |
| 2 | Rule overrides: one list of user-changeable rules with ranges, validated on load; generalize `lesson_rules` and `break_rules`. |
| 3 | House rules: the settings document, a shared "read house rules" first step in every lifeboard skill, the precedence rule, report lines for conflicts. |
| 4 | Board-owned source ([model storage](model-storage.md#work) step 11): `source.json`, `board.json` with file hashes, `contractVersion`. |
| 5 | Release process: version tags, upgrade notes for agents, a migrations folder, the one-line summary. |
| 6 | Update detection: the `basedOn` comparison and report line in every lifeboard skill. |
| 7 | `update-board` skill. Test: a fixture board with one edited and one untouched file, a release that changes both; the untouched file updates, the edited one merges, tests run, nothing publishes without approval. |

## Risks and open questions

| Item | Note |
|---|---|
| Merge quality | Claude may merge wrongly. Mitigations: the board's tests, a preview, approval, version-history undo. |
| Upgrade notes discipline | A release without good notes makes merges guesswork. Make the notes part of the release checklist and check they exist. |
| Board tests travel with the source | A user who deletes tests loses the safety net for their merges. `update-board` reports when the board has no tests. |
| House rules are unverifiable | Plain language cannot be checked by a gate. Gates stay first; conflicts are reported, not hidden. |
| Stable names | Settings field names, the house-rules format and contract points become a promise. Change them only with a migration and a note. |
