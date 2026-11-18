---
name: lifeboard-setup
description: Shared, any kind. One-time setup and health check for a fresh clone of lifeboard: model toolchain (Blender, ImageMagick, gltf-transform, optional Blender MCP) + doctor, local preview server, mockdata, Labs flag, publishing, the ?visitor= test hook, and the weekly scheduled-task template. Use on a new machine, when sharing the repo, or when any model skill fails with a tooling error.
---

# Lifeboard setup (fresh clone)

Order: 1 toolchain + doctor → 2 local preview → 3 Labs flag → 4 publishing → 5 runtime test hook → 6 weekly scheduled task. Run the doctor first; it says exactly what is missing:

```bash
models/shared/tools/doctor.sh          # check only
models/shared/tools/doctor.sh --fix    # install what brew can install
```

## 1. Toolchain (model pipelines)
### Required
| Tool | Why | Install |
|---|---|---|
| Blender ≥ 5.3 | Headless modeling, rigging, animation, baking, QA renders, glTF export (`blender -b`) | `brew install --cask blender` (free, GPL) |
| ImageMagick | Contact sheets for the visual judge | `brew install imagemagick` |
| Node ≥ 20 + `npx @gltf-transform/cli@4` | Validate + optimize `.glb` | `brew install node` (gltf-transform fetched by npx) |
| Claude desktop app scheduled tasks | Runs `weekly-visitor` locally (Blender is a local app); Mac must be awake | Desktop app → Scheduled |

### Optional (interactive development only)
**Blender MCP** (official, Blender Lab) lets Claude drive a live Blender window. The weekly run does NOT use it.
1. Claude desktop → Extensions → install "Blender" (Blender Lab).
2. In Blender: Edit → Preferences → Get Extensions → add repository `https://lab.blender.org/` → install + enable "MCP". Its settings live under Preferences → Add-ons → MCP (no N-panel tab); "Auto Start" is on by default (port 9876).
3. Restart Claude (⌘Q). Test: ask Claude for the Blender scene summary.

## Known gotchas (seen on this Mac, Nov 2026)
- **Blender MCP extension fails with `pydantic-core`/`rpds-py` build errors.** `uv` picked a too-new Python (3.15) with no wheels, then tried to compile with Rust. Fix: pin 3.12 in the extension folder (doctor prints the exact command) and/or `uv python pin --global 3.12`. Reinstalling the extension wipes the folder pin.
- **Rust "can't find crate for core" on Apple Silicon.** rustup default toolchain is x86_64. `rustup default stable-aarch64-apple-darwin`.
- **Artifacts won't serve `.glb`.** Ship models as base64 JS (`assets/<id>-glb.js`) and parse with `GLTFLoader.parseAsync`. `model-ship` does this.
- **Blender MCP vs. ahujasid `blender-mcp`.** Different projects. This repo assumes the official Blender Lab one (or none).
- **Third-party add-on safety.** Any Blender MCP runs arbitrary Python inside Blender; only keep it connected while using it.

## Local preview
- `.claude/launch.json` (in the repo) serves the **repo root** with `python3 -m http.server 8765` (config name `lifeboard`). In Claude: `preview_start` with name `lifeboard`, then open `http://127.0.0.1:8765/`. By hand: `python3 -m http.server 8765` from the repo root.
- The real page talks to the artifact db through `window.claude.use('db')`, which only exists inside claude.ai. Locally, `mock.js` stubs it with an in-memory db (`onSnapshot`, `doc().set/update/delete`) seeded from `window.MOCK`.
- `mockdata.js` = `window.MOCK = { <collection>: { <docId>: {...doc} } }`. The owner's file is a personal data snapshot and is **gitignored**; you won't have it. Make your own: start with `window.MOCK={}` (empty dashboard) or add a few docs per collection using the shapes in `schema.js` (`tasks`, `habits`, `habit_sessions`, `checks`, `list_items`, …). Keep it out of git.
- Load order for a local test page (also gitignored: `test.html`): copy `index.html` and insert `<script src="mockdata.js"></script><script src="mock.js"></script>` before `logic.js`.
- `doctor.sh` checks that `.claude/launch.json` exists and reports `mockdata.js` as optional.

## Labs flag
The game (reef points, garden, visitors) starts at 0 on the day Labs is first turned on: that date is written once to db `labs_state/game.started` and earlier history is ignored. The reef/habitat counts from that day and never resets weekly; the garden runs Mon–Sun weeks from the first Monday on/after it (plots stay seeds until then). Delete that doc to restart from 0.
The display-settings popover (sliders icon) has a **Labs** toggle (off by default, saved per viewer as `lb-ui.labs`) that shows the experimental habitat (creatures) and garden (plants) cards. Turn it on to see models in the page; the rest of lifeboard works without it.

## Publishing
- The page is one claude.ai Artifact with the `db` capability, published with the Artifact tool to the **existing** lifeboard artifact URL (never a new URL; AGENTS.md). Files: `index.html` + its scripts (`logic.js`, `schema.js`, `store.js`, `app.js`, `game.js`, `habitat.js`, `garden.js`; check `index.html` for the current list) **plus** `models/roster.json`, `models/biomes.json`, every roster `js` asset (`models/assets/*-glb.js`) and optionally each roster `spec` json (gives locomotion/name; default swim). three.js r170 loads from cdn.jsdelivr.net via the importmap in `index.html`, only when Labs is on. Optional db collection `visitors_met` is written only with Labs on. Creature and plant assets ship with the page; there is no separate model artifact.
- Never publish `mock.js`, `mockdata.js`, `test.html` or anything under `models/out/`.
- Someone cloning the repo publishes to an artifact of their own (first publish creates it; reuse that URL afterwards).

## Preview the rewards
Open the page with `#labs-preview` (or `test.html#labs-preview` locally). A row of buttons under the habitat jumps to Phase 1–5, sets 0/5/15 overdue (cloudy water, algae), toggles bleaching, cycles biomes and drops food. View-only: nothing is saved and the real game state is untouched.

## Runtime test hook
`habitat.js` supports `?visitor=<id>`, `#visitor=<id>` and `#labs-visitor-<id>` (use the last one in the published artifact, which only passes plain `#name` hashes); any of them turns Labs on for that visit only. It it injects a candidate creature (from `window.LB_CREATURES[<id>]`, e.g. a wrapped `models/out/<id>/<id>-glb.js`) into the habitat so G6 (model-verify) can check it in the real page before it ships.

## Weekly scheduled task (template, not registered)
`.claude/scheduled/weekly-visitor.md` holds the prompt text and a suggested cron (Sunday 06:00). It is not registered on purpose. The Mac must be awake at run time. Register it later from the Claude desktop app → Scheduled, following the steps in that file.

## Repo hygiene
- `models/out/` (builds, QA renders, run ledgers, quarantine) is gitignored local work; `models/assets/` + `models/roster.json` are what ships.

## Sharing checklist
Someone cloning this repo needs: the tools above, `doctor.sh` passing, their own `mockdata.js` for local preview, a lifeboard artifact of their own (see AGENTS.md + Publishing), and (optionally) the scheduled task registered from the template.
