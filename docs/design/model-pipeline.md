---
type: Design Doc
title: Model pipeline reliability
description: Why the judge-panel verdict depends on the draw, what is fixed, and the open plan (categorical rule, measured checks, parts library, orchestration, portable core).
status: draft
design_status: draft
tags: [models, judging, pipeline]
verified: {by: "human:BlakeCrowther", at: 2026-11-21T00:00:00Z}
---

# Model pipeline reliability

**Goal:** a model ships or is held for the same reason on every judge draw, each hold names the part to fix, and fixes land once in shared code instead of per species.

Tracked by [epic lifeboard#15: model pipeline: reliable judging, measured checks, parts library, portable core](https://github.com/BlakeCrowther/lifeboard/issues/15). The checklist there is the work list; this doc is the reasoning and the evidence. The living map of stages, gates and weak spots is `models/pipeline.html`. This doc merges two earlier write-ups (a 2026-11-19 review and a 2026-11-20 re-audit); git history holds their full text, experiment tables and the 76 recorded judgements.

Terms new to the repo (add to `models/README.md` Terms when built): **part** (reusable builder for one anatomical piece, e.g. fin, beak), **skeleton template** (an archetype: body + bones + sockets + clip scaffolding), **recipe** (a species' parts and parameters), **socket** (named attach point exported with the model), **trait** (a must-have species feature in the spec), **identity check** (judges name the model without being told), **major defect** (visible at card size, spoils a main reference feature, or a clip fails its intent), **calibration set** (stored sheets with expected verdicts), **bench** (pre-verified models held for a failed week).

## Problem

Fresh sonnet judges (6 per subject; a panel is any way to draw 3 of the 6, so 20 panels) on the existing contact sheets:

| Subject | Passed under the score rule |
|---|---|
| Clownfish (golden) | 2 of 20 panels |
| Sheepshead (quarantined) | 8 of 20 |
| Drift algae mat (shipped scenery, re-audit) | 4 of 20 |
| Gulf pipefish | 20 of 20, only because the creature floor was set low (0 of 20 at the next floor up) |

- The rule is a coin flip near the bar: split 2-to-1 votes on `artifacts` and `feed`, one 0.17 step from the threshold. More judges do not help.
- Scale carries little information: all 84 recorded scores were 2, 3 or 4.
- Judges agree almost perfectly on categorical questions: the top defect of every subject was named by 6 of 6, and missing traits and fix lists were unanimous or near it.
- Judge shopping: `ledger.py judge` refuses only a reused agent id and the verdict uses the latest 3 usable replies, so on the drift mat judges 1-3 fail it and judges 4-6 pass it.

## Done

Quick wins 1-8 of the epic, merged in [PR lifeboard#42: one judge rule, measured card-size checks, living pipeline map](https://github.com/BlakeCrowther/lifeboard/pull/42): one pass-rule source (`<kind>/qa_calibration.json` `pass_rule`) applied only by `judge_verdict.py`, `mouth_correct` dropped, tapered fins, card-size sulk check, card-size row first on the contact sheet, housekeeping, tracked calibration sheets. Earlier, [PR lifeboard#32: judge scenery in the real Ecosystem, keep judge notes across rounds](https://github.com/BlakeCrowther/lifeboard/pull/32) added notes across rounds, plan gating and Ecosystem captures for scenery.

## Open

### Next quick wins

| Item | Change | Verified by |
|---|---|---|
| Cap judges per build | Ledger refuses a usable judge beyond `pass_rule.judges`; `notes` header names the judges that decided | Self-test refuses a 4th usable judge; replay the drift run |
| Prop placement variety | Per-copy lean, height stretch, tint jitter, same-kind spacing, keep-clear between prop kinds in the Ecosystem package (`src/packages/ecosystem`) (copy the ground cover's approach); all 12 scenery judges called copies stamped | Re-capture eelgrass and drift mat; fresh judges' placement notes drop |
| Card-size footprint gate | Short side at least 8 px at card size; failure routes to a spec display scale, not a rebuild (pipefish is about 5 px) | Pipefish fails, clownfish passes |
| Re-judge goldens | At least 6 judges, per-judge scores stored; eelgrass anchor rewritten (6 of 6 fresh judges give artifacts 3, recorded 4) | `check_judge_rule.py`; anchor matches fresh panels |
| Pipefish snout-tip blobs | Named by 6 of 6; trace before it ships again | Onion-skin frames clean |
| Drift mat base disc | Named by 6 of 6 as a plate under the heap; fix or pull from the roster | Fresh panels pass 18 of 20, or the categorical rule passes |

### Judge rule (epic item 9)

Replace score bars with three questions, each decided by 3 fresh judges:

1. **Identity.** Shown only the card-size side view, unnamed, at least 2 of 3 list an accepted name (spec field `identify_as`) in their top three guesses.
2. **Traits.** Every spec `traits` entry (3-5 must-have features) is seen by at least 2 of 3.
3. **No major defect.** No item on the kind's defect list graded major by at least 2 of 3. Grades: none, minor (close-ups only), major (see "major defect" above).

Minor defects named by 2 of 3 feed one polish round; the new build is kept only if it wins pairwise (order alternated; no order bias in 19 comparisons) and still passes. A script reads the recorded judgements, not the orchestrating agent. Weekly drift check: one judge per calibration item, full panel on any flip, stop and report if it still flips. Stay on sonnet. One structure for all kinds; plants add "each growth stage reads", scenery drops motion.

On history the rule is stricter than today's but stable: it holds the golden (sulk reads as idle) and the pipefish (tail fan a flat disc, since fixed by tapering), fails sheepshead (blind identity 0 of 3; tall dorsal and forked tail traits 0 of 5) and the conch (flared lip trait 0 of 5). Land the shared fixes first so the first weeks under it do not hold more than they ship.

### Measured checks (item 10)

Each slots into shape-check or motion-check; thresholds are calibrated on shipped and quarantined models, then frozen.

| Check | Replaces the judge complaint | Measure |
|---|---|---|
| Eye and mouth size | "Unreadable" (pipefish eye about 0.5 px) | Eye diameter and mouth width in card px, absolute |
| Part attachment | "Floating", "clipping" | Gap and penetration per named part against its parent, at build time before joining; nearest-vertex gaps on the finished mesh overlap between good and bad models, so not after join |
| Slab sheet | Conch lip | Area per vertex and planarity, by part type, allow-listing leaves and blades |
| Feed readable | "Feed unreadable" | Mouth opening in card px at peak, bite count |
| Trait checks | "Dorsal not tall", "tail not forked" | Geometric traits from spec `traits` with a `measure` entry |
| Reskin guard | "Same fish, new paint" | Size-normalised side-silhouette overlap with each roster model |
| Scenery ground contact | Plate under the prop | No base disc under the prop |
| Sway amplitude | "Too subtle at game distance" (sway-check passes what judges call too small) | Calibrate the minimum to judges |

Both sheepshead trait failures and the conch lip are geometric, so these would have been caught and routed before any judge ran.

### Generation and reuse (items 11, 14, 15)

Archetypes duplicate 36-54% of their lines and the written rule "copy the closest generator per species" has never been used (no per-species copy exists). Recommended: a hybrid.

| Layer | Content |
|---|---|
| Primitives | `loft`, `tube`, `flat_part`, `sphere`, bake, armature, skin in `lib.py` |
| Parts | tapered `fin`, `tail` kinds, `eye`, `mouth` kinds (slit, beak, tube snout, sucker), jaw bones, clip blocks (idle pose, feed bite, sulk) |
| Skeleton templates | Body loft, bone chain, sockets, clip scaffolding: today's archetypes, slimmed |
| Recipe | Spec field `parts: [{part, socket, params}]` plus an optional species hook for one new part |

Part names survive to `build_meta.json` (name, type, box, parent, thickness); today they are lost at join. "Novel" means a new part or template and graduates into the library on ship. A parrotfish beak is a `mouth(kind="beak")` part on the existing jaw bone. A swept `shell_lip` part fixes the conch class of failure. Scenery stems want one tapered or curved tube part, not an archetype per prop.

### Orchestration (items 12, 13, 18)

| Topic | Change |
|---|---|
| Retry routing | Failing check maps to the step to re-enter (trait fail to model with the named part; clip fail to animate only; card-size fail to spec display scale). Same check failing twice with the same measure: fall back |
| Session cap and order | One cap for the session; visitor, then plants, then scenery last; unspent share rolls forward |
| Fallback order | Drop the novel part, then a backup species chosen at brief time (different template), then the bench, then no visitor with a loud report |
| Bench | 1-2 verified, unshipped models; a failed week ships from it and says so |
| Failure report | Failing check with measure, judges' agreed fix list, builds and minutes used, next attempt, and a resume file |
| Polish | One round, minor defects only, kept on a pairwise win |
| Dry run | `weekly-visitor --dry-run <event-json>` writes under `models/out/dryrun/` and never ships; page-test needs a candidate hook (scenery has one via `capture.html`; creatures load shipped only) |

### Skins and accessories (design only; blocked by items 11, 14, 16)

Named sockets (`head`, `back`, `tail`; one per plant growth stage) parented to bones; named material slots with texture-swap skins on the same UVs; accessories as small separate glbs attached at runtime, checked for clipping per body-accessory pair across every clip, one style judge per accessory. The roster gains `sockets`, `skins`, `accessories_allowed`; the variant is chosen from the board's own data at runtime. Today's plants bake an accessory into the mesh, which does not generalise.

### Portable core (item 17)

Judge, publish and world-pack adapters around a core of spec format, build, checks, contact sheets and the decision script; agent-neutral playbooks with `.claude/skills` as thin wrappers; a plain command for any scheduler. Do it inside this repo first, split when a second user exists. Capture tools still default to the macOS Chrome path and load three.js from a CDN. Before going public: a licence choice (build scripts import Blender's GPL Python API; confirm before choosing) and a clean-history publish.

## Order

Next quick wins, then items 10 and 11, then 9, then 12 and 13, then 14, then 15 and 16, then 17 and 18 (as in the epic). Item 9 follows the tapered-fin and sulk fixes on purpose.

## Not verified

No page-test on any model, no plant judged under any rule, no orchestrator run end to end, no opus judges, and 3-6 judgements per cell: enough to show the rule is unstable, not to set final thresholds. Blind identity used a static side view, not the live page.
