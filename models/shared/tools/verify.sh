#!/usr/bin/env bash
# The four code checks (spec, shape, motion, export) + renders for the judge-panel. The judge-panel and page-test are done by the model-verify skill.
# Usage: models/shared/tools/verify.sh <id> [path/to/<id>.glb] [path/to/spec.json]
#   Any kind (spec.kind, default creature): shared gates + the kind's models/<kind>/qa.py.
#   default glb: models/out/<id>/<id>.glb. Spec search: arg 3, <kind>/specs/<id>.json, <kind>/specs/examples/<id>.json,
#   <glb dir>/spec.json, out/dryrun/<id>/spec.json. QA output goes next to the glb: <glb dir>/qa.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # models/
ID=$1; GLB=${2:-$ROOT/out/$ID/$ID.glb}; SPEC=${3:-}
if [[ -z $SPEC ]]; then
  for c in "$ROOT"/{creature,plant,scenery}/specs/$ID.json "$ROOT"/{creature,plant,scenery}/specs/examples/$ID.json "$(dirname "$GLB")/spec.json" "$ROOT/out/dryrun/$ID/spec.json"; do
    [[ -f $c ]] && { SPEC=$c; break; }; done
fi
[[ -f $SPEC ]] || { echo "no spec found for $ID"; exit 2; }
OUT=$(cd "$(dirname "$GLB")" && pwd)/qa; echo "spec: $SPEC  qa: $OUT"
mkdir -p "$OUT"; rc=0
echo "== spec-check";     python3 "$ROOT/shared/tools/check_spec.py" "$SPEC" > "$OUT/spec-check.json" || rc=1; cat "$OUT/spec-check.json" | head -20
echo "== shape-check + motion-check (blender)"; blender -b --factory-startup --python "$ROOT/shared/blender/qa_structural.py" -- "$GLB" "$SPEC" "$OUT/shape-motion-check.json" 2>&1 | grep -E "QA_STRUCTURAL|Error|Traceback" || true
[[ -s "$OUT/shape-motion-check.json" ]] || { echo "qa_structural crashed"; rc=1; }
python3 -c "import json,sys;r=json.load(open('$OUT/shape-motion-check.json'));[print(('  ok  ' if c['pass'] else '  FAIL'),c['gate'],c['check'],'|',c['detail']) for c in r['checks']];sys.exit(0 if r['pass'] else 1)" || rc=1
echo "== export-check";
RAR=$(python3 -c "import json;print(json.load(open('$SPEC'))['rarity'])")
LIMIT=$(python3 -c "import json;k=json.load(open('$SPEC')).get('kind','creature');print((200 if k=='scenery' else {'common':400,'rare':600,'exotic':1200}['$RAR'])*1024)")   # scenery: 200 KB per prop
# export-check runs on what ships: optimize exactly like model-ship, then validate + size the optimized file (shape-check and motion-check stay on the source)
TEXSZ=$(python3 -c "import json;print(json.load(open('$SPEC')).get('budget',{}).get('texture',1024))")
OPT="$OUT/optimized.glb"; rm -f "$OPT"
"$ROOT/shared/tools/optimize.sh" "$GLB" "$OPT" "$TEXSZ" > "$OUT/export-check_optimize.txt" 2>&1 || echo "  optimize failed (see export-check_optimize.txt)"
[[ -f $OPT ]] || OPT=/nonexistent
npx -y @gltf-transform/cli@4 validate "$OPT" > "$OUT/export-check_validate.txt" 2>&1
# section "ERROR" followed by "No errors found" means clean
ERRS=$(awk '/^ ERROR/{e=1;next} /^ WARNING/{e=0} e && /│ [A-Z_]+ +│/{n++} END{print n+0}' "$OUT/export-check_validate.txt")
SIZE=$(stat -f%z "$OPT" 2>/dev/null || stat -c%s "$OPT" 2>/dev/null || echo 999999999)
python3 - "$OUT/export-check.json" "$ERRS" "$SIZE" "$LIMIT" <<'EOF' || rc=1
import json,sys
out,errs,size,limit=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),int(float(sys.argv[4]))
c=[{"gate":"export-check","check":"gltf validator (optimized): no errors","pass":errs==0 and size<999999999,"detail":f"{errs} error lines"},
   {"gate":"export-check","check":f"file <= {limit//1024} KB","pass":size<=limit,"detail":f"{size//1024} KB optimized (qa/optimized.glb)"}]
