---
type: Design Doc
title: Cloud model pipeline
description: Feasibility spike showing the creature/plant model pipeline (headless Blender to glTF) runs in a cloud session VM, so the weekly run no longer needs the owner's Mac.
status: draft
design_status: proposed
tags: [models, cloud, setup]
---

# Cloud model pipeline

**Goal:** a non-technical user should not need to install Blender or keep a Mac awake for the weekly model run. This spike checks whether the pipeline runs in a claude.ai cloud session VM.

**Result:** yes for building, animating and the four code checks. Blender 5.3.0 headless, Eevee software rendering, Cycles CPU baking, gltf-transform, ImageMagick, headless Chromium with WebGL, and `pnpm verify` all work. Still unproven: reading live files and the db from a scheduled session, and publishing from one. The judge panel did run (sonnet subagents) and passes. The network allowlist needs two extra hosts.

Terms: **session VM** = the Linux container a cloud session runs in. **Environment** = the saved network allowlist and variables a session uses. **Spike** = this throwaway feasibility run; nothing was shipped or published.

## What was run

| Item | Detail |
|---|---|
| VM | Ubuntu 24.04, 4 vCPU, 16 GB RAM, no GPU, root, 60 GB free disk |
| Blender | 5.3.0 from download.blender.org (`./setup.sh --check` requires >= 5.3); pinned in `./setup.sh` with a sha256 check |
| Creature | `models/creature/specs/examples/clownfish.json` (the golden), built with `build.py --run`, then `verify.sh`. No subagents were used. |
| Not run | model-ship, a polish round, publishing, any live artifact or db write |

Why clownfish and not a spec from `models/creature/specs/`: the `sheepshead` spec fails spec-check ("idle loop identical to gulf_pipefish"), which is a repo issue and not a cloud one. Specs were left unchanged.

## Findings

| # | Area | Status | Notes |
|---|---|---|---|
| 1 | Install Blender 5.3.0 tarball | works | After allowing `download.blender.org`. 1.3 GB on disk. |
| 2 | `blender -b` headless, glTF export | works | `./setup.sh --check` 8 ok / 0 failing. Vulkan init warning is harmless. |
| 3 | Eevee render (blockout, QA turntables, onion skins) | works, slow | Software GL via Mesa (llvmpipe); logs `EGL_BAD_MATCH` lines but renders correctly. No xvfb needed. About 10 s per frame. |
| 4 | Cycles texture bake | works | CPU, 8 samples at 1024 px. Part of the 52 s build. |
| 5 | Build, rig, animate, export (`build.py`) | works | idle, feed, sulk actions; 8000 tris. |
| 6 | `verify.sh` four code gates | works | spec, shape, motion, export all PASS; optimized glb 271 KB. |
| 7 | ImageMagick | works with a shim | Ubuntu ships v6 (`convert`, `montage`), but scripts call `magick`. the `magick` wrapper in `./setup.sh` needed a fix: it only forwarded `magick montage ...`, not `magick in.png -op out.png`. |
| 8 | gltf-transform via npx | works | `@gltf-transform/cli@4` 4.5.1, node 22. |
| 9 | `pnpm verify` | works | 5/5 PASS after the fixes below. About 4 s. |
| 10 | Headless Chromium + WebGL | works | SwiftShader WebGL 2. `capture_ecosystem.ts` rendered a real Ecosystem frame in 87 s (while another job ran). Needs `--no-sandbox` as root. |
| 11 | Network: blender.org, jsdelivr | blocked by default | Default environment blocks both. Allowed in the `lifeboard` environment. npm and PyPI are reachable by default. |
| 12 | Network: cdn.playwright.dev | blocked by default | Playwright's pinned Chromium download fails. Allowed in the `lifeboard` environment; `setup.sh` then installs the pinned build (126 MB) and `pnpm verify` needs no env var. |
| 13 | Artifact tool | works | Listed artifacts. Publishing not exercised. |
| 14 | Artifact db (`ArtifactData`) and live files | works | 2026-11-24: an interactive cloud session read `checks/profile` with `ArtifactData` and the live `models/roster.json` and `biomes.json` with `Artifact read`; the 2026-w48 weekly run published from a cloud session (artifact version 107). A scheduled session reads them too (row 17). |
| 15 | Judge panel (3 sonnet subagents) | works | Run on the cloud-built clownfish (the golden). Judges read the cloud-rendered PNGs and the ledger recorded all three replies. Medians 5/3/4/3/3/3, mean 3.50 vs the golden's recorded 3.33 (bar 3.03), `mouth_correct` 3 of 3: PASS. About 15 s per judge in parallel, about 90k tokens each. |
| 18 | page-test (Ecosystem page, clownfish) | works except fps | Now a shared tool, `models/shared/tools/page-test.ts`, run by `verify.sh` for creatures. Headless Chromium on `capture.html?visitor=<id>`; the candidate is injected through an in-memory roster and `window.LB_CREATURES` (no roster edit). Clownfish: no console errors at 960x720, 375x667 and 160x120; nose-first 272/280 samples; `idle` plays; feed goes seek, eat, back to idle; stays 0.44 m above the sand. Takes 118 s. A corrupt glb fails with exit 1. **Not checked:** the 40 fps gate (reported "not measured" below 20 fps; software GL gives 1.5 fps at 960x720) and pass-through of other creatures and scenery. |
| 16 | Plant pipeline | unknown | Same Blender path; not run. |
| 17 | Scheduled cloud run | reads work | 2026-11-24: a one-time scheduled task started a fresh cloud session that read the live `models/roster.json` (`Artifact read`) and `checks/profile` and `checks/game_status` (`ArtifactData`, deferred, loaded with ToolSearch). Limits seen: no repository was checked out (a task created with `create_trigger` gives no way to choose one), and `send_message` was not available, so a scheduled run cannot report to another session. Not tried: publishing from a scheduled session, and Blender there. |

