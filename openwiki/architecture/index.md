# Files

- [Board UI (ui package)](board-ui.md) - How the lifeboard page boots, turns db changes into a rebuilt board model and a redraw, routes events and writes, and loads the game modules on demand.
- [Build and bundle](build-and-bundle.md) - How strict TypeScript in src/ is bundled by esbuild into dist/, which entry points exist, how chunks and the three.js import map work, and the first-load size budget.
- [Data layer (db package)](data-layer.md) - Collection schemas and validation, the live store with optimistic writes, per-document write queues, rollback and undo, the DbAdapter seam to the artifact db, and the in-memory fake.
- [Domain logic: dates, recurrence, tasks, habits](domain-logic.md) - The pure, DOM-free packages that define a board day, recurring-task dates, task state and ordering, the ring tally and task age, and habit counts and streaks.
- [Package layering and boundaries](package-boundaries.md) - The deep-module layout under src/packages, the entry-point versus lib/ rule, the layering order between packages, and how dependency-cruiser and ESLint enforce it.
