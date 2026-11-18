# Plant archetypes (none yet)

Parametric generators per **growth form**, like creature body plans. Each exposes `model(spec)` (returns parts for all five stages, each part name prefixed `s<n>_`), `material(spec, parts)`, `rig(spec, mesh)` and `animate(spec, arm)` (→ `sway_0..4`, `tend`, optional `wilt`), called by `models/shared/blender/build.py` with `spec.kind = "plant"`. Shared helpers: `models/shared/blender/lib.py` (`tube` for stems, `flat_part` for leaves/petals, `loft`, `finalize`, `bake_to_single_material`).

Planned: `rosette` (lettuce, succulent), `stem_bloom` (tulip, sunflower), `vine` (bean, ivy), `shrub` (lavender, berry bush), `kelp_frond` (water biomes), `cap_fungus` (mushroom).

Keep every parameter blendable (see `../CONTRACT.md`, hybrids).
