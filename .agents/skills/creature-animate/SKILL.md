---
name: creature-animate
description: Kind: creature. Rig and animate a built creature in headless Blender: armature, weights, a unique seamless idle loop and a feed action with jaw bites, a sulk mood loop, mouth node, glTF export. Produces models/out/<id>/<id>.glb. Step 3 of the creature pipeline (after shared model-build; uses shared models/shared/blender/lib.py, build.py --run, and hands off to shared model-verify).
---

# Creature animate (rig + loops + export)

> Paths: `out/` is relative to `models/`; the spec is in the board dir (`models/board/creature/specs/<id>.json`).

Input `out/<id>/<id>_model.blend` + spec. Output `out/<id>/<id>.glb` meeting `models/creature/CONTRACT.md`. Headless Blender only.

## 1. Rig
- Armature `<id>_rig` from the archetype's `rig(spec)`:
  - spine chain along X (4–8 bones, root at center, head bone at +X end);
  - appendage chains: tail/fin/wing (2–4), each tentacle/arm (4–8), legs (3 each), neck (2–3);
  - ≤ 32 bones (exotic 48).
- Empty `mouth` parented to the head bone at the `lib.mouth()` part's tip (`lib.MOUTHS[-1]["tip"]`); eyes parented to head bone.
- `jaw` bone (`lib.jaw_bone("head")`) at the mouth part, mouth part weighted 100% to it.
- Skin: Armature modifier, automatic weights; then limit to 4 influences, normalize all, check no unweighted verts (`qa_structural.py` will fail otherwise).

## 2. Animate (24 fps, no root motion)
Write keys with Python on pose bones; Bezier interpolation, auto-clamped handles.

**idle**: exactly `spec.motion.idle.frames`, a seamless loop:
- Each periodic motion is `sin(2π·k·t/frames + φ)` with whole-number `k` (use `cycles`, and 2×cycles for fast flutter). That guarantees seamlessness.
- Follow-through: each bone down a chain lags its parent by `chain_lag_frames` (phase φ += lag) and amplitude grows ~1.3× per bone toward the tip.
- Peak rotation ≤ 30°, but readable: some vertex must move ≥ 4% body length from frame 0 (motion-check). Add one slow, low-amplitude secondary motion (breathing, gill, bell pulse, hover bob) with k = 1.
- Personality from spec decides the mix (lazy = slow spine sway; busy = quick appendage flutter).
- No self-intersection: fins, arms, tentacles and tails must never pass through the body or each other at any frame (check the extremes of every swing; cut amplitude or add a counter-rotation on the parent before going over). The feed strike must not drive the head through the body's own appendages.
- Key the first and last frame identically, then add a Cycles F-modifier to every curve.

**feed**: `spec.motion.feed.frames`, starts and ends on idle frame-0 pose:
- Beats as fractions of length: anticipate 0–20% (pull back, mouth closes) → strike 20–35%, the fastest beat (head/arm/claw toward +X; mouth must move ≥ 5% body length forward) → grab/bite 35–50% (jaw/tentacle close) → chew/swallow 50–80% (2 small pulses) → settle 80–100%, ease back to idle pose.
- Mouth opens/closes on the bite beats: `lib.key_mouth(arm, [(t, opening), ...], frames=M)` keys the `jaw` scale (≥ 2 bites; closed at t=0 and t=1).
- Follow `spec.motion.feed.technique` for what moves. Peak rotation ≤ 60°; some vertex must move ≥ 12% body length from frame 0 (motion-check).

**sulk**: `spec.motion.sulk.frames`, a seamless loop (same whole-cycle rules as idle), follows `spec.motion.sulk.technique`:
- A held posture (droop/slump/retract, never through the body) plus a slow, small loop; max speed must stay below idle's (motion-check).
- Sulk must read as its own pose at card size (motion-check compares the side silhouette with every idle pose; threshold `SULK_SILHOUETTE_CHANGE_MIN` in creature/qa.py). Hang nose-down; on a deep body don't curl the tail down, it cancels the tilt. Front mouths frown: add `lib.mouth_corner_bones()` to the rig, skin the mouth with `lib.mouth_weights(co)`, key `lib.frown_locs(spec.motion.sulk.frown)` as locs every frame (motion-check: corners drop ≥ 15% mouth width).

**perch** (when `spec.motion.perch`; CONTRACT "Resting"): `spec.motion.perch.frames`, a seamless loop following `perch.technique` and `spec.rest`. Animate in the normal axes (head +X, up +Z) as if the resting surface were below; the runtime turns the whole body into the pose (head down for `hang`, belly to a rock face for `cling`). Only the body's own resting shape moves: wings folded and breathing, tentacles fanning, legs gripping, nothing travelling. Max speed below idle's (motion-check). For `hang`, add an empty `grip` at the feet (parented to the bone that holds on) so the runtime hangs it from there.

Optional `swim_fast` (same rules as idle, higher k) and `react` (startle) when the spec asks.

## 3. Export
- Push each action to its own NLA track named exactly `idle`, `feed`, `sulk`, `perch`, …
- Export: `export_format='GLB'`, `export_animations=True`, `export_animation_mode='NLA_TRACKS'`, `export_image_format='WEBP'`, `export_skins=True`, `export_yup=True`.
- Run `models/shared/tools/verify.sh <id>` locally; if shape-check/motion-check fail, fix and re-export before handing off (verify will run again independently).
