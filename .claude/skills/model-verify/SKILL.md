---
name: model-verify
description: Shared step, any kind. Independently verify a model .glb before it ships: the four automated code checks (spec, shape, motion, export) (shared gates + the kind's models/<kind>/qa.py via models/shared/tools/verify.sh), a fresh-eyes visual judge judge-panel (recorded in the run ledger), and an in-page runtime test page-test. Writes models/out/<id>/report.json. Nothing ships without a PASS. Called by weekly-visitor and season-seeds.
---

# Model verify (any kind)

Shared step. `verify.sh` runs the shared gates and then the kind's `models/<kind>/qa.py` (spec.kind, default creature). Kind-specific lines below are marked; plants: see `models/plant/CONTRACT.md` (stages, sway, tend).

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Verification is adversarial: assume the build is wrong until every gate proves otherwise. The agent that built the creature must not grade its own visuals.

## The four code checks: automated
```bash
models/shared/tools/verify.sh <id> [glb] [spec]   # glb default out/<id>/<id>.glb, must be directly in out/<id>/ or out/dryrun/<id>/ (else exit 2); spec searched in <kind>/specs/, <kind>/specs/examples/, <glb dir>/spec.json, out/dryrun/<id>/
# writes <glb dir>/qa/{spec-check,shape-motion-check,export-check}.json + renders + contact.png   (dry run: verify.sh <id> out/dryrun/<id>/<id>.glb)
```
- spec-check: design file (schema, palette ranges, loop uniqueness vs. roster).
- shape-check: structure: shared (meshes, tris, materials, texture, NaN, armature, bones, ≤4 weights, normalized, all verts weighted, eye meta, rest-pose bbox) + creature (size, axes, symmetry — radial rules if `spec.symmetry` is `radial`, origin, materials, texture, armature, ≤4 weights, normalized, all verts weighted, `mouth`, eye size from `build_meta.json`, `part:mouth` from `build_meta.json` + `mouth` empty at it). Bbox checks run at the rest pose.
- motion-check: animation: creature (idle/feed present, lengths, seamless idle, feed starts/ends on idle pose, no pops, speed caps, visible amplitude ≥ 4% idle / ≥ 12% feed, feed reaches forward).
- export-check: glb export (glTF validator 0 errors, size budget).
Any FAIL → stop; return the failing checks as fix notes.

## judge-panel: visual judges (a panel of fresh subagents)
One judge is noisy (the same sheet scores a step apart across judges), so the judge-panel is several **fresh judges** on the same renders, spawned in parallel (~15 s each): as many as the kind's `models/<kind>/qa_calibration.json` `pass_rule.judges`, on its `judge_model`. Spawn a **new** subagent for every judgement (never resume or SendMessage a previous judge, even for a re-judge of the same model). Record every judge before using any scores, with its JSON reply: `python3 models/shared/tools/ledger.py judge <run_id> <id> <agent_id> --reply -` with the judge's JSON on stdin (a heredoc; once per agent; the reply is the run log the polish rounds read). Every judge prompt asks for fixes tagged with the criterion they raise (`{"criterion":..., "fix":...}`, "placement" for runtime placement); exit 5 / `REFUSED` means that agent already judged in this run: discard its result and spawn a fresh one. A judgement not recorded in the ledger does not count. The verdict is `python3 models/shared/tools/judge_verdict.py <kind> <run_id> <id>` (exit 0 pass, 1 fail, 2 no verdict: too few usable replies); never compute medians by hand. Give the subagent no build context. Give it ONLY: the spec's `reference`, `name`, `motion.*.personality/technique`, `models/STYLE.md`, the images `<qa>/contact.png` + `<qa>/renders/turn_{0,2,4,6}.png` (side/three-quarter turntable views) + `<qa>/renders/motion_{idle,feed}.png`, and the **anchor**: the same-kind golden's contact sheet (calibration file `contact`: a tracked sheet under `models/<kind>/calibration/<golden id>/`, so a fresh clone has the anchor without building it; re-render and replace it when the golden or the sheet layout changes) with its `golden_medians`, phrased "The golden reference scored {golden_medians}; it is the bar for this world's style. Grade the new model relative to it: equal quality = equal score." (When judging the golden itself, omit the anchor.) Contact sheet rows: card-size row (creatures and scenery: the model at the pixel size the user sees, 1× beside the same pixels enlarged; idle then sulk for creatures; also saved alone as `<qa>/renders/card_size_<pose>.png`, first pose named in `renders/card_size.json`), turntable, idle strip, feed strip, onion-skin motion panels (6 poses overlaid at partial opacity), side-by-side with each golden at true relative size. Ask for one JSON object with one key per criterion in `pass_rule.criteria` (an integer 1–5; `null` only when it can't apply, e.g. a static prop's motion), plus notes and criterion-tagged fixes:
```json
{"<criterion>": 1-5, "notes": ["what you see"], "fix": [{"criterion": "<criterion it raises, or placement>", "fix": "one change"}]}
```
- Scenery: the capture also writes `qa/habitat/sway-check.json` (motion measured in the habitat; a FAIL is a motion-check failure). Use the judge prompt in `models/scenery/CONTRACT.md` (scenery has no motion personality/technique fields; its sway intent is `motion.sway.personality`). First run `node models/shared/tools/capture_habitat.mjs <id>` (habitat.js on the standalone `capture.html`: the board's lighting, murk and neighbours, synthetic state; blight props are shown in neglect murk among their own copies). Images, in this order: `<qa>/habitat/wide.png` (the game camera: what the player sees; the candidate is the copy nearest the camera), `<qa>/habitat/turn.png` (4 angles), `<qa>/habitat/sway.png` (labelled frames across one sway loop), then `<qa>/contact.png` (structure and true scale vs the golden). Tell the judge the habitat images are the look that counts; colour and readability are judged from them, not the contact sheet's QA lighting. Frames, not video: the judges' Read tool takes images only, and frames let the run choose how many. The scenery anchor is the golden's tracked `habitat_wide` image, then its `contact`.
- Plants: images `<qa>/contact.png` (row 2 = growth strip) + `renders/motion_{sway_4,tend}.png`; golden, criteria and pass rule from `models/plant/qa_calibration.json`.
- `species_read`: would someone recognise the reference animal?
- `artifacts`: 5 = no holes, stretching, flipped normals, floating parts, texture seams or z-fighting, and no part passing through another part in any idle/feed frame (fin through body, arm through arm).
- Mouth and eye placement are not judge criteria: shape-check measures them. Judges may still name them in `notes` and `fix`.

Record, then decide:
1. Record each judge's reply with `ledger.py judge ... --reply` (above). The ledger files each reply under the run's latest build, so a rebuild starts a fresh panel.
2. Verdict: `python3 models/shared/tools/judge_verdict.py <kind> <run_id> <id>` prints JSON and exits 0 pass, 1 fail, 2 no verdict. Never compute medians, means or the verdict yourself. The rule (per criterion the median of the judges' scores; pass when every median ≥ `floor` and, unless `bar` is null, the mean of the medians ≥ `bar`) and every number in it live only in `pass_rule`. Exit 2 says why, usually too few usable replies since the latest build (a malformed reply is listed as unusable): spawn and record fresh judges, then run it again.
3. `report.json.judge` = the script's output (`pass`, `failed`, `medians`, `mean_of_medians`, `judges`, `fixes`: every fix keyed by the criterion it raises, lowest median first). `report.json.fix_notes` = the fixes under the lowest-median criteria (what `ledger.py plan` must take on).
- Replay or calibration without a run ledger: `judge_verdict.py <kind> --files <a.json> <b.json> <c.json>`.
- New golden or new `judge_model`: re-judge the golden with a full panel, write its medians to `golden_medians` and recompute `pass_rule.bar` as `pass_rule.note` says.

## Polish rounds (any kind, after a judge-panel PASS)
A first pass is a floor, not the finish. Every pipeline (creature, plant, scenery) runs this before model-ship. While the piece's ledger has a judge round left, up to 2 polish rounds (a round = a `plan` after a **passing** build; retries after a failed build don't count, they are bounded by the budget):
1. `ledger.py notes <run> <id>`: every judged build's medians, then every fix grouped by the criterion it raises, oldest first, lowest median first. "placement" fixes are listed apart: route them to habitat.js, not the model.
2. `ledger.py plan <run> <id> --fixes <criterion>[,<criterion>] "<what changes>"`: required before the next build (build.py exits 6 `PLAN NEEDED` otherwise). It refuses unless one of the build's lowest-median criteria is fixed or skipped with a reason (`--skip "reads_as: why"`), refuses a third polish round, and snapshots a passing build to `out/runs/<run>/build<N>/` first.
3. Fix the **cause** in the generator or spec (a missing trait is code, not a parameter nudge), run `shared/tools/preflight.sh` until the code gates pass, then the counted build, the first five gates and a fresh panel.
4. `ledger.py best <run> <id>` names the version to ship (highest mean among passing builds, ties: the newer one) and where its files are; restore a snapshot into `out/<id>/` before model-ship when it isn't the latest build. Stop early when a round doesn't raise the mean. Report each round's mean. The same loop runs on a **failed** judge-panel as the retry loop; the only difference is that a pass can stop.

## page-test: runtime (in the habitat page)
1. Wrap: `printf 'window.LB_CREATURES=window.LB_CREATURES||{};window.LB_CREATURES["<id>"]="%s";' "$(base64 -i out/<id>/<id>.glb | tr -d '\n')" > out/<id>/<id>-glb.js` (plants: `window.LB_PLANTS`, runtime check in the garden plots, see season-seeds).
2. Open the habitat page (the card for the creature's biome) with the candidate injected (`?visitor=<id>` test hook) in the built-in browser via `preview_start` (launch config "scratch" or a repo config), at desktop and 375 px widths.
3. Check:
   - console has no errors;
   - the creature is visible, at a sane size, and nose-first while moving;
   - `idle` plays;
   - triggering a lesson ("feed") plays `feed` aimed at the food and returns to `idle` without a pop;
   - over ~30 s of watching, the creature never passes through the ground, other creatures or any solid scenery (every registered scenery kind not listed in the biome's `pass_through` in `biomes.json`); it may pass through listed kinds. Runtime steering (`keepClear` in habitat.js) owns this, not the clip; a failure routes to runtime;
   - the frame rate stays above 40 fps, measured only on a visible page. A hidden page's timers are throttled, so first check: the `tabs_context` result says whether the Browser pane is displayed or hidden, and `document.visibilityState` (javascript_tool) must be `"visible"`. If either says hidden, record `fps: "not measured: page hidden"` in `gates.page-test`; that is neither a number nor a fail.
4. Save screenshots `out/<id>/qa/runtime_*.png`.

## Report
Write `out/<id>/report.json`: `{id, pass, gates:{spec-check, shape-check, motion-check, export-check, judge-panel, page-test}, judge, fix_notes:[...], attempts}`. On FAIL the orchestrator routes `fix_notes` to the step that owns them (spec-check → brief, shape-check/model artifacts → build, motion-check/rig/motion → animate, export-check → animate export or ship optimize, page-test → animate or runtime).

### Judge-panel note routing
| Judge note about | Route to | Typical fix |
|---|---|---|
| anatomy, proportions, silhouette, missing/extra parts (`species_read`, `anatomy`) | build (model) | archetype params / spec `shape`, `parts`; check blockout |
| color, pattern, gloss (`style_match`) | build (material) | spec `palette`, `pattern`, `material.{roughness,coat}` |
| holes, stretching, seams, floating parts (`artifacts`) | build (topology / UV / bake) | |
| motion: idle/feed unreadable, too stiff, too wild (`idle_readable`, `feed_readable`) | animate | `motion.*.amp_deg`, `reach_ratio`, beats |
| mouth or eye placement/size/visibility (free-text notes; shape-check measures both) | build | `lib.eye`; `lib.mouth()` part (position/facing/size, not hidden by appendages), `jaw` bite keys, `mouth` empty in `rig()` |
| species choice itself unreadable after fixes | brief | pick a more graphic species |
