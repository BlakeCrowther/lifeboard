---
name: plant-brief
description: Kind: plant (OUTLINE, no generator yet). Design a seed species as a plant spec (models/plant/specs/<id>.json, kind "plant") for the current biome and season, or a hybrid as a parameter blend of two parent specs. Step 1 of the plant pipeline (season-seeds); validated by shared check_spec.py (G1), then shared model-build.
---

# Plant brief (outline)

Output: `models/plant/specs/<id>.json`, `"kind": "plant"`, passing `python3 models/shared/tools/check_spec.py`. Read `models/plant/CONTRACT.md` (draft) and `models/STYLE.md` first.

1. Inputs: biome (`models/biomes.json`, its `medium` decides wind vs water sway), season, rarity (common / heirloom / exotic from `game.js` garden scoring), `models/roster.json` (no repeated species).
2. Species: a real plant/fungus/alga with a graphic silhouette per stage (seed → sprout → leafy → bud → bloom). Reference line = binomial + 2–4 traits per late stage.
   - Biome identity: follow `look.plants`, `look.shape` and `look.palette` for the biome, and `identity_rules` in `biomes.json`. Never use a motif another biome `owns`. Swap test and silhouette test as in creature-brief: a jungle plant is huge-leaved and glossy with one hot accent, a deep one is pale and glassy, a meadow one is a round head on an upright stem. The bloom stage carries the biome's accent color.
3. Archetype (growth form) from `models/plant/archetypes/` (none yet: novel path until the first one ships).
4. Params: `size.height_m` (bloom), palette (STYLE ranges), `motion.sway {frames, cycles, amp_deg}` (48–144 frames), `motion.tend {frames}` (24–72), budget per CONTRACT tier.
5. Hybrids (`endSeason`): `parents: [idA, idB]`, every numeric param blended (weight from the game, small mutation), enums from the dominant parent. Keep params blendable.
6. `name`, `lore` (≤ 60 chars). Run check_spec until it passes.
