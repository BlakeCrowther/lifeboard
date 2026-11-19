---
name: plant-brief
description: Kind: plant. Design a seed species as a plant spec (models/plant/specs/<id>.json, kind "plant") for the current biome, or a hybrid as a parameter blend of two parent specs. Step 1 of the plant pipeline (season-seeds); validated by shared check_spec.py (G1), then shared model-build.
---

# Plant brief

Output: `models/plant/specs/<id>.json`, `"kind": "plant"`, passing `python3 models/shared/tools/check_spec.py <spec>`. Read `models/plant/CONTRACT.md`, `models/STYLE.md` and the archetype's docstring first. Worked example: `models/plant/specs/mermaids_cup.json`.

1. **Inputs**: biome id (the habitat's current biome, `checks/labs_reef` / the orchestrator gives it; entry in `models/biomes.json`, its `medium` decides wind vs water sway), rarity (common / heirloom / exotic), `models/roster.json` (no repeated species; `kind: "plant"` entries).
2. **Species**: a real plant / alga / fungus with a graphic silhouette per stage (seed → sprout → leafy → bud → bloom). `reference` = binomial + 2–4 traits for the late stages.
   - Biome identity: follow `look.plants`, `look.shape`, `look.palette` and `identity_rules`. Never use a motif another biome `owns`. The bloom (`palette.accent`) carries the biome's accent colour.
3. **Archetype** (growth form) from `models/plant/archetypes/`: `stem_bloom` (one stem, alternate leaves, terminal head: tulip, daisy, poppy, stalked algae, polyp tufts). No fit → novel path (write a new archetype per `archetypes/README.md`; note it for the orchestrator).
4. **Params** (stem_bloom; all numeric so hybrids blend): `size.height_m` (bloom height, 0.03–3), `shape.stage_heights`, `shape.stem {radius_ratio, lean}`, `shape.leaf {count 1–5, length_ratio, width_ratio, pitch_deg, low, high}`, `shape.head {petals 3–24, radius_ratio, petal_width_ratio, cup_deg, disc_ratio, bud_ratio}`, `shape.seed_ratio`; `palette {main [stem, leaf], accent, disc, seed}` (STYLE ranges, checked on `main`); `material {roughness, coat}`; `motion.sway {frames 48–144, cycles whole, amp_deg ~4–7}`, `motion.tend {frames 24–72, lift_deg, open}`, optional `motion.medium` override; `budget {tris ≤ tier, texture}` (CONTRACT table).
5. **Hybrids** (`endSeason` crosses): `parents: [idA, idB]`; every numeric param = weighted blend (weight from the game) ± ≤ 5% mutation, rounded at build; colours blended in HSV; enums / `archetype` from the dominant parent. Both parents must share an archetype, else use the dominant parent's archetype and only its params. `season-seeds` makes one hybrid per crossed pair (weight 0.5); the hybrid's `biome` = the season's biome (the garden matches hybrids by `parents`, in any biome).
6. `name`, `lore` (≤ 60 chars). Run check_spec until it passes.
