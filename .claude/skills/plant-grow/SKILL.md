---
name: plant-grow
description: Kind: plant. After shared model-build: check the five growth stages, the rig, the per-stage sway_<n> loops and the tend reaction (built by the archetype's rig()/animate() in the same build.py run), fix and rebuild via build.py --run, then hand off to shared model-verify. Step 3 of the plant pipeline (season-seeds).
---

# Plant grow

Input: spec + `models/out/<id>/` from `model-build` (one `build.py <spec> --run <run_id>` produces model, rig, actions and `<id>.glb`). Output: `models/out/<id>/<id>.glb` meeting `models/plant/CONTRACT.md`. Headless Blender only; every rebuild goes through `build.py --run <run_id>` (the ledger counts it).

What the archetype does (reference `models/plant/archetypes/stem_bloom.py`), and what to check:
1. **Stages**: parts `s0_*`…`s4_*` are split after the bake into meshes `stage_0`…`stage_4` (seed, sprout, leafy, bud, bloom), rooted at the soil point, +Z up, one shared texture.
2. **Rig**: one armature; per stage its own bones `s<n>_*` (stem chain 2–3, one bone per true leaf, `s<n>_head` for bud/bloom), ≤ 32 bones common; ≤ 4 weights normalized.
3. **sway_<n>**: whole-cycle sines (integer k over `motion.sway.frames`), each term offset so frame 0 = rest = last frame; amplitude grows with the stage; follow-through lags up the stem then leaves/head. Water medium = longer lag, leaves drift with the stem; air = shorter lag, leaves flutter at 2k.
4. **tend**: all stages perk up together (dip, straighten back past rest, leaves lift, head scales open by `motion.tend.open`), starts and ends at rest.
5. Optional `wilt` (not in stem_bloom yet; runtime desaturates and droops).
6. Run `models/shared/tools/verify.sh <id>`. G2/G3 failures → fix spec params first (amp_deg, lag, heights), the archetype only if the rule can't be met by params. Look at `qa/contact.png`: row 2 is the growth strip (each stage alone, one scale) — every stage must read as its stage and the bloom as the species. Then `model-verify` (G5 judges, G6 runtime).
