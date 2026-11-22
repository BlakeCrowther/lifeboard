---
type: Design Doc
title: Creature resting poses
description: Ecosystem creatures rest the way their real animal does (cling to a rock face, lie on the sand, hang from a branch) and switch between resting and roaming.
status: stable
design_status: implemented
tags: [Ecosystem, models, creature]
verified: {by: "human:BlakeCrowther", at: 2026-11-20T00:00:00Z}
---

# Creature resting poses

**Goal:** a creature rests the way the real animal does: an anemone clings to the side of a rock, a flounder lies on the sand, a bat hangs from a branch, flies about and comes back to hang again. The rest is reasoned per species in its spec, as scenery's `sit` is, so briefs can pick sessile and perching animals without the runtime limiting them.

Terms: **rest** = the spec field below. **Perch site** = one spot a creature can rest on (a point, a surface normal, the object it belongs to). **Sessile** = a creature that never leaves its site (`locomotion: rooted`).

## Today

| | Scenery | Creatures |
|---|---|---|
| How it sits | `sit` (upright / follow / drape) in the spec, written into the glb as `lb_sit`, read by `dress()` / `seat()` | none: every creature roams its loop path forever; `rooted` stands on the sand at its path centre |
| Surface finding | `rockHit` (ray down onto a rock, hit point + face normal), `groundNormal`, `conform` | `keepClear` pushes bodies out of every collider |
| Clips | shader sway | `idle`, `feed`, `sulk` (baked, armature) |

Specs are not published with the artifact (only `roster.json`, `biomes.json` and `assets/*-glb.js` are), so the runtime's `spec.*` reads (e.g. `ecosystem.shelter`) get nothing on the live board. Anything the runtime needs from the spec must be in the roster entry or the glb.

## Design

### 1. Spec: `rest` (optional)

```json
"rest": {"on": "rock", "pose": "cling", "share": 1, "bout_s": [12, 30],
         "why": "Anemones glue their pedal disc to hard rock and stay there for life."}
```

| Field | Values | Meaning |
|---|---|---|
| `on` | `rock` · `sand` · `branch` · `prop` | what it rests on. `branch` = anything overhead it can grip (canopy limbs, roots, scenery `perch*` nodes); `prop` = a biome scenery piece |
| `pose` | `cling` · `lie` · `hang` | `cling`: belly to the surface at any angle (anemone on a rock side, gecko on a wall, sloth under a limb); `lie`: flat on the ground, belly down (flounder, ray); `hang`: head down below a point, held by its grip (bat) |
| `share` | 0 < share ≤ 1, default 0.35 | fraction of time spent resting. `1` = sessile (needs `locomotion: rooted`) |
| `bout_s` | `[min, max]` s, default `[10, 25]` | how long one rest lasts |
| `why` | one sentence, required | reasoned from the real animal: where and how it rests |

