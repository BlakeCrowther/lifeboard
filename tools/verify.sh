#!/usr/bin/env bash
# Runs every cheap check, keeps going after a failure, prints a table, exits 1 if any failed.
# Optional steps that need a missing tool are SKIPped, not failed.
cd "$(dirname "$0")/.." || exit 2
rows=(); fail=0
run() { # name, cmd...
  local name=$1; shift
  if out=$("$@" 2>&1); then rows+=("PASS  $name"); else rows+=("FAIL  $name"); fail=1; printf -- '--- %s\n%s\n' "$name" "$out" >&2; fi
}
skip() { rows+=("SKIP  $1 ($2)"); }

run "no stray JavaScript (check:no-js)" pnpm -s check:no-js
run "game rules vs SPEC.md" pnpm -s spec-check
run "sim runs (balance report)" pnpm -s sim 20 8
if [ -d node_modules/typescript ]; then
  run "typecheck (tsc)" pnpm -s typecheck
  run "lint (eslint + boundaries)" pnpm -s lint
  run "build (esbuild)" pnpm -s build
  run "unit tests (vitest)" pnpm -s exec vitest run
else skip "typecheck, lint, build, vitest" "run pnpm bootstrap"; fi
run "eval graders (self-test)" pnpm -s eval --self-test
run "biomes.json valid (check_biome.py)" python3 models/shared/tools/check_biome.py
if command -v swiftc >/dev/null; then run "break timer pacing" break/test.sh; else skip "break timer pacing" "swiftc not installed"; fi
run "model pipeline map current" python3 models/shared/tools/render_pipeline_map.py --check
if [ -d node_modules/playwright ]; then run "UI smoke (headless Chromium)" node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/e2e/ui-smoke.ts; else skip "UI smoke" "run pnpm bootstrap"; fi
if command -v uv >/dev/null; then
  run "doc frontmatter" tools/check-doc-frontmatter
  run "python lint (ruff + pyright)" pnpm -s lint:py
else skip "doc frontmatter, python lint" "uv not installed"; fi

printf '\n'; printf '%s\n' "${rows[@]}"
exit $fail
