"""Shared shape-check (structure) + motion-check (animation) gates on an exported model .glb, any kind; kind-specific gates live in
models/<kind>/qa.py (spec.kind, default creature), exec'd into this namespace. A kind qa defines shape_check() (run at the REST
pose, must set global L = the kind's "length" for scale-relative checks) and motion_check() (run with the actions in POSE mode),
using check(), meshes, arms, empties, mn/mx/dim, meta, and the helpers use/pose/delta/verts/motion below.
Usage: blender -b --factory-startup --python qa_structural.py -- <file.glb> <spec.json> <out.json>
Re-imports the glb (so we test what ships, not the .blend), checks the kind's CONTRACT.md, writes a JSON report."""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
GLB, SPEC, OUT = argv[0], argv[1], argv[2]
spec = json.load(open(SPEC))
TRIS = {"common": 8000, "rare": 12000, "exotic": 20000}
BONES = {"common": 32, "rare": 32, "exotic": 48}
TEX = {"common": 1024, "rare": 1024, "exotic": 2048}
rar = spec.get("rarity", "common")
checks = []


def check(gate, name, ok, detail=""):
    checks.append({"gate": gate, "check": name, "pass": bool(ok), "detail": detail})


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
# glTF import adds hidden helper meshes (bone shapes); only visible meshes are the creature
meshes = [o for o in sc.objects if o.type == "MESH" and o.visible_get()]
arms = [o for o in sc.objects if o.type == "ARMATURE"]
empties = {o.name.split(".")[0]: o for o in sc.objects if o.type == "EMPTY"}

# ---------- shape-check (structure) ----------
# Every bbox/position check is measured at the REST pose (armature pose_position='REST'), never at frame 0 of an
# action: an asymmetric idle frame 0 (e.g. tail mid-sweep) must not read as an asymmetric model. motion-check switches back.
for a in arms:
    if a.animation_data:
        a.animation_data.action = None
    a.data.pose_position = "REST"
bpy.context.view_layer.update()


def rest_points():
    d = bpy.context.evaluated_depsgraph_get()
    out = []
    for o in meshes:
        e = o.evaluated_get(d)
        m = e.to_mesh()
        out += [o.matrix_world @ v.co for v in m.vertices]
        e.to_mesh_clear()
    return out


tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
MESH_MAX = 15 if spec.get("kind", "creature") == "plant" else 3  # plants: <= 3 per stage x 5 stages
check("shape-check", f"meshes 1-{MESH_MAX}", 1 <= len(meshes) <= MESH_MAX, f"{len(meshes)}")
check("shape-check", f"tris <= {TRIS[rar]}", tris <= TRIS[rar], f"{tris}")
pts = rest_points()
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
dim = mx - mn
mats = {m.name for o in meshes for m in o.data.materials if m}
check("shape-check", "materials <= 3", len(mats) <= 3, f"{sorted(mats)}")
texmax = max([max(i.size) for i in bpy.data.images if i.size[0]] or [0])
check("shape-check", f"texture <= {TEX[rar]}", texmax <= TEX[rar], f"{texmax}")
nan = any(not all(math.isfinite(c) for c in v.co) for o in meshes for v in o.data.vertices)
check("shape-check", "no NaN/inf vertices", not nan)
if spec.get("kind") == "scenery":  # static props have no rig; swaying ones exactly one
    sw = (spec.get("motion") or {}).get("sway") or {}
    want = 1 if sw and sw.get("mode") != "shader" else 0  # shader sway: moved by the Ecosystem, no rig
    check("shape-check", f"{want} armature (sway {'yes' if want else 'no'})", len(arms) == want, f"{len(arms)}")
else:
    check("shape-check", "one armature", len(arms) == 1, f"{len(arms)}")
meta = {}
# eye size (STYLE: diameter 8-12% of body height). Eyes are joined into the skinned mesh, so geometry tags are gone after
# export; build.py records each lib.eye() in build_meta.json and we check that. Missing meta = FAIL (not skipped).
sid = spec["id"]
here = os.path.dirname(os.path.abspath(GLB))
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # models/
meta_p = next(
    (
        p
        for p in (
            os.path.join(here, "build_meta.json"),
            os.path.join(root, "out", sid, "build_meta.json"),
            os.path.join(root, "out", "dryrun", sid, "build_meta.json"),
        )
        if os.path.exists(p)
    ),
    None,
)
if meta_p is None:
    check("shape-check", "build_meta.json present (eye size record)", False, "rebuild with blender/build.py")
