# Plant contract

Status: first generator built (`archetypes/stem_bloom.py`, example `specs/mermaids_cup.json`, passes `verify.sh`). Still open: a plant golden + `qa_calibration.json`, the runtime hookup in `garden.js` (see SPEC.md Garden, "3D seed species"), hybrid blending code. `models/plant/qa.py` encodes the ✓ rules. Shared rules are **not repeated here**: units, meters, Blender scene scale, glTF export settings, materials/texture/bake, ≤ 4 weights normalized, no pops, eased Bezier motion, file-size optimize + `-glb.js` shipping format and the G4 export gate all follow `models/creature/CONTRACT.md` and `models/STYLE.md`. Lines marked ✓ are checked by `models/shared/tools/verify.sh` (shared gates + `plant/qa.py`).

## One glb per species, five stages
- ✓ Stage nodes `stage_0` … `stage_4`, matching `game.js RULES.garden.stages`: `seed`, `sprout`, `leafy`, `bud`, `bloom`. Each is an empty (or mesh root) whose children are that stage's geometry. `stem_bloom` ships each stage as one skinned mesh named `stage_<n>`, all sharing one baked material/texture.
- Every action's frame 0 is the rest pose (each stage's bones are its own, `s<n>_*`), so `tend` crossfades with any `sway_<n>`.
- Exactly one stage is visible at a time; the runtime toggles visibility. The glb ships all five, all visible at rest (QA measures the union).
- Stages may share one armature (preferred: one rig, bones unused by early stages stay still) or have per-stage rigs under their stage node.
- Mesh count: ≤ 3 meshes per stage.

## Space
- ✓ Rooted: origin at the **soil point** (where the stem meets the ground), bbox min z ≈ 0, centred over the origin in X/Y. **+Z up**. No root motion.
- ✓ Height of the bloom stage = `spec.size.height_m` ±15%.
- Facing: plants have no head; +X is the side shown to the camera by default (the "best side").

## Animations (glTF animations = Blender actions)
| Name | Required | Length @24fps | Rules |
|---|---|---|---|
| `sway_<n>` (n = 0…4) | ✓ one per stage | 48–144 | ✓ Seamless loop (bone delta < 1e-3), whole cycles, gentle (≤ 6% size/frame). Wind (`medium: land/air`) = stem bend + leaf flutter lagging up the chain; water (`medium: water`) = slower, larger-phase drift. Per stage, because a seed barely moves and a bloom nods. |
| `tend` | ✓ | 24–72 | ✓ Reaction to logging a habit session: the plant perks up (stem straightens, leaves lift, bloom opens a little), then settles. Starts and ends on the `sway_<n>` frame-0 pose (delta < 1e-2) so it crossfades both ways; visible (≥ 6% size). |
| `wilt` | optional | pose or 24–48 | A died week: drooped pose (stem bend, leaves down, desaturation is the runtime's job). |

## Rarity tiers and budgets (per stage)
| | common | heirloom | exotic |
|---|---|---|---|
| Triangles per stage (whole file ≤ 5 × this) | ≤ 1.6k | ≤ 2.4k | ≤ 4k |
| ✓ Triangles whole file (G2) | ≤ 8k | ≤ 12k | ≤ 20k |
| Texture | 1 × 1024² | 1024² | 2048² allowed |
| Final file | ≤ 400 KB | ≤ 600 KB | ≤ 1.2 MB |
Rarity comes from the garden (`game.js` `rarityOf`: heirloom ≥ 4, exotic ≥ 7 season score).

## Blendable specs (design intent)
`endSeason` can produce **hybrid** seeds from two parents. Plant spec parameters must therefore be **blendable**: numeric (lengths, ratios, counts as floats rounded at build time, angles, HSV colors, profile curves sampled at fixed u) or enums with a defined pick rule (dominant parent). A hybrid spec = per-parameter blend of the two parent specs (weight from the game, ± small mutation), then the normal G1 check. Avoid parameters that only make sense as whole structures (free-form node lists).

## Spec (draft fields)
`kind: "plant"`, `id`, `name`, `biome`, `rarity` (common|heirloom|exotic), `archetype`, `reference`, `size.height_m`, `palette`, `motion.sway {frames, cycles, amp_deg}`, `motion.tend {frames}`, `budget`, `parents` (hybrids only). `check_spec.py` enforces the shared fields plus sway/tend ranges.

## Shipping
Same as creatures: `assets/<id>.glb` + `assets/<id>-glb.js`, roster entry with `"kind": "plant"`. Proposed JS global: `window.LB_PLANTS['<id>']` (runtime owner to confirm; creatures use `window.LB_CREATURES`).
