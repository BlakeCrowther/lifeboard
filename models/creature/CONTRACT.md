# Creature contract

Every shipped creature is one `.glb` that satisfies all of this. `models/shared/tools/verify.sh` checks every line marked ✓ (shared gates + `models/creature/qa.py`).

## Space
- ✓ Units: meters, Blender scene unit scale 1. Body length = `spec.size.length_m` ±15%.
- ✓ Axes (Blender): head points **+X**, up is **+Z**, left/right symmetric about XZ plane. (glTF export converts to +Y up; runtime treats glTF +X as forward.)

### Body plans (`spec.symmetry`, default `bilateral`)
| | bilateral (default) | `radial` (jelly, starfish, anemone, urchin…) |
|---|---|---|
| "length" | extent along X | max horizontal extent (max of X, Y) |
| ✓ longest axis is X | checked | skipped |
| ✓ symmetry | about the XZ plane (Y centred) | about the Z axis: bbox centred in X and Y, footprint aspect X/Y 0.67–1.5 |
| forward / head | +X | +X = the mouth/feeding direction; or `spec.mouth: "underside"` = mouth below centre near the vertical axis |
| ✓ mouth position | +X half of bbox | `front`: +X half; `underside`: below centre, ≤ 25% length from the Z axis |
| ✓ feed reach | mouth moves ≥ 5% length in +X | `underside`: mouth moves ≥ 5% length in any direction |
- ✓ Origin at the body's center of mass, roughly mid-body; all transforms applied (location 0, rotation 0, scale 1).
- No root motion: the creature animates in place. Swimming paths, turning and approach-to-food are the runtime's job.

## Nodes
- ✓ One skinned mesh named `<id>` (eyes/shell may be extra meshes parented to bones; ≤3 meshes total).
- ✓ One armature named `<id>_rig`; ≤ 32 bones (exotic ≤ 48); ≤ 4 weights per vertex, normalized.
- ✓ Empty `mouth` parented to the head bone, placed at the mouth opening. Runtime aims food at it.
- ✓ Visible mouth geometry, every archetype: a real mesh part named `mouth` built with `lib.mouth()` (dark recessed lip slit or round opening, sized from the head, coloured from `palette.lip`/`accent`), facing the spec's mouth direction (`front` +X, `underside` −Z), skinned to a `jaw` bone that opens/closes it on the `feed` bite beats, with `cornerL`/`cornerR` child bones at its ends (`lib.mouth_corner_bones`, weights `lib.mouth_weights`) so mood actions can bend it. A texture line alone does not count. The part is joined into the skinned mesh, so `build.py` records it in `build_meta.json` (`mouth_parts[]`: verts, tip, direction, size); shape-check checks `part:mouth` exists (verts > 0) and the `mouth` empty sits at its tip (≤ 8% length).
- ✓ Structural (bbox) checks — length, axes, symmetry, origin, mouth position — are measured with the armature at its **rest pose** (`pose_position='REST'`), not frame 0 of an action, so animation amplitude never reads as asymmetric modeling.
- ✓ Fins and tails taper: built with `lib.flat_part(..., root=n)`, thick at the root and thin at the free edge. `build.py` records each part's root and edge thickness in `build_meta.json` `flat_parts`; shape-check fails a part whose edge exceeds `FIN_TAPER_MAX` of its root (`creature/qa.py`), or a finned archetype with no records. Archetypes without fins set `HAS_FINS = False`.
- Optional empties: `eye_L`, `eye_R` (look-at), `belly` (shadow/contact point).
- ✓ Eyes: built with `lib.eye()` (STYLE size, diameter 8–12% of body height). Eyes are joined into the skinned mesh, so the size can't be measured from the glb; `build.py` writes `out/<id>/build_meta.json` (`eyes[].diameter_m / body_height_m`) and shape-check checks it. Missing `build_meta.json` = shape-check FAIL. Eyeless body plans simply make no `lib.eye()` calls.

## Visual gate (judge-panel)
A panel of fresh judge subagents scores the contact sheet; each judgement is recorded with its scores in the run ledger and `models/shared/tools/judge_verdict.py` decides pass or fail. Criteria, floor, bar and panel size live only in `models/creature/qa_calibration.json` `pass_rule`. Procedure: the model-verify skill. Mouth and eye placement are shape-check's, not the judges'.

