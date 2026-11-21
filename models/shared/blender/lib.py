"""Shared, body-plan-agnostic Blender helpers for the creature pipeline.
Archetypes (models/<kind>/archetypes/*.py) call these; build.py orchestrates. Everything runs headless (blender -b)."""
import bpy, bmesh, math, os
from mathutils import Vector, Quaternion

FPS = 24

# ---------------- scene ----------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS; sc.unit_settings.system = "METRIC"; sc.unit_settings.scale_length = 1.0
    return sc

def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj

def hex_rgba(h, a=1.0):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]  # sRGB → linear
    return (*lin, a)

# ---------------- geometry ----------------
def mesh_from_bmesh(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return link(bpy.data.objects.new(name, me))

def loft(name, rings, cap_front=None, cap_back=None):
    """rings: list of lists of (x,y,z) with equal length, ordered front→back. Caps are single points."""
    bm = bmesh.new(); vr = [[bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
    for a, b in zip(vr, vr[1:]):
        for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap_front is not None:
        c = bm.verts.new(cap_front)
        for i in range(n): bm.faces.new((c, vr[0][(i + 1) % n], vr[0][i]))
    if cap_back is not None:
        c = bm.verts.new(cap_back)
        for i in range(n): bm.faces.new((c, vr[-1][i], vr[-1][(i + 1) % n]))
    bm.normal_update()
    return mesh_from_bmesh(name, bm)

FLAT_PARTS = []    # one record per flat_part(); measure_flat_parts() adds thicknesses; build.py writes it to build_meta.json
ROOT_AT, EDGE_AT = 0.1, 0.9   # thickness is measured this far along each root -> free edge column (edge: of its visible extent)

def flat_part(name, pts_xz, thickness, at=(0, 0, 0), rot=(0, 0, 0), rim=0.0, root=0, edge=0.1, rings=3, smooth=3):
    """Thin part from a closed XZ outline (fins, wings, petals, flippers), symmetric about its own XZ plane.
    root = n > 0: pts_xz[0..n] is the root chain, where the part joins the body; the rest of the outline is the free
    edge. The part is a membrane lofted from root to free edge in `rings` steps, `thickness` at the root thinning to
    `edge` x thickness at the free edge, so it reads as a fin, not a cut-out slab. root = 0: a uniform plate.
    smooth = n: n extra free-edge points per outline segment, on a curve through the outline points, so the edge is
    round without a subdivision modifier (which would shrink the fin and multiply its triangles).
    rim > 0: a band `rim` metres wide inside the free edge (the whole outline for a plate), plus the edge faces, gets
    material index 1 (give the object a second material, e.g. palette.accent, for a fin rim)."""
    if root == 0:
        bm = bmesh.new(); vs = [bm.verts.new((x, -thickness / 2, z)) for x, z in pts_xz]
        f = bm.faces.new(vs); r = bmesh.ops.extrude_face_region(bm, geom=[f])
        for v in (g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)): v.co.y += thickness
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if rim > 0:
            caps = [g for g in r["geom"] if isinstance(g, bmesh.types.BMFace)] + [f]
            bmesh.ops.inset_individual(bm, faces=caps, thickness=rim, use_even_offset=True)
            for fc in bm.faces: fc.material_index = 0 if fc in caps else 1
        columns = []
    else:
        bm, columns = _tapered_membrane(pts_xz, root, thickness, edge, rings, rim, smooth)
    o = mesh_from_bmesh(name, bm); o.location = at; o.rotation_euler = rot
    FLAT_PARTS.append({"name": o.name, "tapered": root > 0, "columns": columns})
    return o

def _resample(chain, ts):
    """Points at arc-length fractions ts along a polyline."""
    seg = [(a - b).length for a, b in zip(chain[1:], chain)]; total = sum(seg) or 1.0; out = []
    for t in ts:
        d = t * total; i = 0
        while i < len(seg) - 1 and d > seg[i]: d -= seg[i]; i += 1
        out.append(chain[i].lerp(chain[i + 1], min(1.0, d / seg[i]) if seg[i] else 0.0))
    return out

def _through(chain, n):
    """Centripetal Catmull-Rom through every point of an open polyline, n extra points per segment (no overshoot loops
    at sharp tips such as tail forks or fan rays)."""
    if n <= 0: return chain
    ext = [2 * chain[0] - chain[1]] + chain + [2 * chain[-1] - chain[-2]]; out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1:i + 3]; t0 = 0.0
        t1 = t0 + max((p1 - p0).length, 1e-9) ** 0.5; t2 = t1 + max((p2 - p1).length, 1e-9) ** 0.5; t3 = t2 + max((p3 - p2).length, 1e-9) ** 0.5
        out.append(p1)
        for k in range(1, n + 1):
            t = t1 + (t2 - t1) * k / (n + 1)
            a1 = p0.lerp(p1, (t - t0) / (t1 - t0)); a2 = p1.lerp(p2, (t - t1) / (t2 - t1)); a3 = p2.lerp(p3, (t - t2) / (t3 - t2))
            b1 = a1.lerp(a2, (t - t0) / (t2 - t0)); b2 = a2.lerp(a3, (t - t1) / (t3 - t1))
            out.append(b1.lerp(b2, (t - t1) / (t2 - t1)))
    return out + [chain[-1]]

def _tapered_membrane(pts_xz, root, thickness, edge, rings, rim, smooth):
    """Columns run from the root chain to the free edge (one per free-edge point, so its shape is kept exactly); the
    two end columns are the corners where the free edge meets the root, a single vertex each. Returns (bmesh, the
    inner columns' (root, free edge) XZ end points for measure_flat_parts)."""
    P = [Vector((x, 0, z)) for x, z in pts_xz]
    free = _through([P[0]] + P[:root - 1:-1], smooth)        # outline[0] backwards round to outline[root]
    fl = [0.0]
    for a, b in zip(free, free[1:]): fl.append(fl[-1] + (b - a).length)
    base = _resample(P[:root + 1], [d / fl[-1] for d in fl])
    M = len(free)
    def ring_s(j):                                           # ring positions 0 (root) .. 1 (free edge) on column j
        s = [k / rings for k in range(rings + 1)]
        if rim <= 0: return s
        inner = 1 - min(0.5, rim / max((free[j] - base[j]).length, 1e-9))
        return [x * inner for x in s] + [1.0]
    K = len(ring_s(0)) - 1
    bm = bmesh.new(); top, bot = [], []
    for j in range(M):
        if j in (0, M - 1):
            c = bm.verts.new(free[j]); top.append([c] * (K + 1)); bot.append([c] * (K + 1)); continue
        tj, bj = [], []
        for s in ring_s(j):
            p = base[j].lerp(free[j], s); t = thickness * (edge + (1 - edge) * (1 - s * s))   # holds near the root, thins over the outer part
            tj.append(bm.verts.new((p.x, t / 2, p.z))); bj.append(bm.verts.new((p.x, -t / 2, p.z)))
        top.append(tj); bot.append(bj)
    def face(vs, mat):
        vs = [v for i, v in enumerate(vs) if v not in vs[:i]]
        if len(vs) >= 3: bm.faces.new(vs).material_index = mat
    on_rim = lambda k: 1 if rim > 0 and k >= K - 1 else 0
    for j in range(M - 1):
        for k in range(K):
            face([top[j][k], top[j + 1][k], top[j + 1][k + 1], top[j][k + 1]], on_rim(k))
            face([bot[j][k + 1], bot[j + 1][k + 1], bot[j + 1][k], bot[j][k]], on_rim(k))
        face([top[j][K], top[j + 1][K], bot[j + 1][K], bot[j][K]], 1 if rim > 0 else 0)
        face([bot[j][0], bot[j + 1][0], top[j + 1][0], top[j][0]], 0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    # the sheets meet the root and edge bands nearly square on: smooth shading would average across that corner and
    # darken the fin's root and rim, so those edges stay sharp (the sheets themselves still shade smooth)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal, 0.0) > math.radians(45): e.smooth = False
    return bm,[(tuple(base[j].xz), tuple(free[j].xz)) for j in range(1, M - 1)]

def measure_flat_parts(steps=40):
    """Root and edge thickness of every tapered flat_part, measured on the evaluated object (modifiers included) by
    casting rays through it along its own Y: the real geometry, not the parameters it was built from. Subdivision pulls
    a part's edge in from its outline, so the edge sample sits at EDGE_AT of each column's visible extent. Run after
    the archetype has added its modifiers and before finalize() joins the parts. Median over columns, in metres."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    for rec in FLAT_PARTS:
        o = bpy.data.objects.get(rec["name"])
        if not rec["columns"] or o is None: continue
        tree = BVHTree.FromObject(o, dg); roots, edges = [], []
        for (bx, bz), (fx, fz) in rec["columns"]:
            th = {}
            for i in range(steps + 1):
                s = i / steps; x, z = bx + (fx - bx) * s, bz + (fz - bz) * s
                up = tree.ray_cast(Vector((x, 1.0, z)), Vector((0, -1, 0)))[0]; dn = tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))[0]
                if up is not None and dn is not None: th[s] = up.y - dn.y
            if not th: continue
            near = lambda target: th[min(th, key=lambda s: abs(s - target))]
            roots.append(near(ROOT_AT)); edges.append(near(EDGE_AT * max(th)))
        med = lambda v: sorted(v)[len(v) // 2] if v else None
        rec["root_thickness_m"], rec["edge_thickness_m"] = med(roots), med(edges)

def surface_hit(o, origin, direction):
    """First hit of a world-space ray on the evaluated object (subdivision included, so a part mounted there sits on
    the surface the user sees, not on the control cage). Returns (point, normal) in world space, or (None, None). The
    normal faces back along the ray, so it points outward for a ray cast from outside, whatever the face winding."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    mw = o.matrix_world; inv = mw.inverted(); tree = BVHTree.FromObject(o, dg)
    loc, nrm, _, _ = tree.ray_cast(inv @ Vector(origin), (inv.to_3x3() @ Vector(direction)).normalized())
    if loc is None: return None, None
    n = (inv.to_3x3().transposed() @ nrm).normalized()
    return mw @ loc, (-n if n.dot(Vector(direction)) > 0 else n)

def tube(name, path, radii, segs=6):
    """Tapered closed tube along a polyline (tentacles, legs, cerata, antennae, stalks). path: [(x,y,z)] base→tip,
    radii: one per path point. Base and tip are capped with a point so the part is watertight."""
    path = [Vector(p) for p in path]; rings = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        a = t.cross(ref).normalized(); b = t.cross(a)
        rings.append([tuple(p + (a * math.cos(2 * math.pi * k / segs) + b * math.sin(2 * math.pi * k / segs)) * radii[i]) for k in range(segs)])
    t0 = (path[1] - path[0]).normalized(); t1 = (path[-1] - path[-2]).normalized()
    return loft(name, rings, cap_front=tuple(path[0] - t0 * radii[0] * 0.3), cap_back=tuple(path[-1] + t1 * radii[-1] * 0.8))

def sphere(name, radius, at, segs=16):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=radius)
    o = mesh_from_bmesh(name, bm); o.location = at; return o

EYES = []          # filled by eye(); build.py writes it to build_meta.json so shape-check can check eye size after the join
EYE_RANGE = (0.08, 0.12)   # STYLE: eye diameter as a fraction of body height

def eye_material():
    m = bpy.data.materials.get("eye")
    if m is None: m, _, _ = principled("eye", (0.01, 0.01, 0.012, 1), 0.05, 1.0)
    return m

def eye(name, body_height, at, frac=0.10, segs=16):
    """Shared STYLE eye: glossy near-black sphere, diameter = frac x body height (clamped to EYE_RANGE).
    body_height = the creature's full body depth/height in meters (not counting fins/outgrowths)."""
    frac = min(max(frac, EYE_RANGE[0]), EYE_RANGE[1]); d = frac * body_height
    o = sphere(name, d / 2, at, segs); o.data.materials.append(eye_material())
    EYES.append({"name": name, "diameter_m": d, "body_height_m": body_height, "ratio": frac})
    return o

MOUTHS = []        # filled by mouth(); build.py writes it (plus the joined part:mouth vertex count) to build_meta.json

def _frame(direction):
    """Orthonormal (forward, width, gape) axes for a part facing `direction` (width stays horizontal when possible)."""
    a = Vector(direction).normalized(); up = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
    w = up.cross(a).normalized(); h = a.cross(w).normalized()
    return a, w, h

def dark_rgba(hexc, value=0.12):
    """Palette colour pushed dark (same hue), for openings: mouth interior, gill slits."""
    import colorsys
    h = hexc.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b); r, g, b = colorsys.hsv_to_rgb(hh, ss, min(vv, value))
    return hex_rgba("#%02x%02x%02x" % tuple(round(c * 255) for c in (r, g, b)))

