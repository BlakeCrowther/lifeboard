# Scheduled task TEMPLATE: the weekly check (visitor + garden plants)

This file is a template. Nothing runs until someone registers it; `lifeboard-setup` asks which day and registers it (see "Register" below).

## Suggested schedule
- Cron: `0 <hour> * * <day>`, day = the board's week start (`checks/week_start`), hour chosen at setup (0 = Sunday … 6 = Saturday; default `0 6 * * 0`, Sunday 06:00 local time).
- The Mac must be **awake** (and the Claude desktop app running) at run time: Blender is a local app and the run is headless on this machine. Use System Settings → Battery/Energy → schedule wake, or `sudo pmset repeat wakeorpoweron U 05:55:00` (sets a standing power schedule: run it yourself if you want it).
- Working directory: the repo root (`lifeboard/`).

## Prompt (paste as the task's prompt)
```
Run the weekly-visitor skill for lifeboard (repo root = working directory), including step 1c garden plants (season-seeds) for checks/game_status garden.needs.
Unattended: do not ask questions; decide, log, report.
Start a run ledger first: python3 models/shared/tools/ledger.py start <YYYY>-w<WW> --rounds 4 --minutes 30
(the ledger enforces the budget; every build uses build.py --run <run_id>; every judge is recorded).
Ship only on a full PASS. Follow AGENTS.md and the model-ship skill for commit/publish:
commit on branch visitor/<id>; do not merge or push to main; republish the existing lifeboard artifact URL only.
End with the retro (AGENTS.md "Improve as you go"): fix what this run tripped on in the skill/gate that owns it, same commit.
Final message: the weekly-visitor report (visitor or no-visitor reason, plants made, gates, ledger status, contact sheet path, retro fixes).
```

## Register (later, by a human)
1. Run `./setup.sh` until it passes (see the lifeboard-setup skill).
2. Run `lifeboard-setup` (it asks the day), or Claude desktop app → Scheduled with the cron for your day and the prompt above, working directory = this repo.
3. First time: trigger it once by hand, or do a dry run first (`weekly-visitor --dry-run <event-json>`, see that skill).
4. To stop it: delete or pause the task in the Scheduled list.
