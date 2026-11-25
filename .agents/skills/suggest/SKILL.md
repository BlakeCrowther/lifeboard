---
name: suggest
description: Turn a plain-language wish ("I want something that tracks my water", "help me read more") into two or three concrete ways to build it inside lifeboard, each grounded in what the board already has (tasks, habits and their garden plots, lists, the Ecosystem, lessons, the weekly run), with at least one playful, gamified option when it fits. The user picks one and it hands off to building it. Plain words, no jargon. Use when someone says "I want something that…", "could lifeboard do…", "how would I add…", or "suggest a way to…".
---

# Suggest a way to fit an idea into lifeboard

The user knows what they want in their life, not how lifeboard works. Your job: understand the wish, then offer two or three different ways lifeboard could do it, in plain words, and help them pick. You don't build anything in this skill.

## 1. Understand the wish (one question at most)
Restate it in one sentence. If one thing is genuinely unclear and changes the options (how often? just tracking, or nudging too? private or shared?), ask that one question; otherwise go straight to options. Never ask about implementation.

## 2. Know the pieces (read before proposing)
Ground every option in what exists. Skim, don't recite:
- `SPEC.md`: the game rules. **Garden** (one plot per habit; a plant grows a stage each week the habit hits its floor, dies the first week it doesn't; 3D plants made weekly), **Ecosystem** (the day's ring from tasks; phases, visitors, what overdue tasks do), **Lessons**, **Surprises**, **Weekly job**.
- `src/packages/README.md`: the packages. Habits and sessions (`habits`), tasks and repeats (`tasks`, `recurrence`), the game (`game`, rules in `src/packages/game/lib/rules.ts`), the Garden and Ecosystem renderers (`garden`, `ecosystem`), the board UI (`ui`: tabs Today, Plan, Lists, Life, Grow).
- `src/packages/db/lib/schemas.ts`: what the board can store (tasks, habits, habit_sessions, list items, buy list, gift ideas, goals, logs, countdowns, settings documents). A new kind of data usually fits an existing collection before it needs a new one.
- `.agents/skills/`: what Claude already does for the board (lessons from a book or video, weekly visitors and plants, setup).
- `GLOSSARY.md` for the words, so you can explain them simply.

## 3. Offer two or three options
Each option is a different shape, not the same idea three sizes. Draw from these shapes, most to least effort:

| Shape | Good for | Lives in |
|---|---|---|
| A habit (with its garden plot) | Things done regularly: water, reading, calling family | `habits`, Garden |
| A repeating task | Things on a schedule or with a deadline | `tasks` + `recurrence`, the day's ring |
| A list | Things to collect or tick off: books to read, gift ideas | list items, Lists tab |
| A countdown or goal | Something ahead or a year's aim | `countdowns`, `goals`, Life tab |
| Lessons | Learning from a source, a little each day | `lesson-make`, Ecosystem feedings |
| A new game rule | Making something count: points, a visitor, a plant reward | `SPEC.md` + `rules.ts` (changes the game for that board) |
| A new card or view | Seeing something a new way | `src/packages/ui` |

For each option give:
- **What you'd see**: one or two sentences, from the user's side ("A cup fills on your Today screen each time you log a glass; eight glasses grows your water plant a stage").
- **Why this one**: the trade-off in plain words (least effort, most motivating, most flexible).
- **How big**: "works today, no changes" / "a small change" / "a bigger change to your board's code".

Rules:
- At least one option should work **today with no code change** when that's possible (a habit, a repeating task, a list).
- Offer a **gamified** option when it fits: points on the day's ring, a garden plant, an Ecosystem effect, a surprise. Skip it when the wish is somber or private and a game would feel wrong.
- Respect real constraints: game numbers come from `SPEC.md`, a new mechanic changes `SPEC.md` and `rules.ts` together, models only come from the weekly job, the board only stores what the db schemas allow.
- No jargon: say "your board's code", not "the ui package".

## 4. Let them pick, then hand off
Ask which one (AskUserQuestion when available, one option per choice, the "works today" one first when it fits). Then:
- **Works today**: offer to set it up now (create the habit, repeating task, list or countdown on their board with ArtifactData, after they say yes).
- **A change to the board's code**: say where it'll happen (their own copy of lifeboard, AGENTS.md "Which repo publishes which board"), then start the normal flow: a game rule goes into `SPEC.md` first (rule text and **Status**), with `rules.ts` and `pnpm spec-check`; a new card or view gets a short plan, then is built, checked with `pnpm verify`, and published. A bigger idea can start as a design doc in `docs/design/`.
- **Not a fit**: say so kindly, and suggest the closest thing lifeboard does well.
