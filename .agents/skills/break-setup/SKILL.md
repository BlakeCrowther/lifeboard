---
name: break-setup
description: Install, configure, or uninstall Lifeboard Break, the tray/menu-bar app that covers every screen with the lifeboard during timed breaks, on Linux, Windows or macOS. Use to set it up on a computer, change work/break lengths, postpone/skip rules or the lifeboard URL, or remove it. Safe to run again any time to change settings.
---

# Lifeboard Break setup

Two apps share one behaviour; install one per computer:

| app | source | platforms | settings |
|---|---|---|---|
| **Electron** (default) | `break/desktop/` (TypeScript, timer rules in `src/timer.ts`) | Linux (X11/XWayland), Windows, macOS | `settings.json` in the app's data folder |
| Swift (original) | `break/LifeboardBreak.swift` | macOS only, needs `swiftc` | `defaults write com.lifeboard.break` |

On macOS both install under the same LaunchAgent label (`com.lifeboard.break`), so installing one replaces the other. Use the Electron app unless the user asks for the Swift one; its section is at the end.

The Electron app runs from this clone (node_modules' Electron), so it needs `pnpm bootstrap` first and the clone must stay where it is.

## 1. Ask what to change
Show current values, then ask only about what the user wants to change. The settings file:

| OS | settings.json and log.tsv live in |
|---|---|
| Linux | `~/.config/LifeboardBreak/` |
| macOS | `~/Library/Application Support/LifeboardBreak/` |
| Windows | `%APPDATA%\LifeboardBreak\` |

```bash
cat ~/.config/LifeboardBreak/settings.json 2>/dev/null || echo "(all defaults)"
```

| key | type | default | meaning |
|---|---|---|---|
| workMinutes | number | 50 | work time between breaks |
| breakMinutes | number | 5 | break length; this long idle also resets the work timer |
| postponeMinutes | number | 5 | "N more min" button |
| maxPostpones | integer | 2 | postpones per break cycle |
| skipDelaySeconds | number | 15 | Skip stays disabled this long |
| url | string | "" | page shown; empty = bundled placeholder. Lifeboard = the user's own live lifeboard artifact (see below) |

A missing key or a bad value falls back to its default (`src/settings.ts`). The running app re-reads the file within 2 s, so there is no restart. Work and break lengths can also be changed from the tray menu, which writes the same file.

Finding the url: never hardcode one in this repo. Run Artifact `list` and pick the user's live lifeboard (usually the pinned one titled "lifeboard"); confirm with the user. Before choosing, check it is not a mock/test build: read its `index.html` and reject it if it loads `dist/fake-db.js`/`mockdata.js` (those have no live db, so skips would not be saved).

### Skip penalty (lives in the lifeboard db, not on this computer)
The page logs every break end to `logs` (`kind: 'break'`, `label: skip|done|postpone`). Each skip costs life points in the Ecosystem (never below the current phase) and the fish sulk for the rest of that day. Ask what a skip should cost; suggest these:

- 0: free, the fish still sulk
- 5 (default): about half a good day's growth
- 10: about a full day's growth

Write it with ArtifactData `set` on the user's live lifeboard: collection `checks`, doc `break_rules`, data `{ "value": { "skipCost": <n> }, "updated_at": <ms now> }`. Deleting the doc falls back to `RULES.breaks.skipCost` in `src/packages/game/lib/rules.ts`. The fish only show with the Ecosystem on (display menu, or `#eco` on the link).

## 2. Apply
Write the keys being changed into settings.json, keeping the others (create the folder if missing):

```json
{ "workMinutes": 45, "url": "https://claude.ai/artifact/<id>" }
```

## 3. Install / update / uninstall
```bash
pnpm bootstrap            # once per clone: installs Electron
pnpm break:install        # build, start now, and start at login
pnpm break:install --uninstall   # stop it and remove the login entry (settings kept)
```
Re-run `pnpm break:install` after pulling changes to `break/desktop/`. Start at login is a `~/.config/autostart/lifeboard-break.desktop` file on Linux, a LaunchAgent on macOS and an `HKCU\...\Run` value on Windows.

Try it without installing: `pnpm break --now` (starts a break at once). With the app already running, a second `pnpm break --now` starts a break in the running app.

### Linux notes
- Needs a tray host to show the 🐟 menu (KDE, XFCE, Cinnamon have one; GNOME needs the AppIndicator extension). Without one the app still runs breaks; change settings in the file.
- The app runs under X11/XWayland on purpose (Wayland lets no app cover every screen or stay on top).
- Ubuntu 23.10+ blocks Electron's sandbox; `break:install` prints the one-time `chown`/`chmod` of `chrome-sandbox` that fixes it.

## 4. First run with the lifeboard URL
Start a break from the tray menu → Break now (or `pnpm break --now`). claude.ai asks for sign-in once inside the overlay (Google popup works); cookies persist after that. Escape hatch during any break: ⌃⌥⌘B on macOS, Ctrl+Alt+Shift+B on Linux and Windows.

## Troubleshooting
- Log: `log.tsv` in the settings folder (start, break ends, `nav`/`redirect-home` lines).
- Grey screen after sign-in: the app redirects back to `url` at most twice per break; check the log for where it landed.
- Checks: `pnpm test` runs the timer's unit tests anywhere; `pnpm test:break` runs the whole app on Linux in Xvfb (needs `xvfb openbox xdotool`).

## Swift app (macOS, original)
Settings via `defaults` (same keys as the table, types `-float`/`-int`/string):
```bash
defaults read com.lifeboard.break 2>/dev/null || echo "(all defaults)"
defaults write com.lifeboard.break workMinutes -float 45
launchctl kickstart -k gui/$(id -u)/com.lifeboard.break   # restart to apply
break/install.sh              # build → ~/Applications/LifeboardBreak.app, LaunchAgent, start now
break/install.sh --uninstall  # stop, remove app + LaunchAgent (settings kept)
```
Log: `~/Library/Application Support/LifeboardBreak/log.tsv`. Escape: ⌃⌥⌘B.