def mouth(spec, at, direction, head_size, kind="slit", width=0.32, gape=0.10, depth=0.22, protrude=0.4, name="mouth", segs=16):
    """Shared STYLE mouth: a real, visible opening mesh part (part name `mouth`), whatever the body plan.
    at: point ON the body surface where the mouth opens; direction: outward facing (e.g. +X front, -Z underside);
    head_size: head height (m). kind 'slit' = wide flat lip slit, 'round' = rounded opening (width = gape).
    The part is a dark ellipsoid sunk into the surface (only `protrude` of its depth shows), coloured from
    palette.lip (else palette.accent) pushed dark. Archetypes skin it to a `jaw` bone (lib.jaw_bone) and open/close
    it on bite beats (lib.key_mouth). Returns the object; records the placement in MOUTHS for build_meta.json."""
    a, w, h = _frame(direction)
    W = width * head_size; G = (W if kind == "round" else gape * head_size); D = depth * head_size
    c = Vector(at) - a * D * (0.5 - protrude)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co; v.co = c + a * x * D / 2 + w * y * W / 2 + h * z * G / 2
    o = mesh_from_bmesh(name, bm)
    pal = spec.get("palette", {})
    m, _, _ = principled("mouth", dark_rgba(pal.get("lip", pal.get("accent", "#111111"))), 0.45, 0.1)
    o.data.materials.append(m)
    tip = c + a * D / 2
    MOUTHS.append({"name": name, "kind": kind, "center": list(c), "tip": list(tip), "direction": list(a),
                   "width_m": W, "gape_m": G, "head_size_m": head_size, "width_ratio": W / head_size})
    return o

