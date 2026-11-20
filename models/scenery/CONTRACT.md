# Scenery contract

Status: two archetypes built (`archetypes/clump.py` swaying blades/fronds, `archetypes/solid.py` static lofted bodies). Runtime: `habitat.js` places them from `biomes.json` `scenery`. Golden: `eelgrass_tuft` (first shipped piece). Shared rules (units, glTF export, baked material, eased motion, optimize + `-glb.js` shipping, export-check) follow `models/creature/CONTRACT.md` and `models/STYLE.md`. Lines marked ✓ are checked by `verify.sh` (shared gates + `scenery/qa.py`).

## One prop per model
A scenery piece is one prop of a biome's backdrop: a clump, a shell, a rock arch, a dune ridge. It comes from the biome's `look.owns` and is placed many times by habitat.js (count, spread, scale, phase come from `biomes.json`, not the model).

## Space
- ✓ Origin at the ground contact point: bbox min z ≈ 0 (≤ 3%), centred over the origin in X/Y. +Z up in Blender (+Y in glTF), meters.
- ✓ Height = `size.height_m` ±20%; optional `size.footprint_m` (widest horizontal extent) ±30%.

## Budget
- ✓ ≤ 3000 tris (aim 1500–3000; less is fine), one baked material, texture ≤ 512² (`budget.texture`), ≤ 200 KB optimized (export-check).

## Animation
- Static props (shells, stones): no armature, ✓ no actions.
- Swaying props (grasses, kelp): one armature, ✓ one `sway` loop, 48–144 frames, whole cycles, ✓ seamless (bone delta < 1e-3), ✓ gentle (≤ 4% size/frame), ✓ visible (≥ 3%), ✓ no pops. Water = slower, lag growing up the blade.

## Spec
`kind: "scenery"`, `id`, `name`, `biome`, `rarity: "common"`, `archetype`, `reference`, `size.height_m` (+ `footprint_m`), `palette`, `material`, `budget`, optional `motion.sway {frames, cycles, amp_deg, lag_frames}`, optional `pass_through` (creatures swim through it; also settable per biome item). `check_spec.py` (spec-check) enforces these.

## judge-panel
Same judge harness as the other kinds, rubric `reads_as, style_match, artifacts, sway_readable` (static: null). No mouth/feed criteria. Until a golden calibration exists, judged absolute: every median ≥ 3 (`qa_calibration.json`).

## Shipping
`assets/<id>.glb` + `assets/<id>-glb.js` setting `window.LB_SCENERY['<id>']` (base64). Roster: `{id, kind: "scenery", name, spec, glb, js, biome, rarity, pass_through, golden, added}`.
