# Plant contract

Status: first generator built (`archetypes/stem_bloom.py`, example `specs/mermaids_cup.json`, passes `verify.sh`). Runtime hookup built (`src/packages/garden`, SPEC.md Garden "3D plants, one per plant"). Golden: `mermaids_cup` (`qa_calibration.json`). `models/plant/qa.py` encodes the ✓ rules. Shared rules are **not repeated here**: units, meters, Blender scene scale, glTF export settings, materials/texture/bake, ≤ 4 weights normalized, no pops, eased Bezier motion, file-size optimize + `-glb.js` shipping format and the export-check export gate all follow `models/creature/CONTRACT.md` and `models/STYLE.md`. Lines marked ✓ are checked by `models/shared/tools/verify.sh` (shared gates + `plant/qa.py`).

## One glb per species, five stages
- ✓ Stage nodes `stage_0` … `stage_4`, matching `RULES.garden.stages` (`src/packages/game/lib/rules.ts`): `seed`, `sprout`, `leafy`, `bud`, `bloom`. Each is an empty (or mesh root) whose children are that stage's geometry. `stem_bloom` ships each stage as one skinned mesh named `stage_<n>`, all sharing one baked material/texture.
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

## Visual gate (judge-panel)
Same judge harness as creatures (model-verify skill; `models/shared/tools/judge_verdict.py` decides), with the growth strip and the sway and tend clips. Criteria, floor, bar and panel size live only in `models/plant/qa_calibration.json` `pass_rule`.

## Rarity tiers and budgets (per stage)
| | common | rare | exotic |
|---|---|---|---|
| Triangles per stage (whole file ≤ 5 × this) | ≤ 1.6k | ≤ 2.4k | ≤ 4k |
| ✓ Triangles whole file (shape-check) | ≤ 8k | ≤ 12k | ≤ 20k |
| Texture | 1 × 1024² | 1024² | 2048² allowed |
| Final file | ≤ 400 KB | ≤ 600 KB | ≤ 1.2 MB |
Rarity comes from the garden (`rarityOf` in the game package: rare at `garden.rarity.rare`, exotic at `garden.rarity.exotic` in SPEC.md, the finished plant's score). Rare/exotic plants carry a habit accessory (plant-brief step 6): `s<n>_acc_*` parts, counted in the same budget.

## One plant per model
Each model is one plant in one plot: the garden matches a roster plant to a plot by `plot` (habit key) and `gen` (0 = the plot's first plant). There are no hybrids. Prefer numeric params anyway (they keep generators reusable).

## Spec (draft fields)
`kind: "plant"`, `id`, `name`, `biome`, `rarity` (common|rare|exotic), `archetype`, `reference`, `size.height_m`, `palette`, `motion.sway {frames, cycles, amp_deg}`, `motion.tend {frames}`, `budget`, `plot`, `gen`, `habit`, `accessory` (rare only). `check_spec.py` enforces the shared fields plus sway/tend ranges.

## Shipping
Same as creatures: `assets/<id>.glb` + `assets/<id>-glb.js` setting `window.LB_PLANTS['<id>']` (base64 glb). Roster entry: `{id, name, kind: "plant", spec, glb, js, biome, rarity, golden, added, plot, gen, habit}` (`plot` + `gen` pick the plot's plant; `added` = ship date); `name` is shown in the garden. There is no SVG fallback: thirsty and withered plots show the model at their last stage, dried by CSS. Runtime: `src/packages/garden` (`plantPool`, 3D plots); the board scales the bloom to ~46 SVG units, so thin stems read as hairlines in an 84 px tile: prefer `stem.radius_ratio` ≥ 0.035 and chunky heads.
