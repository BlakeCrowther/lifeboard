# Model pipeline re-audit (after merging main)

**Result:** main's judge work fixed the plumbing (judge notes kept across rounds, fixes tagged by criterion, scenery judged in the real habitat, polish snapshots, plan gating) but not the core problem: **the pass decision still depends on which judges you draw.** Fresh panels on the merged tree: the shipped drift algae mat passes **4 of 20**; the rebuilt pipefish passes 20 of 20 only because the creature floor is 2 (its feed median is 2; at floor 3 it passes 0 of 20). New: the ledger lets an agent add judges to the same build for free and counts the latest 3, so on the drift mat the first 3 judges fail it and the last 3 pass it. Judges still agree almost perfectly on *what* is wrong (6 of 6 on the top defect of every subject) while their scores straddle the thresholds. So the review's main recommendation stands and gets stronger: categorical rule (identity + traits + major defects), now for scenery too.

Where things stand: branch `claude/lifeboard-3d-pipeline-review-8d6388` = main (`46efc10`) + quick wins 1–8, merged and uncommitted. Nothing committed or pushed. This doc updates [model-pipeline-review.md](model-pipeline-review.md) (the original, still the reference for detail); tracked by [epic lifeboard#28: model pipeline: reliable judging, measured checks, parts library, portable core](https://github.com/BlakeCrowther/lifeboard/issues/28).

## 1. What main changed that matters here

| PR | Change | Effect on the review |
|---|---|---|
| [PR lifeboard#32: judge scenery in the real habitat, keep judge notes across rounds](https://github.com/BlakeCrowther/lifeboard/pull/32) | `ledger.py judge --reply` stores each judge's JSON; fixes tagged `{criterion, fix}`, "placement" routed to habitat.js; `ledger.py notes/plan/best`; build refuses without a plan (exit 6); passing builds snapshotted; budget = 4 judge rounds + 30 min; `preflight.sh`; scenery judged on headless habitat captures (`capture_habitat.mjs`); shader sway; new `tangle.py` archetype | Fixes "notes → fix instructions" plumbing, polish keep-better, scenery candidate hook, scenery card-size view. Does **not** change pass-rule numbers or scoring |
| [PR lifeboard#36: creatures rest like their real animal](https://github.com/BlakeCrowther/lifeboard/pull/36) | `spec.rest`, `perch` clip, `watch_creatures.mjs` (headless state log); habitat.js reads `perch*` nodes on scenery as grip points | A headless browser path now exists for page-test/fps. `perch*` nodes = a socket reader already waiting (no scenery builder emits them yet) |
| [PR lifeboard#34: add pnpm verify with headless ui smoke check](https://github.com/BlakeCrowther/lifeboard/pull/34) | `pnpm verify` | One command for app checks; model gates still outside it |

## 2. Quick wins 1–8 after the merge

| # | Quick win | Status | Merge note |
|---|---|---|---|
| 1 | One source for pass-rule numbers (`<kind>/qa_calibration.json` `pass_rule`) + `check_judge_rule.py` | Kept, extended | Main had added a 4th rule copy (ledger: floor 3 only, no bar, `--floor`). Ledger now calls `judge_verdict`; `--floor` removed |
| 2 | Decision script `judge_verdict.py` | Kept, adapted | Reads main's `reply` field. My word-overlap fix grouping replaced by main's criterion tags. Self-test now also asserts ledger `best` agrees with it (main's ledger passed all-3s, which the creature bar 3.03 fails) |
| 3 | `mouth_correct` out of the rule | Kept | |
| 4 | Tapered fins | Kept | Pipefish "tail fan is a flat slab" went from 3 of 3 major to 0 of 6 mentions |
| 5 | Card-size sulk check | Kept | Pipefish sulk 74% silhouette change; judges: sulk "reads clearly", none call it idle. Merged with main's `perch` row in creature CONTRACT |
| 6 | Card-size row first on contact sheet | Kept | Scenery: main's habitat images come first, contact second |
| 7 | Housekeeping (QA path, fps "not measured", Node check, quarantined specs, calibration key) | Kept, adapted | verify path rule widened to allow main's `out/<id>/preview/` (preflight) |
| 8 | Calibration sheets tracked | Kept, refreshed | Scenery sheet re-rendered after main's shader-sway rebuild; added the golden's `habitat_wide.png` as the scenery anchor |
| — | Superseded by main | Dropped | My `ledger --scores`, word-overlap grouping, `--floor` |

## 3. Fresh judging, 2026-11-20

18 fresh sonnet judges, 6 per subject, today's prompts and merged rule, recorded in run ledgers `reaudit-<id>-2026-11-20` (gitignored). "Panels" = all 20 ways to draw 3 of the 6.

| Subject | Judged on | Scores across 6 judges | Panels pass | Decided by |
|---|---|---|---|---|
| Eelgrass tuft (scenery golden) | Merged-code build; habitat captures; no anchor | reads 4×6 · style 3,3,4,4,4,4 · artifacts 3×6 · sway 2,3,3,3,3,3 | **20 of 20** (mean 3.25–3.5) | Comfortably above floor 3 |
| Drift algae mat (scenery, **shipped**; glb identical to `assets/`) | Habitat captures (blight murk); eelgrass anchor | reads 3×6 · style 3×6 · artifacts **2,2,2,2,3,3** · sway 3×6 | **4 of 20** | Coin flip on the artifacts floor |
| Gulf pipefish (creature) | Rebuilt from merged code; contact + turntable + motion; clownfish anchor | species 3,4,4,4,4,4 · anatomy 3×6 · style 3,4,4,4,4,4 · artifacts 2,3,3,3,3,4 · idle 3×6 · feed **2,2,2,2,2,3** | **20 of 20** (mean 3.17, bar 3.03) | Floor 2. At floor 3: **0 of 20** |

What the judges named (free text, unprompted), vs how they scored:

| Subject | Defect named | Judges | Score on that criterion |
|---|---|---|---|
| Drift mat | Dark base disc reads as a plate under the heap | **6 of 6** | artifacts split 2/3 |
| Drift mat | Straight rigid stick stems, reads as twig pile or nest | 6 of 6 | reads_as/style 3 |
| Pipefish | Dorsal fin an oversized sail/dome (reference: tiny) | **6 of 6** | anatomy 3 |
| Pipefish | Card size is a 37×5 px smear; bands and snout lost | 6 of 6 | species 4 |
| Pipefish | Feed beats (tuck, flick, sips) unreadable | 6 of 6 | feed 2 |
| Pipefish | Dark blobs at snout tip in idle/feed frames | 6 of 6 | artifacts 2–4 |
| Pipefish | Bulbous head, abrupt step to thin body | 6 of 6 | anatomy 3 |
| Eelgrass | Sway too small at game distance | 6 of 6 | sway 3 (one 2) |
| Both scenery | Copies look stamped / identical (placement) | **12 of 12** | (routed to habitat.js) |

Scale use: 84 scores, every one a 2, 3 or 4.

## 4. Original findings: then vs now

| Original finding | Now | Evidence |
|---|---|---|
| B1 Rule is a coin flip near the bar | **Holds, wider:** also at the floor, also for scenery | Drift mat 4 of 20 on floor 3. Pipefish is stable only because floor 2 never binds |
| B2 More judges don't fix it | Holds | Drift splits 4–2 on artifacts; any panel size lands either side |
| B3 Mean-of-means worse | Moot for verdict; **holds for polish** | `ledger best` still picks by panel mean (noise ±0.25 on one sheet) |
| B4 Scale carries little information | Holds | 84 of 84 scores in 2–4 |
| B5 `mouth_correct` is noise | **Fixed** (quick win 3) | |
| B6 Judges agree on categorical questions | **Holds, stronger** | Section 3: top defect 6 of 6 for every subject |
| Three texts, three rules | **Fixed** (quick win 1 + merge) | Main had a 4th copy in ledger; now one rule, self-test guards it |
| Polish keeps higher mean | Partly fixed by main | Snapshots + plan gating good; choice still by mean |
| Notes → fix instructions | **Fixed by main** (plumbing) | Remaining: no "≥ 2 of 3 agree" filter; `plan` accepts any tied-lowest criterion (drift: all four tied at 3) |
| Golden as a score bar | Holds, plus anchor drift | Eelgrass `golden_medians` artifacts 4 came from one panel; 6 of 6 fresh judges say 3. Clownfish golden 3.00 sits under its own bar 3.03 |
| C card size unmeasured | Holds | Pipefish 37×5.4 px; no gate |
| C sulk differs at card size | **Fixed** (quick win 5) | |
| C part attachment unmeasured | Holds | Pipefish snout-tip blobs 6/6, "floating pectoral discs" 1/6; eelgrass detached base blades 3/6 |
| C slab parts | Fixed for fins (quick win 4); **new instance in scenery** | Drift stems are untapered straight tubes: same primitive flaw, new kind |
| D no session cap / retry table / backup / bench / resume | Holds | Main bounded each piece (4 rounds + 30 min), not the session |
| D page-test can't load a candidate | **Fixed for scenery** (`capture.html` + `inspect_src`); holds for creatures | `?visitor=` still loads shipped only |
| D fps wrong when pane hidden | Half fixed | Headless Chrome tools exist (`watch_creatures.mjs`, ui-smoke); not wired into page-test |
| A copy-closest-generator rule | Holds, drifting the other way | scenery-make now writes a new archetype per piece (`tangle.py`) |
| E sockets | Unchanged; a reader exists | habitat.js already grips `perch*` nodes |
| F portability | Holds, one new item | Capture tools default to the macOS Chrome path and need network (three.js from jsdelivr) |

## 5. New findings

1. **Judge shopping is possible.** `ledger.py judge` refuses only a reused agent id. Judge rounds count distinct builds (`_rounds`), so judges 4, 5, 6 on one build cost nothing, and `judge_verdict`/`notes`/`best` use the latest 3 usable replies. Drift mat: judges 1–3 → FAIL (artifacts 2,2,2); judges 4–6 → PASS. The skill tells agents to "spawn fresh judges" on exit 2 (meant for malformed replies), so the path is documented, not hypothetical.
2. **`ledger notes` header misleads.** It prints "build 1: 6 judges, mean 3.0, PASS" when the verdict used only the latest 3; all 6 would give artifacts median 2 and FAIL.
3. **The creature pass rests on floor 2.** Pipefish feed median 2 on 5 of 6 judges. The floor was lowered because the golden scores 2 on artifacts and feed; so any creature as weak as the golden on feed ships.
4. **Rebuilt pipefish scores lower than the shipped one** (mean 3.50 on 2026-11-19 → 3.17; idle 4s → 3s, feed 3s → 2s). Between the two: tapered fins + new sulk, card-size row first on the sheet, main's prompt. Not separated (would need the old glb on the new sheet). Likely the card row: 6 of 6 judges cite the 37×5 px smear.
5. **sway-check passes what judges call too small.** Eelgrass peak frame change 0.0141 (min 0.008) and drift 0.0334, yet 6 of 6 eelgrass judges and most drift judges call the sway too subtle at game distance.
6. **Prop placement repeats.** `habitat.js` `placeProps` varies yaw and uniform scale (0.85–1.15) only. Ground cover in the same file already varies tilt, height and tint per instance. No same-kind minimum spacing, no keep-clear between prop kinds (2 of 6 drift judges saw eelgrass blades through the mat).
7. **Cost:** each judgement ~95k subagent tokens and 15–23 s, as before.

## 6. Revised plan

### Next quick wins

| # | Item | Files | Verified by |
|---|---|---|---|
| Q1 | Cap usable judges per build at `pass_rule.judges` (ledger refuses extras; malformed replies don't count); `notes` header names the judges that decided | `ledger.py`, `test_judge_verdict.py`, model-verify skill | Self-test: 4th usable judge refused; replay drift run |
| Q2 | Prop placement variety: per-copy lean, height stretch, tint jitter, same-kind spacing, keep-clear between prop kinds (copy ground cover's approach) | `habitat.js`, `models/biomes.json` ranges | Re-capture eelgrass + drift; fresh judges' placement notes below 2 of 3. Runtime only, no rebuild; publish flow per AGENTS.md |
| Q3 | Card-size footprint gate (short side ≥ 8 px from `card_view.json`); fail routes to spec display scale | creature `qa.py`, creature-brief skill | Pipefish (5.4 px) fails, clownfish passes |
| Q4 | Goldens judged by ≥ 6 judges, medians stored with per-judge scores; rewrite eelgrass from today's 6 (4,4,3,3) | `scenery/qa_calibration.json`, model-verify skill note | `check_judge_rule.py`; anchor matches fresh panels |
| Q5 | Trace pipefish snout-tip blobs (6 of 6) before it ships again | creature archetype mouth/jaw parts | Onion-skin frames clean; fresh judges stop naming it |
| Q6 | Fix the shipped drift mat's base disc (6 of 6) or pull it from the roster | drift spec / `tangle.py` | Fresh panels pass ≥ 18 of 20, or categorical rule passes |

### Medium (order changed)

| # | Item | Change since the review |
|---|---|---|
| 9 | Categorical judge rule (identity + traits + major defects) | **Move up, include scenery.** Drift mat's 6-of-6 "base disc" would fail every draw with a named fix, instead of 20% passing |
| 10 | Measured checks | Add: scenery ground contact (no plate under the prop), sway amplitude calibrated to judges (finding 5) |
| 12 | Orchestration | Main did per-piece budget, plan gating, snapshots. Left: session cap, retry table, backup species, bench, resume, pairwise polish |
| 13 | Dry-run harness + creature candidate hook | Reuse main's `capture.html` + `inspect_src` pattern for creatures |
| 11, 14 | Part records; parts + template base | Add a tapered/curved tube part for scenery stems instead of one archetype per piece |

Big bets 15–18 unchanged; 17 (portable core) gains "capture tools: Chrome path from doctor, vendored three.js".

Suggested order: Q1 → Q2, Q3, Q5 → Q4 → 9 (with 10) → Q6 under the new rule → 12, 13 → 14 → 15–18.

## 7. Verified and not

| Check | Result |
|---|---|
| `pnpm verify` (syntax, game rules vs SPEC, sim, UI smoke, doc frontmatter) | PASS |
| `node tools/spec-check.js` | ok, 36 rules |
| `doctor.sh` | 10 ok, 0 failing |
| `test_judge_verdict.py` (incl. ledger agreement), `check_judge_rule.py`, `py_compile` on all model scripts | ok |
| `public-check.sh` (tracked files) | clean |
| Merged-code builds + automated gates: gulf_pipefish, eelgrass_tuft | PASS |
| Habitat capture: eelgrass, drift mat | OK (sway-check PASS) |
| **Not run:** page-test on any model; any plant build or judging; `public-check --history`; old pipefish glb on the new sheet (finding 4); opus judges; any orchestrator end to end (weekly-visitor, scenery-make, season-seeds) | — |

Backups of the pre-merge work: stash `quickwins-premerge-8d6388-20261120` (applied, kept) and a patch + tarball in the session scratchpad.

## 8. Decisions for you

1. Commit the merged quick wins and open the PR? (Still open from before the merge.)
2. Start with Q1 (judge cap) + Q2 (placement variety)?
3. Drift mat: fix now (Q6) or wait for the categorical rule?