### Failures seen, by cause

| Failure | Cause | Type | Fix |
|---|---|---|---|
| `blender` not found | not installed | missing tool | `setup.sh` |
| `magick: not found` / `contact.png` never written | ImageMagick 6 has no `magick` | Linux difference | wrapper in `setup.sh` (now forwards both forms) |
| `verify.sh` printed a contact sheet path and passed without writing it | no check on the file | bug found by this spike | `verify.sh` now fails if `contact.png` is empty |
| `pnpm verify` UI smoke: `ERR_TUNNEL_CONNECTION_FAILED` (fonts, three.js) | `cdn.jsdelivr.net` blocked | cloud network | allow host |
| UI smoke: 404 with no URL | headless Chromium requests `/favicon.ico`; the smoke server returned 404 | harness gap | smoke server answers 204 |
| `chromium.launch()` fails | playwright 1.65.1 wants Chromium rev 1255; the VM preinstalls 1243 | cloud difference | allow `cdn.playwright.dev` and install the pinned build; `CHROMIUM_PATH` (read by `tests/e2e/ui-smoke.ts`) stays as a fallback |
| `capture_ecosystem.ts`: "chrome did not start" | Chrome refuses to run as root without `--no-sandbox` | Linux difference | flag added when uid is 0 (also `watch_creatures.ts`) |
| `sheepshead` spec fails spec-check | idle loop duplicates `gulf_pipefish` | repo issue | not changed; out of scope |

## Timings and resources

Measured with `tools/cloud/measure.py` (wall clock; peak memory is the largest child process).

| Stage | Wall clock | Peak memory |
|---|---|---|
| `setup.sh`, first run | 54 s | |
| `setup.sh`, re-run | 2 s | |
| `./setup.sh --check` | 3 s | |
| `pnpm verify` | about 4 s | |
| Build clownfish (blockout, model, bake, rig, animate, export) | 52 s | 2.2 GB |
| `verify.sh` (4 gates plus 44 QA renders and contact sheet), run twice | 525 s and 546 s | 1.8 GB |
| `verify.sh` with page-test included | 711 s | 1.7 GB |
| `capture_ecosystem.ts` (scenery, run beside another job) | 87 s | 0.2 GB |
| page-test (3 viewport runs, 150 s watch) | 211 s | 0.1 GB |
| Spec-check failure alone (Blender startup) | 27 s | 0.26 GB |

