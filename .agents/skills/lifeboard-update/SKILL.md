---
name: lifeboard-update
description: Take changes from the public lifeboard repo (upstream) into a board's own copy, keeping the board's models and the owner's changes. Fetches upstream, merges (the newest release tag, or upstream main for the maintainer's copy), keeps models/board as the copy's own, moves a copy made before the board store into models/board, runs pnpm verify, shows what changed, and lands it as a merge commit, then publishes the page. Use when a run reports "lifeboard update available", or the owner says "update lifeboard" or "pull upstream".
---

# Update a board's copy from upstream

A board's own copy (a git-tier repo: the owner's private copy, or a cloner's) takes upstream changes here. The public template repo never runs this. Terms: **upstream** = `github.com/BlakeCrowther/lifeboard`; **the copy** = this checkout; **board files** = `models/board/` (this board's models, mirror of what its artifact publishes under `models/`).

## 0. Preconditions
- This checkout is a board's copy: `git remote get-url origin` is not the public template. If it is the template, stop: upstream does not update from itself.
- Clean working tree (`git status --porcelain` empty). Otherwise stop and report.
- An `upstream` remote: add it when missing: `git remote add upstream https://github.com/BlakeCrowther/lifeboard`.

## 1. Target
- Default: the newest release tag (`git tag --list 'v*' --sort=-v:refname | head -1` after the fetch). If upstream has no release tags yet, `upstream/main`.
- `--main` (the maintainer's copy follows upstream `main`; the owner may also ask for it): `upstream/main`.
- Fetch with enough history to find the merge base: `git fetch --tags upstream main` (in a shallow clone, `git fetch --deepen=200 origin main` first).
- Nothing new (`git rev-list --count HEAD..<target>` is 0): report "up to date" and stop.

## 2. What's coming
`git log --oneline --no-merges HEAD..<target>`, plus `docs/releases/<version>.md` from the target when it exists (`git show <target>:docs/releases/<version>.md`): its summary line and its upgrade notes guide step 4. Flag for the report anything risky in the incoming diff: new network hosts, new scripts or hooks, dependency changes in `package.json` / `pnpm-lock.yaml`, changes to `setup.sh`.

## 3. Branch
`git switch -c update/<target short name>` from the copy's `main`.

## 4. Merge
`git merge --no-ff --no-edit <target>`. Then:
- **Board files are the copy's own, always.** Upstream never tracks `models/board/`. If a conflict or change shows under it anyway, take ours: `git checkout --ours -- models/board`.
- **A copy made before the board store** (its pre-merge tree has `models/roster.json` but no `models/board/roster.json`): run `node tools/board-legacy.ts --from ORIG_HEAD --upstream <target>`. It writes this board's models from the pre-merge tree into `models/board/`, puts `models/starter/` back to upstream's, and removes the board's leftovers at the old paths (files upstream does not track). Then `git add -A models` and continue.
- **Other conflicts:** resolve by intent. The owner's change stays; upstream's change is applied on top of it, guided by the release's upgrade notes and the commit messages. Never drop a feature the owner added. If a conflict can't be resolved with confidence, `git merge --abort`, delete the branch and report the files.
- Finish the merge commit (`git commit --no-edit` if the merge stopped).

## 5. Check
- `pnpm install --frozen-lockfile` when `pnpm-lock.yaml` changed.
- `pnpm verify`. A failure caused by the merge: fix it on the branch and re-run (at most three rounds). Otherwise stop and report.
- Board model count is unchanged: entries in `models/board/roster.json` after the merge equal the entries the copy had before (pre-merge `models/board/roster.json`, or for a legacy copy `ORIG_HEAD:models/roster.json`). A drop is a failure: stop and report.

## 6. Preview and approval
Show: the target, the upstream commits taken (step 2), conflicts and how each was resolved, the risky items flagged, the model count before and after, and `pnpm verify`'s result.
- Interactive: ask the owner to approve.
- Unattended (a scheduled run, or the owner said to go ahead without asking): proceed only when `pnpm verify` passed, the model count is unchanged and nothing risky was flagged; otherwise stop and report.

## 7. Land
Push the branch to the copy's `origin`, open a PR to `main` there, wait for its `verify` check, and merge it with a **merge commit** (`gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=merge`). Never squash: a squash drops upstream's history, and the next update would replay everything, deleting upstream's moved files again.

## 8. Publish the page
On the copy's `main`: `pnpm build`, then the live drift check (`pnpm live-diff --list`, read those files from the board's artifact, `pnpm live-diff <dir>`; it compares page files only). If live has page changes the copy lacks, stop and report. Then publish the page files only (`index.html`, every file in `dist/`, including `dist/chunks/`) to the board's existing artifact URL. Never send model files here; models ship only through model-ship.

## 9. Report
One short message: updated from `<old>` to `<target>`, the summary line, what was merged or resolved, risky items, model count, verify result, PR link, published or not.
