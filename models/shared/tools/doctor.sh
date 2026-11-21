#!/usr/bin/env bash
# Checks (and with --fix, installs) the creature pipeline toolchain. Safe to re-run.
# Usage: models/shared/tools/doctor.sh [--fix]
set -u
FIX=${1:-}
BLENDER_MIN=5.3
ok=0; bad=0
pass() { echo "  ok    $1"; ok=$((ok+1)); }
fail() { echo "  FAIL  $1"; echo "        fix: $2"; bad=$((bad+1)); }

echo "lifeboard doctor (model pipelines + local preview)"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || echo "  note  written for macOS; Linux works with apt/snap Blender"
[[ "$(uname -m)" == arm64 ]] && echo "  note  Apple Silicon"

# Blender (headless CLI is all the weekly run needs)
if command -v blender >/dev/null; then
  v=$(blender -b --python-expr "import bpy;print('BLV',bpy.app.version_string)" 2>/dev/null | awk '/^BLV/{print $2}')
  if [[ -n "$v" ]] && awk -v a="$v" -v b="$BLENDER_MIN" 'BEGIN{exit !(a+0>=b+0)}'; then pass "blender $v"; else fail "blender >= $BLENDER_MIN (found ${v:-none})" "brew upgrade --cask blender"; fi
else
  [[ "$FIX" == --fix ]] && brew install --cask blender && pass "blender installed" || fail "blender not found" "brew install --cask blender"
fi

# ImageMagick (contact sheets)
if command -v magick >/dev/null; then pass "imagemagick"; else
  [[ "$FIX" == --fix ]] && brew install imagemagick && pass "imagemagick installed" || fail "imagemagick" "brew install imagemagick"; fi

# Node + gltf-transform (validate/optimize glb). export-check's optimizer (sharp) needs Node >= 20.
if command -v node >/dev/null; then
  nv=$(node -v); nmajor=${nv#v}; nmajor=${nmajor%%.*}
  if [[ "$nmajor" =~ ^[0-9]+$ ]] && (( nmajor >= 20 )); then pass "node $nv"
  else fail "node >= 20 (found $nv; export-check fails on older)" "brew upgrade node, or put node >= 20 first on PATH (nvm use 20)"; fi
else fail "node" "brew install node"; fi
if npx -y @gltf-transform/cli@4 --version >/dev/null 2>&1; then pass "gltf-transform"; else fail "gltf-transform (npx @gltf-transform/cli@4)" "check network / npm"; fi

# Optional: Blender MCP for interactive dev (NOT used by the weekly run)
EXT="$HOME/Library/Application Support/Claude/Claude Extensions/ant.dir.gh.blender.blender-mcp"
if [[ -d "$EXT" ]]; then
  if [[ -x "$EXT/.venv/bin/python" ]] && "$EXT/.venv/bin/python" -c "import pydantic_core" 2>/dev/null; then pass "blender MCP extension (optional)"
  else
    fail "blender MCP extension env broken (optional)" "pin Python 3.12: echo 3.12 > \"$EXT/.python-version\"; rm -rf \"$EXT/.venv\"; (cd \"$EXT\" && UV_PYTHON_PREFERENCE=only-managed uv sync)  — then restart Claude"
  fi
else echo "  skip  blender MCP extension not installed (optional, see lifeboard-setup skill)"; fi

# Rust toolchain arch (only matters if pip/uv must compile wheels)
if command -v rustup >/dev/null; then
  t=$(rustup default 2>/dev/null | awk '{print $1}')
  [[ "$(uname -m)" == arm64 && "$t" == *x86_64* ]] && fail "rustup default is $t on arm64 (breaks source builds)" "rustup default stable-aarch64-apple-darwin" || pass "rustup ${t:-unset}"
fi

# Local preview (lifeboard-setup "Local preview")
if [[ -f "$REPO/.claude/launch.json" ]] && grep -q '"port": 8765' "$REPO/.claude/launch.json"; then pass "preview config .claude/launch.json (http.server 8765)"
else fail "preview config .claude/launch.json missing" "restore it from git (serves the repo root on 8765)"; fi
if [[ -f "$REPO/mockdata.js" ]]; then pass "mockdata.js (optional, personal, gitignored)"
else echo "  skip  mockdata.js not present (optional: create your own window.MOCK={...}, see lifeboard-setup)"; fi
grep -q '^models/out/' "$REPO/.gitignore" 2>/dev/null && pass "models/out/ gitignored" || fail "models/out/ not gitignored" "add 'models/out/' to .gitignore"

# judge-panel rule: well formed, numbers only in <kind>/qa_calibration.json, verdict script behaves
if out=$(python3 "$REPO/models/shared/tools/check_judge_rule.py" 2>&1); then pass "judge rule: one source (check_judge_rule.py)"
else fail "judge rule check:
$(sed 's/^/        /' <<<"$out")" "state rule numbers only in models/<kind>/qa_calibration.json pass_rule; point at it from docs"; fi
if out=$(python3 "$REPO/models/shared/tools/test_judge_verdict.py" 2>&1); then pass "judge verdict self-check"
else fail "judge verdict self-check:
$(sed 's/^/        /' <<<"$out")" "fix models/shared/tools/judge_verdict.py"; fi

# Smoke test: build a cube, export glb headless
tmp=$(mktemp -d)
blender -b --factory-startup --python-expr "import bpy;bpy.ops.mesh.primitive_cube_add();bpy.ops.export_scene.gltf(filepath='$tmp/t.glb',export_format='GLB')" >/dev/null 2>&1 \
  && [[ -s "$tmp/t.glb" ]] && pass "headless glb export" || fail "headless glb export" "run blender -b manually and read the error"
rm -rf "$tmp"

echo "$ok ok, $bad failing"; [[ $bad -eq 0 ]]