## Animations (glTF animations = Blender actions)
| Name | Required | Length @24fps | Rules |
|---|---|---|---|
| `idle` | ✓ | 48–144 frames (2–6 s) | ✓ Seamless loop: pose at last frame == first frame (max bone delta < 1e-3). Every periodic channel completes a whole number of cycles. Length is **per species** (from spec), not a shared constant. |
| `feed` | ✓ | 36–96 frames (1.5–4 s) | ✓ Starts and ends on `idle` frame-0 pose (delta < 1e-2) so it crossfades both ways. Phases: anticipate → reach/strike toward `mouth` direction (+X) → grab/bite → chew/swallow → settle. Plays once per food item; may be looped by runtime for multiple items. |
| `sulk` | ✓ | 48–144 frames (2–6 s) | ✓ Mood loop, played instead of `idle` while the user skipped a break today (runtime crossfades ~1.2 s, so no start-pose rule). Per body plan, from `spec.motion.sulk.technique` (swimmer: nose down, fins clamped, slow tail, sinks; jelly: weak pulses, limp tentacles; octopus: arms curled under, flattened). ✓ Seamless loop, ✓ no pops, ✓ max speed below idle's, ✓ reads as its own pose at card size: the side (XZ) silhouette, rasterised at the Ecosystem card's scale (`shared/card_view.json`), differs from every idle pose by at least a set share of its area (`SULK_SILHOUETTE_CHANGE_MIN` in `creature/qa.py`); a nose-down hang does most of this; on a deep body, curling the tail down cancels it, ✓ front mouths frown: `cornerL/R` bones (`lib.mouth_corner_bones`, skinned with `lib.mouth_weights`) drop ≥ 15% mouth width relative to the jaw (`lib.frown_locs`). |
| `perch` | when `spec.motion.perch` (required by spec-check for `rest.pose: hang` or `locomotion: fly`) | 48–144 frames | Resting loop (see Resting). ✓ Seamless loop, ✓ no pops, ✓ max speed below idle's. Crossfaded, so no start-pose rule. Authored in the normal axes; the runtime turns the body into the pose. |
| `swim_fast` | optional | 24–72 | Same loop rules as idle; used when the runtime speed is high. |
| `react` | optional | 24–72 | Startle/flinch, starts/ends on idle pose. |

- ✓ No pops: no isolated frame whose per-vertex acceleration is > 1.6× both neighbouring frames (a 1-frame jump gives ~2×; smooth beats measured ~1.2×) and > 1.5% body length (a discontinuity, not a fast-but-smooth beat).
- ✓ Speed caps: max per-vertex movement per frame ≤ 8% body length (idle, keeps it gentle) / 25% (feed strike).
- ✓ Visible motion: max per-vertex displacement from the clip's frame-0 pose ≥ 4% body length (idle) / ≥ 12% (feed). Calibrated on the clownfish (idle 0.18, feed 0.35).
- Uniqueness: idle length, cycle count, amplitude and phase offsets come from the spec; runtime additionally randomizes per instance: start phase (0–1) and timeScale (0.92–1.08).

## Resting (`spec.rest`, optional)
How the real animal rests, reasoned per species like scenery's `sit` (design: `docs/design/creature-rest.md`). ✓ = spec-check.
- ✓ `rest {on, pose, why, share?, bout_s?}`. `pose` + `on` pairs: `lie` → `sand` (flounder, ray); `cling` → `rock` | `branch` | `prop` (belly to the surface at any angle: anemone on a rock side, gecko, sloth under a limb); `hang` → `branch` | `prop` (head down from its grip: bat). `prop` = a biome scenery piece; `branch` = an overhead grip (canopy limbs, scenery `perch*` nodes).
- ✓ `why`: one sentence on where and how the real animal rests. ✓ `share` (0–1], default 0.35: fraction of time resting; `1` = sessile, only with `locomotion: rooted`. ✓ `bout_s` `[min, max]` seconds per rest, default `[10, 25]`.
- ✓ `motion.perch {frames, cycles, technique}` required when `pose` is `hang` or `locomotion` is `fly` (their idle can't rest); otherwise the runtime rests on `idle` at half speed.
- Optional empty `grip` where the body holds on (a bat's feet); fallback: the body's rear tip for `hang`, its belly for `cling`/`lie`.
- No `rest` = never rests. Specs aren't published with the board, so `model-ship` copies `rest` and `locomotion` into the roster entry; the Ecosystem package (src/packages/ecosystem) reads `entry.rest`, then `spec.rest`.
- Runtime: roams, then flies to a perch site (rock face by ray hit + normal, open sand, builder or scenery grip points), settles, rests a bout, pushes off. No site of the right kind in the biome → keeps roaming. Food and hiding call it off its perch; a sessile one never leaves (plays `sulk` there when sad). QA: `capture.html?visitor=<id>&perch=1` (starts perched), `&rest=<on>_<pose>` (override, e.g. `rock_cling`); `node models/shared/tools/watch_creatures.mjs <id> --expect approach,settle,perched,leave` (timed cycle in headless Chrome).

## Budgets
| | common | rare | exotic |
|---|---|---|---|
| ✓ Triangles (hard cap, spec-check/shape-check) | ≤ 8k | ≤ 12k | ≤ 20k |
| Default `budget.tris` in briefs (fits the file-size cap at 1024²) | 8k | 9k | 16k |
| ✓ Texture | 1 × 1024² base color (+ optional roughness in same map's alpha or separate 512²) | same | 2048² allowed |
| ✓ Final file (after optimize; export-check runs `shared/tools/optimize.sh` (gltf-transform quantize + resize to budget + webp, the same as model-ship; not `optimize`, which prunes the `mouth` empty) to `qa/optimized.glb` and validates + sizes that; shape-check/motion-check run on the source glb) | ≤ 400 KB | ≤ 600 KB | ≤ 1.2 MB |
| ✓ Materials | ≤ 2 | ≤ 2 | ≤ 3 |

## Shipping format
Artifacts don't serve `.glb`, so the shipped asset is `assets/<id>-glb.js` (`window.LB_CREATURES['<id>']="<base64 glb>"`) next to the canonical `assets/<id>.glb`. `roster.json` lists both.
