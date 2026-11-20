"""judge-panel inputs: fixed-rig QA renders of a creature .glb for the visual judge.
Usage: blender -b --factory-startup --python qa_render.py -- <file.glb> <outdir> [golden1.glb golden2.glb ...]
Writes: turn_0..7.png (turntable), idle_0..5.png, feed_0..5.png,
  onion_{idle,feed}_0..5.png (elevated 3/4 view; 0 opaque, 1..5 transparent, overlaid by verify.sh),
  panel_new.png + panel_<golden>.png (each alone, side view, SAME ortho scale = true relative size),
  panel_mag_<golden>.png + panels.json when the new creature is < 50% of that golden's length (magnified to its length).
Turntable/strip/onion views are framed to the creature's silhouette extents in that view (+15% margin), deterministic.
verify.sh composites onion_*.png → motion_{idle,feed}.png, panels → side_<golden>.png, and packs contact.png."""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
LEGACY = "--legacy-framing" in argv; argv = [a for a in argv if a != "--legacy-framing"]   # A/B only: old fixed L*1.5 / L*2.0 framing
CLIPS = ["idle", "feed", "sulk"]                   # creature default; plants pass --clips sway_4,tend; static scenery --clips ""
if "--clips" in argv: i = argv.index("--clips"); CLIPS = [c for c in argv[i + 1].split(",") if c]; del argv[i:i + 2]
PITCH = 8                                          # turntable elevation; flat scenery passes --pitch 35 (top face reads)
if "--pitch" in argv: i = argv.index("--pitch"); PITCH = float(argv[i + 1]); del argv[i:i + 2]
GLB, OUT, GOLDEN = argv[0], argv[1], argv[2:]
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
def load(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    return new, roots
def hlen(mn, mx): return max((mx - mn).x, (mx - mn).y)   # max horizontal extent (= X length for bilateral bodies)
def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" and o.visible_get() for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx

def rig(L, center):
    """Fixed QA lighting: key area + rim + water-blue world. Never change between weeks."""
    w = bpy.data.worlds.new("qa"); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.03, 0.2, 0.32, 1); bg.inputs[1].default_value = 1.0
    for name, loc, energy, size in (("key", (0.6, -1.6, 2.0), 110, 2.5), ("rim", (-1.5, 1.2, 0.8), 55, 1.5)):
        ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy * L * L / 0.05; ld.size = size * L
        lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo)
        lo.location = center + Vector(loc) * L * 2.2
        lo.rotation_euler = (center - lo.location).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"; cd.ortho_scale = L * 1.5
    cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    return cam

def aim(cam, center, L, yaw_deg, pitch_deg=8):
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    cam.location = center + d * L * 4
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

MARGIN = 1.15   # framing margin around the silhouette

