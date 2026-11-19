---
name: game-reset
description: Restart the Labs game (garden, habitat, visitors) from zero on the user's live lifeboard, after a backup. Optionally clears the designed biomes after the first so Claude designs each new one (biome-brief) as the habitat reaches it. Never touches tasks, habits, sessions, lessons or other board data. Use when the user wants to restart, reset or start the game over.
---

# Game reset

Destructive and can't be undone except from the backup. **Confirm with the user before step 3**, showing exactly what will be cleared.

The game is derived from history counted from `labs_state/game.started` (see `SPEC.md` Core rules and `garden.js` `deriveGame`): growth, phases, biomes, plants, seasons and dioramas all restart when that date moves to today. Tasks, habits and sessions are kept; days before the new start simply don't count.

## 1. Find the board
The user's live lifeboard artifact (never a mock/test build; see break-setup for how to pick it). Never hardcode its URL in the repo.

## 2. Ask (one message)
- **Visitors met:** clear `visitors_met` (default yes; the shelf starts empty).
- **Shelf notes:** clear `labs_keepsakes` titles/notes (default yes: they name dioramas and plants that no longer exist).
- **Biomes:** keep the designed list, or **fresh**: keep biome 0 (Coral shallows, where the current creatures live) and move the rest to `models/biomes.archive.json`, so `weekly-visitor` runs `biome-brief` for each new biome as the habitat gets there.
- **Creatures:** keep `models/roster.json` as is (default). The clownfish and others stay available as visitors for their biome.
- **Break skips / lesson days** in `logs`: keep (default). Skips before the new start don't cost growth anyway; lesson days keep hiding accurate.

## 3. Back up
ArtifactData `list` (page through with `cursor`) with `out_dir` = `~/lifeboard-backups/<YYYY-MM-DD>/` for: `labs_state`, `visitors_met`, `labs_keepsakes`, and `checks` doc `labs_reef` (`get`). Outside the repo: it's personal data. Copy `models/biomes.json` there too. Report the folder.

## 4. Reset
- `labs_state/game`: `update` `{ "started": "<today, Pacific YYYY-MM-DD>", "created_at": <ms> }` pinned with `if_version`.
- `checks/labs_reef`: `delete` (the board rewrites it on next load).
- If chosen: `delete` every doc in `visitors_met` and `labs_keepsakes` with `batch` (≤ 50 writes per batch, each pinned with its `if_version`).
- Fresh biomes: move entries `id >= 1` from `models/biomes.json` into `models/biomes.archive.json` (append under `"biomes"`, keep the `note`/`identity_rules` only in biomes.json), run `python3 models/shared/tools/check_biome.py`, commit, push, and republish the artifact with `models/biomes.json` in `files` (lifeboard-setup "Publishing"; check the live copy against the repo first per AGENTS.md).

## 5. After
Tell the user to reload the board (open devices too). Each viewer's browser remembers "new today" progress (`lb-hab-*` local storage); it settles after a day and needs no action. Report: backup folder, what was cleared, the new start date, and (fresh biomes) that biome-brief will design biome 1 when the habitat is on its final phase.

## Restore
Put the backed-up docs back with ArtifactData `set` (same ids), and `models/biomes.json` from the backup or git history.
