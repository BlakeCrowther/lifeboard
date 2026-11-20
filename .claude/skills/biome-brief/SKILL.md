---
name: biome-brief
description: Kind: biome. Design the next habitat biome and add it to models/biomes.json (name, medium, light, locomotion, examples, scene, look) so the habitat, the shelf diorama and creature-brief can use it. weekly-visitor calls it when the habitat is on its final phase or has moved into a biome with no entry; validated by models/shared/tools/check_biome.py. Also use to design a biome by hand.
---

# Biome brief

> Paths are relative to `models/` unless they start with the repo root files (`habitat.js`, `SPEC.md`).

Runs unattended when weekly-visitor calls it: decide, validate, report. Never ask the user.

## When it runs
- **Needed:** the board's `checks/game_status` (see weekly-visitor step 1) says `biome` = B and `biomes.json` has no entry with `id` B (the habitat already moved on), or `phase == phases - 1` (final phase) and there is no entry for B + 1. Brief exactly that one id.
- **Not needed:** the entry exists. Never rewrite an existing biome: the shelf dioramas and visitors already met depend on it. (After the last entry the habitat would cycle back to biome 0's look; designing the next one stops that.)

## 1. Read
- `biomes.json`: every biome, `identity_rules`, the `note` (field meanings).
- `roster.json`: creatures met so far and their biomes.
- The habitat's scene builders: the keys of `LOOKS` in `habitat.js` (today: reef, kelp, tidepool, mangrove, deep, meadow, canopy, jungle). `scene` must be one of these.

## 2. Design
Pick a real-world habitat that makes a good next step: vary the medium: never three biomes in a row in the same medium, and the second biome of a fresh game (after a game-reset) should leave water. Past games' biomes (`biomes.archive.json`) were already played: treat them as examples of the format and quality bar, not as a menu (see **2b**); avoid repeating the previous biome's feel, and keep it reachable for a weekly creature pipeline (animals with clear silhouettes).
- **name**: 1–3 words, evocative and plain ("Salt marsh", "Desert spring").
- **medium** water | land | air, **light** (a few words), **locomotion** (subset of swim, drift, crawl, rooted, walk, fly, climb, burrow, hop, glide).
- **examples**: 4–6 real species with strong silhouettes; at least one rare-worthy and one exotic-worthy (the biome's icon).
- **scene**: the closest existing builder by structure, not colour (a salt marsh → `mangrove`, a desert spring → `meadow`). `pass_through` only for scenery the creatures move through (e.g. `["kelp"]`).
- **look** (follow every `identity_rules` line):
  - `shape`: one shape language no other biome uses as its main shape.
  - `palette`: 4 hex `[sky/water, depth/horizon, ground, accent]`, a hue family away from both neighbours (the validator warns within 15°).
  - `ground`, `owns` (3–5 motifs only this biome uses; never one another biome owns), `creatures`, `plants`, `motion`.
- **scenery** (preferred over reusing a `scene` builder's props): 3–5 pieces from `look.owns`, as items `{id, count, spread: cluster|scatter|edge|back, scale: [min,max], phase | phases: [first,last], landmark?, pass_through?}` plus `frame: {ground, water: [shallow, deep], dens, light}`. Phases: phase 0 = sparse ground cover, later phases add bigger/rarer pieces, one `landmark` for a late phase; every phase 0–4 must add something (`check_biome.py` fails otherwise). `scene` stays as the fallback base (ground, light, motes). The fill pass (weekly-visitor 1b2 → scenery-make) builds the pieces; until a piece ships, `check_biome.py` fails on it, so brief and build in the same run.
- Swap test against the two neighbours: if it would pass as either after a recolor, change it.

## 2b. Archive review (your judgment, not a script)
Read every entry in `models/biomes.archive.json`. Name the archived biome closest to your design and compare four things: real-world habitat, shape language (`look.shape`), palette family, owned motifs. If two or more match, it's a replay: redesign (a different habitat, not a recolor). One match is fine with a stated reason. Prefer habitats the archive never tried (deserts, caves, dunes, ice, salt marsh, alpine, rivers, savanna, …). Write the closest archived biome and what differs into the report. `check_biome.py` only catches the unambiguous cases (archived name = FAIL, archived owned motif = WARN).

## 3. Write + validate
Append the entry to `biomes.json` (`id` = the next integer; keep ids 0..n-1 in order), then:
```bash
python3 models/shared/tools/check_biome.py <id>
```
Fix every FAIL; fix WARN unless the reason is stated in the report. Max 2 redesigns, then fall back to a safe variant of an existing biome's structure with a new name, palette and `owns`.

## 4. Ship
Commit `models/biomes.json` with the visitor (weekly-visitor's model-ship publishes `models/biomes.json` alongside the roster). By hand: commit on the working branch and republish the lifeboard artifact with `models/biomes.json` in `files` (lifeboard-setup "Publishing").

## 5. Report
Name, medium, scene reused, closest archived biome and what differs, palette swatches, owned motifs, example species, and any WARN kept. List the scenery pieces with their phases. New structures (caves, dunes) need no page code: their props are scenery models.
