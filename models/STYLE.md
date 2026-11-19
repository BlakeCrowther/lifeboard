# Style lock (all kinds)

Applies to creatures and plants. Eyes, mouth and feed items are creature rules; plants follow the form, material, palette, pattern, eased-motion and QA-lighting rules (see `plant/CONTRACT.md`).

Goal: any week's surprise visitor looks like it belongs in the same world as the golden references. Lock the *rendering language and motion feel*; let *species, shape and pattern* ride.

## Locked (judge fails on violations)
- **Form:** stylized-real. Smooth subdivided surfaces, soft rounded silhouettes, slightly oversized heads/eyes (~1.15×), no hard-faceted low-poly, no realistic micro-detail (no scale normal maps, no pores).
- **Eyes:** shared eye asset `lib.eye()`: glossy near-black sphere, single highlight, diameter 8–12% of body height (default 10%, `spec.eye.ratio`).
- **Mouth:** visible at card size: real geometry from the shared `lib.mouth()` (dark recessed lip slit, or round opening; `palette.lip` else `palette.accent`, pushed dark), never hidden behind appendages, opening/closing on feed bites. An accent lip line (`lib.accent_line`) may frame it. Gives every creature the same "face".
- **Materials:** Principled BSDF only. Base color baked, roughness 0.25–0.55, clearcoat 0–0.6 (from `spec.material.{roughness,coat}`, default 0.35/0.35, clamped). No emission except bioluminescent species (night-only, accent ≤ 10% surface).
- **Palette:** 2–4 main colors + 1 accent per creature. Saturation and value inside the house range: HSV S 0.45–0.95, V 0.35–0.98 for main colors; pure black only for outlines/stripe edges; whites ≤ V 0.95 (keeps water caustics / sun highlights from blowing out).
- **Patterns:** graphic and readable at card size (bands, spots, gradients, edge rims). Minimum feature width ≈ 3% of body length.
- **Motion feel:**
  - Eased everything: no linear interpolation; Bezier with auto-clamped handles.
  - Follow-through: chains (tail, fins, wings, tentacles, antennae, petals) lag the parent by 2–6 frames, amplitude grows toward the tip.
  - Gentle but readable: nothing snaps (peak bone rotation ≤ 30° idle, ≤ 60° feed; speed ≤ 8% / 25% body length per frame), yet the motion must read at card size: some vertex moves ≥ 4% body length from the frame-0 pose during idle and ≥ 12% during feed (G3).
  - Feed reads in silhouette: anticipation is visible (small pull-back), strike is the fastest beat, settle is the slowest.
- **QA lighting:** fixed rig (`shared/blender/qa_render.py`), so renders compare across weeks.

## Biome identity (enforced at brief time)
The style lock keeps every model in one *world*; `biomes.json` `look` + `identity_rules` keep each *biome* unmistakable inside it: its own shape language, hue family, owned motifs and motion feel. Locked rendering, free silhouette.

## Free (let it ride)
Species, body plan, proportions within anatomy, color choices inside the palette range, pattern design, idle personality (lazy hover vs. busy flicker), feed technique.

## Golden references
`assets/` models marked `"golden": true` in `roster.json` are rendered next to every new model **of the same kind** in the QA side-by-side. Start: `clownfish`. Each medium (water / land / air) should get its own golden once one exists. Promote a creature to golden only when a human likes it.
