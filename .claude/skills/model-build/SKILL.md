---
name: model-build
description: Shared step, any kind (creature, plant). Build a model in headless Blender from its spec: blockout, model, topology cleanup, UVs, material, texture bake, via models/shared/blender/build.py --run (archetype from models/<kind>/archetypes/). Produces models/out/<id>/<id>_model.blend + build_meta.json. Called by creature (weekly-visitor) and plant (season-seeds) pipelines.
---

# Model build (model + look-dev, any kind)

Shared step. Kind steps around it: creature (creature-brief → **model-build** → creature-animate), plant (plant-brief → **model-build** → plant-grow). Rules below are written for creatures; plants follow `models/plant/CONTRACT.md` (rooted origin at the soil point, five stage parts) with the same stages 3–7.

Input `models/<kind>/specs/<id>.json`. Output `models/out/<id>/<id>_model.blend` with one mesh named `<id>`, baked single PBR material, plus (`blockout_{side,top}.png` when the archetype has a blockout), `build_meta.json` (eye size, gloss, tris). build.py runs `check_spec` first and exits 3 on a spec-check failure, before any Blender work. Always `blender -b --factory-startup --python <script> -- <args>`; never the Blender MCP.

## Generator
- **One generator per species (default).** Copy the closest generator in `models/<kind>/archetypes/` to `models/<kind>/archetypes/<id>.py`, set the spec's `archetype` to `<id>`, add a first docstring line `Based on: <source>`, and then edit freely to express the species: beak, spines, sloped head, extra fins, new pattern. Species traits the judges look for (from the spec's `reference`) belong in code here, not squeezed into a parent archetype's parameters. Anything reusable (a fin builder, a beak, a gait cycle) goes into `models/shared/blender/lib.py` instead, so every species gets later fixes. The file joins the library when the creature ships; failed ones stay in quarantine.
- Reuse an archetype unchanged (`archetype` = an existing name) only when the species needs nothing it lacks.
- Generator API: `models/<kind>/archetypes/<archetype>.py` exposes `model(spec)`, `material(spec, parts)`, `rig(spec, mesh)`, `animate(spec, arm)`, and optionally `blockout(spec)` (primitive parts only; `streamlined_swimmer` has one, `soft_glider` doesn't). Call them through `models/shared/blender/build.py <spec> [outdir] --run <run_id>` (always `--run` inside a pipeline run: the ledger enforces the build budget and exits 4 `BUDGET EXHAUSTED`) (shared steps live in `models/shared/blender/lib.py`).
- Brand-new body plan (nothing close exists, e.g. the first walker): write `models/<kind>/archetypes/<id>.py` with the same functions, modeled on the nearest archetype's structure. Keep everything parametric from the spec; no hardcoded species values. It joins the library once the creature ships.

## Stages (do them in order; render a check after 2 and 3)
1. **Blockout** (optional, cheap): `build.py <spec> --stage blockout` renders black side + top silhouettes (`blockout_side.png`, `blockout_top.png`) if the archetype defines `blockout(spec)`; otherwise it prints "blockout skipped". Compare to the reference line; fix proportions now, it's cheapest here. New archetypes should add one.
2. **Model**: low-poly cage with clean loops along the body, Subdivision Surface (viewport 1–2). Body is lathe/loft along X; appendages (fins, wings, legs, tentacles, shell, petals) are separate parts with enough loops to bend (≥ 6 per tentacle/tail segment), then joined. Head **+X**, up **+Z**, symmetric in Y, origin at body center, real meters.
3. **Topology cleanup**: apply subdiv to the export level, merge by distance, recalc normals outward, decimate (collapse) only if over `budget.tris`, down to exactly the budget (it's a cap, not a target; `lib.finalize`), shade smooth (auto-smooth for hard edges like claws/shell).
4. **UVs**: Smart UV Project (angle ~66°, margin 0.02); tubes/tentacles get a seam on the underside first.
5. **Material**: Principled BSDF from spec palette; pattern via object-space coordinates + noise wobble (see `models/creature/archetypes/streamlined_swimmer.py` bands); roughness/coat from `spec.material` (clamped to STYLE; passed to the bake); creatures: eyes via `lib.eye(name, body_height, at)` (never hand-made spheres); a visible mouth: real geometry via `lib.mouth(spec, at, direction, head_size)` as part `mouth` (facing `spec.mouth`: front +X / underside −Z, clear of tentacles/appendages; optional `lib.accent_line` lip). Required for every archetype (shape-check).
6. **Bake**: Cycles, bake DIFFUSE color only (no direct/indirect) to one 1024² (2048² exotic) image, margin 8 px; optionally roughness to a 512². Replace node trees with one Image Texture → Principled material named `<id>`.
7. Save `<id>_model.blend`. No look-dev render here: the look is judged from `verify.sh`'s contact sheet and, for scenery, `capture_habitat.mjs` (the habitat's real lighting).

## Self-check before handing to animate
Mesh tri count within budget, no NaN, dimensions ±15% of spec, looks like the reference on the contact sheet (scenery: `qa/habitat/wide.png`). If the silhouette is wrong, go back to stage 1 instead of patching.

Reference implementation: `models/creature/archetypes/streamlined_swimmer.py` (example spec `models/creature/specs/examples/clownfish.json`).
