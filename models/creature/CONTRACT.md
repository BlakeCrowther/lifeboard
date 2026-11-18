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
- ✓ One armature named `<id>_rig`; ≤ 32 bones (legendary ≤ 48); ≤ 4 weights per vertex, normalized.
- ✓ Empty `mouth` parented to the head bone, placed at the mouth opening. Runtime aims food at it.
- ✓ Visible mouth geometry, every archetype: a real mesh part named `mouth` built with `lib.mouth()` (dark recessed lip slit or round opening, sized from the head, coloured from `palette.lip`/`accent`), facing the spec's mouth direction (`front` +X, `underside` −Z), skinned to a `jaw` bone that opens/closes it on the `feed` bite beats. A texture line alone does not count. The part is joined into the skinned mesh, so `build.py` records it in `build_meta.json` (`mouth_parts[]`: verts, tip, direction, size); G2 checks `part:mouth` exists (verts > 0) and the `mouth` empty sits at its tip (≤ 8% length).
- ✓ Structural (bbox) checks — length, axes, symmetry, origin, mouth position — are measured with the armature at its **rest pose** (`pose_position='REST'`), not frame 0 of an action, so animation amplitude never reads as asymmetric modeling.
- Optional empties: `eye_L`, `eye_R` (look-at), `belly` (shadow/contact point).
- ✓ Eyes: built with `lib.eye()` (STYLE size, diameter 8–12% of body height). Eyes are joined into the skinned mesh, so the size can't be measured from the glb; `build.py` writes `out/<id>/build_meta.json` (`eyes[].diameter_m / body_height_m`) and G2 checks it. Missing `build_meta.json` = G2 FAIL. Eyeless body plans simply make no `lib.eye()` calls.

## Visual gate (G5)
Median of 3 fresh judge subagents (each recorded in the run ledger): every median ≥ 3, mean of medians ≥ 4 (novel archetypes: every median ≥ 4), `mouth_correct` true in ≥ 2 of 3. See the model-verify skill.

## Animations (glTF animations = Blender actions)
| Name | Required | Length @24fps | Rules |
|---|---|---|---|
| `idle` | ✓ | 48–144 frames (2–6 s) | ✓ Seamless loop: pose at last frame == first frame (max bone delta < 1e-3). Every periodic channel completes a whole number of cycles. Length is **per species** (from spec), not a shared constant. |
| `feed` | ✓ | 36–96 frames (1.5–4 s) | ✓ Starts and ends on `idle` frame-0 pose (delta < 1e-2) so it crossfades both ways. Phases: anticipate → reach/strike toward `mouth` direction (+X) → grab/bite → chew/swallow → settle. Plays once per food item; may be looped by runtime for multiple items. |
| `swim_fast` | optional | 24–72 | Same loop rules as idle; used when the runtime speed is high. |
| `react` | optional | 24–72 | Startle/flinch, starts/ends on idle pose. |

- ✓ No pops: no isolated frame whose per-vertex acceleration is > 1.6× both neighbouring frames (a 1-frame jump gives ~2×; smooth beats measured ~1.2×) and > 1.5% body length (a discontinuity, not a fast-but-smooth beat).
- ✓ Speed caps: max per-vertex movement per frame ≤ 8% body length (idle, keeps it gentle) / 25% (feed strike).
- ✓ Visible motion: max per-vertex displacement from the clip's frame-0 pose ≥ 4% body length (idle) / ≥ 12% (feed). Calibrated on the clownfish (idle 0.18, feed 0.35).
- Uniqueness: idle length, cycle count, amplitude and phase offsets come from the spec; runtime additionally randomizes per instance: start phase (0–1) and timeScale (0.92–1.08).

## Budgets
| | common | rare | legendary |
|---|---|---|---|
| ✓ Triangles (hard cap, G1/G2) | ≤ 8k | ≤ 12k | ≤ 20k |
| Default `budget.tris` in briefs (fits the file-size cap at 1024²) | 8k | 9k | 16k |
| ✓ Texture | 1 × 1024² base color (+ optional roughness in same map's alpha or separate 512²) | same | 2048² allowed |
| ✓ Final file (after optimize; G4 runs `shared/tools/optimize.sh` (gltf-transform quantize + resize to budget + webp, the same as model-ship; not `optimize`, which prunes the `mouth` empty) to `qa/optimized.glb` and validates + sizes that; G2/G3 run on the source glb) | ≤ 400 KB | ≤ 600 KB | ≤ 1.2 MB |
| ✓ Materials | ≤ 2 | ≤ 2 | ≤ 3 |

## Shipping format
Artifacts don't serve `.glb`, so the shipped asset is `assets/<id>-glb.js` (`window.LB_CREATURES['<id>']="<base64 glb>"`) next to the canonical `assets/<id>.glb`. `roster.json` lists both.
