# Contributing

How to send a change to the public lifeboard repo (**upstream**, `github.com/BlakeCrowther/lifeboard`) or report a problem with it. Running your own board needs none of this; see [README.md](README.md) and [AGENTS.md](AGENTS.md).

## From a board copy (the usual way)

If you run a board, you work in your **board copy** (your own repo made by `lifeboard-setup`; terms in [GLOSSARY.md](GLOSSARY.md)). To send a fix from it, say *"run lifeboard-contribute"*. The skill builds a clean branch from upstream with only that change, scans it for personal data, runs `pnpm verify` and opens the pull request (through a fork unless you are the maintainer). It never sends your board's models (`models/board/`) or anything from your board's database.

## By hand

1. **Branch** from upstream `main`, named `<type>/<slug>` (e.g. `fix/ring-rounding`). Rename `claude/`, `cursor/` or `codex/` branches before the first push.
2. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <summary>`, imperative, lowercase, no period; types `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`. The body says why.
3. **Run `pnpm verify`** and make it pass before opening the pull request (`pnpm bootstrap` first in a fresh checkout). If you change a game mechanic, update [SPEC.md](SPEC.md) in the same commit; if you change the model pipeline, update [models/pipeline.html](models/pipeline.html) (AGENTS.md says how).
4. **Open the pull request.** Title in the commit-subject format. Body sections: **Why**, **What**, **Testing**, **Evidence**, **Notes**. Evidence is screenshots and a short recording for UI changes, or the command and its output for anything else. Media goes on the pull request, never in git. Pull requests are squash-merged, and nothing is pushed straight to `main`.

## Keep it public-safe

Upstream is public, and so is its history. A change must not contain:

- anyone's real board data, habit names, models or backups (fixtures and seeds are made up);
- absolute or home paths (`/Users/...`); use repo-relative paths;
- secrets, tokens, or account or artifact IDs (use placeholders like `<id>`);
- owner-specific labels in code (names of places, pets or people shown in the UI come from the board's profile).

`pnpm verify` fails if upstream tracks anything under `models/board/`. The full rules are in AGENTS.md, "Public-safe repos".

## Open an issue

Use [GitHub Issues](https://github.com/BlakeCrowther/lifeboard/issues). Title the issue as plain prose naming the outcome you want ("Habit pips show the wrong week after midnight"), with no `feat:` or `bug:` prefix. Say what you did, what you expected and what happened, using made-up data.

## For agents working on upstream

- **Issue tracker**: GitHub Issues on this repo, with the `epic` / `feature` / `task` labels and the Dev Board project. Commands and conventions: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels**: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs**: one context; [GLOSSARY.md](GLOSSARY.md) for terms, [docs/adr/](docs/adr/index.md) for decisions (OKF frontmatter). See [docs/agents/domain.md](docs/agents/domain.md).
