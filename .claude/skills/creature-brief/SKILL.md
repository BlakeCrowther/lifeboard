---
name: creature-brief
description: Kind: creature. Design the next visitor as a creature spec (models/creature/specs/<id>.json, kind "creature") from the current biome, rarity and roster. Step 1 of the creature pipeline (weekly-visitor); validated by shared check_spec.py (G1). Also use to brief a specific creature by hand.
---

# Creature brief

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Output: `models/creature/specs/<id>.json` that passes `python3 models/shared/tools/check_spec.py`. Read `models/STYLE.md` and `models/creature/CONTRACT.md` first; `creature/specs/examples/` holds reference specs (clownfish = streamlined swimmer).

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
   - Prefer real species with a strong silhouette and graphic pattern; legendary = the biome's most iconic animal, pushed one notch more dramatic (size, glow, plumage). The creature's `locomotion` (swim / walk / fly / drift / rooted / climb) must suit the medium.
2. **Pick a path**: safe (existing archetype + new params) or novel (needs a new archetype). Rare/legendary may go novel; common stays safe unless the library has < 3 archetypes.
3. **Write the reference line**: binomial name + 2–4 identifying traits, at least one of them the biome-specific one (the shape or color that ties it to `look`). The judge checks the renders against this sentence.
4. **Size** in real meters (card readability is the runtime's job). **Palette** 2–4 mains + accent inside STYLE ranges (check_spec enforces HSV).
5. **Motion** (makes each loop unique):
   - `idle.frames` 48–144 and `cycles` (whole number). Bigger/calmer animals → longer, fewer cycles; small/busy → shorter, more cycles. Must differ from every roster creature (check_spec enforces).
   - `amp_deg`, `chain_lag_frames`, one-line `personality`.
   - `feed.frames` 36–96 and `technique`: how *this body plan* eats, in beats (anticipate → reach → grab/bite → chew/swallow → settle). Examples: streamlined swimmer dart + snap; octopus arm reach, curl food to beak; jelly pulse up, tentacle wrap, pull under bell; crab claw pinch to mouth; anemone tentacles close then reopen; turtle neck extend + bite; bird peck; lizard tongue flick; bee land + sip.
6. **Budget** (`budget.tris`, a cap): common 8000, rare 9000, legendary 16000 (`texture` 1024; legendary may use 2048 only if the file still fits). Higher counts pass the G2 cap but blow the G4 file-size limit (seen: rare 9k+ at ~660 KB > 600). Optional: `material.{roughness,coat}` (0.25–0.55 / 0–0.6), `eye.ratio` (0.08–0.12), `symmetry: "radial"` + `mouth: "front"|"underside"` for radial body plans (see CONTRACT "Body plans").
7. Add `name` (common name) and `lore` (≤ 60 chars, playful, shown when it arrives).
8. Run `check_spec.py`; fix until it passes.

Do not spoil the surprise in any user-facing message; the weekly report reveals it.