Valid pairs: `lie` → `sand`; `cling` → `rock`, `branch`, `prop`; `hang` → `branch`, `prop`. No `rest` = never rests (today's behaviour).

### 2. Model: `perch` clip and `grip` node

- `perch` animation (optional): a seamless resting loop, 48–144 frames, calmer than `idle` (max speed below idle's), crossfaded in and out (no start-pose rule, like `sulk`). Authored in the model's normal axes (head +X, up +Z); the runtime turns the whole body into the pose, the clip only does the body's own resting shape (wings folded, tentacles fanning, legs gripping).
- **Required** when `pose` is `hang` or `locomotion` is `fly` (a flapping idle can't rest). Otherwise, missing `perch` → the runtime plays `idle` at half speed.
- `grip` empty (optional): where the body holds on (a bat's feet). Fallback: rear tip of the body for `hang`, belly for `cling` / `lie`.
- motion-check checks `perch` when present: loops, no pops, slower than idle.

### 3. Delivery

`model-ship` copies `rest` (and `locomotion`) from the spec into the creature's roster entry. The runtime reads `entry.rest || spec.rest`. Giving an already-shipped creature a rest is a spec + roster edit, no rebuild (unless it needs a `perch` clip).

### 4. Runtime (`src/packages/ecosystem`)

**Perch sites**, found when the world is built and claimed one creature per site:

| `on` | How sites are found |
|---|---|
| `rock` | `surfaceHit`: a ray from outside a rock toward its centre (generalises `rockHit`, which only casts down); `cling` keeps side faces (normal.y −0.3…0.75) on the camera's half |
| `sand` | open sand near the creature's path, clear of colliders; normal from `groundNormal` |
| `branch` | registered by builders (`limb` underside points) and by scenery glb nodes named `perch*`; resolved at the piece's grown-in scale; a `hang` site must leave the body clear of the ground |
| `prop` | `surfaceHit` on a visible biome scenery piece |

No site of the right kind in this biome → the creature keeps roaming; a rest is never faked onto the wrong surface.

**States:** `roam` → (roam timer) `approach` (fly to a point off the surface along its normal) → `settle` (ease onto the site, crossfade to `perch`) → `perched` (bout timer) → `leave` (push off along the normal, crossfade to `idle`) → `enter` (rejoin the loop path, the existing state). Roam time between rests = `bout × (1 − share) / share`, jittered.

**Orientation:** `cling` / `lie`: body up = surface normal, head = up-slope on steep faces, else the current heading projected onto the surface. `hang`: head = world down, back toward the camera, hung from the `grip` point. Every state sets a target quaternion and the holder slerps to it, so take-off and landing never pop.

**Collisions:** `keepClear` skips the perch object while approaching, settling and perched.

**Other states win:** food within reach → a perched (non-sessile) creature leaves to eat; hiding (no lessons) → it leaves for its shelter. A sessile creature never leaves; it plays `sulk` while sad or hiding, `perch` otherwise. A perched non-sessile creature keeps `perch` while sad (the `sulk` clip is authored for the roaming body).

**Test hooks** (QA, like `?phase=`): `?rest=<on>_<pose>` (e.g. `rock_cling`) overrides the visitor's rest, `?perch=1` starts it perched. Both work on `capture.html?visitor=<id>`. `models/shared/tools/watch_creatures.mjs <id> --expect approach,settle,perched,leave` runs the page in headless Chrome (a hidden preview pane throttles frames), logs every state change and fails if a state never comes.

### 5. Pipeline

- `creature-brief`: every brief decides `rest` from the real animal (or says why it never rests in `notes`); sessile and perching animals are welcome, and the rooted/perching body plans count as unusual locomotion for the novel-first rule.
- `creature-animate`: makes `perch` when the spec has `rest` and the pose needs it.
- `check_spec.py`: validates the fields, the pairs, `share: 1` ⇔ rooted, and `motion.perch` when required.
- `models/creature/CONTRACT.md`: a "Resting" section.

First use: `gulf_pipefish` gets `{on: sand, pose: lie, share: 0.3}` (pipefish settle motionless among seagrass bases on the bottom), a spec + roster edit.

## Not in scope

Plants. Crawling over walls as locomotion (only the resting pose). Physics or grip IK. Several creatures sharing one site. Fixing the other live-only spec reads (`ecosystem.shelter`), listed as a follow-up.

## Risks

- Rocks are simple ellipsoid colliders but bumpy meshes; the ray hit, not the collider, places the body, so it sits on the visible surface.
- A creature authored with a long tail sticking out may clip into curved rock; the settle offset uses the posed bounding box.
- Too much resting makes the scene feel empty; `share` defaults low, and the visitor is never resting when it first enters.

## Testing

`check_spec.py` on the pipefish and on bad-rest fixtures; `pnpm spec-check`; `pnpm typecheck`; `capture.html?visitor=gulf_pipefish&perch=1` screenshots for `lie`, plus `&rest=rock_cling` and `&scene=canopy&rest=branch_hang` to exercise the other two poses; `watch_creatures.mjs` for the timed cycle and `--at 5:'Ecosystem.feed(4)'` for the food interrupt.