def jaw_bone(parent="head", name="jaw"):
    """Bone entry (for lib.armature) at the last lib.mouth(): head at the mouth centre, pointing out of the mouth."""
    mt = MOUTHS[-1]; c = Vector(mt["center"]); a = Vector(mt["direction"])
    return (name, tuple(c), tuple(c + a * max(mt["width_m"], 1e-3)), parent)

def mouth_corner_bones(parent="jaw", spread=0.38):
    """Bone entries for the last lib.mouth()'s corners (cornerL/R, children of the jaw). They let a mood action
    (sulk) bend the slit into a frown. Skin mouth verts with mouth_weights()."""
    mt = MOUTHS[-1]; c = Vector(mt["center"]); a, w, h = _frame(mt["direction"]); W = mt["width_m"]
    return [(n, tuple(c + w * s * W * spread), tuple(c + w * s * W * spread + a * W * 0.5), parent) for n, s in (("cornerL", 1), ("cornerR", -1))]

def mouth_weights(co):
    """Weights for a mouth vertex: middle on the jaw, each end blending onto its corner bone."""
    mt = MOUTHS[-1]; a, w, h = _frame(mt["direction"]); s = (Vector(co) - Vector(mt["center"])).dot(w) / (mt["width_m"] / 2)
    sm = lambda x: 0.0 if x <= 0 else 1.0 if x >= 1 else x * x * (3 - 2 * x)
    l, r = sm(s) * 0.5 + max(0.0, s) * 0.5, sm(-s) * 0.5 + max(0.0, -s) * 0.5   # gradual: the slit bends into an arc, not a V
    return {"jaw": max(0.0, 1 - l - r), "cornerL": l, "cornerR": r}

