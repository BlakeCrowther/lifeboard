# Files

- [Board UI and boot sequence](board-ui.md) - How the lifeboard page boots, redraws on store changes, dispatches events, and lazy-loads the game (garden and ecosystem) chunks.
- [Data store over the artifact db](data-store.md)
- [Game state derivation](game-derivation.md) - How the garden, tide and reef, visitors and lessons are derived from db history on every load, and how RULES, SPEC.md and spec-check are kept equal.
- [3D model pipeline](model-pipeline.md) - The headless Blender pipelines that build, verify and ship creature, plant and scenery models, their shared gates and judge rule, and how the page consumes the roster.
- [Packages and boundaries](packages-and-boundaries.md) - The deep-module package layout under src/packages, the layering between domain, scene, db and ui packages, and how dependency-cruiser enforces it.
