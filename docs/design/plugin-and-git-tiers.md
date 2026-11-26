---
type: Design Doc
title: Plugin and git tiers
description: Two ways to run lifeboard from one codebase. The plugin tier gives settings-only boards that update automatically; the git tier gives each user a private copy of the repo they can change completely, with upstream releases merged by Claude on request. make-it-mine moves a user from the first to the second.
status: stable
design_status: approved
tags: [setup, customization, updates, plugin]
---

# Plugin and git tiers

**Status:** approved. Git tier built, in review as stacked PRs: the owner's board split ([PR lifeboard#29](https://github.com/BlakeCrowther/lifeboard/pull/29), merged; `BlakeCrowther/my-lifeboard`), the demo board ([PR lifeboard#32](https://github.com/BlakeCrowther/lifeboard/pull/32)), `lifeboard-update` and `lifeboard-contribute` ([PR lifeboard#30](https://github.com/BlakeCrowther/lifeboard/pull/30)), setup's own-copy step ([PR lifeboard#33](https://github.com/BlakeCrowther/lifeboard/pull/33)). Not built: the plugin tier, releases (tags, `docs/releases/`, the `release` skill), the `checks` to `settings` rename, rule overrides with ranges.

**Goal:** anyone can run lifeboard. People who are happy with the settings that ship install a plugin and never touch code. People who want to change anything (the spec, the page, the pipeline, "a new visitor every day") get their own private copy of the repo, which Claude changes for them and merges upstream releases into on request. Both share one codebase and one way of storing a board.

Builds on [board store and model storage](model-storage.md): every board keeps its models, data and preferences in its board store, apart from code. Terms (board, board store, upstream, page files) are defined there.

## The two tiers

| | Plugin tier | Git tier |
|---|---|---|
| For | People happy with the settings that ship | People who want to change anything |
| Their code | None: they run the plugin's code | Their own private repo, a copy of upstream with shared history |
| Their board | The stock page plus their settings, models and data | Their page plus their settings, models and data |
| Changes | Settings only | Ask Claude: edit, `pnpm verify`, commit to `main`, publish |
| Updates | Automatic: the plugin updates; the next run builds and publishes the new stock page and reports "updated to 1.4: adds X" | On request: the run reports "1.4 is out: adds X"; `/lifeboard-update` merges, verifies, previews and asks |
| Model history | Store version history only | `models/board/` committed in their repo |
| To go further | `/lifeboard:make-it-mine` | Contribute a change upstream (optional) |

**`/lifeboard:make-it-mine`** (plugin to git, one way): clone upstream at the release the plugin is on (so history is shared and later updates merge cleanly), create their private repo, push, record upstream, hydrate the board's models into `models/board/` and commit them, and from then on start sessions on their repo. Settings, models and data stay in the board store, so nothing else moves. There is no way back to the plugin tier, and none is needed.

Precedents for the split: Expo managed apps with a path to editing native code, Create React App's "eject", and in Neovim the LazyVim distribution versus kickstart.nvim, a starting point you own. The difference here is that Claude does the merging, which is what makes owning everything practical to keep updated.

## Settings

The plugin tier's ceiling, and shortcuts for git-tier users. Three levels already exist in the code:

| Level | Where | Settings |
|---|---|---|
| Device | Browser `localStorage` `lb-ui` | Folds, list sorts |
| Board | `checks/ui_prefs` | Theme, Ecosystem and Garden on or off, commit lock; icon style |
| Owner | `checks/profile` | Name, timezone, place, pets; model style, run day (weekly) |

Game numbers: `checks/lesson_rules` and `checks/break_rules` already override `RULES` field by field (`src/packages/ui/game/lessons.ts`, `src/packages/ui/game/game.ts`). Generalize this into one list of user-changeable rules, each with an allowed range, validated when the page loads so a bad value cannot break the game. `SPEC.md` and `pnpm spec-check` keep defining the defaults. Unattended runs never change game numbers; only the user can.

New settings are added as they come up. Settings are values only; anything that would be an instruction to Claude is a git-tier change ([model storage](model-storage.md#where-each-setting-lives) explains why).

Rule for all code and migrations: never delete or rewrite fields or documents it does not own. Collections are `z.looseObject` and settings writes merge (`{...current, ...patch}`), so a user's extra fields and data written by a newer version stay intact.

### Rename `checks` to `settings`

`checks` began as checkbox state (one document per checkbox, with a `week` field) and became a catch-all for settings, rule overrides and computed game status.

| Today | After |
|---|---|
| Checkbox documents in `checks` | Stay in `checks` |
| `checks/profile`, `ui_prefs`, `week_start`, `lesson_rules`, `break_rules` | `settings/<id>` |
| `checks/game_status` | `game_state` (the collection exists) |

Migration, run once per board when the page loads, with no fallback reads:
1. Read the board's data version (`settings/_schema`).
2. If behind, run each missing migration in order (copy `checks/<id>` to `settings/<id>`), then save the new version.
3. From then on, read only the new place.
4. A tab still running older code sees that a newer version is live, shows "lifeboard updated, reload" and stops writing.

Migrations stay in the code, because boards update on their own schedule. If the list grows long, set a minimum supported version and route older boards through a stepping-stone release. Do this before the plugin tier ships, since settings become a promise to plugin users then.

## Git tier

### Setup

A new user opens a Claude Code session on upstream and runs `/lifeboard-setup`, which asks: settings only (plugin) or your own copy (git). For git, setup does this for them:

```bash
git clone --branch v<latest> https://github.com/<owner>/lifeboard && cd lifeboard
git switch -c main && git remote rename origin upstream
gh api user/repos -f name=lifeboard -F private=true
git remote add origin https://github.com/<user>/lifeboard && git push -u origin main
```

Then it asks for their profile and settings, publishes their board (build, page files, starter set) and schedules the weekly run on their repo. The repo is private by default; it is theirs to make public later. The only prerequisite is a GitHub account; a local-only user can skip GitHub and keep the repo on their computer.

This is GitHub's documented "duplicating a repository" plus "syncing a fork" with an `upstream` remote. A template copy would start with unrelated history, so updates could not merge; a GitHub fork of a public repo cannot be private.

### Which rules apply

One check, no config file: a repo with an `upstream` remote is a user's copy; a repo without one is upstream.

| Repo | Workflow |
|---|---|
| A user's copy | Commit to `main` after `pnpm verify`. No branches or PRs |
| Upstream, or a change being sent upstream | `CONTRIBUTING.md`: issues, branches, PR format, Conventional Commits |

### Updates

1. **Detect.** Each run does `git fetch upstream --tags`, compares the newest release tag with the repo's version, and if newer adds the summary line from `docs/releases/<version>.md` in that tag to its report. No other request is made and nothing is counted.
2. **`/lifeboard-update`:**
   1. `git merge v<new>`. Git uses the shared history as the merge base.
   2. Claude resolves conflicts using the release's upgrade notes.
   3. Flag anything risky in the incoming diff (new network calls, scripts, hooks, dependency changes) before asking.
   4. Run the release's migrations, then `pnpm verify`, then show a preview.
   5. On approval: commit and publish page files. On a failed check or a no: nothing is committed.
3. **Undo:** `git revert`, then publish.
4. **Never automatic.** Even a clean merge changes something the user built.

A user who never updates keeps a working board.

### Contributing back

Optional. A contribute step builds a clean branch from the upstream release with only the change, runs a basic public-safety scan (home paths, emails, artifact IDs), shows the diff, and opens a PR following `CONTRIBUTING.md`. Nothing leaves a user's repo otherwise.

### Security

| Risk | Mitigation |
|---|---|
| Upstream releases are code that runs in users' sessions; a compromised upstream would reach users who update | Updates only from release tags and only on approval; risky changes flagged in the diff; optionally signed tags |
| Upgrade notes are instructions Claude follows | Read only from the tagged release in upstream, never from issues, PRs or elsewhere |
| Setup runs repo code (`pnpm install`, `./setup.sh` installing the repo's pre-commit hook) | Normal for any clone; same trust as the code |
| A user's repo made public later | Their data stays in the board store; the repo's pre-commit hook blocks stray JS; the public-safety scan runs on contribute |
| The weekly run can push to their repo | Claude's GitHub access is granted per repo |
| Contributing leaks personal changes | Clean branch from the release, scan, diff shown first |

## Plugin tier

- **Install:** the plugin is upstream at a release tag; the marketplace entry pins the tag. A plugin turned on for the user's claude.ai account is what reaches cloud sessions.
- **Setup:** `/lifeboard:setup` asks for settings, builds the page from the plugin's source in a scratch folder (`pnpm install`, `pnpm build`), and publishes page files plus the starter set.
- **Runs:** the same pipeline from the plugin folder. Each run compares the plugin's version with the version the published page records. If the plugin is newer, it builds and publishes the stock page and reports "updated to 1.4: adds X". The page migrates its data on load. Undo is the store's version history.
- **No branch of built files.** Building is a publish step in both tiers, so the plugin needs nothing beyond the tagged source.

## The maintainer's own board

The public repo is the product, not anyone's board. It publishes a **demo board** on seed data ([feature lifeboard#11](https://github.com/BlakeCrowther/lifeboard/issues/11)): synthetic habits and tasks, the starter models, and a visible "Demo" badge. The maintainer's real board runs from a **private git-tier copy** of the public repo, set up like any user's (clone, push to a new private repo, `upstream` = the public repo). Personal data and models then never reach the public repo.

| | Public repo | Maintainer's private copy |
|---|---|---|
| Publishes | The demo board | The maintainer's live board |
| Weekly run | None | Yes, with the auto-merging PR from [PR lifeboard#26](https://github.com/BlakeCrowther/lifeboard/pull/26) inside the private copy |
| Product work | Here, tested on the demo board, merged by PR (`CONTRIBUTING.md`) | Not here |
| Takes changes from | Contributors | Upstream `main` (the maintainer follows `main`, not release tags): `/lifeboard-update --main` |
| Run retro fixes | Arrive by the contribute step | Made here, then sent upstream with the contribute step |

The two boards never share data, which is what lifeboard#11 asks for. "One publish updates both" becomes two steps: publish the demo from upstream, then `/lifeboard-update` in the private copy publishes the live board.

### Moving the maintainer's board out (order)

| Step | Change | Touches the live board? |
|---|---|---|
| 1 | Create the private copy from the public repo's `main` (it starts with today's roster, so the live board is unchanged). | No |
| 2 | Re-register the weekly run in claude.ai on the private copy (repo and lifeboard environment attached); delete the old registration if any. From then on the live board publishes only from the private copy. | Publishes only |
| 3 | Public repo PR: the roster becomes the starter set (generic biome-0 scenery and creatures; the maintainer's plants leave, since they are made for his habits); the hardcoded habit-icon map becomes generic name hints; the demo board: seed data, "Demo" badge, its own artifact. Merge only after step 2, so no live publish runs from a roster without the maintainer's models. | No |
| 4 | Model storage steps 3 to 11 ([model storage](model-storage.md#work)) in the public repo, pulled into the private copy with `/lifeboard-update`. | Through the private copy |

**Taking step 3 into the private copy.** Upstream deletes the maintainer's plant files, and the private copy never changed most of them since it was created, so a plain merge would delete them there too. Merge once, then restore the board's models from before the merge and commit:

```bash
git merge upstream/main
git checkout ORIG_HEAD -- models/roster.json models/assets models/plant/specs
git commit -m "chore: keep this board's models after upstream's starter-set split"
```

After that merge, the shared history already contains the deletion, so later updates leave those files alone. The models stay at their current paths (`models/roster.json`, `models/assets/`), because every pipeline step and the page read them there; they move to `models/board/` with the model-storage work.

Status 2026-11-25: step 1 done (`BlakeCrowther/my-lifeboard`, private); step 2 done (the weekly task's prompt targets the private copy; the lifeboard environment still lists only the public repo, so the run installs the toolchain itself); step 3 split into [PR lifeboard#29](https://github.com/BlakeCrowther/lifeboard/pull/29) (roster to starter set, generic habit icons, which-repo-publishes rule) and the demo board (lifeboard#11).

After step 3, upstream's roster changes rarely, so the private copy's own roster merges cleanly until model storage moves it to `models/board/`. Names already in the public repo's history stay; rewriting it was judged not worth breaking every clone.

## Releases

A release is a version marked finished: a semantic version, a tag `v<version>`, and `docs/releases/<version>.md` with a one-line summary (for run reports) and upgrade notes written for an agent (what changed and why, file by file). Git-tier users update to tags, never to upstream `main`, which can hold unfinished work. The plugin tier updates when the version in `.claude-plugin/plugin.json` changes.

The `release` skill does it: bump the version in `package.json` and `plugin.json`, write the notes from the merged PRs, tag and push. It runs only in upstream (no `upstream` remote) and refuses elsewhere. Contributors never release. Process: `RELEASING.md`.

Usage: nothing is built to count users. Stars and the repo's traffic page are enough.

## Repo files

| File | For | Holds |
|---|---|---|
| `README.md` | Everyone | What lifeboard is, the two tiers, how to start |
| `AGENTS.md` | Agents in every copy | How the repo works and the rules every board follows, including what the owner-workflow section says today about publishing a board from its repo |
| `CONTRIBUTING.md` | Upstream and anyone sending changes to it | Issues and labels, PR format, Conventional Commits, `pnpm verify`, testing rules, public safety. dev-home's standards block lands here |
| `RELEASING.md` | Maintainers | When to cut a release, the `release` skill, version numbers, upgrade notes |

`AGENTS.md` says: "Sending a change to upstream? Follow `CONTRIBUTING.md`." These files ship in every copy and do nothing in a user's repo, the usual open-source arrangement. `.gitignore` cannot hold them back: an ignored file is never in the repo, so cloud sessions and other computers would lose it.

The public-safety pre-commit hook (home paths, emails, artifact IDs, keys, private words) stays in dev-home (`install-hooks.sh`) and is never shipped. The repo's own pre-commit hook (no stray JS, typecheck) ships, because those are project rules.

## Work

| Step | Change |
|---|---|
| 1 | `checks` to `settings` migration. |
| 2 | Repo files: split `AGENTS.md` into `AGENTS.md`, `CONTRIBUTING.md` (issue tracker, triage labels, domain docs, the standards block) and `RELEASING.md`; generalize the owner-workflow section for every board; the `upstream`-remote rule. |
| 3 | dev-home: `repos.tsv` gains a target-file column; `sync-standards.sh` writes the standards block into it (`CONTRIBUTING.md` for lifeboard); dev-home `AGENTS.md` notes this. Separate PR in dev-home. |
| 4 | Rule overrides: one list of user-changeable rules with ranges, validated on load. |
| 5 | Releases: version in `package.json`, `docs/releases/`, the `release` skill, `RELEASING.md`, first tag. |
| 6 | Git tier: the git path in `lifeboard-setup`, the update line in runs, `/lifeboard-update`, the contribute step. Test `/lifeboard-update` on a fixture repo with one edited and one untouched file and a release that changes both: the untouched file updates, the edited one merges, `pnpm verify` runs, nothing is committed without approval. |
| 7 | Plugin tier, once a scheduled cloud run without a repo is proven: `.claude-plugin/plugin.json` and a marketplace entry; skill paths that work from `${CLAUDE_PLUGIN_ROOT}` as well as a checkout; build-in-scratch publish; automatic stock-page updates; `/lifeboard:make-it-mine`. |

Order: move the maintainer's board out first ([steps 1 to 3 above](#moving-the-maintainers-board-out-order)), then model storage ([steps 3 to 11](model-storage.md#work)), which both tiers need, then the steps in this table.

## Risks and open questions

| Item | Note |
|---|---|
| Plugin tier in scheduled cloud runs | Unproven: whether an account-level plugin runs in a scheduled cloud session with no repo, and how Blender gets installed there. Prove before promising the tier. |
| Plugin skill paths | Skills live in `.agents/skills/`; check how a plugin manifest points at them, or move them. |
| Merge quality | Claude may merge wrongly. Mitigations: `pnpm verify`, a preview, approval, `git revert`. |
| Upgrade-notes discipline | A release without good notes makes merges guesswork. The `release` skill writes them and refuses to tag without them. |
| Heavily changed repos | Some users will stop taking updates. Their board keeps working. |
| Stable names | Settings field names become a promise to plugin users. Change them only with a migration and a note. |
| Build cost in the plugin tier | `pnpm install` and `pnpm build` on each stock-page update (only when the plugin version changes). The page build needs only esbuild, so a slim install is possible. |
