---
type: Architecture
title: "Domain logic: dates, recurrence, tasks, habits"
description: The pure, DOM-free packages that define a board day, recurring-task dates, task state and ordering, the ring tally and task age, and habit counts and streaks.
tags: [dates, recurrence, tasks, habits, ring, pure-functions]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-22T17:23:06.062Z
sources:
  - id: openwiki-source-b9c532a64390202aefeb8c31
    resource: repo://src/packages/dates/lib/board-clock.ts
  - id: openwiki-source-cc04528ee2a1b79341d3afe8
    resource: repo://src/packages/dates/lib/calendar-dates.ts
  - id: openwiki-source-87d51b094249dcdea2f2d5ed
    resource: repo://src/packages/habits/lib/habit-stats.ts
  - id: openwiki-source-5a1b5c8b401febe76b24e1f0
    resource: repo://src/packages/recurrence/lib/rules.ts
  - id: openwiki-source-43826b7c4acbf3ad7f6e31ae
    resource: repo://src/packages/tasks/lib/commitment.ts
  - id: openwiki-source-c6b3ef602b2cd54c4af107ab
    resource: repo://src/packages/tasks/lib/task-dates.ts
generated: { by: "claude-code", at: "2026-11-22T17:23:06.062Z" }
---

# Domain logic: dates, recurrence, tasks, habits

Four small packages hold the board's rules about time and work. They are pure (no DOM, no db imports), sit at the bottom of the layering `dates ← recurrence ← tasks, habits ← game` ([Package layering and boundaries](./package-boundaries.md)), and are tested through their entry points in each package's `tests/`. The [game package](../game/game-derivation.md) and the [board UI](./board-ui.md) build on them. Terms such as *ring*, *committed*, *age*, *floor* and *target* are defined in [GLOSSARY.md](../../GLOSSARY.md); the numbers behind them live in [SPEC.md](../../SPEC.md).

## dates

- **Zone-free date math.** A date is a `'YYYY-MM-DD'` string read as UTC midnight, so adding days never crosses a daylight-saving gap in the browser's zone (`index.ts` exports `addDays`, `daysBetween`, `weekStartOf`, month helpers and labels). Weekdays are numbered 0 Sunday to 6 Saturday.
- **The board's day boundary.** `clock.ts` decides which calendar date an instant falls on, using the browser's zone until `setTimeZone` switches it to the profile's IANA zone. An unknown zone name returns `false` and keeps the old zone; the fallback zone is `America/Los_Angeles` only if even the browser zone cannot be formatted. `todayDate` and `dateOfInstant` are the only source of "today" for the page; everything else takes today as a parameter.

## recurrence

`nextDueDate(rule, task, completedOn)` returns the next due date after finishing an occurrence. Calendar rules count from the task's own scheduled date (due, else deadline, else the completion date).

| Rule kind | Next date |
|---|---|
| `interval` | from the scheduled date when `basis` is `schedule`, otherwise from the completion date, by `every` days, weeks, months or years |
| `monthly_day`, `monthly_last_day`, `monthly_weekday` | `every_months` later; a day past month end clamps to the last day; a missing nth weekday rolls to the next month that has one |
| `yearly_*` | one year later (first or last day, a fixed day clamped to month end, or an nth weekday) |

Numeric rule fields may arrive as strings from the db, so every read goes through `Number()`, and a bad `every` falls back to 1. `describeRule` and `shortRuleLabel` produce the task editor's sentence and the compact label. The matching zod schema is in the [data layer](./data-layer.md).

## tasks

- **Effective date and state.** A task's effective date is the earlier of its do date (`due_date`) and `deadline_date`. A task is *overdue* when its deadline passed, or its do date passed with no deadline; it is *slipped* when the do date passed but the deadline is still ahead.
- **Ordering and buckets.** `bucketTasks` splits open tasks into `urgent` (effective date today or earlier), `week` (within 7 days), `later` and `none`. The urgent list puts hand-ordered tasks first, then overdue ones, then by date; the other lists sort by date then manual order, with creation time as the final tiebreak.
- **Commitment and the ring.** A task is *committed* to each date in `committed_days`; with none recorded, its effective date stands in. `ringTally` counts, per date, tasks committed to it that were not finished before it, plus everything finished on it (a task added and finished the same day adds one to both sides). `ringPercent` is done ÷ committed capped at 1, and `null` when nothing was committed so empty days stay neutral.
- **Age.** `taskAge` counts days since the first committed day and rescheduling never resets it; a task not yet committed, or committed in the future, has age 0. `missedTaskStatus` classifies what a missed day became: done late, moved, overdue or slipped.
- The UI side effects of commitment (recording `committed_days` at midnight, the commit lock) live in `ui/shared/commitments.ts` ([Board UI](./board-ui.md)).

## habits

`habitStats(habit, sessions, today, weekStart)` counts a habit's sessions per week and day and derives the streak. A weekly habit meets its floor when the week's count reaches the floor; a daily habit needs every day so far at the floor. The streak is floor-met weeks in a row ending this week (or last week while this one is still open). `best` is the longest run ever and is never below the current streak; `pending` means this week's floor is not met yet but the streak can continue; `missed` marks a daily habit that already missed a day this week. The result also carries the last 12 weeks and this week's seven days for the UI. Whether a session counts at all (logged in its own week, or with an exception) is decided earlier in the board model, not here.

## Extension notes

New date-dependent behavior should take `today` and the week start as arguments rather than reading the clock, so the [game derivation](../game/game-derivation.md) and the balance sim can reuse it unchanged.
