---
type: architecture
title: Board UI and boot sequence
description: How the lifeboard page boots, redraws on store changes, dispatches events, and lazy-loads the game (garden and ecosystem) chunks.
tags: [ui, boot, render-loop, events, game-loading]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T15:04:47.972Z
sources:
  - id: openwiki-source-3e6af8ae4f0af87fcea5db2b
    resource: repo://src/packages/ui/app/render.ts
  - id: openwiki-source-e2b54b1cf8eab0d11416762b
    resource: repo://src/packages/ui/boot.ts
  - id: openwiki-source-6cd1f358e4b527ced9a43d84
    resource: repo://src/packages/ui/game/game.ts
  - id: openwiki-source-4a1933b34e15b010199e0dc1
    resource: repo://src/packages/ui/shared/redraw.ts
generated: { by: "claude-code", at: "2026-11-23T15:04:47.972Z" }
---

# Board UI and boot sequence

The `ui` package (`src/packages/ui/`) is the DOM layer on top of every other package. `src/main.ts` is the bundle entry and only calls `bootBoard()`; it is the only file allowed to import `ui`.

## Boot

`bootBoard` (`src/packages/ui/boot.ts`) runs in this order:

1. Registers the renderer with `shared/redraw.ts`, then installs the event listeners.
2. Applies the saved theme from `localStorage`.
3. Reads the URL hash for navigation state. A `#eco`, `#labs` or `visitor=` link forces the Ecosystem on for the visit.
4. If the game is on, starts loading the game modules.
5. Starts the db store. On every store change it refreshes the board model. Once the status is `ready`, it seeds starter tasks, spawns missing recurring successors and records commitments, then schedules a render.
6. Draws immediately, starts the live calendar and listens for break-overlay events.

## Render loop

Everything asks `shared/redraw.ts` for a redraw and never draws directly. `scheduleRender` draws on the next tick, but if the user is typing in an input or dragging, it leaves the redraw pending until `catchUp()` runs. db changes can arrive at any time, including from other devices, so this keeps edits from being wiped.

`renderPage` (`app/render.ts`) rebuilds the tab bar and the active tab's view (`today`, `plan`, `lists`, `life`, `grow`). Until the store is `ready`, it shows a status card for `loading`, `slow`, `nodb` or `error` instead of any data. It preserves scroll position and restores focus by `data-act` key across the innerHTML replacement. It also notices a day rollover and refreshes the board when `clock.today` changes.

## Events

Controls carry `data-act` (clicks) or `data-form` (submits); one listener per event type in `app/events.ts` dispatches on that value. Writes go through the store's optimistic write path (see the data store page).

## Game loading

The game is optional per device. With it off, nothing loads: no three.js and no game derivation. `game/game.ts` loads the garden and ecosystem chunks once (`loadGameModulesOnce`). `currentGame()` derives game state only when the garden is loaded and the store is ready. It caches the result until the model revision, the plant pool version or the day changes, and a derivation error yields `null` rather than breaking the board.

## Break overlay hook

If the macOS break overlay injected `window.lifeboardBreak`, the board listens for `lifeboardbreakend` and logs each end as a `logs` doc of kind `break`. The game reads skipped breaks from those logs.

<!-- openwiki: broken internal link [/openwiki/architecture/data-store.md] link "/openwiki/architecture/data-store.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/architecture/game-derivation.md] link "/openwiki/architecture/game-derivation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
See also: [data store](/openwiki/architecture/data-store.md), [game derivation](/openwiki/architecture/game-derivation.md).
