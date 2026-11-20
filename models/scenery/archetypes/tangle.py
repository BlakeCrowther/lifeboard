"""Archetype: tangle: a low, loose mat of thin, wiry, forking stems draped over one knobbly heap lying on the ground
(drift algae mats, wrack lines, tumbleweed litter, bramble runners, root mats). Stems start at scattered points on the
heap (never one hub), wander outward and fork at shallow angles, and their ends droop onto the ground, so the piece reads
as one matted mass rather than upright blades (clump), one lofted body (solid) or limbs around a body.
Sways gently (optional `motion.sway`): the whole mat breathes and the stem ends follow with a lag.

Contract (models/scenery/CONTRACT.md): origin at the ground contact point, +Z up (glTF +Y), meters, one baked material.

Spec fields (all optional except size/palette):
  size.height_m, size.footprint_m        heap height and widest extent (stem ends included)
  shape.heap {radius_ratio .3, knobs .25, cover 30}   heap radius as a fraction of footprint; knobs = bump depth / heap
      height; cover = short looping stems matted over the heap (the heap itself should barely show)
  shape.stems {count 14 (4-24), radius_ratio .035, reach .9, wander .5, forks 2, fork_deg 28, segs 5}
      radius_ratio = stem radius / height_m; reach = how far past the heap edge stems run (1 = to the footprint edge);
      wander = sideways curve; forks = times each stem splits (0-3); fork_deg = split angle.
  palette.main [heap colour, stem end colour]; palette.accent: optional mottle on the heap
  motion.sway {frames, cycles, amp_deg 3, lag_frames 8}   root breathes, two bones per stem, ends lag
  seed: integer (default: hash of id)"""
import math, sys, os, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import lib, bpy, bmesh
from mathutils import Vector, noise

BONES_PER = 2
STEMS = {}            # stem index -> [Vector] main centre line (rig weights + animation)

def _sh(spec, part, key, default): return ((spec.get("shape") or {}).get(part) or {}).get(key, default)
def _H(spec): return spec["size"]["height_m"]
def _F(spec): return spec["size"].get("footprint_m", 4 * _H(spec))
def _rng(spec): return random.Random(spec.get("seed", sum(map(ord, spec["id"]))))
def _cr(spec): return _sh(spec, "heap", "radius_ratio", 0.3) * _F(spec)
def _HH(spec): return _H(spec) * 0.85                      # heap dome height; bumps and draped stems make up the rest

def _heap_z(spec, x, y):
    """Height of the (unbumped) heap surface above (x, y); 0 outside it."""
    cr = _cr(spec); q = 1 - (x * x + y * y) / (cr * cr)
    return _HH(spec) * math.sqrt(q) if q > 0 else 0.0

def _run(spec, rng, start, yaw, length, segs):
    """A stem segment: runs along `yaw` with a sideways wander, follows the heap surface (slightly sunk into it),
    then droops onto the ground past the heap edge."""
    r0 = _sh(spec, "stems", "radius_ratio", 0.035) * _H(spec); wander = _sh(spec, "stems", "wander", 0.5)
    pts = []; bend = rng.uniform(-1, 1) * wander
    for k in range(segs + 1):
        t = k / segs; a = yaw + bend * t
        p = start.copy() if k == 0 else pts[-1] + Vector((math.cos(a), math.sin(a), 0)) * (length / segs)
        lift = r0 * (0.8 + 1.2 * math.sin(math.pi * t) * rng.uniform(0.3, 1.0))   # loose loops, not glued flat
        p.z = max(_heap_z(spec, p.x, p.y) - r0 * 0.5, 0) + lift * (1 - t ** 3) + r0 * 0.9 * t ** 3
        pts.append(p)
    return pts

