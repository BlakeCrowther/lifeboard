---
name: creature-brief
description: Kind: creature. Design the next visitor as a creature spec (models/creature/specs/<id>.json, kind "creature") from the current biome, rarity and roster. Step 1 of the creature pipeline (weekly-visitor); validated by shared check_spec.py (G1). Also use to brief a specific creature by hand.
---

# Creature brief

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Terms (creature, body plan, archetype, safe/novel path, golden): see `models/README.md` "Terms". Output: `models/creature/specs/<id>.json` that passes `python3 models/shared/tools/check_spec.py`. Read `models/STYLE.md` and `models/creature/CONTRACT.md` first; `creature/specs/examples/` holds reference specs (clownfish = streamlined swimmer).

## Inputs
- Biome and rarity: from the caller (weekly-visitor passes them from the game state). Default `biome` = current, `rarity` = common.
- `models/roster.json`: never repeat a species; avoid the same archetype twice in a row when the library has ≥ 2.
- `models/creature/archetypes/`: proven generators (safe path).

## Steps
1. **Pick a species** that fits the biome in `models/biomes.json`: its `medium` (water / land / air), real ecology, `examples`, and above all its `look` and the file's `identity_rules`. The creature must be *unmistakably from this biome*:
   - Body plan and silhouette echo `look.shape`; colors come from or sit next to `look.palette`, following `look.creatures`; idle feel follows `look.motion`.
   - Never use a motif another biome lists in its `look.owns`.
   - **Swap test**: compare against every roster creature from *other* biomes. If this design would pass as theirs after a recolor, change at least two of: body plan, silhouette, pattern type, hue family, size class, motion.
   - **Silhouette test**: filled black at card size, it still says which biome.
   - Prefer real species with a strong silhouette and graphic pattern; exotic = the biome's most iconic animal, pushed one notch more dramatic (size, glow, plumage). The creature's `locomotion` (swim / walk / fly / drift / rooted / climb) must suit the medium.
2. **Pick a path: novel by default.** The world should keep surprising; reusing a body plan is the exception.
   - Before choosing, list 5 candidate species for this biome and mark each one's body plan. Strike any that an existing archetype in `models/creature/archetypes/` already covers *unless* that archetype has never been used in this biome **and** the species has a trait it can actually express (judges failed a parrotfish for its beak, which `streamlined_swimmer` cannot make). Prefer the strangest, most delightful survivor: odd silhouettes, unusual locomotion (hop, burrow, climb, glide, crawl, rooted), body plans the library lacks.
   - **Novel** (write a new archetype; model-build's "new archetype" rules) when: the library has < 6 archetypes, or this is the biome's first creature, or the medium/locomotion has no archetype yet (e.g. the first walker, flier or burrower), or rarity is rare/exotic.
   - **Safe** (existing archetype + new params) only when none of those hold, or as the weekly-visitor fallback after a novel attempt failed. Never pick safe just because it's easier.
   - Record the choice and the struck candidates in the spec's `notes.path` (one line), so the report can show it.
   - Either way the species gets its **own generator** (model-build: copy the closest archetype to `archetypes/<id>.py`, set `archetype: "<id>"`, `based_on: "<source>"`). So "can the archetype express it?" is now "how far is it from the closest generator?": list in `notes.traits` the 2–4 species traits the copy must add (e.g. "parrot beak", "tall spiny dorsal", "5 wide bars"). Never drop a defining trait to fit existing code.
3. **Write the reference line**: binomial name + 2–4 identifying traits, at least one of them the biome-specific one (the shape or color that ties it to `look`). The judge checks the renders against this sentence.
4. **Size** in real meters (card readability is the runtime's job). **Palette** 2–4 mains + accent inside STYLE ranges (check_spec enforces HSV).
5. **Motion** (makes each loop unique):
   - `idle.frames` 48–144 and `cycles` (whole number). Bigger/calmer animals → longer, fewer cycles; small/busy → shorter, more cycles. Must differ from every roster creature (check_spec enforces).
   - `amp_deg`, `chain_lag_frames`, one-line `personality`.
   - `habitat.shelter`: what it hides by when no lessons are done for days (`anemone`, `rock`, `kelp`, `coral`, …; default `habitat.anchor`, else `rock`). Clownfish: anemone; octopus: rock; crab: rock.
   - `sulk.frames` 48–144, whole `cycles`, `technique`: how *this body plan* mopes (it plays all day after a skipped break). Optional `energy` (0–1 of idle amplitude, default 0.35), `droop_deg`, `frown` (0–1, front mouths). Examples: swimmer nose droops, fins clamped, one slow tail beat, sinks; jelly barely pulses, tentacles hang limp, drifts down; octopus pales, arms curled under, flattens; crab claws tucked, sits low; anemone half-closes; bird fluffs up, head tucked; nudibranch rhinophores folded back, cerata flattened.
   - `feed.frames` 36–96 and `technique`: how *this body plan* eats, in beats (anticipate → reach → grab/bite → chew/swallow → settle). Examples: streamlined swimmer dart + snap; octopus arm reach, curl food to beak; jelly pulse up, tentacle wrap, pull under bell; crab claw pinch to mouth; anemone tentacles close then reopen; turtle neck extend + bite; bird peck; lizard tongue flick; bee land + sip.
6. **Budget** (`budget.tris`, a cap): common 8000, rare 9000, exotic 16000 (`texture` 1024; exotic may use 2048 only if the file still fits). Higher counts pass the G2 cap but blow the G4 file-size limit (seen: rare 9k+ at ~660 KB > 600). Optional: `material.{roughness,coat}` (0.25–0.55 / 0–0.6), `eye.ratio` (0.08–0.12), `symmetry: "radial"` + `mouth: "front"|"underside"` for radial body plans (see CONTRACT "Body plans").
7. Add `name` (common name) and `lore` (≤ 60 chars, playful, shown when it arrives).
8. Run `check_spec.py`; fix until it passes.

Do not spoil the surprise in any user-facing message; the weekly report reveals it.
