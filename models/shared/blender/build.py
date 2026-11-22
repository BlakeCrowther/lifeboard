"""Spec → model → bake → rig → animate → glb, using the spec's archetype.
Usage: blender -b --factory-startup --python models/shared/blender/build.py -- <spec.json> [outdir] [--stage blockout|model|all] [--run <run_id>]
Runs spec-check (check_spec) first and exits 3 on failure (fail fast, before any Blender work; not a build attempt).
--run <run_id>: records the attempt in the run ledger (shared/tools/ledger.py) after spec-check passes; exits 4 with
"BUDGET EXHAUSTED" (no Blender work) when the run's build or time budget is spent, exits 6 "PLAN NEEDED" when the last build
was judged and no `ledger.py plan` follows it. Pipeline runs must always pass it.
--preview: an uncounted trial build into out/<id>/preview/ (with --run it still checks the run's minutes, never its builds).
shared/tools/preflight.sh wraps it with verify.sh so size, bones and height fail before a counted build is spent.
Writes outdir/blockout_{side,top}.png (only if the archetype defines blockout()), <id>_model.blend,
<id>_color.png, build_meta.json (eye size vs body height, mouth part, fin root/edge thickness, for shape-check), <id>.blend,
<id>.glb (default outdir models/out/<id>).
The archetype is looked up in models/<spec.kind>/archetypes/ (kind default creature). rig() may return (None, None)
for a static model (scenery without sway): no armature, no actions."""

import importlib.util
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # models/
sys.path.insert(0, HERE)
import lib

argv = sys.argv[sys.argv.index("--") + 1 :]
stage = "all"
if "--stage" in argv:
    i = argv.index("--stage")
    stage = argv[i + 1]
    del argv[i : i + 2]
preview = "--preview" in argv
if preview:
    argv.remove("--preview")
run_id = None
if "--run" in argv:
    i = argv.index("--run")
    run_id = argv[i + 1]
    del argv[i : i + 2]
sys.path.insert(0, os.path.join(ROOT, "shared", "tools"))
import check_spec

spec_report = check_spec.main(argv[0])
if not spec_report["pass"]:
    print("BUILD FAIL spec-check:", json.dumps(spec_report["fails"]))
    sys.exit(3)
spec = json.load(open(argv[0]))
sid = spec["id"]
if run_id:
    import ledger

    ok, msg = (ledger.record_preview if preview else ledger.record_build)(run_id, sid)
    print("LEDGER", msg)
    if not ok:
        sys.exit(6 if msg.startswith("PLAN") else 4)
out = argv[1] if len(argv) > 1 else os.path.join(ROOT, "out", sid, *(["preview"] if preview else []))
os.makedirs(out, exist_ok=True)

kind = spec.get("kind", "creature")
p = os.path.join(ROOT, kind, "archetypes", spec["archetype"] + ".py")
if not os.path.exists(p):
    sys.exit(
        f"BUILD FAIL: no archetype {spec['archetype']} (novel path: write models/{kind}/archetypes/{spec['archetype']}.py)"
    )
ms = importlib.util.spec_from_file_location(spec["archetype"], p)
arch = importlib.util.module_from_spec(ms)
ms.loader.exec_module(arch)

L = spec["size"].get("length_m", spec["size"].get("height_m"))  # plants: height
if kind == "scenery":
    L = max(L, spec["size"].get("footprint_m", 0))  # flat props (a sand dollar) frame by width
C = (0, 0, L / 2) if kind in ("plant", "scenery") else (0, 0, 0)  # plants/scenery stand on their ground point
if hasattr(arch, "blockout"):  # optional cheap silhouette check (side + top), before any detail work
    lib.reset()
    arch.blockout(spec)
    print("BUILD blockout", lib.silhouette_renders(os.path.join(out, "blockout"), L))
else:
    print("BUILD blockout skipped: archetype has no blockout()")
if stage == "blockout":
    sys.exit(0)

lib.reset()
lib.EYES.clear()
lib.MOUTHS.clear()
lib.FLAT_PARTS.clear()
parts = arch.model(spec)
arch.material(spec, parts)
lib.measure_flat_parts()  # part identity is lost in the join, so fin thickness is measured per part now, for shape-check
mesh = lib.finalize(parts, sid, spec.get("budget", {}).get("tris", 8000))
# the mouth part is joined into the skinned mesh (and its tag dropped at skinning), so record it now for shape-check
vg = mesh.vertex_groups.get("part:mouth")
mverts = [v for v in mesh.data.vertices if vg and any(g.group == vg.index and g.weight > 0.5 for g in v.groups)]
mouth_meta = [dict(m, verts=len(mverts)) for m in lib.MOUTHS]
rough, coat = lib.gloss_from_spec(spec)
lib.bake_to_single_material(
    mesh, sid, spec.get("budget", {}).get("texture", 1024), rough, coat, out_png=os.path.join(out, f"{sid}_color.png")
)
flat_meta = [{k: v for k, v in r.items() if k != "columns"} for r in lib.FLAT_PARTS]
fin_meta = (
    {"has_fins": getattr(arch, "HAS_FINS", True)} if kind == "creature" else {}
)  # an archetype without fins says so
json.dump(
    {
        "id": sid,
        "archetype": spec["archetype"],
        "tris": lib.tris(mesh),
        "roughness": rough,
        "coat": coat,
        "eyes": lib.EYES,
        "eye_range": lib.EYE_RANGE,
        "mouth_parts": mouth_meta,
        "flat_parts": flat_meta,
        **fin_meta,
    },
    open(os.path.join(out, "build_meta.json"), "w"),
    indent=1,
)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{sid}_model.blend"))
print("BUILD model", sid, "tris", lib.tris(mesh))
if stage == "model":
    sys.exit(0)

lib.placement_extras(mesh, spec)
if ((spec.get("motion") or {}).get("sway") or {}).get("mode") == "shader":  # habitat shader sways it: no bones, no clip
    lib.shader_sway(mesh, spec, getattr(arch, "sway_weights", None))
    arm = None
else:
    arm, mouth = arch.rig(spec, mesh)
acts = arch.animate(spec, arm) if arm else []  # static scenery: no rig, no actions
if arm:
    lib.stash_nla(arm, acts)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{sid}.blend"))
bpy.ops.object.select_all(action="DESELECT")
lib.export_glb(os.path.join(out, f"{sid}.glb"))
print("BUILD done", sid, "actions", [a.name for a in acts], "->", os.path.join(out, f"{sid}.glb"))
