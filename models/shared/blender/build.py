"""Spec → model → bake → rig → animate → glb, using the spec's archetype.
Usage: blender -b --factory-startup --python models/shared/blender/build.py -- <spec.json> [outdir] [--stage blockout|model|all] [--run <run_id>]
Runs G1 (check_spec) first and exits 3 on failure (fail fast, before any Blender work; not a build attempt).
--run <run_id>: records the attempt in the run ledger (shared/tools/ledger.py) after G1 passes; exits 4 with
"BUDGET EXHAUSTED" (no Blender work) when the run's build or time budget is spent. Pipeline runs must always pass it.
Writes outdir/blockout_{side,top}.png (only if the archetype defines blockout()), <id>_model.blend, model.png,
<id>_color.png, build_meta.json (eye size vs body height, for G2), <id>.blend, <id>.glb (default outdir models/out/<id>).
The archetype is looked up in models/<spec.kind>/archetypes/ (kind default creature).."""
import bpy, sys, os, json, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))   # models/
sys.path.insert(0, HERE)
import lib

argv = sys.argv[sys.argv.index("--") + 1:]
stage = "all"
if "--stage" in argv: i = argv.index("--stage"); stage = argv[i + 1]; del argv[i:i + 2]
run_id = None
if "--run" in argv: i = argv.index("--run"); run_id = argv[i + 1]; del argv[i:i + 2]
sys.path.insert(0, os.path.join(ROOT, "shared", "tools"))
import check_spec
g1 = check_spec.main(argv[0])
if not g1["pass"]:
    print("BUILD FAIL G1 (spec):", json.dumps(g1["fails"])); sys.exit(3)
spec = json.load(open(argv[0])); sid = spec["id"]
if run_id:
    import ledger
    ok, msg = ledger.record_build(run_id, sid)
    print("LEDGER", msg)
    if not ok: sys.exit(4)
out = argv[1] if len(argv) > 1 else os.path.join(ROOT, "out", sid); os.makedirs(out, exist_ok=True)

kind = spec.get("kind", "creature")
p = os.path.join(ROOT, kind, "archetypes", spec["archetype"] + ".py")
if not os.path.exists(p): sys.exit(f"BUILD FAIL: no archetype {spec['archetype']} (novel path: write models/{kind}/archetypes/{spec['archetype']}.py)")
ms = importlib.util.spec_from_file_location(spec["archetype"], p); arch = importlib.util.module_from_spec(ms); ms.loader.exec_module(arch)

L = spec["size"]["length_m"]
if hasattr(arch, "blockout"):          # optional cheap silhouette check (side + top), before any detail work
    lib.reset(); arch.blockout(spec)
    print("BUILD blockout", lib.silhouette_renders(os.path.join(out, "blockout"), L))
else: print("BUILD blockout skipped: archetype has no blockout()")
if stage == "blockout": sys.exit(0)

lib.reset(); lib.EYES.clear(); lib.MOUTHS.clear()
parts = arch.model(spec)
arch.material(spec, parts)
mesh = lib.finalize(parts, sid, spec.get("budget", {}).get("tris", 8000))
# the mouth part is joined into the skinned mesh (and its tag dropped at skinning), so record it now for G2
vg = mesh.vertex_groups.get("part:mouth")
mverts = [v for v in mesh.data.vertices if vg and any(g.group == vg.index and g.weight > 0.5 for g in v.groups)]
mouth_meta = [dict(m, verts=len(mverts)) for m in lib.MOUTHS]
rough, coat = lib.gloss_from_spec(spec)
lib.bake_to_single_material(mesh, sid, spec.get("budget", {}).get("texture", 1024), rough, coat, out_png=os.path.join(out, f"{sid}_color.png"))
json.dump({"id": sid, "archetype": spec["archetype"], "tris": lib.tris(mesh), "roughness": rough, "coat": coat,
           "eyes": lib.EYES, "eye_range": lib.EYE_RANGE, "mouth_parts": mouth_meta}, open(os.path.join(out, "build_meta.json"), "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{sid}_model.blend"))
lib.quick_render(os.path.join(out, "model.png"), L)
print("BUILD model", sid, "tris", lib.tris(mesh))
if stage == "model": sys.exit(0)

arm, mouth = arch.rig(spec, mesh)
acts = arch.animate(spec, arm)
lib.stash_nla(arm, acts)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{sid}.blend"))
bpy.ops.object.select_all(action="DESELECT")
lib.export_glb(os.path.join(out, f"{sid}.glb"))
print("BUILD done", sid, "actions", [a.name for a in acts], "->", os.path.join(out, f"{sid}.glb"))
