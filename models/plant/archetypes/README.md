# Plant archetypes

Parametric generators per **growth form**, like creature body plans. Each exposes `model(spec)` (returns parts for all five stages, each part name prefixed `s<n>_`), `material(spec, parts)`, `rig(spec, mesh)` (splits the baked mesh into `stage_0..4` meshes and skins them to one armature) and `animate(spec, arm)` (→ `sway_0..4`, `tend`, optional `wilt`), called by `models/shared/blender/build.py` with `spec.kind = "plant"`. Shared helpers: `models/shared/blender/lib.py` (`tube` for stems, `flat_part` for leaves/petals, `sphere`, `finalize`, `bake_to_single_material`).

Built:
- `stem_bloom`: one stem, alternate leaves, a terminal head (petal whorl / ray cap / parasol). Fields in its docstring. Example: `../specs/mermaids_cup.json` (Acetabularia, Coral shallows). Covers tulip, daisy, poppy, cosmos, stalked algae and polyp tufts.

Planned: `rosette` (lettuce, succulent), `vine` (bean, ivy), `shrub` (lavender, berry bush), `kelp_frond` (water biomes), `cap_fungus` (mushroom). New ones: copy `stem_bloom`'s rig/animate shape (per-stage bones, frame 0 = rest, whole-cycle sines).

Keep every parameter blendable (see `../CONTRACT.md`, hybrids).
