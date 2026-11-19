---
name: model-ship
description: Shared step, any kind. Ship a verified model: optimize the glb (models/shared/tools/optimize.sh), wrap it as base64 JS, add it to models/roster.json with its kind, commit on a branch, republish the lifeboard artifact. Final step of the creature and plant pipelines; refuses without a passing report.json.
---

# Creature ship

> Paths: `out/`, `assets/`, `roster.json`, `<kind>/specs/` are relative to `models/`.

Precondition: `models/out/<id>/report.json` has `"pass": true` and was written after the current `<id>.glb` (compare mtimes). Otherwise stop.

1. **Optimize**:
   ```bash
   models/shared/tools/optimize.sh out/<id>/<id>.glb assets/<id>.glb <budget.texture>
   ```
   (quantize + resize + webp as separate steps: `gltf-transform optimize` prunes the `mouth` empty.) Use quantize only. No draco or meshopt: the habitat page would need a decoder. Re-run `models/shared/tools/verify.sh <id> models/assets/<id>.glb`; G2–G4 must still pass, because quantization can break the loop seams.
2. **Wrap**: `assets/<id>-glb.js` as in model-verify G6.
3. **Roster**: append `{id, kind, spec, glb, js, biome, rarity, golden:false, added:<YYYY-MM-DD>}` to `roster.json` `models[]` (paths relative to `models/`).
4. **Commit** on a branch `visitor/<id>` (plants: `seed/<id>`). The message names the species and the gates passed. Merge to main and push only if the scheduled task's instructions allow it. Otherwise leave the branch for review.
5. **Publish**: republish the main lifeboard artifact with `models/roster.json`, `models/biomes.json` (when a biome-brief ran) and every `models/assets/*-glb.js` as files (see lifeboard-setup "Publishing"). Follow AGENTS.md for the artifact URL; never create a new artifact URL.
6. **Announce**: return `{id, name, lore, rarity, contact: out/<id>/qa/contact.png}` to the orchestrator for the weekly report.