def silhouette_pts(objs, step_cap=4000):
    """Evaluated (posed) world-space vertices of the visible meshes, subsampled deterministically."""
    d = bpy.context.evaluated_depsgraph_get(); out = []
    for o in objs:
        if o.type != "MESH" or not o.visible_get(): continue
        e = o.evaluated_get(d); m = e.to_mesh(); st = max(1, len(m.vertices) // step_cap)
        out += [o.matrix_world @ m.vertices[i].co for i in range(0, len(m.vertices), st)]; e.to_mesh_clear()
    return out

def fit(cam, pts, legacy_scale=1.5):
    """Frame an ortho camera (already aimed) to the silhouette: project the points onto the view plane, centre on
    their extents and fit the larger of width/height with MARGIN. Deterministic (pure geometry, no randomness).
    Keeps the camera's viewing direction and distance; slides it within the view plane."""
    if LEGACY: cam.data.ortho_scale = L * legacy_scale; return cam.data.ortho_scale
    q = cam.matrix_world.to_quaternion(); right = q @ Vector((1, 0, 0)); up = q @ Vector((0, 1, 0)); fwd = q @ Vector((0, 0, -1))
    xs = [p.dot(right) for p in pts]; ys = [p.dot(up) for p in pts]; zs = [p.dot(fwd) for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    loc = cam.location; cam.location = loc + right * (cx - loc.dot(right)) + up * (cy - loc.dot(up))
    cam.data.ortho_scale = max(w, h, 1e-4) * MARGIN
    depth = max(zs) - min(zs); cam.data.clip_start = max(1e-4, (min(zs) - cam.location.dot(fwd)) * 0.5)
    cam.data.clip_end = (max(zs) - cam.location.dot(fwd)) + depth + 1.0
    return cam.data.ortho_scale

def frames_pts(objs, frames):
    """Union of silhouettes over several frames (a strip/onion keeps ONE framing so motion stays comparable)."""
    out = []
    for f in frames: sc.frame_set(f); out += silhouette_pts(objs, 1500)
    return out

def setup_render(res=384):
    sc.render.engine = "BLENDER_EEVEE"; sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = False; sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Punchy"
    except Exception: pass
    try: sc.eevee.taa_render_samples = 24
    except Exception: pass

def shot(path):
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

def play(objs, name):
    arm = next((o for o in objs if o.type == "ARMATURE"), None)
    act = next((a for a in bpy.data.actions if a.name == name or a.name.startswith(name + "_") or a.name.startswith(name + ".")), None)
    if not arm or not act: return None
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks: t.mute = True
    ad.action = act
    if hasattr(ad, "action_slot") and getattr(act, "slots", None): ad.action_slot = act.slots[0]
    return tuple(map(int, act.frame_range))

clear(); setup_render()
objs, _ = load(GLB); mn, mx = bbox(objs); L = hlen(mn, mx); C = (mn + mx) / 2
cam = rig(L, C)
# every view is framed to the creature's actual silhouette in that view (fit()), not a fixed L*1.5: low, flat or tiny
# bodies fill the frame like the golden does
r = play(objs, CLIPS[0]) if CLIPS else None; s0 = r[0] if r else 1   # static scenery: no clips; sc.frame_set(s0)
for i in range(8):
    aim(cam, C, L, 360 * i / 8, PITCH); fit(cam, silhouette_pts(objs)); shot(f"{OUT}/turn_{i}.png")
# plants: a growth strip (each stage_<n> alone, side view, one shared framing so growth reads at true scale), then
# the clip strips and onions show the bloom stage only (the union of five overlapping stages is unjudgeable)
STG = {o.name.split(".")[0]: o for o in objs if o.type == "MESH" and o.name.startswith("stage_")}
def solo(keep):
    for nm, o in STG.items(): o.hide_render = o.hide_viewport = nm != keep
if STG:
    aim(cam, C, L, 0, 4); fit(cam, silhouette_pts(objs))
    for nm in sorted(STG): solo(nm); shot(f"{OUT}/{nm}.png")
    solo(sorted(STG)[-1])
for name in CLIPS:
    r = play(objs, name); fr = [int(r[0] + (r[1] - r[0]) * i / 5) for i in range(6)] if r else [s0] * 6
    aim(cam, C, L, 0, 4); fit(cam, frames_pts(objs, fr))
    for i, f in enumerate(fr): sc.frame_set(f); shot(f"{OUT}/{name}_{i}.png")
# motion onion-skin: elevated 3/4 view (side views hide lateral sway/yaw, top views hide pitch), framed to the union of
# the 6 poses so a feed lunge stays in frame. Frame 0 opaque (onion_<clip>_0) + 5 later poses transparent; verify.sh overlays them.
for name in CLIPS:
    r = play(objs, name)
    if not r: continue
    fr = [int(r[0] + (r[1] - r[0]) * i / 6) for i in range(6)]
    aim(cam, C, L, 30, 40); fit(cam, frames_pts(objs, fr) if not LEGACY else [], 2.0)
    for i, f in enumerate(fr):
        sc.render.film_transparent = i > 0; sc.render.image_settings.color_mode = "RGBA" if i else "RGB"
        sc.frame_set(f); shot(f"{OUT}/onion_{name}_{i}.png")
sc.render.film_transparent = False; sc.render.image_settings.color_mode = "RGB"
# side-by-side panels: each creature rendered ALONE, side view, with one shared ortho scale → true relative size.
# When the new creature is < 50% of a golden's length, also render it magnified to that golden's length
# (panel_mag_<golden>.png) so detail is judgeable; panels.json records the factors for verify.sh labels.
if GOLDEN:
    import json
    sizes, lens = {}, {}
    for path in [GLB] + GOLDEN:
        clear(); o, _ = load(path); a, b = bbox(o); sizes[path] = max(hlen(a, b), (b - a).z); lens[path] = hlen(a, b)
    S = max(sizes.values()); meta = {}
    def panel(path, scale, out):
        clear(); setup_render(384); o, _ = load(path); a, b = bbox(o); c = (a + b) / 2
        cam = rig(S, c); aim(cam, c, S, 0, 4)
        CLIPS and play(o, CLIPS[0]); sc.frame_set(1); cam.data.ortho_scale = scale * 1.5
        cam.data.clip_start = 1e-4; cam.data.clip_end = S * 20
        shot(out)
    for path in [GLB] + GOLDEN:
        panel(path, S, f"{OUT}/panel_new.png" if path == GLB else f"{OUT}/panel_{os.path.splitext(os.path.basename(path))[0]}.png")
    for g in GOLDEN:
        gid = os.path.splitext(os.path.basename(g))[0]; k = lens[g] / max(lens[GLB], 1e-6)
        if lens[GLB] < 0.5 * lens[g]:
            panel(GLB, S / k, f"{OUT}/panel_mag_{gid}.png"); meta[gid] = {"magnified": round(k, 2)}
        else: meta[gid] = {"magnified": None}
    json.dump(meta, open(f"{OUT}/panels.json", "w"))
print("QA_RENDER DONE", OUT)