def _plan(spec):
    """Every tube as (part, stem index, path, radii), deterministic from the spec."""
    rng = _rng(spec); F, cr = _F(spec), _cr(spec)
    n = int(min(max(_sh(spec, "stems", "count", 14), 4), 24)); segs = int(_sh(spec, "stems", "segs", 5))
    r0 = _sh(spec, "stems", "radius_ratio", 0.035) * _H(spec); reach = _sh(spec, "stems", "reach", 0.9)
    forks = int(_sh(spec, "stems", "forks", 2)); fang = math.radians(_sh(spec, "stems", "fork_deg", 28))
    out = []
    for i in range(n):
        ang = rng.uniform(0, 2 * math.pi); rr = cr * math.sqrt(rng.uniform(0.05, 0.75))
        start = Vector((math.cos(ang) * rr, math.sin(ang) * rr, 0)); start.z = _heap_z(spec, start.x, start.y) - r0
        yaw = ang + rng.uniform(-0.9, 0.9)                         # outward-ish but skewed: no radial star
        length = max(F / 2 * reach - rr, cr * 0.5) * rng.uniform(0.6, 1.0)
        main = _run(spec, rng, start, yaw, length, segs)
        out.append((f"s{i}", i, main, [r0 * (1 - 0.6 * k / segs) for k in range(segs + 1)]))
        STEMS[i] = main
        level = [(main, yaw, length, r0, f"s{i}")]
        for f in range(forks):                                     # dichotomous splits along each branch
            nxt = []
            for path, yw, ln, rad, nm in level:
                k = max(1, int(len(path) * rng.uniform(0.35, 0.65))); sgn = rng.choice((-1, 1))
                ns = max(2, segs - 1 - f); nl = ln * (1 - k / len(path)) * rng.uniform(0.8, 1.1)
                fp = _run(spec, rng, path[k], yw + sgn * fang * rng.uniform(0.7, 1.2), nl, ns)
                rr0 = rad * 0.75; nm2 = f"{nm}_f{f}"
                out.append((nm2, i, fp, [rr0 * (1 - 0.65 * q / ns) for q in range(ns + 1)]))
                nxt += [(path, yw, ln, rad, nm), (fp, yw + sgn * fang, nl, rr0, nm2)]
            level = nxt
    return out

def _heap(spec):
    """One knobbly dome: a flattened sphere whose verts are pushed by 3D noise (bumps), bottom flat on the ground."""
    cr, hh = _cr(spec), _HH(spec); knobs = _sh(spec, "heap", "knobs", 0.25); seed = Vector((_rng(spec).uniform(0, 50),) * 3)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    for v in bm.verts:
        d = v.co.copy(); n = noise.noise(d * 2.6 + seed) * 0.6 + noise.noise(d * 6.0 + seed) * 0.4
        v.co = Vector((d.x * cr * (1 + 0.3 * n), d.y * cr * (1 + 0.3 * n), max(d.z, 0) * hh * (1 + knobs * n * (1 - 0.7 * d.z ** 4))))
    bm.normal_update()
    return lib.mesh_from_bmesh("heap", bm)

def model(spec):
    STEMS.clear(); parts = {"heap": _heap(spec)}
    for name, i, path, radii in _plan(spec):
        parts[name] = lib.tube(name, [tuple(p) for p in path], radii, segs=4 if "_" not in name else 3)
    # matted cover: short looping stems lying over the heap, so the mass reads as stems, not a smooth shell
    rng = random.Random(_rng(spec).random()); cr = _cr(spec); r0 = _sh(spec, "stems", "radius_ratio", 0.035) * _H(spec)
    for j in range(int(_sh(spec, "heap", "cover", 30))):
        a = rng.uniform(0, 2 * math.pi); rr = cr * math.sqrt(rng.uniform(0, 0.85))
        st = Vector((math.cos(a) * rr, math.sin(a) * rr, 0)); st.z = _heap_z(spec, st.x, st.y)
        path = _run(spec, rng, st, rng.uniform(0, 2 * math.pi), cr * rng.uniform(0.5, 0.9), 3)
        parts[f"cover{j}"] = lib.tube(f"cover{j}", [tuple(p) for p in path], [r0 * 0.9, r0 * 0.9, r0 * 0.75, r0 * 0.5], segs=3)
    return parts