def frown_locs(amount):
    """key_pose locs that drop both mouth corners by `amount` (0..1) of half the mouth width: a frown."""
    mt = MOUTHS[-1]; a, w, h = _frame(mt["direction"]); d = -h * amount * mt["width_m"] * 0.5
    return {"cornerL": d, "cornerR": d}

def mouth_scale(arm, bone, opening):
    """Pose-bone scale for a mouth opened by `opening` (0 closed .. 1 wide): mostly gape, some width, little depth.
    Maps the mouth's world (forward, width, gape) axes onto the bone's local axes."""
    mt = MOUTHS[-1] if MOUTHS else None
    a, w, h = _frame(mt["direction"]) if mt else _frame((1, 0, 0))
    gain = ((a, 0.3), (w, 0.35), (h, 2.4))
    out = []
    for i in range(3):
        ax = Vector(local_world_axis(arm, bone, i))
        out.append(1 + opening * max(gain, key=lambda g: abs(ax.dot(g[0])))[1])
    return Vector(out)

def local_world_axis(arm, bone, i):
    m = (arm.matrix_world @ arm.data.bones[bone].matrix_local).to_3x3().normalized()
    return m.col[i]

def key_mouth(arm, beats, bone="jaw", frame0=1, frames=48):
    """beats: [(t 0..1, opening 0..1)] for the jaw bone's scale only (other channels keyed by key_pose).
    Start and end closed (1,1,1) so the clip still starts/ends on the idle pose."""
    pb = arm.pose.bones[bone]
    for t, op in beats:
        pb.scale = mouth_scale(arm, bone, op); pb.keyframe_insert("scale", frame=frame0 + round(t * frames))
    pb.scale = Vector((1, 1, 1))

