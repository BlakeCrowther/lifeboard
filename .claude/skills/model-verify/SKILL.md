---
name: model-verify
description: Shared step, any kind. Independently verify a model .glb before it ships: automated gates G1-G4 (shared gates + the kind's models/<kind>/qa.py via models/shared/tools/verify.sh), a fresh-eyes visual judge G5 (recorded in the run ledger), and an in-page runtime test G6. Writes models/out/<id>/report.json. Nothing ships without a PASS. Called by weekly-visitor and season-seeds.
---

# Model verify (any kind)

Shared step. `verify.sh` runs the shared gates and then the kind's `models/<kind>/qa.py` (spec.kind, default creature). Kind-specific lines below are marked; plants: see `models/plant/CONTRACT.md` (stages, sway, tend).

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Verification is adversarial: assume the build is wrong until every gate proves otherwise. The agent that built the creature must not grade its own visuals.

## G1–G4: automated
```bash
models/shared/tools/verify.sh <id> [glb] [spec]   # glb default out/<id>/<id>.glb; spec searched in <kind>/specs/, <kind>/specs/examples/, <glb dir>/spec.json, out/dryrun/<id>/
# writes <glb dir>/qa/{g1,g23,g4}.json + renders + contact.png   (dry run: verify.sh <id> out/dryrun/<id>/<id>.glb)
```
- G1 spec (schema, palette ranges, loop uniqueness vs. roster).
- G2 structure: shared (meshes, tris, materials, texture, NaN, armature, bones, ≤4 weights, normalized, all verts weighted, eye meta, rest-pose bbox) + creature (size, axes, symmetry — radial rules if `spec.symmetry` is `radial`, origin, materials, texture, armature, ≤4 weights, normalized, all verts weighted, `mouth`, eye size from `build_meta.json`, `part:mouth` from `build_meta.json` + `mouth` empty at it). Bbox checks run at the rest pose.
- G3 animation: creature (idle/feed present, lengths, seamless idle, feed starts/ends on idle pose, no pops, speed caps, visible amplitude ≥ 4% idle / ≥ 12% feed, feed reaches forward).
- G4 export (glTF validator 0 errors, size budget).
Any FAIL → stop; return the failing checks as fix notes.

## G5: visual judge (median of 3 fresh subagents)
One judge is noisy (the same model scored 3.2–4.0 across judges), so G5 = **3 fresh judges** on the same renders, spawned in parallel (~15 s each). Spawn a **new** subagent for every judgement (never resume or SendMessage a previous judge, even for a re-judge of the same creature). Record all 3 before using their scores: `python3 models/shared/tools/ledger.py judge <run_id> <id> <agent_id>` (once per agent); exit 5 / `REFUSED` means that agent already judged in this run: discard its result and spawn a fresh one. A judgement not recorded in the ledger does not count. Give the subagent no build context. Give it ONLY: the spec's `reference`, `name`, `motion.*.personality/technique`, `models/STYLE.md`, the images `<qa>/contact.png` + `<qa>/renders/turn_{0,2,4,6}.png` (side/three-quarter turntable views) + `<qa>/renders/motion_{idle,feed}.png`, and the **anchor**: the same-kind golden's contact sheet (creatures: `out/clownfish/qa/contact.png`) with its scores from `models/<kind>/qa_calibration.json`, phrased "The golden reference scored {scores}; it is the bar for this world's style. Grade the new creature relative to it: equal quality = equal score." (When judging the golden itself, omit the anchor.) Contact sheet rows: turntable, idle strip, feed strip, onion-skin motion panels (6 poses overlaid at partial opacity), side-by-side with each golden at true relative size. Ask for JSON:
```json
{"species_read":1-5,"anatomy":1-5,"style_match":1-5,"artifacts":1-5,"idle_readable":1-5,"feed_readable":1-5,"mouth_correct":true,"notes":["..."],"fix":["..."]}
```
- Plants: images `<qa>/contact.png` (row 2 = growth strip) + `renders/motion_{sway_4,tend}.png`; criteria `species_read, anatomy, style_match, artifacts, growth_readable, sway_readable, tend_readable` (no mouth); anchor + bar from `models/plant/qa_calibration.json` (golden `mermaids_cup`).
- `species_read`: would someone recognise the reference animal?
- `artifacts`: 5 = no holes, stretching, flipped normals, floating parts, texture seams or z-fighting, and no part passing through another part in any idle/feed frame (fin through body, arm through arm).
- Aggregate: per criterion the **median** of the 3 judges; `mouth_correct` = true in ≥ 2 of 3.
- PASS rule (**golden-relative**, from `models/<kind>/qa_calibration.json` `pass_rule` + `golden_median3`): every median ≥ `floor` (3), mean of the 6 medians ≥ golden mean − `margin` (today 3.67 − 0.3 = 3.37), `mouth_correct` true in ≥ 2 of 3. Novel archetypes: same, plus no median below the golden's median on `anatomy` and `artifacts`. When a new golden is promoted, re-judge it median-of-3 and update `golden_median3`, so the bar tracks the best work.
- `report.json.judge` holds the medians plus `judges: [{agent_id, scores}, ×3]`; fix notes come from notes ≥ 2 judges agree on.

## G6: runtime (in the habitat page)
1. Wrap: `printf 'window.LB_CREATURES=window.LB_CREATURES||{};window.LB_CREATURES["<id>"]="%s";' "$(base64 -i out/<id>/<id>.glb | tr -d '\n')" > out/<id>/<id>-glb.js` (plants: `window.LB_PLANTS`, runtime check in the garden plots, see season-seeds).
2. Open the habitat page (the card for the creature's biome) with the candidate injected (`?visitor=<id>` test hook) in the built-in browser via `preview_start` (launch config "scratch" or a repo config), at desktop and 375 px widths.
3. Check:
   - console has no errors;
   - the creature is visible, at a sane size, and nose-first while moving;
   - `idle` plays;
   - triggering a lesson ("feed") plays `feed` aimed at the food and returns to `idle` without a pop;
   - over ~30 s of watching, the creature never passes through the ground, other creatures or any solid scenery (every registered scenery kind not listed in the biome's `pass_through` in `biomes.json`); it may pass through listed kinds. Runtime steering (`keepClear` in habitat.js) owns this, not the clip; a failure routes to runtime;
   - the frame rate stays above 40 fps.
4. Save screenshots `out/<id>/qa/runtime_*.png`.

## Report
Write `out/<id>/report.json`: `{id, pass, gates:{G1..G6}, judge, fix_notes:[...], attempts}`. On FAIL the orchestrator routes `fix_notes` to the step that owns them (G1 → brief, G2/model artifacts → build, G3/rig/motion → animate, G4 → animate export or ship optimize, G6 → animate or runtime).

### G5 judge-note routing
| Judge note about | Route to | Typical fix |
|---|---|---|
| anatomy, proportions, silhouette, missing/extra parts (`species_read`, `anatomy`) | build (model) | archetype params / spec `shape`, `parts`; check blockout |
| color, pattern, gloss (`style_match`) | build (material) | spec `palette`, `pattern`, `material.{roughness,coat}` |
| holes, stretching, seams, floating parts (`artifacts`) | build (topology / UV / bake) | |
| motion: idle/feed unreadable, too stiff, too wild (`idle_readable`, `feed_readable`) | animate | `motion.*.amp_deg`, `reach_ratio`, beats |
| mouth or eye placement/size/visibility (`mouth_correct`) | build | `lib.eye`; `lib.mouth()` part (position/facing/size, not hidden by appendages), `jaw` bite keys, `mouth` empty in `rig()` |
| species choice itself unreadable after fixes | brief | pick a more graphic species |
