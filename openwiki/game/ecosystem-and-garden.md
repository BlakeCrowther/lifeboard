---
type: Architecture
title: Ecosystem and Garden rendering
description: How the three.js Ecosystem scene and the Garden and Collection views render derived game state, including lazy loading, model manifests from models/, URL test hooks, weather, and the capture page used by the model pipeline.
tags: [ecosystem, garden, three.js, rendering, lazy-loading, models]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-24T16:14:32.981Z
sources:
  - id: openwiki-source-a5e85d559310f47547b34206
    resource: repo://src/capture-page.ts
  - id: openwiki-source-e3e6c7388a13fc122abdf8da
    resource: repo://src/packages/ecosystem/lib/ecosystem.ts
  - id: openwiki-source-b37b5854401d3f60acb9ff76
    resource: repo://src/packages/ecosystem/lib/kit.ts
  - id: openwiki-source-84c5afbec81adcab9a043e99
    resource: repo://src/packages/ecosystem/lib/manifests.ts
  - id: openwiki-source-9698e05efeb71cacae46ba14
    resource: repo://src/packages/ecosystem/lib/url-hooks.ts
  - id: openwiki-source-150c67dcc293f19c86ecfe93
    resource: repo://src/packages/ecosystem/lib/weather.ts
  - id: openwiki-source-bd43e572da94cfd09b66d08a
    resource: repo://src/packages/garden/lib/plant-3d.ts
  - id: openwiki-source-9cf168e9dc522c63d3f9b9bf
    resource: repo://src/packages/garden/lib/rerender.ts
  - id: openwiki-source-a182eb993cab8835e8c33ce6
    resource: repo://src/packages/garden/lib/roster.ts
generated: { by: "claude-code", at: "2026-11-22T17:23:06.062Z" }
---

# Ecosystem and Garden rendering

The `ecosystem` and `garden` packages draw game state; they never compute it. State comes from `deriveGame` ([Game derivation](./game-derivation.md)), and both packages may import domain packages but never `ui` or `db` ([Package layering and boundaries](../architecture/package-boundaries.md)). Terms such as *Ecosystem*, *biome*, *phase* and *visitor* are defined in [GLOSSARY.md](../../GLOSSARY.md); the mechanics are in [SPEC.md](../../SPEC.md).

## Ecosystem package

`createEcosystem(pageUrl)` returns a handle with the card `element`, `mount(slot)`, `setState(view)`, `setWeather(reading)`, `feed(particles)`, `inspect`, `debug()` and `stats`. `scene-rules.ts` is a separate pure entry (no three.js, no DOM) so tests and the balance tooling can use the scene's rules directly.

### Lazy start

Nothing heavy loads with the board. The card is observed with an `IntersectionObserver` (200 px root margin); the first time it is visible `start()` loads the three.js kit and the model manifests in parallel, builds the engine, loads creatures, and only then hides the loading message. When the card leaves view the engine pauses, and re-entering view kicks it again. Food dropped (`feed`) before the engine exists is remembered and released once it starts, capped at 12 particles. Any failure logs a warning and leaves a short "could not load" message rather than breaking the board. The packages themselves reach the board as separate bundle chunks ([Build and bundle](../architecture/build-and-bundle.md), [Board UI](../architecture/board-ui.md)).

### three.js kit

`lib/kit.ts` imports `three` and the addons (composer, render, bloom, output and shader passes, `GLTFLoader`, geometry and skeleton utilities) dynamically. All of them stay external to the bundle; the page's import map resolves them at runtime.

### State flow

`setState` stores the new game view, repaints the info strip (biome name, phase label, progress bar, line of text, visitor chip), and tells the running engine to apply it. If the biome changed since the last state, creatures are reloaded for the new biome before applying. The scene biome is chosen in order: a forced `?biome=`, the biome of a forced visitor, else the game's `reef.biome` modulo the number of known biomes. A `?phase=` pin overlays the real state through `pinPhase`, so previews never alter game data.