def subsurf(o, levels):
    m = o.modifiers.new("Sub", "SUBSURF"); m.levels = m.render_levels = levels; return m

def finalize(parts, name, tri_budget):
    """parts: {part_name: obj}. Tags verts with 'part:<name>' groups, applies modifiers/transforms, joins,
    cleans, decimates to budget. Returns the single mesh object (origin at world 0).
    Tapered flat parts are kept out of the decimation: collapsing an edge across a membrane a fraction of a millimetre
    thick costs the decimator almost nothing, so it would eat fin edges first and leave dark, folded patches."""
    thin = {r["name"] for r in FLAT_PARTS if r["tapered"]}
    for pn, o in parts.items():
        vg = o.vertex_groups.new(name=f"part:{pn}"); vg.add(range(len(o.data.vertices)), 1.0, "REPLACE")
        if o.name in thin: o.vertex_groups.new(name="decimate_keep").add(range(len(o.data.vertices)), 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts.values(): o.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(parts.values()))
    bpy.ops.object.convert(target="MESH")                      # applies modifiers
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join(); o = bpy.context.active_object; o.name = o.data.name = name
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    # the budget is a cap, not a target: decimate only when over, and only down to the budget
    for _ in range(4):
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if n <= tri_budget: break
        d = o.modifiers.new("Dec", "DECIMATE"); d.ratio = tri_budget / n
        if "decimate_keep" in o.vertex_groups: d.vertex_group = "decimate_keep"; d.invert_vertex_group = True; d.vertex_group_factor = 10.0
        bpy.ops.object.modifier_apply(modifier="Dec")
    if "decimate_keep" in o.vertex_groups: o.vertex_groups.remove(o.vertex_groups["decimate_keep"])
    for p in o.data.polygons: p.use_smooth = True
    return o

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

