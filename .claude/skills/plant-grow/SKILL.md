---
name: plant-grow
description: Kind: plant (OUTLINE, no generator yet). After shared model-build: build the five stage models, rig, author a seamless sway_<n> idle per stage and the tend reaction (optional wilt), export the glb. Step 3 of the plant pipeline (season-seeds); uses shared lib.py/build.py --run and hands off to shared model-verify.
---

# Plant grow (outline)

Input: the built `out/<id>/<id>_model.blend` (stage parts `s0_*`…`s4_*`) + spec. Output `models/out/<id>/<id>.glb` meeting `models/plant/CONTRACT.md`. Headless Blender only; every build through `build.py --run <run_id>`.

1. **Stages**: parent each stage's parts under an empty `stage_0`…`stage_4` (seed, sprout, leafy, bud, bloom); rooted origin at the soil point, +Z up; per-stage tri budget.
2. **Rig**: one armature; stem chain (3–6 bones) + leaf/petal bones; unused bones stay still in early stages; ≤ 4 weights normalized.
3. **sway_<n>** per stage: seamless (whole cycles, sin with integer k), follow-through up the stem, amplitude grows with stage; wind vs water by biome medium.
4. **tend**: perk-up reaction, starts/ends on the sway frame-0 pose, visible ≥ 6% size, eased.
5. Optional **wilt** pose.
6. Export NLA tracks named exactly `sway_0`…`sway_4`, `tend`, (`wilt`); run `models/shared/tools/verify.sh <id>` (plant gates in `models/plant/qa.py`).
