#!/usr/bin/env bash
# The code checks (spec, shape, motion, export, and for creatures page-test) + renders for the judge-panel. The judge-panel is run by the model-verify skill.
# Usage: models/shared/tools/verify.sh <id> [path/to/<id>.glb] [path/to/spec.json]
#   VERIFY_RUN=<run_id>: queued time for a build slot is credited to that run. VERIFY_CODE_ONLY=1 stops after the code checks (no judge renders, no contact sheet): what preflight.sh runs.
#   Any kind (spec.kind, default creature): shared gates + the kind's models/<kind>/qa.py.
#   The glb must sit directly in models/out/<id>/, its preview/ (preflight.sh) or models/out/dryrun/<id>/ (any file name; a relative path is tried from
#   the cwd, then from models/). Anything else exits 2, so QA output always lands in that folder's qa/ and never beside a
#   shipped asset. Default glb: models/out/<id>/<id>.glb. Spec search: arg 3, the board's <kind>/specs/<id>.json (shared/tools/model-files.ts),
#   <kind>/specs/examples/<id>.json, <glb dir>/spec.json, out/dryrun/<id>/spec.json.
#   contact.png rows, top to bottom: card-size view (creature and scenery only: the model at the pixel size the user sees
#   on the Ecosystem card, 1x beside the same pixels enlarged, idle then sulk; scale from shared/card_view.json), turntable,
#   growth stages (plant), one strip per clip, motion onion-skins, side-by-side with each golden. Plants have no card-size
#   row: the garden package draws them normalised per plot, not at the Ecosystem's metres-to-pixels scale.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"   # models/
# one Blender job per build slot (slots.py); VERIFY_RUN=<run_id> credits time queued for a slot back to that run's ledger
if [[ -z ${LB_SLOT_HELD:-} ]]; then exec python3 "$ROOT/shared/tools/slots.py" ${VERIFY_RUN:+--run "$VERIFY_RUN"} -- "$0" "$@"; fi
ID=${1:-}; [[ -n $ID ]] || { echo "usage: verify.sh <id> [path/to/<id>.glb] [path/to/spec.json]"; exit 2; }
GLB=${2:-$ROOT/out/$ID/$ID.glb}; SPEC=${3:-}
[[ -f $GLB ]] || { [[ -f $ROOT/$GLB ]] && GLB=$ROOT/$GLB; }
GDIR=$(cd "$(dirname "$GLB")" 2>/dev/null && pwd -P)
[[ -f $GLB && -n $GDIR ]] || { echo "glb not found: $GLB"; exit 2; }
OUTDIR=$(cd "$ROOT/out" 2>/dev/null && pwd -P)   # physical, so a symlinked out/ still matches
if [[ $GDIR != "$OUTDIR/$ID" && $GDIR != "$OUTDIR/$ID/preview" && $GDIR != "$OUTDIR/dryrun/$ID" ]]; then
  echo "refusing $GLB: the glb must be directly in models/out/$ID/, models/out/$ID/preview/ or models/out/dryrun/$ID/ (QA output goes to that folder's qa/); copy it there first"; exit 2; fi
if [[ -z $SPEC ]]; then
  # a spec written by a brief lands in models/board/ before the board has a roster, so search every layer
  for c in "$ROOT"/board/{creature,plant,scenery}/specs/$ID.json "$ROOT"/starter/{creature,plant,scenery}/specs/$ID.json "$ROOT"/{creature,plant,scenery}/specs/$ID.json "$ROOT"/{creature,plant,scenery}/specs/examples/$ID.json "$GDIR/spec.json" "$ROOT/out/dryrun/$ID/spec.json"; do
    [[ -f $c ]] && { SPEC=$c; break; }; done
fi
[[ -f $SPEC ]] || { echo "no spec found for $ID"; exit 2; }
OUT=$GDIR/qa; echo "spec: $SPEC  qa: $OUT"
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
KIND=$(python3 -c "import json;print(json.load(open('$SPEC')).get('kind','creature'))")
if [[ $KIND == creature ]]; then   # plants are checked in the garden plots and scenery by capture_ecosystem.ts (model-verify)
  echo "== page-test (real Ecosystem page, headless browser)"
  PT_GLB=$OPT; [[ -f $PT_GLB ]] || PT_GLB=$GLB
  node "$ROOT/shared/tools/page-test.ts" "$ID" "$PT_GLB" "$SPEC" "$OUT" || { rc=1; [[ -s "$OUT/page-test.json" ]] || echo "  FAIL page-test did not run (browser missing? run pnpm bootstrap)"; }
fi
if [[ -n ${VERIFY_CODE_ONLY:-} ]]; then   # preflight.sh: the code gates only; no judge sees a trial build, so don't spend minutes rendering sheets for it
  echo "== automated gates: $([[ $rc -eq 0 ]] && echo PASS || echo FAIL)  (code gates only: renders skipped, VERIFY_CODE_ONLY)"; exit $rc; fi
