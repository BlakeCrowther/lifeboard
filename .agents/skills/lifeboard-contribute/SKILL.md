---
name: lifeboard-contribute
description: Send one change from a board's own copy back to the public lifeboard repo as a pull request, without any of the board's models or personal data. Builds a clean branch from upstream main with only that change, scans it for personal data, runs pnpm verify, and opens the PR (the maintainer pushes to upstream; anyone else through a fork). Use when a run reports a fix to "send upstream", or the owner says "contribute this" or "send this upstream".
---

# Contribute a change upstream

Terms as in `lifeboard-update`: **upstream** = `github.com/BlakeCrowther/lifeboard`, **the copy** = this board's own repo.

## 1. Pick the change
The commits or files to send (from the owner's words, or a run's "send upstream" list). Only code, skills, tools, docs and pipeline files. Never `models/board/`, never a board's roster, specs or assets, never data from the board's database.

## 2. Clean branch
```bash
git fetch upstream main
git switch -c <type>/<slug> upstream/main
```
Apply only the change: `git cherry-pick <sha>` for whole commits that touch nothing excluded in step 1, otherwise re-apply the hunks by hand from `git show <sha> -- <paths>`. Commit with a Conventional Commit subject and a body that says why.

## 3. Scan for personal data
On `git diff upstream/main...HEAD` (added lines and commit messages):
- home paths (`/Users/`, `/home/<name>`), emails, artifact URLs and ids (`claude.ai/artifact/...`), keys or tokens;
- the board's own words: read the board's `checks/profile` (name, place, pet names) and `habits` (names and keys) with ArtifactData, and search the diff for each, case-insensitive.

Any hit: remove it, or stop and ask. Never send a diff that still has one.

## 4. Check
`pnpm verify` on the branch. Fix failures the change caused; otherwise stop and report.

## 5. Open the PR
- The maintainer (push access to upstream): `git push -u upstream <branch>`, then open the PR on upstream.
- Anyone else: fork upstream once (`gh api -X POST repos/BlakeCrowther/lifeboard/forks`), add it as a remote, push the branch there, then open the PR on upstream with `head` = `<fork owner>:<branch>`. The fork holds only upstream's code and this branch.

PR title in the commit-subject format; body: Why, What, Testing, Evidence, Notes, following upstream's `AGENTS.md` "Git and PRs". Report the PR link and switch back to the copy's `main`.
