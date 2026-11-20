#!/usr/bin/env bash
# Ship optimization, shared by verify.sh (export-check) and model-ship. Usage: optimize.sh <in.glb> <out.glb> [texture_px=1024]
# Individual steps instead of `gltf-transform optimize`: optimize's prune/flatten drops leaf empties such as `mouth`
# (CONTRACT-required). quantize + webp + resize only; no draco/meshopt (the habitat page has no decoder).
set -euo pipefail
IN=$1; OUT=$2; PX=${3:-1024}; G="npx -y @gltf-transform/cli@4"; T=$(mktemp -d)
$G quantize "$IN" "$T/a.glb"
$G resize "$T/a.glb" "$T/b.glb" --width "$PX" --height "$PX"
$G webp "$T/b.glb" "$OUT"
rm -rf "$T"
