---
type: Decision Record
title: TypeScript, deep modules and one name per concept
description: Move the page code to strict TypeScript bundled with esbuild, split into enforced deep packages with Vitest and Playwright tests, zod-derived db types, skill evals, and one name per concept.
status: stable
decision_status: accepted
tags: [build, typescript, architecture, tests, naming]
---

# TypeScript, deep modules and one name per concept

Accepted 2026-11-21.

## Context

The page is 8 root-level JS files (about 4.4k lines; `app.js` alone is over 2k) that share globals by `<script>` load order. There are no types, so db shapes (`schema.js`) and view models drift apart. Tests are scattered across `tools/spec-check.js`, `sim/`, `tools/ui-smoke/` and one Python file, with no unit tests for recurrence, the day boundary or game math. One concept often has several names (the ecosystem is `habitat` in code; db `buy_list_items` is `wish` in memory). Some docs are named after their history rather than their subject. The repo is meant to show good agent-led engineering.

Terms used below:

- **Package**: a folder under `src/packages/` whose root files are its public **entry points**; everything in subfolders (`lib/`) is private.
- **Entry point**: a root file of a package; the only thing other code may import.
- **Seam**: the public interface a test exercises.
- **Eval**: a fixed input plus a script grader that scores a skill's output.

## Decision

| # | Decision |
|---|---|
| 1 | **TypeScript everywhere the runtime allows**, strict `tsconfig` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `allowJs: false`, `verbatimModuleSyntax`), bundled with esbuild into `dist/`. The artifact is published from `index.html` + `dist/`. Node tools run as `.ts` directly (Node 24 type stripping). three.js stays an external import-map module. This ends the "no build step" premise. |
| 2 | **Blender Python stays Python** (`bpy` requires it) but is typed and linted with ruff + pyright. The Swift break app is unchanged. |
| 3 | **Deep modules**: `src/packages/<name>/` with entry points at the root, `lib/` private, tests co-located. Packages: `dates`, `recurrence`, `tasks`, `habits`, `game`, `db`, `ecosystem`, `garden`, `ui`. Plus `src/main.ts`, `tests/e2e/`, `tools/`, `evals/`. |
| 4 | **Enforced by dependency-cruiser**: import entry points only; tests go through entry points; no cycles; layering `dates` <- `recurrence` <- `tasks`/`habits` <- `game`; `db` depends on none of them; `ui`, `ecosystem` and `garden` may import domain packages; no domain package imports `ui`, `db` or the DOM. |
| 5 | **Vitest** for unit tests at agreed seams, **Playwright** for e2e. No tautological tests. Expected values come from `SPEC.md` worked examples or hand-checked literals, never from the code under test. |
| 6 | **zod schemas are the single source of db collection types** (`z.infer`), replacing hand-written `schema.js` validation. |
| 7 | **Evals** in `evals/<skill>/`, only for skills whose output a script can grade: `creature-brief`, `plant-brief`, `biome-brief`, `lesson-make`, plus judge goldens. Not part of `pnpm verify` (they cost tokens). |
| 8 | **One name per concept.** "Ecosystem" everywhere; the word "habitat" is removed from code, files and docs. Code uses the db collection names (`buy_list_items`, `gift_ideas`, `countdowns`, `habit_sessions`), not divergent in-memory names (`wish`, `gifts`, `bigDays`/`glance`, `sessions`). No one- or two-letter globals or unintuitive aliases. |
| 9 | **Repo skills live in `.agents/skills`** (dev-home `STANDARDS.md` §8); `.claude/skills` is a symlink to it. |
| 10 | **Docs named by history** are merged into one current doc, or deleted if stale. |

### Alternatives rejected

| Alternative | Why not |
|---|---|
| JSDoc + `checkJs`, no build | Keeps "no build step" but is not real TypeScript; JSDoc generics are clumsy; no real module imports or tree-shaking. |
| Jest | Needs extra config for TS and ESM; Vitest runs TS natively and shares esbuild's toolchain. |
| valibot (instead of zod) | Smaller bundle, but zod is the more widely known default and bundle size is not a constraint here. |

## Consequences

- Publishing and the weekly skills must build first (`dist/` is required); the "publish `index.html` + scripts" step in `AGENTS.md` becomes "publish `index.html` + `dist/`".
- `pnpm verify` gains typecheck, lint, dependency-cruiser and Vitest. Playwright and evals stay outside it unless cheap.
- Big one-time rewrite of the page code; the published artifact must behave the same before and after.
- Renames touch code, docs and the glossary together. The glossary entry "Ecosystem (habitat in code)" and the `habitat.js` references go away when the rename lands.
- Boundaries are checked by a tool, so they can't erode by convention alone.
- Changing any of these later (build tool, test runner, schema library) means touching every package.
- `AGENTS.md`'s file list and "no build step" line, the pipeline map and skill paths need updating as the rollout lands; the rollout checklist is tracked as issues, not here.
