---
type: Operations
title: Verification and CI
description: What pnpm verify runs and in what order, the GitHub Actions workflow, the headless UI smoke test, doc frontmatter check, skill evals, testing rules, and what is deliberately left out of verify.
tags: [verify, ci, testing, ui-smoke, evals, github-actions]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-24T16:14:32.981Z
sources:
  - id: openwiki-source-4320a40cc58d6de85374b359
    resource: repo://.github/workflows/verify.yml
  - id: openwiki-source-09e4fd34eaf58fd8da3d4f9c
    resource: repo://evals/README.md
  - id: openwiki-source-2a24262bea9c8820d12b1821
    resource: repo://tests/e2e/ui-smoke.ts
  - id: openwiki-source-102efd484e3f82713aef710e
    resource: repo://tools/verify.sh
  - id: openwiki-source-fbadcd8591b65031efaaedce
    resource: repo://vitest.config.ts
generated: { by: "claude-code", at: "2026-11-24T16:14:32.981Z" }
---

# Verification and CI

`pnpm verify` runs `tools/verify.sh`, the single "is this done?" gate for the repo, and the same command runs in CI. It keeps going after a failure, prints a PASS/FAIL/SKIP table, and exits 1 if anything failed; failing steps print their full output to stderr. Optional steps whose tool is missing are skipped, not failed.

## What verify runs

| Step | Checks | Notes |
|---|---|---|
| no stray JavaScript | `pnpm check:no-js` (`tools/check-no-js.ts`) | fails on any `.js/.mjs/.cjs` outside its allowlist |
| game rules vs SPEC.md | `pnpm spec-check` | [Game derivation](../game/game-derivation.md) |
| sim runs | `pnpm sim 20 8` | a short balance run, not a tuning run |
| typecheck, lint, build, unit tests | `tsc`, ESLint plus dependency-cruiser, esbuild (with the size budget), Vitest | skipped with a hint when `node_modules/typescript` is missing; see [Build and bundle](../architecture/build-and-bundle.md), [Package layering and boundaries](../architecture/package-boundaries.md) |
| eval graders | `node evals/run.ts --self-test` | graders on committed good and bad fixtures; no Claude calls |
| biomes | `models/shared/tools/check_biome.py` on `biomes.json` | |
| break timer pacing | `break/test.sh` | skipped when `swiftc` is not installed |
| model pipeline map | `render_pipeline_map.py --check` | fails if `models/pipeline.html`'s data block is stale ([3D model pipeline](../models/model-pipeline.md)) |
| UI smoke | `tests/e2e/ui-smoke.ts`, headless Chromium | skipped when Playwright is not installed |
| doc frontmatter, python lint | `tools/check-doc-frontmatter`, `pnpm lint:py` (ruff and pyright) via `uv` | skipped without `uv` |

## CI

`.github/workflows/verify.yml` runs on every pull request and on pushes to `main`: checkout, pnpm, Node 24, `uv`, then `pnpm bootstrap` and `pnpm verify`. `bootstrap` installs dependencies and the Chromium that the smoke test needs, so nothing is skipped in CI. Changes land through pull requests, squash-merged, per the shared standards in `AGENTS.md`.

## UI smoke test

`tests/e2e/ui-smoke.ts` serves the repo root from a throwaway local server, opens `index.html` in headless Chromium with the synthetic board data from `tests/e2e/fixture.ts` and `dist/fake-db.js` (the in-memory db, see [Data layer](../architecture/data-layer.md)) injected, clicks every tab, and runs one db-writing action per tab. It fails on any page error, console error or failed local request, then checks that owner data stays in the board: the greeting uses `checks/profile.name`, an existing board gets no starter tasks and an empty board gets them. It needs a fresh `dist/` and has a 120 second timeout so a hang cannot stall verify.

## Doc frontmatter

`tools/check-doc-frontmatter` (a `uv` script) fails if a file in `docs/adr` or `docs/design`, other than an `index.md`, lacks YAML frontmatter with a non-empty `type`. `GLOSSARY.md` stays plain.

## Unit tests

Vitest runs `src/**/tests/**/*.test.ts` and `tools/**/*.test.ts`. Tests live next to each package and call its public entry points only; the boundary rules forbid reaching into `lib/` ([Package layering and boundaries](../architecture/package-boundaries.md)). The shared testing rules: add a test only when it catches a failure nothing else catches, extend an existing test before adding one, no tautological tests, and a bug fix comes with a test that fails without it.

## Skill evals (not in verify)

`evals/` grades what a skill writes against a fixed input. Evals cost tokens, so they are run by hand when a skill, a contract or a grader changes: `node evals/run.ts <skill|all>` (flags `--case`, `--no-rubric`, `--model`, `--judge-model`, `--max-usd`). Each live case copies a frozen synthetic world and the repo's current contracts into a temp dir, runs `claude -p` there, and grades the output with the script graders already used elsewhere (`check_spec.py`, `check_biome.py`, the db `validate`) plus an optional rubric. Covered skills: `creature-brief`, `plant-brief`, `biome-brief`, `lesson-make`. Model skills are covered by the judge-panel goldens instead.

## Not in verify

Visual review in the preview, model gates and the judge panel, skill evals, building the Swift [break overlay](../integrations/break-overlay.md) (only its pacing test runs, and only with `swiftc`), and anything needing Blender. State what you could not check when reporting a change as done. Unattended runs ([Publishing and the weekly run](./publish-and-weekly-run.md)) run verify before publishing.
