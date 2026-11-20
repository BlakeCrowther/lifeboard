# Model pipeline (creatures + plants)

Autonomous pipelines that design, build, animate, verify and ship 3D models for lifeboard, with no human in the loop. Two **kinds** share one toolchain: **creatures** (weekly reef/habitat visitors) and **plants** (one species per garden plant, made weekly for the plots that need one; rare ones get a habit accessory; first archetype `stem_bloom`). A model ships only after every gate passes; otherwise the run falls back to a safe variant or ships nothing.

## Terms
- **Kind**: what sort of model: `creature` (an animal that visits the habitat), `plant` (one garden plant: a habit's plot, generation `gen`) or `scenery` (one backdrop prop a biome places many times: a grass tuft, a shell; skill `scenery-make`). Each kind has its own contract, QA and archetypes under `models/<kind>/`.
- **Creature**: one species that visits, e.g. the clownfish or the Gulf pipefish. Its **spec** (`creature/specs/<id>.json`) is the design: species reference, size, palette, pattern, motion personality, lore. One spec → one shipped `.glb` with `idle`, `feed` and `sulk` animations.
- **Body plan**: the anatomy a species is built on, independent of species or biome: "torpedo body + fins + tail", "soft slug on a foot", "pencil-thin tube with a snout", "eight arms", "shell + four flippers". Many species share a body plan (clownfish, tuna and sheepshead are all torpedo swimmers).
- **Archetype**: the code that builds one body plan: a parametric Python generator in `<kind>/archetypes/<name>.py` (`model`, `material`, `rig`, `animate`). A spec picks an archetype and fills in its parameters. Archetype = body plan in code; creature = one species built with it. Each shipped creature gets its own generator (`archetypes/<id>.py`, copied from the closest one and edited to add its traits, e.g. a beak), so the library grows by one per creature; shared pieces live in `shared/blender/lib.py`.
- **Safe path / novel path**: safe starts from an existing archetype (copied per species); novel writes a generator for a body plan the library lacks. creature-brief prefers novel (variety), and a shipped novel archetype joins the library.
- **Biome**: a habitat stage in `biomes.json` (name, medium, look, owned motifs). Creatures are briefed for the current biome.
- **Gates**: the six checks every model must pass to ship, listed under "Gates" below.
- **Golden**: the reference creature (today the clownfish) whose judge scores set the judge-panel bar (`creature/qa_calibration.json`).
- **Polish round**: after a judge-panel pass, the run fixes the judges' shared notes, rebuilds and re-judges, shipping the better-scoring version.
- **Roster**: `roster.json`, every shipped model. **Quarantine**: `out/quarantine/<id>/`, failed attempts kept for inspection.

```
models/
  README.md  STYLE.md (shared style lock)  biomes.json  roster.json (every shipped model, with kind)
  assets/    shipped <id>.glb + <id>-glb.js            out/  local work dir (gitignored): builds, QA, runs/, quarantine
  shared/blender/  lib.py  build.py  qa_structural.py (shared gates)  qa_render.py
  shared/tools/    doctor.sh  verify.sh  check_spec.py  optimize.sh  ledger.py
  creature/  CONTRACT.md  archetypes/  specs/  qa.py (creature gates)  qa_calibration.json (golden judge scores)
  plant/     CONTRACT.md  archetypes/stem_bloom.py  specs/mermaids_cup.json  qa.py (plant gates)
  scenery/   CONTRACT.md  archetypes/{clump,solid}.py  specs/  qa.py (scenery gates)
```

Every spec has `kind` (`creature` default | `plant`). Shared code dispatches on it: `build.py` loads `models/<kind>/archetypes/<archetype>.py`; `qa_structural.py` runs the shared gates (tris, materials, texture, NaN, armature, weights, eye meta, rest-pose bbox) and then `models/<kind>/qa.py` (creature: body-plan axes/symmetry, mouth, idle/feed/reach; plant: soil origin, stage nodes, sway/tend); `check_spec.py` and `verify.sh` likewise.

Skills (`.claude/skills/`), shared steps reused by every kind, kind steps isolated:
```
shared:   lifeboard-setup · model-build · model-verify · model-ship
creature: weekly-visitor (orchestrator) → creature-brief → model-build → creature-animate → model-verify → model-ship
plant:    season-seeds (orchestrator) → plant-brief → model-build → plant-grow → model-verify → model-ship
```
Each step is its own skill, so steps can be re-run alone (e.g. re-animate without re-modeling).

## Gates

Six gates a model must pass to ship (names appear in `report.json`, `qa/*.json`, skills and logs). The first four are code (`shared/tools/verify.sh`); the last two are run by `model-verify`.

- **spec-check** (formerly G1): design file valid (`shared/tools/check_spec.py`).
- **shape-check** (formerly G2): mesh, rig, size, rest pose.
- **motion-check** (formerly G3): animation measured by code (loops, speed, amplitude, pops).
- **export-check** (formerly G4): glb valid and small, measured on the optimized file.
- **judge-panel** (formerly G5): 3 fresh AI judges view renders, median vs the golden.
- **page-test** (formerly G6): runs in the real habitat page.

Shape-check and motion-check share one output file, `qa/shape-motion-check.json`.

## Docs
- `creature/CONTRACT.md`, `plant/CONTRACT.md`: what each kind's file must contain so the runtime can use it (axes, scale, node names, animation names, loop rules, budgets). Shared rules live in the creature contract + `STYLE.md`; the plant contract refers to them.
- `STYLE.md`: the art-direction lock: what is fixed vs. what is free to vary (all kinds).
- `roster.json`: shipped models, `{"models": [{id, kind, spec, glb, js, ...}]}` (the runtime reads this; paths relative to `models/`).
- `biomes.json`: the habitats a run can target (medium, ecology, examples).
- `<kind>/specs/`: one design spec per model (`specs/examples/` = reference specs) (input to build/animate, also the judge's reference).

Creature pipeline detail follows.

## Blender stages (expert order, all scripted, `blender -b` headless)
| # | Stage | What happens | Script |
|---|---|---|---|
| 1 | Reference | Brief names real-world species/traits, silhouette notes, palette | spec JSON |
| 2 | Blockout | Optional: if the archetype defines `blockout(spec)`, build.py renders `blockout_side.png` / `blockout_top.png` silhouettes; otherwise skipped | `creature/archetypes/<a>.py: blockout()` |
| 3 | Model | Cage mesh with clean edge loops + Subdivision Surface; appendages (fins, wings, legs, tentacles) as separate parts then joined | `model()` |
| 4 | Optimize topology | Apply subdiv at export level, decimate to tri budget, merge by distance, recalc normals | `shared/blender/lib.py` |
| 5 | UV | Smart UV project (seams for tubes/tentacles) with margin | lib |
| 6 | Material / look-dev | Procedural Principled BSDF from spec palette + pattern nodes | `material()` |
| 7 | Bake | Bake base color (+ roughness) to one 1024 texture; replace with single glTF-friendly PBR material | lib |
| 8 | Rig | Armature chains by archetype (spine, tail, fin/wing, tentacle, leg, neck); automatic weights; ≤4 influences, normalized | `rig()` |
| 9 | Animate | `idle` loop and `feed` action; cyclic F-curves; secondary motion (follow-through) on chains | `animate()` |
| 10 | QA lighting + renders | Fixed three-point + water-world rig, turntable + animation strips + side-by-side with golden refs | `shared/blender/qa_render.py` + `shared/tools/verify.sh` (contact sheet: turntable, idle/feed strips, onion-skin motion panels, each view framed to the silhouette +15%; golden side-by-side at true scale, plus a "magnified to same length" panel when the new creature is < 50% of the golden's length) |
| 11 | Export | glTF binary, actions as animations, +Y up, WEBP texture | lib |
| 12 | Validate | Structural, animation, export, visual (judge), runtime gates | `shared/tools/verify.sh` |

Runtime lighting belongs to each habitat page (e.g. the reef's caustics, fog, absorption). Blender lighting exists only to make QA renders comparable week to week.

## Archetypes
Builders are parametric generators per body plan in `creature/archetypes/` (start: `streamlined_swimmer`). The brief picks an existing archetype + parameters (safe path) or asks for a new archetype (novel path: the agent writes a new generator; same gates, plus a stricter judge pass and one extra retry). Proven archetypes accumulate, so the library grows and the safe path gets richer.

Archetypes are named by **body plan**, not species or biome, so one generator serves many habitats. Planned:

| Archetype | Examples |
|---|---|
| `streamlined_swimmer` (built) | clownfish, tuna, dolphin, squid mantle, tadpole |
| `flat_disc_swimmer` | tang, angelfish, butterflyfish |
| `undulating_flat` | ray, flounder, cuttlefish fin |
| `serpentine` | eel, snake, worm |
| `many_armed` | octopus, starfish, brittle star |
| `radial_drifter` | jellyfish, comb jelly, dandelion seed |
| `legged_crawler` | crab, beetle, lizard, spider |
| `shelled_paddler` | turtle, tortoise |
| `winged_flyer` | bird, butterfly, bat, flying fish |
| `rooted` | anemone, coral polyp, flower, mushroom |
| `soft_glider` (built) | nudibranch, slug, snail |
| `slender_tube` (built) | pipefish, trumpetfish, stick insect |

## Lessons → feed
Doing a lesson drops food into the habitat. Every creature within range plays `feed` aimed at the food (runtime steers the root toward the food, `feed` supplies the body action). That's why every creature must have a `feed` action and a `mouth` node, whatever its body plan (swimmer lunge-bite, octopus arm curl-to-mouth, jelly tentacle wrap, crab claw-to-mouth, anemone tentacle close, bird peck, bee land-and-sip).

## Run ledger (budget)
`shared/tools/ledger.py` is the only budget counter: `start <run> --builds 8 --minutes 120`, every build is `build.py ... --run <run>` (exits 4 `BUDGET EXHAUSTED`; pre-build spec-check failures don't count), every judge is `ledger.py judge <run> <id> <agent_id>` (a reused agent id is refused), `status <run>`. State: `out/runs/<run>.json`.

## Failure policy
- Each gate failure returns machine-readable reasons; the failing step retries with them (max 2 retries, 3 for novel archetypes).
- Still failing → fall back to a safe-path variant (proven archetype, new params/palette) and re-verify.
- Still failing → no visitor this week; work is moved to `out/quarantine/<id>/` (dry runs: `out/dryrun/quarantine/<id>/`) with the report. Never ship unverified.
- Every run writes `out/<id>/report.json` and a contact sheet, so a human can audit later without being needed now.

## Where it runs
Locally on the Mac via the desktop app's scheduled task (Blender is a local app). Headless CLI only (`blender -b`); the Blender MCP is for interactive development, not the weekly run. The Mac must be awake at run time.

## Solid scenery (runtime)
Creatures never pass through the ground, each other, or solid scenery. In `habitat.js` every scenery piece registers with `solid(kind, mesh)`; all kinds are solid by default. A biome opts specific kinds out with `pass_through` in `biomes.json` (e.g. kelp forest: `["kelp"]`, cloud canopy: `["cloud"]`). New scenery: register it with a kind, and only add the kind to `pass_through` where swimming/flying through it looks natural. Thin dressing (grass blades, rays, particles) is not registered. Clips themselves must not self-intersect (creature-animate).
