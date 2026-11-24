#!/usr/bin/env bash
# Uncounted trial build + the code gates (size, bones, height, motion; swaying scenery: sway measured in the Ecosystem capture), so a counted build is only spent on a candidate
# that already passes them. Usage: models/shared/tools/preflight.sh <spec.json> [--run <run_id>]
# Writes out/<id>/preview/ (QA in out/<id>/preview/qa). Exit 0 when every automated gate passes, else 1 (3 = spec-check).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # models/
SPEC=$(cd "$(dirname "$1")" && pwd)/$(basename "$1"); shift
ID=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$SPEC")
BLENDER=${BLENDER:-blender}
"$BLENDER" -b --factory-startup --python "$ROOT/shared/blender/build.py" -- "$SPEC" --preview "$@" 2>&1 | grep -E "^(BUILD|LEDGER)" ; rc=${PIPESTATUS[0]}
[[ $rc -ne 0 ]] && { echo "PREFLIGHT build failed (exit $rc)"; exit $rc; }
VERIFY_CODE_ONLY=1 "$ROOT/shared/tools/verify.sh" "$ID" "$ROOT/out/$ID/preview/$ID.glb" "$SPEC" | grep -E "FAIL|automated gates"
# swaying scenery: the motion is measured in the real Ecosystem (shader sway can't be seen in Blender)
if python3 -c "import json,sys;d=json.load(open(sys.argv[1]));sys.exit(0 if d.get('kind')=='scenery' and (d.get('motion') or {}).get('sway') else 1)" "$SPEC"; then
  node "$ROOT/shared/tools/capture_ecosystem.ts" "$ID" --glb "$ROOT/out/$ID/preview/$ID.glb" --spec "$SPEC" | grep -E "sway-check|FAIL"
fi
grep -q '"pass": false' "$ROOT/out/$ID/preview/qa/"*.json "$ROOT/out/$ID/preview/qa/ecosystem/"*.json 2>/dev/null && { echo "PREFLIGHT FAIL: fix before a counted build"; exit 1; }
echo "PREFLIGHT PASS: run the counted build (build.py --run)"; exit 0