def material(spec, parts):
    pal = spec["palette"]; main = [lib.hex_rgba(c) for c in pal["main"]]; F = _F(spec)
    m, nt, b = lib.principled("tangle", main[0], 0.5, 0.05)
    # olive while over the heap, rust only toward the stem ends (distance from the centre)
    tc = nt.nodes.new("ShaderNodeTexCoord"); vl = nt.nodes.new("ShaderNodeVectorMath"); vl.operation = "LENGTH"
    nt.links.new(tc.outputs["Object"], vl.inputs[0])
    sc = nt.nodes.new("ShaderNodeMath"); sc.operation = "MULTIPLY"; sc.inputs[1].default_value = 2 / F; nt.links.new(vl.outputs["Value"], sc.inputs[0])
    v = lib.wobble(nt, sc.outputs[0], tc, 0.15, 40 * 0.3 / F)
    r = nt.nodes.new("ShaderNodeValToRGB"); el = r.color_ramp.elements
    el[0].color = main[0]; el[0].position = 0.55; el[1].color = main[-1]; el[1].position = 0.95
    nt.links.new(v, r.inputs[0]); col = r.outputs[0]
    if pal.get("accent"):                                         # mottle so the heap reads matted, not smooth
        n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 250 * 0.3 / F; nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
        g = nt.nodes.new("ShaderNodeMath"); g.operation = "GREATER_THAN"; g.inputs[1].default_value = 0.55; nt.links.new(n.outputs[0], g.inputs[0])
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(g.outputs[0], mix.inputs["Factor"])
        nt.links.new(col, mix.inputs["A"]); mix.inputs["B"].default_value = lib.hex_rgba(pal["accent"]); col = mix.outputs["Result"]
    nt.links.new(col, b.inputs["Base Color"])
    for o in parts.values(): o.data.materials.append(m)

def rig(spec, mesh):
    if not (spec.get("motion") or {}).get("sway"): return None, None
    H = _H(spec); bones = [("root", (0, 0, 0), (0, 0, H), None)]
    for i, p in STEMS.items():
        n = len(p) - 1; prev = "root"
        for j in range(BONES_PER):
            a, b = p[round(n * j / BONES_PER)], p[round(n * (j + 1) / BONES_PER)]
            bones.append((f"s{i}_{j}", tuple(a), tuple(b), prev)); prev = f"s{i}_{j}"
    arm = lib.armature(spec["id"] + "_rig", bones)
    def wf(co, parts):
        p = next(iter(parts))
        if not p.startswith("s"): return {"root": 1.0}
        i = int(p[1:].split("_")[0]); path = STEMS[i]
        k = min(range(len(path)), key=lambda q: (path[q] - co).length); t = k / (len(path) - 1)
        if "_" in p: t = max(t, 0.6)                              # forks ride the outer bone of their stem
        return lib.lerp_weights(t, [((j + 0.5) / BONES_PER, f"s{i}_{j}") for j in reversed(range(BONES_PER))])
    lib.skin(mesh, arm, wf)
    return arm, None

def animate(spec, arm):
    ms = spec["motion"]["sway"]; N, k = ms["frames"], int(ms["cycles"]); amp = math.radians(ms.get("amp_deg", 3)); lag = ms.get("lag_frames", 8)
    w = lambda ff, f, ph: math.sin(2 * math.pi * k * ff / N + ph) - math.sin(2 * math.pi * k * (ff - f) / N + ph)   # frame 0 = rest = frame N
    act = lib.new_action(arm, "sway")
    for f in range(N + 1):
        rots = {"root": [((1, 0, 0), amp * 1.0 * w(f, f, 0.0)), ((0, 1, 0), amp * 0.8 * w(f, f, 1.1))]}   # the whole mat rocks
        for i, p in STEMS.items():
            d = p[-1] - p[0]; d.z = 0; d = d.normalized() if d.length else Vector((1, 0, 0)); side = (-d.y, d.x, 0)
            for j in range(BONES_PER):
                ff = f - lag * (j + 1); g = 0.7 + 0.8 * j          # one travelling wave: ends follow later and further
                rots[f"s{i}_{j}"] = [(side, -amp * g * w(ff, f, 0.6)), ((0, 0, 1), amp * 0.5 * g * w(ff, f, 1.9))]
        lib.key_pose(arm, 1 + f, rots)
    lib.ease_all(act)
    return [act]