else:
    meta = json.load(open(meta_p))
    eyes = meta.get("eyes", [])
    lo, hi = meta.get("eye_range", (0.08, 0.12))
    if not eyes:
        check(
            "shape-check",
            "eyes: none tagged eyeL/eyeR (allowed only if body plan has no eyes)",
            True,
            "no lib.eye() calls",
        )
    for e in eyes:
        r = e["diameter_m"] / e["body_height_m"]
        check(
            "shape-check",
            f"eye {e['name']} diameter {lo:.0%}-{hi:.0%} of body height",
            lo - 1e-6 <= r <= hi + 1e-6,
            f"{r:.3f}",
        )
if arms:
    a = arms[0]
    check("shape-check", f"bones <= {BONES[rar]}", len(a.data.bones) <= BONES[rar], f"{len(a.data.bones)}")
    over = 0
    unnorm = 0
    unweighted = 0
    for o in meshes:
        if not any(m.type == "ARMATURE" for m in o.modifiers) and o.parent != a:
            continue
        vg_bones = {vg.index for vg in o.vertex_groups if vg.name in a.data.bones}
        for v in o.data.vertices:
            ws = [g.weight for g in v.groups if g.group in vg_bones and g.weight > 1e-4]
            if len(ws) > 4:
                over += 1
            if not ws:
                unweighted += 1
            elif abs(sum(ws) - 1) > 0.02:
                unnorm += 1
    check("shape-check", "<= 4 influences per vertex", over == 0, f"{over} verts over")
    check("shape-check", "weights normalized", unnorm == 0, f"{unnorm} verts")
    check("shape-check", "every vertex weighted", unweighted == 0, f"{unweighted} verts")

KIND = spec.get("kind", "creature")
KQA = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), KIND, "qa.py")
if not os.path.exists(KQA):
    raise SystemExit(f"no kind qa for kind {KIND!r}: {KQA}")
L = max(dim.x, dim.y)  # default scale; the kind's shape_check() sets its own "length"
exec(compile(open(KQA).read(), KQA, "exec"), globals())  # defines shape_check(), motion_check()
shape_check()  # pyright: ignore[reportUndefinedVariable]

# ---------- motion-check (animation; shared helpers; clips + rules come from the kind) ----------
for a in arms:
    a.data.pose_position = "POSE"


def use(act):
    ad = arms[0].animation_data or arms[0].animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = act
    if hasattr(ad, "action_slot") and getattr(act, "slots", None):
        ad.action_slot = act.slots[0]


def pose(f):
    sc.frame_set(f)
    return [pb.matrix.copy() for pb in arms[0].pose.bones]


def delta(p, q):
    return max(abs(a[i][j] - b[i][j]) for a, b in zip(p, q) for i in range(4) for j in range(4)) if p else 0


def verts(f):
    sc.frame_set(f)
    d = bpy.context.evaluated_depsgraph_get()
    out = []
    for o in meshes:
        e = o.evaluated_get(d)
        m = e.to_mesh()
        step = max(1, len(m.vertices) // 1500)
        out += [o.matrix_world @ m.vertices[i].co for i in range(0, len(m.vertices), step)]
        e.to_mesh_clear()
    return out


def motion(act):
    """Returns (max speed, max jerk-spike, max displacement from first frame) in body lengths. Speed catches flailing; the spike catches pops:
    a frame whose acceleration is far above the clip's typical acceleration (a discontinuity, not just fast motion)."""
    s, e = map(int, act.frame_range)
    P = [verts(f) for f in range(s, e + 1)]
    speed = max(max((a - b).length for a, b in zip(P[i + 1], P[i])) for i in range(len(P) - 1)) / L
    acc = [max((a - 2 * b + c).length for a, b, c in zip(P[i - 1], P[i], P[i + 1])) / L for i in range(1, len(P) - 1)]
    # a pop is an isolated frame: much sharper than both neighbours (smooth accent beats ramp up and down)
    nb = lambda i: max(acc[i - 1] if i > 0 else 0, acc[i + 1] if i + 1 < len(acc) else 0)
    # floor is relative to the clip's own typical acceleration (median) so body shape/size doesn't flip a borderline frame:
    # a pop must clear 0.03 L/frame^2 AND 3x the clip median AND 1.6x both neighbours
    med = sorted(acc)[len(acc) // 2] if acc else 0
    spike = max((x for i, x in enumerate(acc) if x > max(0.03, 3 * med) and x > 1.6 * nb(i)), default=0)
    amp = max(max((a - b).length for a, b in zip(P[i], P[0])) for i in range(len(P))) / L
    return speed, spike, amp


if arms or KIND == "scenery":
    motion_check()  # pyright: ignore[reportUndefinedVariable]


rep = {
    "file": GLB,
    "spec": SPEC,
    "tris": tris,
    "length_m": round(L, 4),
    "checks": checks,
    "pass": all(c["pass"] for c in checks),
}
json.dump(rep, open(OUT, "w"), indent=1)
print("QA_STRUCTURAL", "PASS" if rep["pass"] else "FAIL", sum(not c["pass"] for c in checks), "failing")
