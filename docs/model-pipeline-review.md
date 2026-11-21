# Model pipeline review

> Updated by [model-pipeline-reaudit.md](model-pipeline-reaudit.md) (2026-11-20, after merging main's judge changes): what still holds, what main fixed, new findings, revised plan.

**Result:** the pipeline's build side is sound but its pass decision is not. Today's judge rule ships or quarantines the same model depending on which three judges it draws (sheepshead: passes 8 of 20 panels), and the reference creature fails its own bar on 18 of 20 panels. Recommended: (1) replace score bars with a categorical rule (blind identity + spec traits + major defects), (2) move the complaints judges repeat into measured checks, (3) replace "copy the closest generator" with a parts library + skeleton templates + thin species recipe, (4) split a portable core from lifeboard adapters. Nothing in this doc is implemented; it is a plan awaiting approval.

Status of this doc: research only. No tracked code changed. Numbers come from 76 fresh sonnet judgements run 2026-11-19 on existing contact sheets (details in [Experiments](#experiments)).

Terms used here that are new to the repo (to add to `models/README.md` Terms on approval): **part** (a reusable builder for one anatomical piece, e.g. fin, beak), **skeleton template** (what the repo calls an archetype: body + bones + sockets + clip scaffolding), **recipe** (a species' list of parts and parameters), **socket** (a named attach point exported with the model), **trait** (a must-have species feature listed in the spec), **identity check** (judges name the model without being told what it is), **major defect** (a flaw visible at card size, or one that spoils a main reference feature, or a clip that fails its intent), **calibration set** (stored sheets with expected verdicts), **bench** (pre-verified models held for a week that fails).

## Summary of recommendations

| Area | Today | Recommended | Main evidence |
|---|---|---|---|
| A. Generation | Three archetypes; written rule says copy closest generator per species (never used: no per-species copies exist) | Parts library + skeleton templates + species recipe; novel parts graduate into the library on ship | 54% of lines identical between two archetypes; one shared flaw (flat fins) flagged on every model |
| B. Judging | 3 judges, 1–5 scores, median per criterion, mean ≥ golden − 0.3 | Blind identity at card size + spec traits + no major defect, majority of 3; pairwise only for polish | Sheepshead passes 40% of panels; golden passes 10%; judges use only scores 2–4 |
| C. Measured checks | Size, symmetry, mouth, loops, speeds | Add card-size, eye/mouth pixels, part attachment, slab parts, feed/sulk visibility at card size, trait checks | Pipefish eye ≈ 0.5 px on the card; sulk passes motion-check yet judges call it same as idle |
| D. Orchestration | Fixed retry counts, per-piece budgets, no session cap, no resume | Route retries by failing check, session cap + order, backup species, bench, resume file | Budgets exist per piece but nothing bounds the whole weekly session |
| E. Skins/accessories | Plants bake one accessory into the mesh | Sockets + named material slots exported; accessories as separate files | Part names are lost at join today, so nothing can attach later |
| F. Public repo | One repo, Claude- and Artifact-coupled | Portable core + three adapters (judge, publish, world pack) | Table in section F; history not yet public-clean |

---

## A. Generation and reuse

### Current state

- Creature archetypes: `streamlined_swimmer`, `slender_tube`, `soft_glider` (plus `_prototype/`). Plant: `stem_bloom`. Scenery: `clump`, `solid`.
- Shared helpers in `models/shared/blender/lib.py`: `loft`, `flat_part`, `tube`, `sphere`, `eye`, `mouth`, `jaw_bone`, `mouth_corner_bones`, `mouth_weights`, `key_mouth`, rig and bake helpers.
- Written rule (creature-brief skill, `models/README.md` Terms): each species gets its own generator copied from the closest archetype. **Untested:** no per-species copy exists in the tree; all three specs build from an archetype directly.
- Measured duplication between archetypes (normalised lines, ≥ 0.8 similarity): swimmer ↔ tube 54% (60 of ~205 lines identical), swimmer ↔ glider 36%, tube ↔ glider 37%. All three define the same function set (`_dims`, `blockout`, `model`, `material`, `rig`, `_idle_pose`, `animate`, `_sulk`).
- Fins are `flat_part` with constant thickness: 0.0127 × body length on clownfish and sheepshead, 0.005–0.006 on pipefish. Judges flag "slab part" on every model, 18 of 18.
- Part names (`part:mouth`, `eyeL`…) are lost when parts are joined, so checks and future attachments cannot address a fin or tail after build.

### How an expert would do it

A technical artist building a stylised family keeps three layers apart: primitives, anatomical parts with their own rules, and a body template that owns proportions, bones and attach points. A species is then data plus, rarely, one new part. Fixes land once and every species rebuilt from the library gets them. Novelty comes from new parts and new templates, not from forked files.

### Strategy comparison

| | 1. One parametric archetype per body plan | 2. Parts library + few skeleton templates | 3. One generator per species, copied from closest (today's written rule) | 4. Fresh generator per creature |
|---|---|---|---|---|
| Variety | Low–medium: bounded by parameters; drifts to reskins | High: new combinations and new parts | High in principle | Highest |
| Quality floor | High inside the parameter range, poor outside | High: each part is proven and carries its own checks | Falls over time: every copy carries old bugs and adds new ones | Lowest: every run re-solves eyes, mouth, weights |
| Fix propagation | Good | Best: fix a part, rebuild all | None: N copies, N fixes | None |
| Authoring cost per species | Low | Low for recipe; medium when a new part is needed | Medium | High; most likely to burn the 8-build budget |
| Authoring risk (unattended) | Low | Low–medium | Medium, grows with copies | High |
| Rig and clip reuse (idle/feed/sulk) | Full | Full per template; parts bring their own bones and weights | Copied, then diverges | None |
| Lessons carry forward | In the archetype | In the part (code + check), so they are enforced | In prose only (`LESSONS.md`) | In prose only |
| Verdict | Keep as the template layer | **Recommended core** | Drop | Allowed only for a new body plan, and it must use library parts |

### Recommendation

Hybrid of 1 and 2, with 4 as a controlled exception.

| Layer | What it is | Where it comes from |
|---|---|---|
| Primitives | `loft`, `tube`, `flat_part`, `sphere`, bake, armature, skin | `lib.py`, unchanged |
| Parts | `fin` (tapered: thick at root, thin at edge), `tail` (fan, forked, lunate, rounded), `eye`, `mouth` kinds (slit, beak, tube snout, sucker), jaw and mouth-corner bones, clip blocks (idle pose, feed bite, sulk) | `lib.py` `eye`, `mouth`, `jaw_bone`, `mouth_corner_bones`, `mouth_weights`, `key_mouth` move here as-is; fin and tail are extracted from the archetypes; `_idle_pose`/`_sulk`/`animate` shared code becomes clip blocks |
| Skeleton templates | Body loft, bone chain, sockets, clip scaffolding | Today's three archetypes, slimmed by the 36–54% that moves into parts |
| Recipe | Spec field `parts: [{part, socket, params}]`, plus an optional small species hook for one new part | Replaces the copy rule |

Rules that make it work:

- Each part declares its attach surface, socket, weights and its own measured checks (taper, attachment gap). A part that passes once keeps passing.
- Part names survive to `build_meta.json` (name, type, bounding box, parent, thickness). Checks and accessories need this.
- **Novel** is redefined as "adds a new part or a new template". A new template (crab, jellyfish) is strategy 4, but must use library eyes and mouths and declare sockets. On ship, the new part or template joins the library.
- A reskin guard stops parts reuse collapsing variety: compare the new side silhouette with every roster silhouette and fail if too similar (threshold in section C).

**Parrotfish beak:** a `mouth(kind="beak")` part on the mouth socket, driven by the existing jaw bone. Not a copied generator. If the beak needs new geometry, that is one new part in a species hook, promoted on ship.

**Plants and scenery:** same answer. `stem_bloom`, `clump` and `solid` are already templates. Plant accessories become parts on per-stage sockets instead of per-species copies. Scenery needs parts too: the quarantined conch failed on its outer lip (a 38-vertex flat sheet spanning 0.615 of the shell length); a swept `shell_lip` part fixes the class, not the instance.

**Cost:** medium for extraction (rebuild the two shipped creatures and compare renders before/after), large for recipes. Tapered fin alone is small and should go first.

---

## B. Judging

### Current state

- judge-panel: 3 fresh sonnet subagents score 6 criteria 1–5 (creature), median per criterion; pass if every median ≥ 2, mean of medians ≥ 3.03 (golden 3.33 − 0.3), and `mouth_correct` true for ≥ 2 of 3. Plant: floor 3, bar 3.56. Scenery: every median ≥ 3.
- Three texts state three different rules: `models/creature/CONTRACT.md` (every median ≥ 3, mean ≥ 4), the model-verify skill (floor 3), `models/creature/qa_calibration.json` (floor 2, 3.03).
- Polish rounds keep whichever version has the higher panel mean.

### What the data says

Six fresh judges per subject on the existing sheets, today's prompt and rule. "Panels" = every way to draw 3 of the 6.

| Subject (history) | Criterion scores across 6 judges | Panel mean range | Passes today's rule |
|---|---|---|---|
| Clownfish (golden) | species 4×6, anatomy 3×6, style 4×6, artifacts 2×6, idle 3×6, feed 2,2,2,3,2,3; mouth true 3/6 | 3.00–3.17 | 2 of 20 (4 of 20 ignoring mouth) |
| Gulf pipefish (shipped) | species 4×6, anatomy 3×6, style 4×6, artifacts 2,3,3,3,3,3, idle 3,4,4,4,4,4, feed 2,3,3,3,3,3; mouth 4/6 | 3.50 | 16 of 20 (all 4 fails from `mouth_correct`) |
| Sheepshead (quarantined) | species 3,3,3,3,3,2, anatomy 3×6, style 4×6, artifacts 2,3,2,3,3,2, idle 4,4,3,3,4,4, feed 2,3,2,2,3,2; mouth 6/6 | 2.83–3.33 | **8 of 20** |
| Queen conch shell (quarantined) | reads-as 3, style 3, artifacts 2, identical ×6 | n/a | 0 (needs every median ≥ 3) |

Findings:

1. **The rule is a coin flip near the bar.** Sheepshead ships 40% of the time. The golden fails its own bar 90% of the time under fresh judges (its recorded calibration scores average 3.33; fresh judges give 3.00–3.17).
2. **More judges do not fix it.** Same rule with panels of 5: sheepshead passes 3 of 6, clownfish 0 of 6, pipefish 2 of 6 (mouth). The noise is not random scatter; it is 2-versus-3 straddles on `artifacts` and `feed` with the bar one 0.17 step away. Any panel size lands on one side or the other.
3. **Mean-of-means is worse than median-of-criteria.** It passes sheepshead on 14 of 20 panels.
4. **The scale carries little information.** Judges used only 2, 3 and 4 in 24 judgements. `anatomy` = 3 and `style` = 4 on 18 of 18 creature judgements. Floor 2 can never bind because nobody scores 1.
5. **`mouth_correct` is noise.** True on 3 of 6 for the golden and 4 of 6 for the shipped pipefish. shape-check already measures mouth position.
6. **Judges agree strongly when asked categorical questions.** Missing traits, named defects and fix lists were unanimous or near it (table below).

### Answers to the brief's questions

| Question | Answer |
|---|---|
| How many judges | 3, majority vote on yes/no questions. Escalate to 5 only when a blocking question splits 2–1. Panel size is not the problem (finding 2). |
| Median vs trimmed mean | Irrelevant once questions are categorical. For any score that remains, median per criterion; never mean-of-means (finding 3). |
| Absolute 1–5 vs pairwise vs references | Drop 1–5 as a pass bar. Use yes/no with severity for pass/fail; pairwise for "is version B better than A" (polish). Pairwise vs the golden as a bar is useless: golden preferred overall 15 of 15, including over the shipped pipefish. |
| Multiple anchors | Yes, as a calibration set with expected verdicts (one clear pass, one fixable, two fails), not as score bars. |
| Per-criterion rubrics with worked examples | Yes: each defect gets a one-line definition and the major/minor line ("visible in the card view"). Adding that line turned 18/18 "slab part" flags into a usable split (below). |
| Separate "reads as species" from "polished" | Yes. Identity = blind naming + traits. Polish = defect review. They fail for different reasons and route to different fixes. |
| Notes → fix instructions | Judges return `{part, problem, change}`; act on items named by ≥ 2 of 3. Agreement was high: sheepshead (pectoral slab, dorsal not tall, tail not forked), conch (outer lip, 5 of 5). |
| Sonnet vs opus | Stay on sonnet. With categorical questions sonnet panels agreed with each other and with ship history. No fresh opus judgements were run; one opus pass over the calibration set is a listed experiment. Per judgement: 19–30 s, 91–99k subagent tokens, of which ≈ 84k is fixed harness overhead (one-image blind judges: 84–86k, 8–13 s). |
| Is a golden scoring 2 on artifacts and feed a fit anchor | Not as a score bar. Fine as a style anchor. Its sulk also reads as idle (major, 2 of 3). Fix the golden's shared flaws rather than tune rules around them. |
| Was lowering the floor to 2 right | It made the rule consistent with the golden but removed the floor: no judge scored 1, so only the mean bar decides, and that bar sits within one step of both the golden and a quarantined model. |
| One scheme for three kinds | One structure (identity + traits + major defects), per-kind defect lists and clips. Plants add "each growth stage reads"; scenery drops motion. Plant sheets were not re-judged here. |
| Polish rounds: keep the higher mean | Noise. The same sheet's panel mean ranges 2.83–3.33 (sheepshead). Replace with pairwise old-vs-new, order alternated. Pairwise showed no order bias across 19 comparisons. |
| Calibration and drift | Weekly, before the first real judgement: one judge per calibration item (4 calls). Any flipped verdict → run the full 3 and, if still flipped, stop and report. Full re-judge when the judge model or prompt changes. |
| When a human spot-checks | First ship of a new part or template; a drift alarm; a 2–1 split that survives escalation; one shipped model a month. Same JSON form as an AI judge, so the human is just another judge. |

### Proposed pass rule

A model passes judge-panel when all three hold, each decided by 3 fresh judges:

1. **Identity.** Shown only the card-size side view with no name, ≥ 2 of 3 judges list an accepted name in their top three guesses. Accepted names come from a new spec field `identify_as` (e.g. `["conch", "queen conch"]`).
2. **Traits.** Every trait in a new spec field `traits` (must-have features, 3–5 per species) is seen by ≥ 2 of 3.
3. **No major defect.** No item on the kind's defect list is graded major by ≥ 2 of 3. Grades: none / minor (close-ups only) / major (visible in card view, or spoils a main reference feature, or a clip fails its intent).

Minor defects named by ≥ 2 of 3 feed one polish round; the new version is kept only if it wins pairwise against the old by ≥ 2 of 3 and still passes. A small script, not the orchestrating agent, reads the recorded judgements and returns the verdict. `mouth_correct` leaves the rule (shape-check owns it).

### What the rule decides on history

| Subject | History | Today's rule (fresh judges) | Blind identity (card) | Traits | Major defects (≥ 2 of 3) | Proposed verdict |
|---|---|---|---|---|---|---|
| Clownfish | Golden | Passes 2 of 20 panels | 3 of 3, first guess, confidence 5 | 4 of 4 | Sulk same as idle (2 of 3); no geometry majors | **Hold, one fix:** sulk clip (shared code, also fixes sheepshead) |
| Gulf pipefish | Shipped | Passes 16 of 20 | 3 of 3 in top three (first guess 2 of 3), confidence 2 | 5 of 5 | Slab part: tail fan a flat disc (3 of 3) | **Hold, one fix:** tail fan |
| Sheepshead | Quarantined | **Passes 8 of 20** | 0 of 3 card, 0 of 2 full size ("striped reef fish") | Tall pointed dorsal 0 of 5, forked tail 0 of 5 | Slab part (3 of 3), sulk (2 of 3) | **Fail:** identity. Fix list: dorsal, tail, pectoral |
| Queen conch shell | Quarantined | Fails | 3 of 3 name conch (shell type right) | Flared lip grown from the shell 0 of 5, stepped spire 2 of 5 | Slab part: outer lip (3 of 3) | **Fail:** lip trait + major defect |

Read honestly: the proposed rule is stricter than today's. It would not have shipped the pipefish as-is and it flags the golden. In return every verdict is the same on every draw in this sample, each fail names the part to fix, and the two "hold" cases share causes that are single library fixes (tapered fin/tail, sulk clip). Those two fixes should land **before** the rule switches, or the first weeks under the new rule will hold more than they ship.

Supporting numbers: before the severity grades were added, the yes/no defect list flagged the golden on 4–5 defects and "slab part" on 18 of 18 judgements, so yes/no alone does not discriminate; with grades, the golden has no geometry majors. A pairwise check of sheepshead against the weakest shipped model (pipefish) agreed with history: pipefish preferred overall 3 of 4, identity 4 of 4, form 4 of 4.

**Cost:** medium. About 6 judge calls per verdict instead of 3 (three of them one-image calls), offset by fewer wasted rebuilds.

---

## C. Measured checks

### Current state

- shape-check (creature): length ± 15%, long axis X, origin near centre, symmetry, mouth marker exists / at head end / within 8% length of the mouth part, mouth part exists; shared: ≤ 3 materials, no bad vertices, one armature, build record present, ≤ 4 influences, weights normalised.
- motion-check (creature): idle/feed/sulk exist, lengths, seamless loops, speed caps, no pops, feed starts and ends on idle, feed moves the mouth ≥ 5% length, sulk slower than idle, sulk posture differs ≥ 4% length, mouth corners drop ≥ 15% mouth width.
- Plant and scenery: size, origin, footprint, triangle cap, sway/tend visibility.
- Gap: nothing is measured in card pixels. The runtime shows ≈ 207 CSS px per metre on a 375 px phone, so the pipefish is ≈ 37 × 5 px with a ≈ 0.5 px eye; the clownfish ≈ 46 × 23 px with a ≈ 2 px eye.
- Gap: sulk passes "differs ≥ 4%" on models where 2 of 3 judges call it the same as idle.

### Proposed checks

All slot into shape-check or motion-check; no new gate names. "Calibrated" = threshold set from the shipped models and the calibration set, then frozen.

| Check | Judge complaint it replaces | Measure | Threshold method | False-fail risk | Needs |
|---|---|---|---|---|---|
| Card size | "Too small to read" | Bounding box in card px from spec size × runtime scale | Absolute px (start: long side ≥ 40, short side ≥ 8) | Medium for thin species (pipefish 5 px). Fix offered: spec display scale, not a rebuild | Runtime px-per-metre as a world-pack value |
| Eye and mouth size | "Eye/mouth unreadable" | Eye diameter and mouth width in card px | Absolute px (start: eye ≥ 1.5, mouth ≥ 2); stylised enlargement allowed | Medium; calibrate on pipefish (blind confidence 2) vs clownfish (5) | Build record already holds eye size |
| Fin and tail taper | "Slab part" | Edge thickness ÷ root thickness, and thickness ÷ body length, per fin part | Relative (start: edge ≤ 50% of root) | Low once fins come from the tapered part | Part records kept through build |
| Part attachment | "Floating / detached", "clipping" | Gap and penetration between each named part and its parent surface, surface-to-surface, measured before parts are joined | Relative to body length (start: gap ≤ 0.5%, sink ≤ 30% of part depth) | Low at build time. **Not reliable after join:** nearest-vertex gaps on finished low-poly meshes overlapped between good and bad models (0.005–0.029 of length) | Run at build time on named parts |
| Slab sheet | Conch lip | Large near-flat part: area ÷ vertex count and planarity, by part type | Relative, per part type (fins exempt once tapered) | Medium; leaves and blades are legitimately flat, so allow-list by type | Part type in build record |
| Feed readable | "Feed unreadable" | Mouth opening in card px at peak; bite count | Absolute px (start: ≥ 2 px change) | Low | Sample clip at keyframes |
| Sulk differs from idle | "Sulk same as idle" | Silhouette difference between sulk and idle in the card-size side view | Absolute px or % of silhouette area; replaces the 4% length rule | Low–medium | Card-size silhouette render |
| Trait checks | "Dorsal not tall", "tail not forked" | Where a trait is geometric: fin height ÷ body depth, tail fork depth ÷ tail length | Relative, from the spec's `traits` with a `measure` entry | Low for geometric traits; colour and pattern traits stay with judges | `traits` in spec |
| Reskin guard | "Same fish, new paint" | Side-silhouette overlap with each roster model, size-normalised | Relative (start: fail above 0.85 overlap) | Medium; calibrate on the three shipped body plans | Stored roster silhouettes |

Both sheepshead trait failures (dorsal height, tail fork) and the conch lip are geometric, so those two quarantines would have been caught and routed by measured checks before any judge ran.

**Cost:** medium overall; card size, eye/mouth pixels and sulk difference are small.

---

## D. Orchestration

### Current state

- Order inside weekly-visitor: biome-brief (if needed, unbudgeted) → scenery-make → visitor → season-seeds. Budgets per piece: creature 8 builds / 120 min, plant 6 / 60 per plant, scenery 5 builds per prop. No cap on the whole session.
- Retries: max 2 (3 novel). Fallbacks: simplify novel once → safe-path variant → quarantine. Polish: up to 2 rounds after a pass.
- A failed run ends with a quarantine folder and a report.

### Recommendation

| Topic | Change | Why |
|---|---|---|
| Retry routing | A table from failing check → skill step to re-enter (trait fail → model step with the named part; clip fail → animate step only; card-size fail → spec display scale, no rebuild). Same check failing twice with the same measure → fall back, don't retry. | Retries today restart too far back and spend builds |
| Session cap and order | One cap for the session. Order: biome-brief only when the habitat cannot show a visitor without it → visitor → season-seeds → scenery last. Each stage is told its share; unspent share rolls forward. | The visitor is the weekly delight; scenery is the only stage nobody misses for a week |
| Novel vs safe | Novel only when the bench has a fallback and the last two weeks shipped. Otherwise recipe-only. | Keeps variety without stacking risky weeks |
| Fallback order | Simplify (drop the novel part) → backup species chosen at brief time (different template, pre-checked spec) → bench → no visitor, loud report | "Safe-path variant of the same species" repeats the same identity failure |
| Bench | Keep 1–2 fully verified, unshipped models. A failed week ships from the bench and the report says so. | Turns a failed run into a quieter week instead of an empty one |
| Ending a failed run | Report lists: failing check with measure, judges' agreed fix list, builds and minutes used, what would be tried next, and a resume file so the next session continues instead of restarting | Today's failure output is not actionable without re-reading logs |
| Polish | One round, only for minor defects named by ≥ 2 of 3, kept only on a pairwise win | Two rounds judged by panel mean is spending builds on noise (section B) |
| Dry-run harness | `weekly-visitor --dry-run <event-json>` runs brief → build → all checks → judges against a local event file, writes under `models/out/dryrun/`, never ships or publishes | Needed to test any of the above without the live board |

Listed gaps:

| Gap | Fix |
|---|---|
| page-test cannot load an unshipped candidate | Local-only candidate hook in the test page that loads a model from `models/out/<id>/` |
| Frame rate reads wrong when the browser pane is hidden | Record "not measured" when the page is hidden; measure in a headless browser when one is present |
| QA output location varies | Always `models/out/<id>/qa/`; verify refuses other paths |
| Stale pass-rule text | Numbers live only in `qa_calibration.json`; other docs point to it; a check fails on rule numbers elsewhere |
| No golden anchor on a fresh clone | Track the calibration set's sheets (small images) under `models/<kind>/calibration/` |
| Failed specs sit beside shipped ones | Move quarantined specs out of `specs/` (sheepshead and conch are there today) |
| Per-piece ledger not enforced | verify and ship refuse without an open ledger entry for that piece |

**Cost:** retry table, QA path, rule-text check, spec move are small. Session cap, backup species, resume file and dry-run harness are medium. Bench is medium and depends on a reliable pass rule.

---

## E. Skins and accessories (design only)

### Current state

Plant specs may carry `accessory {item, why, stage_from, attach}`; the generator bakes it into the stage meshes as `s<n>_acc_*`; the fallback drops it. Creatures and scenery have nothing equivalent. One baked texture per model, up to 3 materials.

### Design

| Piece | Design | Notes |
|---|---|---|
| Sockets | Named empties exported in the glb: `head`, `back`, `tail` for creatures; one per growth stage for plants. Each parented to a bone, with a reference scale so one accessory fits many bodies. | The `mouth` empty already works this way |
| Skins | Named material slots (`body`, `accent`, `eye`) and a texture per skin; runtime swaps the texture. Same UVs, so no rebuild. | Requires the bake to be repeatable from the recipe |
| Accessories | Separate small glb files authored against a normalised socket, attached at runtime. Baked-in only where the accessory must deform with the body. | Separate files give N bodies × M accessories without N × M builds |
| Verification | Per body × accessory pair, measured: bounding volumes do not intersect the body beyond a set depth at sampled frames of every clip; size within a fraction of body length. One judge pass per accessory (style), not per pair. | Clipping must be checked in every animation; that is cheap only if measured |
| Roster and runtime | Roster entry gains `sockets`, `skins`, `accessories_allowed`. The variant in use is chosen from the board's own data at runtime, not baked into the roster. | Keeps owner data out of the repo |

| | Pros | Cons |
|---|---|---|
| Separate accessory files + sockets | Combinatorial variety, tiny builds, rewards without new creatures | Runtime attach code; pair checks; cannot deform |
| Texture-swap skins | Nearly free variety | Colour-only; a skin cannot change identity traits |
| Baked-in (today's plants) | Simple, deforms correctly | One build per variant; fallback loses it; cannot be earned later |

Generalising the plant approach: the spec shape (`item`, `why`, `stage_from`, `attach`) carries over well; `attach` becomes a socket name. The baked-in implementation does not generalise.

Which A–D choices matter: parts with kept names, sockets on templates and repeatable bakes (section A) make this cheap. Staying with copied generators forces a rewrite, because every species file would need sockets added by hand and nothing guarantees the names match.

**Cost:** not planned here. Blocked by plan items 11, 14 and 16.

---

## F. Public repo or plugin

### Portable vs coupled

| Piece | Portable as-is | Coupled to | Adapter or change |
|---|---|---|---|
| Spec format, `check_spec.py` | Mostly | Game fields in specs (rarity, biome/phase; plant `plot`, `gen`, habit) | Core spec + optional `app` block the core ignores |
| `lib.py`, `build.py`, archetypes | Yes | Blender ≥ 5.3 only | None |
| shape-check, motion-check, export-check | Yes | Blender, gltf-transform 4, Node ≥ 20 | None |
| Contact-sheet render, `verify.sh` | Yes | ImageMagick | None |
| judge-panel | No | Claude subagents, `judge_model`, agent ids in the ledger | **Judge adapter:** takes images + prompt, returns the judgement JSON. Implementations: Claude subagent, any vision API, human form |
| Verdict | No (the agent does the arithmetic) | Whoever runs the skill | Decision script in core |
| Run ledger | Mostly | Agent ids as proof a judge ran | Store judge id + provider + prompt hash |
| page-test | No | The lifeboard page, built-in browser pane, `.claude/launch.json` | Minimal viewer page in core + headless browser run; lifeboard page test stays in the app adapter |
| Ship step | No | Artifact publish, roster as base64 JS, `models/assets/` | **Publish adapter:** default writes files + roster JSON; Artifact publishing is lifeboard's |
| Triggers and game state | No | Board db (`checks/game_status`, `checks/profile`), `garden.needs` | Core takes an event JSON (what to make, constraints); lifeboard's adapter builds it from the db |
| Style, biomes, goldens | No | `STYLE.md`, `biomes.json`, `habitat.js` placement, calibration set | **World pack:** style text, biome list, calibration sheets, px-per-metre, kinds enabled |
| Skills | No | `.claude/skills` format, sonnet subagent rule | Agent-neutral playbooks (plain markdown steps + commands); `.claude/skills` become thin wrappers; equivalents for other agents point at the same playbooks |
| Scheduling | No | Claude scheduled-task template | Document a plain command a cron or any scheduler can call |
| `doctor.sh` | Partly | Homebrew, a macOS-only extensions path | OS-neutral checks; install hints per OS; add the Node ≥ 20 check |
| three.js r170 from CDN | Yes | Network at view time | Fine; pin stays |
| Blender MCP | Optional already | — | Keep optional |

### Public-safety check (run 2026-11-19)

| Check | Result |
|---|---|
| `public-check.sh` on tracked files | Clean |
| `public-check.sh --history` | **Not clean:** one early commit carries home-directory scratch paths in prototype scripts; commit authors include personal email addresses |
| Tracked specs and roster | Species, sizes, colours, biome names only; no owner data found |
| `_prototype/clownfish_prototype.blend` (135 KB binary) | No home paths in its strings; still an opaque binary worth dropping or regenerating before going public |
| Licence | No `LICENSE` file |

Consequences: publish from a fresh squashed history, per the "Public-safe repos" rule. Pick a licence before then. Note for that choice (not legal advice): the build scripts import Blender's Python API, which is GPL; the common position is that such scripts are GPL-compatible or GPL, while generated models are the author's own output and can carry a separate licence. Worth confirming before choosing.

### Recommendation

| | Pros | Cons |
|---|---|---|
| Core + adapters in this repo first (`models/` core, lifeboard adapter beside it) | No sync problem; lifeboard keeps working; boundary proven by use | Not installable alone yet |
| Separate public repo now | Clean for outsiders | Two copies drift (the live-vs-template problem again, one level up); every fix lands twice |
| Plugin for one agent | Easy install for that agent | Fails the portability goal |

Go core-plus-adapters inside this repo, then split when a second user exists. Other trade-offs:

- **Judge quality across providers:** the categorical rule transfers better than score bars because it does not depend on one model's scale. Each provider still needs the calibration set to agree before its verdicts count; the run refuses to ship otherwise.
- **Reproducibility:** builds are deterministic from spec + library version. Judges are not; the ledger stores prompts, images and answers so a verdict can be replayed.
- **Unattended safety defaults for a public version:** no publishing, no commits to a default branch, budgets enforced by the ledger, Blender run with factory settings and no network, output confined to `models/out/`.
- **Maintenance:** adapters are the only lifeboard-specific surface, which keeps the live-vs-template rule in `AGENTS.md` unchanged for the app.

**Minimum first public version:** core build + measured checks + contact sheets + decision script + human judge adapter + file publish + one world pack (the reef) with its calibration sheets + OS-neutral doctor + licence + clean history. **Can wait:** other AI judge adapters, the scheduler docs, bench, skins and accessories, plant and scenery kinds beyond what the reef pack needs.

**Cost:** large, mostly in the judge and event adapters and the playbook rewrite.

---

## Prioritised plan

Effect columns: ↑ helps, — neutral. "Blocks" = this item must land before skins/accessories (S) or the public split (P). Sizes are estimates.

### Quick wins

| # | Item | Files | Verified by | Ship rate | Quality | Portability | Blocks |
|---|---|---|---|---|---|---|---|
| 1 | One source for pass-rule numbers; other texts point to it; check that fails on stray rule numbers | `models/creature/CONTRACT.md`, `.claude/skills/model-verify/SKILL.md`, `models/README.md`, `models/*/qa_calibration.json`, new check in `models/shared/tools/` | Check passes; grep shows one definition | ↑ | — | ↑ | P |
| 2 | Decision script: recorded judgements → verdict | New `models/shared/tools/` script, `ledger.py`, model-verify skill | Replays the 76 recorded judgements and reproduces this doc's tables | ↑ | ↑ | ↑ | P |
| 3 | Drop `mouth_correct` from the judge rule | Judge prompt, calibration files, decision script | Pipefish false fails 4 of 20 → 0 on replay | ↑ | — | — | |
| 4 | Tapered fin and tail in the library; rebuild clownfish and pipefish | `models/shared/blender/lib.py`, three creature archetypes | Taper measure; defect review on pipefish tail fan drops below 2 of 3 major | ↑ | ↑ | — | |
| 5 | Sulk that differs at card size; card-size sulk check replaces the 4% rule | Creature archetypes (`_sulk`), `models/creature/qa.py` | motion-check; clownfish and sheepshead sulk no longer major | ↑ | ↑ | — | |
| 6 | Card-size view first on the contact sheet | `models/shared/blender/qa_render.py`, `verify.sh` | Sheet shows the view; judges cite it | — | ↑ | — | |
| 7 | Housekeeping: fixed QA path, "not measured" frame rate when hidden, Node ≥ 20 in doctor, quarantined specs out of `specs/`, calibration key renamed off its numbered gate code | `verify.sh`, `doctor.sh`, model-verify skill, `models/*/specs/`, `qa_calibration.json` | doctor; verify refuses a wrong path | ↑ | — | ↑ | |
| 8 | Track calibration sheets for fresh clones | `models/<kind>/calibration/` | Fresh clone runs judge-panel without the main checkout's `models/out/` | ↑ | — | ↑ | P |

### Medium

| # | Item | Files | Verified by | Ship rate | Quality | Portability | Blocks |
|---|---|---|---|---|---|---|---|
| 9 | New judge rule: blind identity + traits + major defects; spec gains `identify_as`, `traits`; weekly drift check | Judge prompts, `check_spec.py`, specs, calibration files, model-verify skill, `CONTRACT.md` per kind | Calibration set returns expected verdicts on 3 separate draws | ↑ (after 4, 5) | ↑↑ | ↑ | P |
| 10 | Measured checks from section C | `models/*/qa.py`, `qa_structural.py`, `build.py` | Each check run on shipped + quarantined models; thresholds frozen from results; sheepshead and conch fail on the right check | ↑ | ↑↑ | ↑ | |
| 11 | Part records kept through build (name, type, box, parent, thickness) | `lib.py` `finalize`, `build.py`, build record | Record lists every part for all rebuilt models | — | ↑ | — | **S** |
| 12 | Orchestration: retry table, session cap and order, backup species, one-round pairwise polish, resume file, useful failure report | weekly-visitor, season-seeds, scenery-make skills, `ledger.py` | Dry run of a forced failure at each check lands on the right step and stays inside the cap | ↑↑ | — | — | |
| 13 | Dry-run harness incl. candidate hook for page-test | weekly-visitor skill, `test.html` hook, `models/out/dryrun/` | Three simulated weeks from `node sim/run.js 1 28 --visitors=steady:1000` complete without touching roster or live board | ↑ | — | ↑ | P |
| 14 | Extract shared archetype code into parts + template base | Creature archetypes, new parts module | Rebuild shipped creatures; checks pass; pairwise judges see "same" or better | — | ↑ | ↑ | **S** |

### Big bets

| # | Item | Files | Verified by | Ship rate | Quality | Portability | Blocks |
|---|---|---|---|---|---|---|---|
| 15 | Recipe-driven species; novel parts graduate; copy rule removed; beak part as first test | Specs, `check_spec.py`, creature-brief skill, parts module, `models/README.md` | A parrotfish built from recipe + beak part passes the new rule inside budget | ↑ | ↑↑ (variety) | ↑ | S |
| 16 | Sockets and named material slots exported | Templates, `export_glb`, roster format, runtime loader | Glb lists sockets; a test accessory attaches in the viewer | — | — | — | **S** |
| 17 | Portable core + adapters (judge, publish, world pack), agent-neutral playbooks, minimal viewer, licence, clean history | Repo layout under `models/`, skills, `doctor.sh`, new `LICENSE` | Fresh clone on a second machine and a non-Claude agent builds and verifies the reef pack with the human judge | — | — | ↑↑ | **P** |
| 18 | Bench of pre-verified models | Roster format, weekly-visitor | A forced-fail dry run ships from the bench | ↑↑ | — | — | |

Suggested order: 1–8 → 10, 11 → 9 → 12, 13 → 14 → 15, 16 → 17, 18. Item 9 goes after 4 and 5 on purpose (see section B).

---

## Experiments

### Run for this review

All judges were fresh sonnet subagents, one per judgement, each recorded with `ledger.py` under a dry-run id (`dry-<subject>-2026-11-19`). Inputs: existing contact sheets from the main checkout's `models/out/`. Outputs, prompts and raw answers: `models/out/dryrun/judge-exp/` in this worktree (gitignored).

| Experiment | Judgements | Question | Result |
|---|---|---|---|
| Today's rule, 6 judges × 4 subjects | 24 | How stable is the current verdict | Sheepshead passes 8 of 20 panels; golden 2 of 20; pipefish 16 of 20; conch 0. Panels of 5 no better |
| Yes/no defects + traits + pairwise vs golden | 18 | Do categorical questions agree | Traits and fix lists near-unanimous; yes/no defects flag everything (slab 18 of 18); golden preferred 15 of 15, no order bias |
| Blind identity, card and full size | 18 | Can a judge name it unprompted | Clownfish 3 of 3; pipefish 3 of 3 in top three; sheepshead 0 of 5; conch 5 of 5 |
| Defect severity | 12 | Does a major/minor line discriminate | Yes: golden has no geometry majors; pipefish tail, sheepshead fins, conch lip major 3 of 3 |
| Pairwise vs weakest shipped | 4 | Is a floor anchor usable | Pipefish over sheepshead overall 3 of 4, identity 4 of 4 |
| Part measures on existing glb files | — | Which complaints are measurable | Fin thickness, card pixels, conch lip measurable; attachment not reliable after join |

### Not run, and why

| Experiment | Why not | Cost to run |
|---|---|---|
| Three simulated weeks through `weekly-visitor --dry-run` | Not cheap: each week is a real brief plus up to 8 Blender builds, and the harness cannot yet page-test an unshipped model (plan item 13) | Up to 3 × the creature budget; run after item 13 |
| Opus over the calibration set | Brief set sonnet as the judge; opus numbers were context only | 12–24 judgements |
| Plant sheets under the new rule | Only one plant spec exists; no quarantined plant to contrast | 6–9 judgements |
| Measured-check thresholds on rebuilt models | Needs part records (item 11) | Part of item 10 |

### Limits of these numbers

- 3–6 judgements per cell. Enough to show the instability of the current rule; not enough to set final thresholds.
- Trait lists were written by hand from each spec's reference text; the brief step would write them in future.
- Blind tests used a static side view on a flat background, not the live page.
- Ground truth is ship/quarantine history only; no human labels beyond that.
- The golden was judged without an anchor sheet (it is the anchor), so its scores are not strictly like-for-like with the others.

---

## Renames and doc updates this plan needs

No gate is renamed. Proposed checks join shape-check or motion-check; judge-panel keeps its name with two parts (identity, defect review).

| Change | `models/README.md` Terms | `models/PIPELINE.md` |
|---|---|---|
| New terms: part, skeleton template, recipe, socket, trait, identity check, major defect, calibration set, bench | Add each with a one-line definition | Add parts and recipe to the build stage; add calibration check before judge-panel; add bench to the failure path |
| "Archetype" kept, defined as the code for a skeleton template | Edit the Archetype and Body plan entries | Label unchanged |
| "Safe path / novel path": novel = adds a new part or template; copy-per-species wording removed | Rewrite the entry | Update the fallback branch (simplify → backup species → bench) |
| "Golden" → style anchor and one member of the calibration set; no score bar | Rewrite the entry | Update the judge-panel row |
| "Polish round": one round, pairwise | Rewrite the entry | Update the loop |
| Gates list | Drop the "formerly" numbered-code notes once the calibration key is renamed | — |
| Optional, job-named files: contact-sheet renderer, shape/motion check runner, per-kind check module | Update paths in Docs and Gates sections | Update the tool column |
