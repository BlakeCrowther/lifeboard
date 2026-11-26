#!/usr/bin/env bash
# Installs the model-pipeline toolchain (Blender >= 5.3, ImageMagick, Node >= 22.18) and the
# repo's JS deps plus the Chromium that `pnpm test:ui` needs (`pnpm bootstrap`), then checks
# the toolchain and repo health. Works on macOS (Homebrew), Linux (apt or dnf; Blender from
# download.blender.org) and Windows (Git Bash, winget). Idempotent: skips whatever is already
# installed. Used by humans, VMs and the cloud environment's setup script.
# Usage: ./setup.sh [--check]    (--check: only run the checks, install nothing)
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
BLENDER_SERIES=5.3
BLENDER_MIN=$BLENDER_SERIES
BLENDER_VERSION=5.3.0
NODE_MIN=22.18 # the repo's tools run .ts files directly (Node strips types by default from 22.18); package.json engines agree
# true when node -v is at least NODE_MIN (major.minor)
node_ok() { local v; v=$(node -v 2>/dev/null | sed 's/^v//'); [[ -n $v ]] || return 1; local maj=${v%%.*} rest=${v#*.}; local min=${rest%%.*}; local nmaj=${NODE_MIN%%.*} nmin=${NODE_MIN#*.}; (( maj > nmaj || (maj == nmaj && min >= nmin) )); }

MODE=${1:-}

have() { command -v "$1" >/dev/null 2>&1; }
log() { echo "setup: $*"; }
die() { echo "setup: $*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *) die "unsupported OS $(uname -s)" ;;
esac

SUDO=""
if [[ $OS == linux && $EUID -ne 0 ]]; then
  have sudo && SUDO=sudo || die "need root or sudo to install packages"
fi

pkg_install() { # linux: package names differ little between apt and dnf for these
  if have apt-get; then $SUDO apt-get update -qq && $SUDO apt-get install -y "$@" >/dev/null
  elif have dnf; then $SUDO dnf install -y "$@" >/dev/null
  else die "no apt-get or dnf; install manually: $*"; fi
}

blender_ok() {
  have blender || return 1
  local v; v=$(blender -b --python-expr "import bpy;print('BLV',bpy.app.version_string)" 2>/dev/null | awk '/^BLV/{print $2}')
  [[ -n "$v" ]] && awk -v a="$v" -v b="$BLENDER_SERIES" 'BEGIN{exit !(a+0>=b+0)}'
}

install_blender() {
  blender_ok && { log "blender ok"; return; }
  case $OS in
    mac) have brew || die "install Homebrew first (https://brew.sh)"; brew install --cask blender ;;
    windows) winget install -e --id BlenderFoundation.Blender --accept-source-agreements --accept-package-agreements
             log "add the Blender folder (C:\\Program Files\\Blender Foundation\\Blender $BLENDER_SERIES) to PATH, then reopen the shell" ;;
    linux)
      [[ "$(uname -m)" == x86_64 ]] || die "Blender has no official Linux build for $(uname -m); install >= $BLENDER_SERIES by hand"
      # libEGL + Mesa drivers: Blender 5 renders headless (Eevee QA renders) through EGL; libGL alone exports but can't render
      pkg_install curl xz-utils libxi6 libxkbcommon0 libsm6 libxrender1 libxfixes3 libgl1 libegl1 libegl-mesa0 libgl1-mesa-dri 2>/dev/null \
        || pkg_install curl xz libXi libxkbcommon libSM libXrender libXfixes mesa-libGL mesa-libEGL mesa-dri-drivers
      $SUDO mkdir -p /opt/blender
      curl -fsSL "https://download.blender.org/release/Blender$BLENDER_SERIES/blender-$BLENDER_VERSION-linux-x64.tar.xz" \
        | $SUDO tar -xJ -C /opt/blender --strip-components=1
      $SUDO ln -sf /opt/blender/blender /usr/local/bin/blender ;;
  esac
}

