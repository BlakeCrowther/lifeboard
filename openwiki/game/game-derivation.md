---
type: Architecture
title: Game derivation and rules
description: How game state is derived from db history on every load, where the tunable RULES live, how spec-check ties them to SPEC.md, and how the balance sim runs the same package.
tags: [game, derivation, rules, spec-check, simulation]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-22T17:23:06.062Z
sources:
  - id: openwiki-source-cf775ba1ea4f36bad51d3653
    resource: repo://src/packages/game/derive.ts
  - id: openwiki-source-f8a393a4f569cbfcdfc03d28
    resource: repo://src/packages/game/lib/derive-game.ts
  - id: openwiki-source-ff7a1e630c6e046b66be34e1
    resource: repo://src/packages/game/lib/reef.ts
  - id: openwiki-source-b2e26382d5158fef0dbab8cc
    resource: repo://src/packages/game/lib/rules.ts
  - id: openwiki-source-5b11211374c104d4cada8ada
    resource: repo://tools/sim.ts
  - id: openwiki-source-7fd1f9390baadbd987c79277
    resource: repo://tools/spec-check.ts
generated: { by: "claude-code", at: "2026-11-22T17:23:06.062Z" }
---

# Game derivation and rules

The game (garden, Ecosystem, visitors, lessons) stores almost no state of its own. `src/packages/game` is a pure, DOM-free package that **derives** the whole game from db history (tasks, habits, habit sessions, break skips, lesson dates, the plant pool) each time the board loads. The mechanics themselves (numbers, rewards, status of each section) are written in [SPEC.md](../../SPEC.md), the source of truth; this page covers how code and spec are tied together. Terms are in [GLOSSARY.md](../../GLOSSARY.md).

## Entry points

| Entry | Exports |
|---|---|
| `index.ts` | `RULES`, plot rules (`newPlot`, `plotWeek`, `weekResult`, `rarityOf`, …), reef rules (`dayTide`, `reefDay`, `weekVisitor`, `overdueReward`, `cloudiness`, `blight`, …), lesson rules (`buildDeck`, `answerLesson`, …) |
| `derive.ts` | `deriveGame`, `calendarSeason`, `PLANT_SPECIES` and the input and state types |

The package imports `dates`, `recurrence`, `tasks` and `habits` only ([Package layering and boundaries](../architecture/package-boundaries.md)); `tasks/ringTally` supplies each day's committed and done counts ([Domain logic](../architecture/domain-logic.md)).

## Derivation

`deriveGame(input)` takes today, task and habit summaries, sessions, the start day, week start, break-skip dates, lesson dates and the plant pool, and returns the complete state: the garden plots with their plants and pressed plants, the reef (Ecosystem) with phase, biome and dioramas, tide and murk, the week's visitor, break effects and lesson hiding. History before the game start day (`game_state/game`) is ignored; the game begins at zero that day. The choices the rules left open are documented at the top of `lib/derive-game.ts`:

- **Tide.** A day's tide is the Today ring: `dayTide(committed, done)` from `ringTally`. A day with nothing committed is neutral (`null`), so empty days neither help nor hurt. Days run from the first task or session date, capped at 365 back.
- **Growth.** `reefDay` adds points per day from the tide and moves the Ecosystem through phases and biomes; phase thresholds adapt to the person's trailing daily average (`tide.trailingDays`).
- **Murk and blight.** Cloudiness counts open tasks whose effective date has passed; blight counts tasks whose age since first commitment reached `blightAfter`. Rescheduling never resets age.
- **Visitors.** The week's visitor is the better of the rare earned by enough full-ring days and an aged-task drop (capped per week and per biome), else common, and none while bleached.
- **Garden.** Weeks run from the garden start. Each habit's plot runs `plotWeek` on finished weeks only; the current week is still open. A week's result (`died`, `floor`, `target`, `above`) adds points to the plant, and points decide the next seed's rarity. Random rolls (mutation, species) are seeded from the habit key, so every reload and device agrees.
- **Plant pool.** Which species a plot gets comes from the pool of roster plants ([Ecosystem and Garden rendering](./ecosystem-and-garden.md)); `PlantPool` is passed in, so derivation stays pure.

Because everything is recomputed from history, editing history (a floor, a target, an old session) re-scores the past. SPEC.md lists freezing closed weeks as an open question. The board caches the derived state by model revision and plant-pool version ([Board UI](../architecture/board-ui.md)).

## RULES and the spec

Every tunable number lives in one object, `RULES`, in `lib/rules.ts` (garden, tide, visitor, bleach, lessons, breaks). `RULES` is deliberately mutable so the balance sim can override entries.

`tools/spec-check.ts` (`pnpm spec-check`, part of `pnpm verify`; see [Verification and CI](../operations/verification-and-ci.md)) enforces the pairing in both directions. It flattens `RULES` into `section.key` leaves and scans SPEC.md for backticked `` `section.key = value` `` statements. It fails when:

- a spec value differs from `RULES`,
- the spec names a key `RULES` does not have, or
- a `RULES` leaf is never mentioned in the spec.

So no number can exist only in code or only in the spec. The repo rule is that any mechanic change updates SPEC.md (rule text and the section's **Status**: Built, Partly built or Planned) in the same commit. UI look and wording may differ from the spec; mechanics may not.

## Balance simulation

`pnpm sim` runs `tools/sim.ts`: the game package against seeded made-up personas (steady, bursty, slump-and-recover, overachiever, light user) for 28 weeks over 200 seeds by default, with no Claude in the loop, so runs repeat and compare after a tweak. Arguments are `[seeds] [weeks]`, overrides such as `garden.bloomWeeks=1` or `lessons.intervals=[3,7,21]` (applied directly to `RULES`), and `--visitors[=persona[:seed]]` to print one run's week-by-week visitor events (the weekly visitor skill's dry run picks from this list; see [Publishing and the weekly run](../operations/publish-and-weekly-run.md)). Findings and the decisions taken from them are recorded in SPEC.md's Simulation section. `pnpm verify` runs the sim as a smoke check; it never changes game numbers, and neither do unattended weekly runs.

## Testing

`src/packages/game/tests/game.test.ts` exercises the package through its entry points. When changing a rule: edit `RULES`, update SPEC.md, run `pnpm spec-check` and `pnpm sim`, then `pnpm verify`.
