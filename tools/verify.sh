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

run "syntax (node --check)" bash -c 'shopt -s nullglob; for f in *.js tools/*.js tools/ui-smoke/*.js; do node --check "$f" || exit 1; done'
run "game rules vs SPEC.md" pnpm -s spec-check
run "sim runs (balance report)" pnpm -s sim 20 8
if [ -d node_modules/typescript ]; then
  run "typecheck (tsc)" pnpm -s typecheck
  run "lint (eslint + boundaries)" pnpm -s lint
  run "build (esbuild)" pnpm -s build
  run "unit tests (vitest)" pnpm -s exec vitest run
else skip "typecheck, lint, build, vitest" "run pnpm bootstrap"; fi
run "eval graders (self-test)" node evals/run.ts --self-test
run "model pipeline map current" python3 models/shared/tools/render_pipeline_map.py --check
if [ -d node_modules/playwright ]; then run "UI smoke (headless Chromium)" node tools/ui-smoke/run.js; else skip "UI smoke" "run pnpm bootstrap"; fi
if command -v uv >/dev/null; then run "doc frontmatter" tools/check-doc-frontmatter; else skip "doc frontmatter" "uv not installed"; fi

printf '\n'; printf '%s\n' "${rows[@]}"
exit $fail
