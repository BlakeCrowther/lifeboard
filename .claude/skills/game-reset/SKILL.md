---
name: game-reset
description: Restart the game (garden, ecosystem, visitors) from zero on the user's live lifeboard, after a backup. Optionally archives every designed biome and creature so Claude designs each new one (biome-brief) as the habitat reaches it. Never touches tasks, habits, sessions, lessons or other board data. Use when the user wants to restart, reset or start the game over.
---

# Game reset

Destructive and can't be undone except from the backup. **Confirm with the user before step 3**, showing exactly what will be cleared.

The game is derived from history counted from `game_state/game.started` (see `SPEC.md` Core rules and `garden.js` `deriveGame`): growth, phases, biomes, plants, seasons and dioramas all restart when that date moves to today. Tasks, habits and sessions are kept; days before the new start simply don't count.

## 1. Find the board
The user's live lifeboard artifact (never a mock/test build; see break-setup for how to pick it). Never hardcode its URL in the repo.

## 2. Ask (one message)
- **Visitors met:** clear `visitors_met` (default yes; the shelf starts empty).
- **Shelf notes:** clear `keepsakes` titles/notes (default yes: they name dioramas and plants that no longer exist).
- **Biomes:** keep the shipped list and its creatures and plants (default; no Blender needed), or **fresh**: archive every biome and every roster model (creatures and plants: plants belong to a biome by index, so they go with it), so the next `weekly-visitor` run designs biome 0 (`biome-brief`) and builds its first creature, then each later biome as the habitat reaches it. Fresh needs Blender: without it the new biomes get no visitors. Until that run the habitat shows a plain "Uncharted" water scene. Plots show the 2D SVG species until `season-seeds` makes each plot's plant (the weekly task runs it for `garden.needs`).
- **Break skips / lesson days** in `logs`: keep (default). Skips before the new start don't cost growth anyway; lesson days keep hiding accurate.

## 3. Back up
ArtifactData `list` (page through with `cursor`) with `out_dir` = `~/lifeboard-backups/<YYYY-MM-DD>/` for: `game_state`, `visitors_met`, `keepsakes`, and `checks` doc `game_status` (`get`). Outside the repo: it's personal data. Copy `models/biomes.json` there too. Report the folder.

## 4. Reset
- `game_state/game`: `update` `{ "started": "<today, Pacific YYYY-MM-DD>", "created_at": <ms> }` pinned with `if_version`.
- `checks/game_status`: `delete` (the board rewrites it on next load).
- If chosen: `delete` every doc in `visitors_met` and `keepsakes` with `batch` (≤ 50 writes per batch, each pinned with its `if_version`).
- Fresh biomes: move every entry of `models/biomes.json` `biomes` into `models/biomes.archive.json` and every `models/roster.json` `models` entry (creatures and `kind: "plant"` alike) into `models/roster.archive.json` (append under the same key with an `archived: "<date>"` field; keep `note`/`identity_rules`/`version` in the live files, leaving `"biomes": []` and `"models": []`; the `assets/` files stay, and so do `*/qa_calibration.json` goldens: G5 still compares new creatures and plants against them). Run `python3 models/shared/tools/check_biome.py`, commit, push, and republish the artifact with `models/biomes.json` and `models/roster.json` in `files` (lifeboard-setup "Publishing"; check the live copy against the repo first per AGENTS.md). Offer to run `weekly-visitor` now instead of waiting for the schedule (it designs biome 0, then runs `season-seeds` in the new garden's first week).

## 5. After
Tell the user to reload the board (open devices too). Each viewer's browser remembers "new today" progress (`lb-hab-*` local storage); it settles after a day and needs no action. Report: backup folder, what was cleared, the new start date, and (fresh biomes) that the next weekly-visitor run designs biome 0 and its first creature, and that plots stay 2D until `season-seeds` makes the first season's plants.

## Restore
Put the backed-up docs back with ArtifactData `set` (same ids), and `models/biomes.json` / `models/roster.json` from the archive files, the backup or git history.