install_imagemagick() {
  # verify.sh calls `magick montage ...` and `magick in.png -op out.png`; ImageMagick 6 (apt) has no `magick`, so shim both forms.
  # a stale shim can exist yet fail on `magick in.png ...`, so check that it runs, not only that it is on PATH
  if have magick && magick -version >/dev/null 2>&1; then log "imagemagick ok"; return; fi
  case $OS in
    mac) brew install imagemagick ;;
    windows) winget install -e --id ImageMagick.ImageMagick --accept-source-agreements --accept-package-agreements ;;
    linux)
      have montage || pkg_install imagemagick
      { have magick && magick -version >/dev/null 2>&1; } || { printf '#!/bin/sh\ncase "$1" in montage|convert|identify|composite|mogrify|compare|display) exec "$@";; *) exec convert "$@";; esac\n' | $SUDO tee /usr/local/bin/magick >/dev/null; $SUDO chmod +x /usr/local/bin/magick; } ;;
  esac
}

install_node() {
  if have node; then
    if node_ok; then log "node ok"; return; fi
    log "node $(node -v) is older than $NODE_MIN (the repo tools and export-check need >= $NODE_MIN)"
  fi
  case $OS in
    mac) brew install node ;;
    windows) winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements ;;
    linux) die "install Node >= $NODE_MIN (nvm, nodesource or your distro) and re-run" ;;
  esac
}

if [[ $MODE != --check ]]; then
  install_blender
  install_imagemagick
  install_node
  if have pnpm; then (cd "$REPO" && pnpm bootstrap); else log "pnpm not found; skipped pnpm bootstrap (needed for pnpm verify)"; fi
  # repo hook: dev-home's public-check hook runs pre-commit.local after its own check; with no hook, it is pre-commit
  hooks="$(git -C "$REPO" rev-parse --path-format=absolute --git-path hooks)"; mkdir -p "$hooks"
  ln -sf "$REPO/tools/hooks/pre-commit" "$hooks/pre-commit.local"
  [[ -e "$hooks/pre-commit" ]] || ln -s "$REPO/tools/hooks/pre-commit" "$hooks/pre-commit"
fi

# ---- checks (also the weekly run's preflight: any FAIL means no visitor this week) ----
set +e
ok=0; bad=0
pass() { echo "  ok    $1"; ok=$((ok+1)); }
fail() { echo "  FAIL  $1"; echo "        fix: $2"; bad=$((bad+1)); }

echo "lifeboard setup check (model pipelines + local preview)"
[[ "$(uname -m)" == arm64 ]] && echo "  note  Apple Silicon"

if have blender; then
  v=$(blender -b --python-expr "import bpy;print('BLV',bpy.app.version_string)" 2>/dev/null | awk '/^BLV/{print $2}')
  if blender_ok; then pass "blender $v"; else fail "blender >= $BLENDER_MIN (found ${v:-none})" "./setup.sh"; fi
else fail "blender not found" "./setup.sh"; fi

if have magick && magick -version >/dev/null 2>&1; then pass "imagemagick"; else fail "imagemagick" "./setup.sh"; fi

# The repo's tools run .ts files directly, and export-check's optimizer (sharp) needs a recent Node: >= NODE_MIN.
if have node; then
  nv=$(node -v)
  if node_ok; then pass "node $nv"
  else fail "node >= $NODE_MIN (found $nv; the repo tools and export-check fail on older)" "./setup.sh, or put node >= $NODE_MIN first on PATH (nvm use 22)"; fi
else fail "node" "./setup.sh"; fi
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
if [[ -f "$REPO/.claude/launch.json" ]] && grep -q '"port": 8765' "$REPO/.claude/launch.json"; then pass "preview config .claude/launch.json (pnpm dev, port 8765)"
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
# Eevee render: verify.sh's QA renders (turntables, card size, contact sheet) need a working GL/EGL stack, which an export
# alone doesn't touch (a cloud container exported fine and then failed every render on a missing libEGL.so.1)
blender -b --factory-startup --python-expr "import bpy;bpy.ops.mesh.primitive_cube_add();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=s.render.resolution_y=32;bpy.ops.object.camera_add(location=(4,-4,3),rotation=(1.1,0,0.785));s.camera=bpy.context.object;s.render.filepath='$tmp/r.png';bpy.ops.render.render(write_still=True)" >/dev/null 2>&1 \
  && [[ -s "$tmp/r.png" ]] && pass "headless Eevee render" || fail "headless Eevee render" "QA renders will be missing; on Linux install libegl1 libegl-mesa0 libgl1-mesa-dri (re-run ./setup.sh)"
rm -rf "$tmp"

echo "$ok ok, $bad failing"; [[ $bad -eq 0 ]]
