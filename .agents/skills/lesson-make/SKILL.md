---
name: lesson-make
description: Turn a book, video, post, article, talk, podcast, course or note into lifeboard lessons (Ecosystem). Interviews the user about what mattered, or with "do it for me" works from the source alone; rates size and salience, picks the source's format ladder, writes a prompt per rung, and adds rows to the live lifeboard's sources and lessons collections. Use when the user hands over something to learn from, says "make lessons from X", or wants to see the lesson queue.
---

# Make lessons

Rules live in `SPEC.md` → Lessons (read it first). Data shapes: `schema.js` (`sources`, `lessons`). Deck logic: `src/packages/game/lib/lessons.ts` (`buildDeck`, `answerLesson`, `rungOf`).

## 0. Target board
The user's live lifeboard artifact (never a mock/test build; see break-setup for how to pick it). Never hardcode its URL in this repo.

## 1. Show the queue first
ArtifactData `list` on `lessons` (and `sources`). Report: active lessons, how many are due or new, books in progress. The board shows `lessons.feedings` (2) feedings a day of `lessons.perFeeding` (5) cards; 2+ books a month backs it up, so say so if this adds to a backlog.

## 2. Get the source
Accept a link, file, pasted text, transcript, quote or "the book X". Read what you can (WebFetch for links, Read for files). For a book you can't read, work from what you reliably know and say so.

## 3. Interview (skip with "do it for me")
Ask at most 3 short questions, one message:
- What stuck with you / why this source?
- What do you want to be able to do or remember after?
- Anything to skip?

## 4. Rate and size
- **size** 1–3 (short post … long book), **salience** 1–3 (how much it matters to the user).
- Lesson count by type (SPEC table): post/short video 3–5; long article/talk/podcast 4–8; book 10–25. Scale within the range by size × salience.
- **intervals** (optional, days between reviews; default `[3,7,21]`; it graduates after the last): quotes/inspiration `[7,30,90]`; ideas from books `[3,7,21]` (omit); language/facts `[1,3,7,14]`. Ask if unsure. Ladder `["tap"]` alone makes a quote card.
- **ladder**: formats the lessons climb, in order, from `tap | recall | apply`. Ideas/books: `["tap","recall","apply"]`. Skills/language/facts: `["recall","apply"]`. Never more than 3 rungs.

## 5. Write lessons
One idea per lesson. `rungs` has exactly one entry per ladder step, same order:
- `tap`: `{ "format":"tap", "prompt":"<the idea or a short quote, ≤ 240 chars>", "note":"<optional: why it matters / source line>" }`
- `recall`: `{ "format":"recall", "prompt":"<a sentence with ___ for the blank, or a question>", "answer":"<answer>|<accepted alt>", "choices":["…","…","…"] }`: `choices` optional (3, answer among them, plausible distractors); without it the user types the answer, so keep answers 1–3 words. Matching ignores case, accents and punctuation.
- `apply`: `{ "format":"apply", "prompt":"<one concrete question: where could you use this today / this week?>" }`

Write in plain words, no jargon the source didn't teach. Show the user the list (titles + recall answers) before writing unless they said "do it for me".

## 6. Write rows
ArtifactData `batch` on the live board:
- `sources/<slug>`: `{ title, type, author?, url?, size, salience, ladder, intervals?, summary (2–3 sentences), status: "active", created_at: <ms> }`. `type` ∈ book, video, post, article, talk, podcast, course, note.
- `lessons/<slug>-<nn>`: `{ source_id: "<slug>", level: 0, due: "<today YYYY-MM-DD>", state: "active", rungs: [...], order: <n>, created_at: <ms> }`.

Every doc must pass `LBS.validate` (check with `node -e` against `schema.js` before writing). The board skips invalid docs silently.

## 7. Report
Source added, lesson count, ladder, and when they start showing (new lessons fill each feeding after due reviews). Lessons appear only with the Ecosystem on.

## Feedings
Board-wide: ArtifactData `set` `checks/lesson_rules` `{ "value": { "feedings": <n>, "perFeeding": <n>, "dayStart": <hour>, "dayEnd": <hour> }, "updated_at": <ms> }` (defaults 2 × 5, day 6–22; any key may be left out).

## Pausing / removing
Pause a source: set `sources/<id>.status = "paused"` (its lessons leave the deck). Rewrite a flagged lesson (`flagged: true`) in place and clear the flag.