Disk: Blender 1.3 GB, `node_modules` 19 MB, one creature's `models/out` 16 MB. Total used grew about 2 GB.

Almost all the time is software-rendered Eevee: `verify.sh` is 10 minutes of the roughly 12 for one creature. A weekly run with polish rounds (up to 4 builds, each with a re-verify) could reach about 45 minutes before judge time. `verify.sh`'s render step is the place to cut (fewer frames or lower resolution) if that is too long.

## Blockers and open questions

1. **Network allowlist.** The default environment blocks `download.blender.org`, `cdn.jsdelivr.net` and `cdn.playwright.dev`. Spike used a personal `lifeboard` environment with all three added. A fresh user must do the same (or `lifeboard-setup` must create it).
2. **Fresh VM every run.** Blender is a 400 MB download plus 1.3 GB unpacked each run (about 1 minute here). Acceptable; a setup script on the environment could preinstall it, but that script cannot run `./setup.sh` from an unmerged branch.
3. **Live files and db from a scheduled session.** AGENTS.md requires diffing the live artifact against `main` before publishing. `Artifact read` and `ArtifactData` exist here but were not exercised against the live artifact. Needs one read-only trial.
4. **Publishing and landing the model.** A shipped model changes `models/roster.json` and adds assets, which per AGENTS.md go through a PR. Whether a scheduled session can open a PR and publish unattended is untested.
5. **page-test speed.** Ecosystem sim time is clamped to 0.05 s per frame, so on software GL the watch is a small viewport for `--secs` (default 90) of real time, covering far less than 90 s of simulated time. The 40 fps gate and pass-through of other creatures and scenery still need a real GPU or a manual look (model-verify says so).
6. **Judge panel in a scheduled session.** Subagents work in an interactive cloud session; a scheduled session is untested. The judged build was the golden itself, so the result checks that cloud renders look like the Mac's, not that a new species passes. Judges flagged the tail fin as a thin slab and the eye as small (both repo-model matters, not cloud ones).
7. **Browser choice.** One browser everywhere: the Chromium playwright pins, installed by `./setup.sh` through `pnpm bootstrap`, which needs `cdn.playwright.dev`. The capture scripts use it by default (`CHROME` overrides).

## Recommended plan: weekly cloud routine

1. **One-time, in `lifeboard-setup`:** create the personal `lifeboard` environment with hosts `download.blender.org`, `cdn.jsdelivr.net` and `cdn.playwright.dev`, and register a scheduled task that starts a fresh session in it (cron on the user's chosen week-start day, as the existing template does).
2. **Each run:** `./setup.sh` (about 1 min), `./setup.sh --check`.
3. **Live diff first:** `Artifact read` the live files, diff against `main`, port live-only changes (AGENTS.md rule). Stop and report on conflicts.
4. **Game state:** read `checks` / `game_status` with `ArtifactData` (read-only) to see what the week needs.
5. **Pipeline:** `weekly-visitor` and `season-seeds` as written, subagents on sonnet. `verify.sh` takes about 9 minutes per build here, so keep the 30-minute budget in the ledger but expect polish rounds to be limited by it.
6. **Ship:** commit on a branch, open a PR (assets + roster), publish the artifact (pre-approved once checks pass).
7. **Before relying on it,** run it once by hand in a session on the `lifeboard` environment and close open questions 3, 4 and 6.

## Files

- `./setup.sh` (repo root, from main): cross-platform installer and check. This spike's changes to it: the `magick` shim fix. The first draft of a separate `tools/cloud/setup.sh` was dropped in favour of it.
- `models/shared/tools/page-test.ts`: creature page-test, called by `verify.sh` (also see `model-verify`).
- `tools/cloud/measure.py`: wall clock and peak memory wrapper (no GNU `time` on the VM).
