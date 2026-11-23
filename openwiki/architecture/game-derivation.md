---
type: architecture
title: Game state derivation
description: How the garden, tide and reef, visitors and lessons are derived from db history on every load, and how RULES, SPEC.md and spec-check are kept equal.
tags: [game, derivation, rules, spec, garden, reef]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-f8a393a4f569cbfcdfc03d28
    resource: repo://src/packages/game/lib/derive-game.ts
  - id: openwiki-source-e03b310af916e0036c32491d
    resource: repo://src/packages/game/lib/garden-plots.ts
  - id: openwiki-source-b2e26382d5158fef0dbab8cc
    resource: repo://src/packages/game/lib/rules.ts
  - id: openwiki-source-7fd1f9390baadbd987c79277
    resource: repo://tools/spec-check.ts
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---

# Game state derivation

The `game` package (`src/packages/game/`) holds the game mechanics as pure code with no DOM and no db access. Game state is never stored. `deriveGame(input)` (`lib/derive-game.ts`) recomputes it from task, habit session, break and lesson history each time the page loads or the model changes. The page and node tools (the balance sim) share the same code.

## Inputs and start day

`GameInput` is plain data: today, tasks (effective date, done date, committed days), habits (key, floor, target), sessions, break skips, lesson dates and a plant pool. The UI builds it in `ui/game/game.ts`. A `game_state` doc holds the start day. History before the start is ignored: earlier completions are dropped and earlier open tasks are clamped to the start date.

## Reef (Ecosystem)

For each day from the first task or session date (at most 365 back) to today:

- The day's tide comes from the Today ring tally (`ringTally`): committed versus done. A day with nothing committed is neutral (null).
- `reefDay` advances the reef, which owns the points, phases and biome per day.
- A skipped break costs `RULES.breaks.skipCost` points on its day, but never drops below the current phase's floor.

The week's visitor rarity is the better of the tide-based `weekVisitor` and an overdue-task reward. Finishing a long-pushed task (age measured from first committed day) can drop a rare or exotic visitor, capped per week and per biome. Lessons make creatures hide after `RULES.lessons.hideAfter` days without one; this is dormant until the first lesson.

## Garden

Each habit is a plot holding one plant. Weeks run from the garden start. `weekResult` maps a week's session count against floor and target to died, floor, target or above. `plantWeek` then advances the plant:

- A seed (stage 0) waits without penalty until its first floor week.
- Once sprouted, a week below floor kills the plant, unless `RULES.garden.wilt` allows a wilt first.
- Each good week adds `RULES.garden.points`, and the plant advances one stage up to bloom.

`plotWeek` shows a bloom (or dead plant) for the configured weeks, then presses it. The finished plant's score picks the next seed's rarity (rare and exotic thresholds), and a small mutation chance applies. A dead plant yields compost, so the next seed starts already sprouted. Only finished weeks are scored. Random rolls are seeded from the habit key, so reloads agree.

## RULES, SPEC.md and spec-check

All tunable numbers live in `RULES` (`lib/rules.ts`), deliberately mutable so the balance sim can override entries. `SPEC.md` is the source of truth for mechanics and names each number as `section.key = value`. `pnpm spec-check` (`tools/spec-check.ts`) fails if any such line differs from `RULES`, names an unknown key, or if a `RULES` leaf is missing from the spec. It runs in `pnpm test` and `pnpm verify`. A mechanic change therefore updates `SPEC.md` and `RULES` in the same commit.

<!-- openwiki: broken internal link [/openwiki/architecture/board-ui.md] link "/openwiki/architecture/board-ui.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/architecture/packages-and-boundaries.md] link "/openwiki/architecture/packages-and-boundaries.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
See also: [board UI](/openwiki/architecture/board-ui.md), [packages and boundaries](/openwiki/architecture/packages-and-boundaries.md).