# ---------------- materials ----------------
def principled(name, color, rough=0.4, coat=0.3, transmission=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color; b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat; b.inputs["Transmission Weight"].default_value = transmission
    return m, m.node_tree, b

def coord_along(nt, axis, scale, offset):
    """Node output = Object coord[axis] * scale + offset (axis 0=X,1=Y,2=Z)."""
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    m = nt.nodes.new("ShaderNodeMath"); m.operation = "MULTIPLY_ADD"
    nt.links.new(sep.outputs[axis], m.inputs[0]); m.inputs[1].default_value = scale; m.inputs[2].default_value = offset
    return m.outputs[0], tc

def wobble(nt, value_out, tc, amount, scale=3.0):
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = scale
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    w = nt.nodes.new("ShaderNodeMath"); w.operation = "MULTIPLY_ADD"; w.inputs[1].default_value = amount; w.inputs[2].default_value = -amount / 2
    nt.links.new(n.outputs[0], w.inputs[0])
    a = nt.nodes.new("ShaderNodeMath"); a.operation = "ADD"; nt.links.new(value_out, a.inputs[0]); nt.links.new(w.outputs[0], a.inputs[1])
    return a.outputs[0]

def constant_ramp(nt, value_out, stops):
    """stops: [(pos, rgba)] sorted; first stop applies from 0."""
    r = nt.nodes.new("ShaderNodeValToRGB"); cr = r.color_ramp; cr.interpolation = "CONSTANT"
    cr.elements[0].position = 0; cr.elements[0].color = stops[0][1]
    cr.elements[1].position = min(max(stops[1][0], 0.0005), 1) if len(stops) > 1 else 1; cr.elements[1].color = stops[1][1] if len(stops) > 1 else stops[0][1]
    for p, c in stops[2:]:
        e = cr.elements.new(min(max(p, 0), 1)); e.color = c
    nt.links.new(value_out, r.inputs[0]); return r.outputs[0]

ROUGH_RANGE, COAT_RANGE = (0.25, 0.55), (0.0, 0.6)   # STYLE.md

def gloss_from_spec(spec):
    """spec.material.{roughness,coat}, defaults 0.35/0.35, clamped to STYLE ranges."""
    m = spec.get("material", {}) or {}
    r = min(max(float(m.get("roughness", 0.35)), ROUGH_RANGE[0]), ROUGH_RANGE[1])
    c = min(max(float(m.get("coat", 0.35)), COAT_RANGE[0]), COAT_RANGE[1])
    return r, c

def accent_line(nt, bsdf, color, x_min, z_center, half_width, x_max=1e9):
    """Overlay a thin accent stroke (lip line, rim, seam) on whatever drives Base Color: object-space
    x in [x_min, x_max] and |z - z_center| < half_width. Generic: archetypes pick where."""
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    def op(kind, a, b):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = kind
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    inx = op("MULTIPLY", op("GREATER_THAN", sep.outputs[0], x_min), op("LESS_THAN", sep.outputs[0], x_max))
    inz = op("LESS_THAN", op("ABSOLUTE", op("SUBTRACT", sep.outputs[2], z_center), 0), half_width)
    mask = op("MULTIPLY", inx, inz)
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(mask, mix.inputs["Factor"])
    bc = bsdf.inputs["Base Color"]
    if bc.is_linked: src = bc.links[0].from_socket; nt.links.remove(bc.links[0]); nt.links.new(src, mix.inputs["A"])
    else: mix.inputs["A"].default_value = bc.default_value
    mix.inputs["B"].default_value = color; nt.links.new(mix.outputs["Result"], bc)

def bake_to_single_material(o, name, size, rough=0.35, coat=0.35, out_png=None):
    """Smart-UV the mesh, bake diffuse color of all its materials into one image, swap to one PBR material."""
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(name + "_color", size, size)
    for m in o.data.materials:
        n = m.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img; m.node_tree.nodes.active = n
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 8
    try: sc.cycles.device = "GPU"
    except Exception: pass
    bk = sc.render.bake; bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.margin = 8
    bpy.ops.object.bake(type="DIFFUSE")
    if out_png: img.filepath_raw = out_png; img.file_format = "PNG"; img.save()
    img.pack()
    m, nt, b = principled(name, (1, 1, 1, 1), rough, coat)
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; nt.links.new(t.outputs[0], b.inputs["Base Color"])
    o.data.materials.clear(); o.data.materials.append(m)
    sc.render.engine = "BLENDER_EEVEE"
    return img

# ---------------- rig ----------------
def armature(name, bones):
    """bones: [(name, head, tail, parent_or_None)] in world meters. Returns armature object (origin 0)."""
    ad = bpy.data.armatures.new(name); arm = link(bpy.data.objects.new(name, ad))
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for n, h, t, p in bones:
        b = ad.edit_bones.new(n); b.head = h; b.tail = t; b.roll = 0
        if p: b.parent = eb[p]; b.use_connect = False
        eb[n] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones: pb.rotation_mode = "QUATERNION"
    return arm

def skin(mesh, arm, weight_fn):
    """weight_fn(vertex_co_world, part_names_set) -> {bone: w}. Limits to 4, normalizes, parents mesh to armature."""
    parts_by_idx = {vg.index: vg.name[5:] for vg in mesh.vertex_groups if vg.name.startswith("part:")}
    groups = {b.name: mesh.vertex_groups.new(name=b.name) for b in arm.data.bones}
    for v in mesh.data.vertices:
        parts = {parts_by_idx[g.group] for g in v.groups if g.group in parts_by_idx}
        w = {k: x for k, x in weight_fn(mesh.matrix_world @ v.co, parts).items() if x > 1e-4}
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; s = sum(x for _, x in top) or 1
        for bn, x in top: groups[bn].add([v.index], x / s, "REPLACE")
    for vg in [vg for vg in mesh.vertex_groups if vg.name.startswith("part:")]: mesh.vertex_groups.remove(vg)
    mod = mesh.modifiers.new("Armature", "ARMATURE"); mod.object = arm
    mesh.parent = arm

def empty(name, at, bone_parent=None, arm=None):
    e = link(bpy.data.objects.new(name, None)); e.empty_display_size = 0.01
    if arm and bone_parent:
        e.parent = arm; e.parent_type = "BONE"; e.parent_bone = bone_parent
        bpy.context.view_layer.update()
        e.matrix_world = __import__("mathutils").Matrix.Translation(Vector(at))
    else: e.location = at
    return e

def lerp_weights(x, stations):
    """stations: [(x_position, bone)] sorted by x descending. Linear blend between the two nearest."""
    if x >= stations[0][0]: return {stations[0][1]: 1.0}
    if x <= stations[-1][0]: return {stations[-1][1]: 1.0}
    for (xa, ba), (xb, bb) in zip(stations, stations[1:]):
        if xb <= x <= xa:
            t = (xa - x) / (xa - xb); s = t * t * (3 - 2 * t)
            return {ba: 1 - s, bb: s}
    return {stations[-1][1]: 1.0}

# ---------------- animation ----------------
def local_axis(arm, bone, world_axis):
    """World-space axis expressed in the bone's rest-local frame (for rotations/translations on pose bones)."""
    m = (arm.matrix_world @ arm.data.bones[bone].matrix_local).to_3x3().normalized()
    return (m.inverted() @ Vector(world_axis)).normalized()

def new_action(arm, name):
    act = bpy.data.actions.new(name); ad = arm.animation_data or arm.animation_data_create(); ad.action = act
    return act

def key_pose(arm, frame, rots, locs=None):
    """rots: {bone: [(world_axis, radians), ...]}; locs: {bone: world_vector}. Keys every pose bone at frame."""
    locs = locs or {}
    for pb in arm.pose.bones:
        q = Quaternion()
        for ax, ang in rots.get(pb.name, []): q = q @ Quaternion(local_axis(arm, pb.name, ax), ang)
        pb.rotation_quaternion = q
        lv = locs.get(pb.name)
        pb.location = (local_axis(arm, pb.name, lv.normalized()) * lv.length) if lv is not None and lv.length > 0 else Vector()
        pb.keyframe_insert("rotation_quaternion", frame=frame); pb.keyframe_insert("location", frame=frame)

def ease_all(act):
    for fc in _fcurves(act):
        for k in fc.keyframe_points: k.interpolation = "BEZIER"; k.handle_left_type = k.handle_right_type = "AUTO_CLAMPED"
        fc.update()

def _fcurves(act):
    if hasattr(act, "layers") and act.layers:  # Blender 4.4+ layered actions
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags: yield from cb.fcurves
    else:
        yield from act.fcurves

def stash_nla(arm, actions):
    """Each action → its own NLA track named after it; used by glTF export (NLA_TRACKS mode)."""
    ad = arm.animation_data or arm.animation_data_create(); ad.action = None
    for act in actions:
        tr = ad.nla_tracks.new(); tr.name = act.name
        s, _ = act.frame_range; tr.strips.new(act.name, int(s), act); act.use_fake_user = True

# ---------------- output ----------------
def export_glb(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_skins=True,
                              export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_image_format="WEBP", export_apply=False, export_extras=True, export_attributes=True)

SIT_MODES = ("upright", "follow", "drape")

def placement_extras(o, spec):
    """How the runtime should seat and move this prop, carried in the glb itself (node extras -> three.js userData),
    so the habitat and the QA capture read the same thing. lb_sit: upright | follow | drape (scenery `sit.mode`)."""
    sit = (spec.get("sit") or {}).get("mode")
    if sit: o["lb_sit"] = sit

def shader_sway(o, spec, weight_fn=None):
    """Sway done by the habitat's vertex shader instead of bones: no armature, no animation data in the file.
    Writes two per-vertex float attributes, exported as glTF _SWAY_W / _SWAY_P (three.js: _sway_w / _sway_p):
      _SWAY_W 0..1  how far this point may move (0 = rooted, 1 = free tip)
      _SWAY_P 0..1  how far behind the base its wave runs (lag)
    weight_fn(spec, co) -> (w, p) per vertex in meters (archetype `sway_weights`); default: by height above the ground.
    Node extras carry the motion: lb_sway_amp (m), lb_sway_period (s), lb_sway_lift (0..1 of amp, upward)."""
    sw = spec["motion"]["sway"]; H = spec["size"]["height_m"]; F = spec["size"].get("footprint_m", H)
    if weight_fn is None:
        weight_fn = lambda sp, co: (min(1.0, max(0.0, co.z / H)) ** 2, min(1.0, max(0.0, co.z / H)))
    me = o.data
    for nm in ("_SWAY_W", "_SWAY_P"):
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
    aw = me.attributes.new("_SWAY_W", "FLOAT", "POINT"); ap = me.attributes.new("_SWAY_P", "FLOAT", "POINT")
    for v in me.vertices:
        w, ph = weight_fn(spec, v.co)
        aw.data[v.index].value = min(1.0, max(0.0, w)); ap.data[v.index].value = min(1.0, max(0.0, ph))
    o["lb_sway_amp"] = round(sw["amp"] * max(H, F), 5); o["lb_sway_period"] = float(sw["period_s"]); o["lb_sway_lift"] = float(sw.get("lift", 0))

def silhouette_renders(prefix, L, res=384):
    """Blockout check: flat black silhouettes on white, orthographic side (-Y) and top (+Z) views."""
    sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE"; sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("sil"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    blk = bpy.data.materials.new("sil"); blk.use_nodes = True; blk.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0, 0, 0, 1)
    blk.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
    for o in sc.objects:
        if o.type == "MESH": o.data.materials.clear(); o.data.materials.append(blk)
    cd = bpy.data.cameras.new("s"); cd.type = "ORTHO"; cd.ortho_scale = L * 1.4; cam = link(bpy.data.objects.new("s", cd)); sc.camera = cam
    outs = []
    for view, loc, rot in (("side", (0, -4 * L, 0), (math.pi / 2, 0, 0)), ("top", (0, 0, 4 * L), (0, 0, 0))):
        cam.location = loc; cam.rotation_euler = rot; p = f"{prefix}_{view}.png"; sc.render.filepath = p
        bpy.ops.render.render(write_still=True); outs.append(p)
    return outs

