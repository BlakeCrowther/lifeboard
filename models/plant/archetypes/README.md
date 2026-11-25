# Plant archetypes

Parametric generators per **growth form**, like creature body plans. Each exposes `model(spec)` (returns parts for all five stages, each part name prefixed `s<n>_`), `material(spec, parts)`, `rig(spec, mesh)` (splits the baked mesh into `stage_0..4` meshes and skins them to one armature) and `animate(spec, arm)` (→ `sway_0..4`, `tend`, optional `wilt`), called by `models/shared/blender/build.py` with `spec.kind = "plant"`. Shared helpers: `models/shared/blender/lib.py` (`tube`, `flat_part`, `sphere`, `finalize`, `bake_to_single_material`) and `models/plant/plant_kit.py` (stage split, skinning, `ribbon` straps, `arc` paths, bone chains, and sway/tend for any form by bone name: `s<n>_stem<j>`, `s<n>_blade<i>_<j>`, `s<n>_leaf<i>`, `s<n>_head<i>`, `s0_seed`).

**Every weekly plant gets its own generator** (`<id>.py`, copied from the closest form below, `based_on` in its spec), with the species' defining traits built into geometry. `check_spec.py` refuses a plant spec that names a shared form unless `notes.why_library_form` says why the form as is is the species.

Growth forms (each has an example spec in `../specs/examples/<form>_example.json` that passes the gates):

| Form | Shape | Examples |
|---|---|---|
| `stem_bloom` | one stalk, alternate leaves, one terminal flower head (petal whorl, ray cap, parasol) | tulip, daisy, poppy, stalked algae (`../specs/mermaids_cup.json`, the golden) |
| `blade_clump` | a tuft of long arching strap blades from one base, optional seed spike(s) on a stalk | cordgrass, eelgrass, turtle grass, iris or daylily clump |
| `blade_fan` | a short stalk with one or a few broad upright fan or paddle blades, radiating ribs, optional rim crust | fan algae, ginkgo-like leaf, paddle blade |
| `rosette` | a ring of leaves at the soil; bud/bloom: a centre flower stalk, a centre cluster, or nothing | lettuce, plantain, succulent, sea lavender rosette |
| `spray` | a leafy stalk branching near the top into many small florets: panicle (plume), umbel, raceme | goldenrod, sea lavender spray, yarrow, fruit umbel |
| `brush` | a stalk (or none) topped by a dense tuft or dome of filaments, optional bract collar | shaving-brush alga, thistle, dandelion clock, moss cushion |

New forms are built on `plant_kit.py`: describe the parts and bones, let the kit do stages, rig and motion. Keep a rig under 32 bones (`plant_kit.MAX_BONES`; share bones with `plant_kit.group`) and a file under its rarity's size cap (fewer, simpler small parts; 512 px textures for forms of many small parts).
