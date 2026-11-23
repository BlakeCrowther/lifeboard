---
type: Integration
title: Break overlay app
description: The native macOS menu-bar app that covers every screen with the board during timed breaks, its timer and settings, the page bridge and events, and how skipped breaks feed the game.
tags: [break, macos, swift, webview, integration]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-23T20:10:38.978Z
sources:
  - id: openwiki-source-f930bf0e2ce22b2f40c40f81
    resource: repo://break/build.sh
  - id: openwiki-source-47161623184a7578f9b4d812
    resource: repo://break/install.sh
  - id: openwiki-source-fb0dd20300551ce132c6fadd
    resource: repo://break/LifeboardBreak.swift
  - id: openwiki-source-de9446aa33eac9e75b915667
    resource: repo://break/Pacing.swift
  - id: openwiki-source-e2b54b1cf8eab0d11416762b
    resource: repo://src/packages/ui/boot.ts
  - id: openwiki-source-6cd1f358e4b527ced9a43d84
    resource: repo://src/packages/ui/game/game.ts
generated: { by: "claude-code", at: "2026-11-23T20:10:38.978Z" }
---

# Break overlay app

`break/` holds Lifeboard Break, a native macOS menu-bar app (two Swift files, no Xcode project) that, on a work/break timer, covers all screens with a web view of the board. It is the one part of the repo outside the web page. It talks to the page only through a small JavaScript bridge and one DOM event ([Board UI](../architecture/board-ui.md)). The agent skill `break-setup` installs and configures it.

## Build and install

| Script | Does |
|---|---|
| `break/build.sh [--run\|--now]` | compiles `LifeboardBreak.swift` and `Pacing.swift` with `swiftc`, writes `break/out/LifeboardBreak.app` (agent app: `LSUIElement`, bundle id `com.lifeboard.break`, ad-hoc signed), bundles `placeholder.html`; `--run` opens it, `--now` opens it and starts a break immediately |
| `break/install.sh [--uninstall]` | builds, copies the app to `~/Applications`, and writes a LaunchAgent so it starts at login; `--uninstall` stops and removes both |

## Timer and overlay

The app sits in the menu bar showing minutes until the next break. A one-second tick drives everything:

- **Work timer.** `nextBreak` is set `workMinutes` ahead and reset after any break ends or a paused period. No break starts while the Mac is asleep or locked. When it returns, the pure `Pacing.afterAway` decides: an absence of at least a break's length resets the work period (it counted as a break), a shorter one pushes the next break out by the time away, and an absence during an overlay ends that break. Idle time of at least a break's length (no input events) also resets the timer.
- **Break.** When the timer reaches zero the app opens one borderless window per screen at screen-saver level on all Spaces, with the page in a `WKWebView`, a countdown, a Skip button that stays disabled for `skipDelaySeconds`, and a Postpone button. Postponing delays the next break by `postponeMinutes` and is allowed `maxPostpones` times per work period. Menu entries pause the timer and choose work and break lengths. A global escape key chord (⌃⌥⌘B) ends a break.
- **Page shown.** The overlay loads the `url` setting, normally the lifeboard artifact URL; when it is empty it shows the bundled `placeholder.html`. Popups the page opens are shown in a secondary web view.

## Settings

Settings are `UserDefaults` for `com.lifeboard.break`, changed with `defaults write com.lifeboard.break <key> <value>`; the menu also edits the work and break lengths.

| Key | Default |
|---|---|
| `workMinutes` | 50 |
| `breakMinutes` | 5 |
| `postponeMinutes` | 5 |
| `maxPostpones` | 2 |
| `skipDelaySeconds` | 15 |
| `url` | empty (placeholder page) |

Each break end also appends a line to a local `log.tsv` in the app's Application Support folder.

## Page bridge

On load the app injects `window.lifeboardBreak` into the page and its frames, with `skip()`, `postpone()` and `done()` (each posts a message to the native handler), a `secondsLeft` value, and a `lifeboardbreaktick` event fired every second with the seconds remaining. When a break ends the app dispatches `lifeboardbreakend` with the reason (`skip`, `skip-page`, `escape`, `postpone`, `done`, `done-page`). It delays teardown of the web view by five seconds so the page can save the end event first.

## How the board uses it

`ui/boot.ts` (`listenForBreakEnds`) does nothing unless `window.lifeboardBreak` exists, so the board runs normally in any browser. When present, each `lifeboardbreakend` is mapped to a label (`skip`, `done` or `postpone`) and, once the store is ready, written as a `logs` document of kind `break` for that day ([Data layer](../architecture/data-layer.md)).

The game reads only the skips: `ui/game/game.ts` collects the dates of `break` logs labeled `skip` and passes them, with an optional `checks/break_rules` `skipCost`, into `deriveGame`. Each skipped break costs `RULES.breaks.skipCost` growth points, never dropping below the current phase ([Game derivation](../game/game-derivation.md), [SPEC.md](../../SPEC.md)).

## Extension notes

- A new break signal goes through the same pair: a reason string in the app's `endBreak`, and a label mapping in `listenForBreakEnds`.
- The app has no tests or CI coverage; `pnpm verify` does not build it, since it needs macOS and Swift ([Verification and CI](../operations/verification-and-ci.md)).