json.dump({"checks":c,"pass":all(x["pass"] for x in c)},open(out,"w"),indent=1)
[print(('  ok  ' if x['pass'] else '  FAIL'),x['gate'],x['check'],'|',x['detail']) for x in c]
sys.exit(0 if all(x["pass"] for x in c) else 1)
EOF
echo "== judge-panel renders"
CLIPS=$(python3 -c "import json;s=json.load(open('$SPEC'));k=s.get('kind','creature');print({'plant':'sway_4,tend','scenery':'sway' if (s.get('motion') or {}).get('sway') else ''}.get(k,'idle,feed,sulk'))")
PITCH=$(python3 -c "import json;print(30 if json.load(open('$SPEC')).get('kind')=='scenery' else 8)")   # scenery: see the top face (sand dollar petals)
# golden source: the contract build out/<gid>/<gid>.glb if present (true meters), else the roster's shipped glb
GOLD=$(python3 -c "
import json,os;r=json.load(open('$ROOT/roster.json'))
print(' '.join(next(p for p in ('$ROOT/out/%s/%s.glb'%(c['id'],c['id']),'$ROOT/'+c['glb']) if os.path.exists(p)) for c in r['models'] if c.get('golden') and c['id']!='$ID' and c.get('kind','creature')==json.load(open('$SPEC')).get('kind','creature')))")
blender -b --factory-startup --python "$ROOT/shared/blender/qa_render.py" -- "$GLB" "$OUT/renders" $GOLD --clips "$CLIPS" --pitch "$PITCH" ${QA_LEGACY_FRAMING:+--legacy-framing} 2>&1 | grep -E "QA_RENDER|Error|Traceback" || true
shopt -s nullglob
turns=("$OUT"/renders/turn_*.png)
if (( ${#turns[@]} )); then
  magick montage "$OUT"/renders/turn_*.png -tile 8x1 -geometry 192x192+2+2 -background '#0b2230' "$OUT/row_turn.png"
  CL=(); [[ -n $CLIPS ]] && IFS=, read -r -a CL <<< "$CLIPS"; rows=("$OUT/row_turn.png"); mot=()
  stg=("$OUT"/renders/stage_[0-9].png)   # nullglob: empty unless the model has growth stages (a bare `ls` lists cwd)
  if (( ${#stg[@]} )); then   # plants: growth strip, seed -> bloom at one scale
    magick montage "$OUT"/renders/stage_[0-9].png -tile 5x1 -geometry 256x256+2+2 -background '#0b2230' "$OUT/row_stages.png"; rows+=("$OUT/row_stages.png"); fi
  for c in ${CL[@]+"${CL[@]}"}; do   # one strip per clip (creature: idle, feed, sulk; plant: sway_4, tend)
    magick montage "$OUT"/renders/${c}_[0-9].png -tile 6x1 -geometry 256x256+2+2 -background '#0b2230' "$OUT/row_${c}.png"; rows+=("$OUT/row_${c}.png")
    # motion onion-skin: frame 0 opaque + 5 later poses at 40% opacity, one image per clip
    [[ -f "$OUT/renders/onion_${c}_0.png" ]] || continue
    args=("$OUT/renders/onion_${c}_0.png")
    for f in "$OUT"/renders/onion_${c}_[1-9].png; do args+=( \( "$f" -channel A -evaluate multiply 0.4 +channel \) -composite ); done
    magick "${args[@]}" "$OUT/renders/motion_${c}.png"; mot+=(-label "$c: 6 poses overlaid, 3/4 above" "$OUT/renders/motion_${c}.png")
  done
  if (( ${#mot[@]} )); then   # static scenery has no clips
    magick montage "${mot[@]}" -tile $(( ${#mot[@]} / 3 ))x1 -geometry 384x384+4+4 -background '#0b2230' -fill white -pointsize 16 "$OUT/row_motion.png"
    rows+=("$OUT/row_motion.png"); fi
  # side-by-side: separate panels at one shared scale (true relative size), labelled
  for p in "$OUT"/renders/panel_*.png; do
    g=$(basename "$p" .png); g=${g#panel_}; [[ $g == new || $g == mag_* ]] && continue
    # true-scale pair; plus a "magnified to same length" panel when the new creature is < 50% of the golden's length
    tiles=(-label "$ID (new, true scale)" "$OUT/renders/panel_new.png" -label "$g (golden)" "$p")
    MAG=$(python3 -c "import json,sys;print((json.load(open(sys.argv[1])).get(sys.argv[2]) or {}).get('magnified') or '')" "$OUT/renders/panels.json" "$g" 2>/dev/null)
    [[ -n $MAG && -f "$OUT/renders/panel_mag_$g.png" ]] && tiles+=(-label "$ID magnified x$MAG (= $g length)" "$OUT/renders/panel_mag_$g.png")
    magick montage "${tiles[@]}" -tile "$(( ${#tiles[@]} / 3 ))x1" -geometry 384x384+4+4 -background '#0b2230' -fill white -pointsize 16 "$OUT/renders/side_$g.png"
    rows+=("$OUT/renders/side_$g.png")
  done
  magick "${rows[@]}" -background '#0b2230' -gravity west -append "$OUT/contact.png"
  echo "  contact sheet: $OUT/contact.png"; for f in "$OUT"/renders/side_*.png; do echo "  side-by-side: $f"; done
else echo "  FAIL renders missing"; rc=1; fi
echo "== automated gates: $([[ $rc -eq 0 ]] && echo PASS || echo FAIL)  (next: judge-panel + page-test via model-verify skill)"
exit $rc
