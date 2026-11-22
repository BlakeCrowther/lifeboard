# Scenery contract

Status: two archetypes built (`archetypes/clump.py` swaying blades/fronds, `archetypes/solid.py` static lofted bodies). Runtime: the Ecosystem package (`src/packages/ecosystem`) places them from `biomes.json` `scenery`. Golden: `eelgrass_tuft` (first shipped piece). Shared rules (units, glTF export, baked material, eased motion, optimize + `-glb.js` shipping, export-check) follow `models/creature/CONTRACT.md` and `models/STYLE.md`. Lines marked ✓ are checked by `verify.sh` (shared gates + `scenery/qa.py`).

## One prop per model
A scenery piece is one prop of a biome's backdrop: a clump, a shell, a rock arch, a dune ridge. It comes from the biome's `look.owns` and is placed many times by the Ecosystem package (src/packages/ecosystem) (count, spread, scale, phase come from `biomes.json`, not the model).

## Space
- ✓ Origin at the ground contact point: bbox min z ≈ 0 (≤ 3%), centred over the origin in X/Y. +Z up in Blender (+Y in glTF), meters.
- ✓ Height = `size.height_m` ±20%; optional `size.footprint_m` (widest horizontal extent) ±30%. Measured on the whole rest-pose mesh: everything that pokes up counts, and anything sunk below the origin fails the ground-origin check.

## How it rests (`sit`, required)
How a copy sits on the ground, decided per spec by reasoning from the real thing: what holds it (roots, its own weight, nothing),
whether it is rigid, whether it hugs bumps or bridges them. Write the reason in `sit.why`; there is no size rule to fall back on.
- `upright`: stays vertical whatever the slope (rooted plants grow toward the light: eelgrass, kelp).
- `follow`: the whole prop tilts with the surface under it (rigid things lying flat: a sand dollar, a shell, a fallen leaf).
- `drape`: tilts and bends so every part rests on the sand under it (soft, heavy-for-its-stiffness things: an algae mat, a mold film, wet cloth).
On rocks a copy tilts to the rock face (`follow` and `drape`). The build writes the mode into the glb (`lb_sit`), the Ecosystem package (src/packages/ecosystem) seats every copy by it, and the Ecosystem capture shows the result; a wrong choice is a `placement` note.

## Budget
- ✓ ≤ 3000 tris (aim 1500–3000; less is fine), one baked material, texture ≤ 512² (`budget.texture`), ≤ 200 KB optimized (export-check).
- ✓ ≤ 32 bones (shape-check; bone sway only).
- Where the 200 KB goes: mesh ~35–40 B/tri after quantize (2800 tris ≈ 110 KB), texture ≈ 20–40 KB (webp 512²). Bone sway adds ≈ 4.5 KB per bone per 96 frames; shader sway adds ~2 numbers per point (≈ 10 KB). Prefer shader sway.
- Check all of these before spending a counted build: `shared/tools/preflight.sh <spec> --run <run>` (uncounted trial build + verify.sh).

## Animation
- **Shader sway (preferred)**: `motion.sway {mode: "shader", amp, period_s, lift, personality}`. No armature, no clip: the build writes two per-point values (`_SWAY_W` how free the point is 0..1, `_SWAY_P` how far its wave lags 0..1; archetype `sway_weights(spec, co)`, default by height) and the settings into the glb; the Ecosystem package (src/packages/ecosystem) moves the points on the GPU, each copy a little out of step. `amp` is a fraction of the prop's size (0.01–0.15), `period_s` 3–12 s, `lift` 0–1 (stem ends rise as the wave passes). ✓ anchored (base core weight ≤ 0.3), ✓ free parts (max weight ≥ 0.5), ✓ sway visible in the Ecosystem capture (`qa/ecosystem/sway-check.json`, peak frame change ≥ 0.008; golden eelgrass ≈ 0.014).
- Static props (shells, stones): no armature, ✓ no actions.
- Bone sway (shipped grasses; new props use shader sway): one armature, ✓ one `sway` loop, 48–144 frames, whole cycles, ✓ seamless (bone delta < 1e-3), ✓ gentle (≤ 4% size/frame), ✓ visible (≥ 3%), ✓ no pops. Water = slower, lag growing up the blade.

## Spec
`kind: "scenery"`, `id`, `name`, `biome`, `rarity: "common"`, `archetype`, `reference`, `size.height_m` (+ `footprint_m`), `palette`, `material`, `budget`, `sit {mode, why}`, optional `motion.sway` (shader: `{mode: "shader", amp, period_s, lift, personality}`; bone: `{frames, cycles, amp_deg, lag_frames, personality}`; `personality`: one sentence on how it should move, the judges grade `sway_readable` against it), optional `pass_through` (creatures swim through it; also settable per biome item). `check_spec.py` (spec-check) enforces these.

## judge-panel
Same judge harness as the other kinds (model-verify skill), rubric `reads_as, style_match, artifacts, sway_readable` (static: null). No mouth/feed criteria. Criteria, floor, bar and panel size live only in `models/scenery/qa_calibration.json` `pass_rule`; `models/shared/tools/judge_verdict.py` decides (a static prop's `null` motion score is left out). Images come from `node shared/tools/capture_ecosystem.mjs <id>` (the real Ecosystem) then `verify.sh`'s contact sheet. Judge prompt (fill the `{}`; nothing else about the build):

```
You are a visual judge for a 3D scenery prop in a stylized underwater game Ecosystem. Judge only what you see.
Prop: {name}. Reference: "{reference}". Placed many times on the {biome name}{, shown in neglect murk among its own copies: blight props}.
Sway intent: "{motion.sway.personality}" (static props: no sway; score sway_readable null).
Read the style guide models/STYLE.md. Images (Read tool), in order, from out/{id}/qa/:
1. ecosystem/wide.png: the game camera in the real Ecosystem; the prop is the copy nearest the camera. What the player sees.
2. ecosystem/turn.png: 4 angles round it. 3. ecosystem/sway.png: labelled frames across one sway loop, in order.
4. contact.png: studio renders for structure and true scale (its first row is the card-size view). Judge colour and readability from 1-3, not the studio lighting.
Anchor: the golden {golden id} scored {qa_calibration.json golden_medians}; see models/{qa_calibration.json ecosystem_wide}. Equal quality = equal score.
Score 1-5 (3 = acceptable for this world): reads_as, style_match, artifacts, sway_readable.
Tag every fix with the criterion it would raise; use "placement" for anything about how the Ecosystem places copies
(spacing, sameness of copies, sinking into the sand): those go to the Ecosystem package (src/packages/ecosystem), not the model.
Reply with ONLY: {"reads_as":n,"style_match":n,"artifacts":n,"sway_readable":n,"notes":["..."],"fix":[{"criterion":"artifacts","fix":"..."}]}
```

## Shipping
`assets/<id>.glb` + `assets/<id>-glb.js` setting `window.LB_SCENERY['<id>']` (base64). Roster: `{id, kind: "scenery", name, spec, glb, js, biome, rarity, pass_through, golden, added}`.