### Manifests and models

The scene reads the model pipeline's published JSON, never the pipeline itself: `models/roster.json` (creatures, plants, scenery) and `models/biomes.json`, fetched with `cache: 'no-cache'` from the base list in `MODEL_BASES` (currently one entry, `models/`). `lib/manifests.ts` types these files and drops malformed entries, so the scene only reads fields it understands. Each roster entry's `js` script sets a base64 glb on `window.LB_CREATURES[id]` (or `LB_SCENERY` for scenery); the contract for the glb itself (axes, scale, clips `idle` and `feed`, an empty `mouth` node) is the creature contract in `models/` ([3D model pipeline](../models/model-pipeline.md)). The same seam carries plants as `window.LB_PLANTS[id]`.

### Weather and season

`lib/weather.ts` turns the board's conditions snapshot into 0..1 amounts of cloud, rain, fog, snow and storm by matching words in the condition text. A reading older than 12 hours counts as unknown (clear), so stale data never darkens the scene; a forced `?weather=` is always fresh. Weather and season change the look only, never the game. `setWeather` ignores readings whose condition and timestamp are unchanged.

### URL test hooks

`lib/url-hooks.ts` parses the hooks `scene`, `phase`, `weather`, `month`, `inspect`, `inspect_src`, `biome`, `hour`, `rest`, `perch` and `visitor`. The artifact host passes only plain `#name` hashes, so every hook also works as `#name-value` in the hash. These names are a contract with the model pipeline's page-test and capture tools.

### Capture page

`capture.html` loads `dist/capture.js` (from `src/capture-page.ts`), which mounts the Ecosystem full-window with a synthetic state (phase 4 of 5, biome from `?biome=`, and `?neglect=<0..1>` driving cloudiness, blight and overdue count) and exposes it as `window.Ecosystem`. Headless pipeline tools use that handle (`inspect.pose`, `debug`, `feed`) to photograph habitats and watch creatures without the board or a db.

## Garden package

`garden` renders the plots and keepsakes: the Garden card, the plot SVG and 3D beds, the Collection of dioramas and pressed plants, the logbook, and the stat tiles. Entry points include `plotSVG`, `collectionHTML`, `gardenTiles`, `logbookHTML`, `plantPool` and `setGardenRerender`.

- **Plant pool.** `lib/roster.ts` reads `roster.json` and `biomes.json` into typed models (`readRosterModels`) and builds the `PlantPool` that the game derivation uses to pick species for plots ([Game derivation](./game-derivation.md)). Because that JSON loads asynchronously, the pool carries a version so the board's cached game state recomputes when it changes.
- **Rerender seam.** The garden cannot import the render loop, so `setGardenRerender` registers a callback and `requestRerender` calls it once the manifests finish loading ([Board UI](../architecture/board-ui.md)).
- **3D plots.** `lib/plant-3d.ts` draws plants whose roster species has a 3D model. One shared offscreen WebGL renderer draws each plot (stage `stage_<n>` visible, looping `sway_<n>`, a one-shot `tend` when the tile was just logged) and copies the frame onto a canvas over the plot's SVG bed, at about 20 fps and paused off-screen. The SVG species (the roster `svg` shape, drawn by `plant-svg.ts`) shows until the model is on screen, so a plot is never empty. three.js loads lazily here too.
- **Collection.** `lib/collection.ts` lists dioramas (the Ecosystem in progress first, finished ones after) and pressed plants, each with an owner-written title and note stored as keepsakes; the stat tiles count from the same keepsakes.

## Extension notes

- A new URL hook: add it to `SceneHooks` and `readSceneHooks`, then document it where the pipeline's capture tools use it.
- A new scene input from the game: add it to the view type in `rules.ts` and pass it through `setState`; keep derivation in `game`.
- New models arrive only through `models/roster.json` and `biomes.json`; no code change is needed to show a new creature, plant or scenery prop.
