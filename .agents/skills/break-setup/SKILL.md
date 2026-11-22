---
name: break-setup
description: Install, configure, or uninstall Lifeboard Break, the macOS menu-bar app that covers every screen with the lifeboard during timed breaks. Use to set it up on a Mac, change work/break lengths, postpone/skip rules or the lifeboard URL, or remove it. Safe to run again any time to change settings.
---

# Lifeboard Break setup

App source: `break/` (`LifeboardBreak.swift`, `build.sh`, `install.sh`, `placeholder.html`). macOS only; needs `swiftc` (Xcode or Command Line Tools).

## 1. Ask what to change
Show current values, then ask only about what the user wants to change:

```bash
defaults read com.lifeboard.break 2>/dev/null || echo "(all defaults)"
```

| key | type | default | meaning |
|---|---|---|---|
| workMinutes | -float | 50 | work time between breaks |
| breakMinutes | -float | 5 | break length; this long idle also resets the work timer |
| postponeMinutes | -float | 5 | "N more min" button |
| maxPostpones | -int | 2 | postpones per break cycle |
| skipDelaySeconds | -float | 15 | Skip stays disabled this long |
| url | string | "" | page shown; empty = bundled placeholder. Lifeboard = the user's own live lifeboard artifact (see below) |

Finding the url: never hardcode one in this repo. Run Artifact `list` and pick the user's live lifeboard (usually the pinned one titled "lifeboard"); confirm with the user. Before choosing, check it is not a mock/test build: read its `index.html` and reject it if it loads `mock.js`/`mockdata.js` (those have no live db, so skips would not be saved).

Work and break lengths can also be changed from the 🐟 menu without this skill.

### Skip penalty (lives in the lifeboard db, not on this Mac)
The page logs every break end to `logs` (`kind: 'break'`, `label: skip|done|postpone`). Each skip costs life points in the Ecosystem (never below the current phase) and the fish sulk for the rest of that day. Ask what a skip should cost; suggest these:

- 0: free, the fish still sulk
- 5 (default): about half a good day's growth
- 10: about a full day's growth

Write it with ArtifactData `set` on the user's live lifeboard: collection `checks`, doc `break_rules`, data `{ "value": { "skipCost": <n> }, "updated_at": <ms now> }`. Deleting the doc falls back to `RULES.breaks.skipCost` in `src/packages/game/lib/rules.ts`. The fish only show with the Ecosystem on (display menu, or `#eco` on the link).

## 2. Apply
```bash
defaults write com.lifeboard.break workMinutes -float 45
defaults write com.lifeboard.break url "https://claude.ai/artifact/<id>"
```
Then restart so it picks them up: `launchctl kickstart -k gui/$(id -u)/com.lifeboard.break`.

## 3. Install / update / uninstall
```bash
break/install.sh              # build → ~/Applications/LifeboardBreak.app, LaunchAgent, start now
break/install.sh --uninstall  # stop, remove app + LaunchAgent (settings kept)
```
Re-run `install.sh` after any change to the Swift code.

## 4. First run with the lifeboard URL
Start a break from 🐟 → Break now. claude.ai asks for sign-in once inside the overlay (Google popup works); cookies persist after that. Escape hatch during any break: ⌃⌥⌘B.

## Troubleshooting
- Navigation log: `~/Library/Application Support/LifeboardBreak/log.tsv` (break ends + `nav`/`redirect-home` lines).
- Grey screen after sign-in: the app redirects back to `url` at most twice per break; check the log for where it landed.