echo "== judge-panel renders"
CLIPS=$(python3 -c "import json;s=json.load(open('$SPEC'));k=s.get('kind','creature');print({'plant':'sway_4,tend','scenery':'sway' if (s.get('motion') or {}).get('sway') else ''}.get(k,'idle,feed,sulk'))")
PITCH=$(python3 -c "import json;print(30 if json.load(open('$SPEC')).get('kind')=='scenery' else 8)")   # scenery: see the top face (sand dollar petals)
# card-size view inputs: "<px per metre> <extra display scale> <note>"; empty for plants (no Ecosystem-card size).
# Scenery is drawn at biomes.json's per-placement scale on top of px_per_m; show the smallest placement (the worst case).
CARD=$(python3 - "$ROOT" "$SPEC" <<'EOF'
import json, sys
sys.path.insert(0, sys.argv[1] + "/shared/tools")
import model_files
root, spec = sys.argv[1:3]
s = json.load(open(spec)); kind = s.get("kind", "creature")
if kind == "plant": sys.exit(0)
ppm, scale, note = json.load(open(root + "/shared/card_view.json"))["px_per_m"], 1.0, ""
if kind == "scenery":
    note = "not placed in biomes.json: scale 1"
    for b in json.load(open(model_files.resolve("biomes.json"))).get("biomes", []):
        mine = [p["scale"][0] for p in b.get("scenery", []) if b.get("id") == s.get("biome") and p.get("id") == s["id"] and p.get("scale")]
        if mine: scale, note = min(mine), "smallest biome placement, scale %g" % min(mine)
print(ppm, scale, note)
EOF
)
CARD_ARGS=(); CARD_PPM=; CARD_SCALE=; CARD_NOTE=
[[ -n $CARD ]] && { read -r CARD_PPM CARD_SCALE CARD_NOTE <<< "$CARD"; CARD_ARGS=(--card-px-per-m "$CARD_PPM" --card-scale "$CARD_SCALE"); }
rm -f "$OUT"/renders/card_size* "$OUT/row_card.png"   # a crashed render must not leave a stale card row behind
# golden source: the contract build out/<gid>/<gid>.glb if present (true meters), else the roster's shipped glb
GOLD=$(python3 -c "
import json,os,sys;sys.path.insert(0,'$ROOT/shared/tools');import model_files;r=json.load(open(model_files.resolve('roster.json')))
print(' '.join(next(p for p in ('$ROOT/out/%s/%s.glb'%(c['id'],c['id']),str(model_files.resolve(c['glb']))) if os.path.exists(p)) for c in r['models'] if c.get('golden') and c['id']!='$ID' and c.get('kind','creature')==json.load(open('$SPEC')).get('kind','creature')))")
blender -b --factory-startup --python "$ROOT/shared/blender/qa_render.py" -- "$GLB" "$OUT/renders" $GOLD --clips "$CLIPS" --pitch "$PITCH" ${CARD_ARGS[@]+"${CARD_ARGS[@]}"} ${QA_LEGACY_FRAMING:+--legacy-framing} 2>&1 | grep -E "QA_RENDER|Error|Traceback" || true
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
  # first row: the model at the pixel size the user sees (1x, actual pixels) beside the same pixels enlarged by pixel
  # replication, so a judge can inspect what survives at that size without smoothing inventing detail
  if [[ -f $OUT/renders/card_size.json ]]; then
    read -r CW CH CK CPOSES CMODEL <<< "$(python3 - "$OUT/renders/card_size.json" "$(magick identify -format %w "$OUT/row_turn.png")" <<'EOF'
import json, sys
c = json.load(open(sys.argv[1])); w, h = c["canvas_px"]; poses = c["poses"]
room = int(sys.argv[2]) // (2 * len(poses)) - 16   # keep the row no wider than the turntable row; at most 6x, at least 2x, at most 480 px tall
print(w, h, max(2, min(6, room // w, 480 // h)), ",".join(poses), "%gx%g" % tuple(c["model_px"]))
EOF
)"
    tiles=()
    for p in ${CPOSES//,/ }; do
      magick "$OUT/renders/card_size_$p.png" -filter point -resize $(( CK * 100 ))% "$OUT/renders/card_size_${p}_enlarged.png"
      tiles+=(-label "$p, 1x: what the user sees (${CW}x${CH} px)" "$OUT/renders/card_size_$p.png" -label "$p, same pixels enlarged ${CK}x" "$OUT/renders/card_size_${p}_enlarged.png")
    done
    TW=$(( CW * CK )); (( TW < 300 )) && TW=300   # wide enough for the label under the tile
    if magick montage "${tiles[@]}" -tile "$(( ${#tiles[@]} / 3 ))x1" -geometry "${TW}x$(( CH * CK ))>+8+6" -background '#0b2230' -fill white -pointsize 16 "$OUT/row_card_tiles.png" &&
       magick -background '#0b2230' -fill white -pointsize 18 label:"card size: what the user sees (1x) and the same pixels enlarged ${CK}x. Model about ${CMODEL} px${CARD_NOTE:+ ($CARD_NOTE)}" \
         "$OUT/row_card_tiles.png" -gravity west -append "$OUT/row_card.png"; then rows=("$OUT/row_card.png" "${rows[@]}")
    else echo "  FAIL card-size row not built"; rc=1; fi
  fi
  magick "${rows[@]}" -background '#0b2230' -gravity west -append "$OUT/contact.png"
  [[ -s "$OUT/contact.png" ]] || { echo "  FAIL contact sheet was not written (ImageMagick failed above)"; rc=1; }
  echo "  contact sheet: $OUT/contact.png"; for f in "$OUT"/renders/side_*.png; do echo "  side-by-side: $f"; done
  for f in "$OUT"/renders/card_size_*.png; do [[ $f == *_enlarged.png ]] || echo "  card size (1x): $f"; done
else echo "  FAIL renders missing"; rc=1; fi
echo "== automated gates: $([[ $rc -eq 0 ]] && echo PASS || echo FAIL)  (next: judge-panel via model-verify skill)"
exit $rc
