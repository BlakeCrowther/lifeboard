# Scheduled task TEMPLATE: weekly visitor (NOT registered)

This file is a template. Nothing runs until someone registers it (see "Register" below).

## Suggested schedule
- Cron: `0 6 * * 0` (Sunday 06:00 local time).
- The Mac must be **awake** (and the Claude desktop app running) at run time: Blender is a local app and the run is headless on this machine. Use System Settings → Battery/Energy → schedule wake, or `sudo pmset repeat wakeorpoweron U 05:55:00` (sets a standing power schedule: run it yourself if you want it).
- Working directory: the repo root (`lifeboard/`).

## Prompt (paste as the task's prompt)
```
Run the weekly-visitor skill for lifeboard (repo root = working directory).
Unattended: do not ask questions; decide, log, report.
Start a run ledger first: python3 models/shared/tools/ledger.py start <YYYY>-w<WW> --builds 6 --minutes 90
(the ledger enforces the budget; every build uses build.py --run <run_id>; every judge is recorded).
Ship only on a full PASS. Follow AGENTS.md and the model-ship skill for commit/publish:
commit on branch visitor/<id>; do not merge or push to main; republish the existing lifeboard artifact URL only.
Final message: the weekly-visitor report (visitor or no-visitor reason, gates, ledger status, contact sheet path).
```

## Register (later, by a human)
1. Run `models/shared/tools/doctor.sh` until it passes (see the lifeboard-setup skill).
2. Claude desktop app → Scheduled (or ask Claude: "create a scheduled task from .claude/scheduled/weekly-visitor.md") with the cron and prompt above, working directory = this repo.
3. First time: trigger it once by hand, or do a dry run first (`weekly-visitor --dry-run <event-json>`, see that skill).
4. To stop it: delete or pause the task in the Scheduled list.
