# Scheduled task TEMPLATE: the weekly run (visitor + garden plants)

This file is a template. Nothing runs until someone registers it; `lifeboard-setup` asks which day and registers it (see "Register" below).

## Suggested schedule
- Cron: `43 22 * * <day>` in the owner's time zone: 22:43 the night before the board's week starts, day = the day before `checks/week_start` (0 = Sunday … 6 = Saturday). Default (week starts Monday): Sunday night, e.g. `CRON_TZ=America/Los_Angeles 43 22 * * 0`.
- Which repo: the board's own copy (for the owner, the private copy), never the public lifeboard repo (AGENTS.md "Which repo publishes which board"). The run commits models and opens its PR there.
- Where it runs:
  - **Cloud (recommended)**: a scheduled task that starts a fresh cloud session in the lifeboard environment each time. The environment's setup script runs `./setup.sh` (Blender, its render libraries, ImageMagick, Node); its network must allow `download.blender.org`. Nothing has to be awake.
  - **Mac**: the Claude desktop app → Scheduled, working directory = this repo. The Mac must be **awake** with the app running (System Settings → Battery/Energy → schedule wake, or `sudo pmset repeat wakeorpoweron U 05:55:00`).

## Prompt (paste as the task's prompt)
```
Run the weekly-visitor skill for lifeboard (repo root = working directory), including step 1c garden plants (season-seeds) for checks/game_status garden.needs.
Unattended: do not ask questions; decide, log, report.
Start a run ledger first: python3 models/shared/tools/ledger.py start <YYYY>-w<WW> --rounds 4 --minutes 30
(the ledger enforces the budget; every build uses build.py --run <run_id>; every judge is recorded).
Ship on a full PASS; when the budget runs out without one, ship the best attempt below the bar (weekly-visitor fallback 2).
Commit and publish per AGENTS.md (publish only when "This board's settings" pre-approve it; otherwise commit and say in the report that it waits for a publish) and the model-ship skill: one branch for the whole run, publish the model files only (model-ship step 5, never the page) to the existing lifeboard artifact URL.
Then open a PR to main, wait for its verify check, and squash-merge it when it passes (model-ship step 4), so main holds the board's models (`models/board/`) for next week. Never merge a red check; fix the cause on the branch.
Progress: keep the session's task list current so the owner can follow along. One task per agent: "This week's visitor" and one per plot ("<plot> plant, gen <n>"), plus "Publish and merge". In each task's status say the stage (brief, build, grow/animate, verify, judges, ship), the ledger's rounds and minutes used, "queued for a build slot" while waiting, and what is left. Mark each completed with its outcome (passed, below bar, quarantined, no visitor). Same no-spoiler rule: never a species, name or look.
End with the retro (AGENTS.md "Improve as you go"): fix what this run tripped on in the skill/gate that owns it, same commit.
Final message: the weekly-visitor report (visitor or no-visitor reason, plants made by plot, gates, ledger status, retro fixes, PR link). No spoilers: never name or describe a visitor or plant; the board reveals them.
```
## Register (later, by a human)
1. Run `./setup.sh` until it passes (see the lifeboard-setup skill).
2. Run `lifeboard-setup` (it asks the day and where it runs), or create the scheduled task yourself with the cron and the prompt above (cloud: a fresh session per run in the lifeboard environment; Mac: desktop app → Scheduled, working directory = this repo).
3. First time: trigger it once by hand, or do a dry run first (`weekly-visitor --dry-run <event-json>`, see that skill).
4. To stop it: delete or pause the task in the Scheduled list.
