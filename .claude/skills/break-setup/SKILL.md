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
| url | string | "" | page shown; empty = bundled placeholder. Lifeboard = the user's published lifeboard artifact link |

Work and break lengths can also be changed from the 🐟 menu without this skill.

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
