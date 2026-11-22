"""Archetype: tangle: a low, loose mat of thin, wiry, much-branched stems draped over one lumpy mound lying on the ground
(drift algae mats, wrack lines, tumbleweed litter, bramble runners, root mats). The mound is a bell-shaped pile that
feathers into the ground (no rim, no cushion edge); stems start on top of it at scattered points (never one hub), curve
outward over it, fork and sprout short branchlets, and lie down on the ground past its edge, so the piece reads as one
matted mass rather than upright blades (clump), one lofted body (solid) or limbs around a body.
Sways gently (optional `motion.sway`): the stems lift and wave like a surge passing through; the mound stays put.

Contract (models/scenery/CONTRACT.md): origin at the ground contact point, +Z up (glTF +Y), meters, one baked material.

Spec fields (all optional except size/palette):
  size.height_m, size.footprint_m        mound height and widest extent (stem ends included)
  shape.heap {radius_ratio .38, knobs .3, cover 18, lobes .18}   mound radius as a fraction of footprint; knobs = lump
      depth / mound height; cover = short curled stems matted over the mound
      (cover_width = their radius / stem radius, .85); lobes = how uneven its outline is
  shape.stems {count 12 (4-24), radius_ratio .09, reach .95, wander .7, forks 2, fork_deg 35, segs 7, twigs 3}
      radius_ratio = stem radius / height_m; reach = how far past the mound stems run (1 = to the footprint edge);
      wander = how much each stem curves (and wiggles); forks = side branches per stem (0-4); fork_deg = split angle;
      segs = points per main stem (more = smoother curves); twigs = short branchlets per stem (0-6).
  palette.main [stem colour, stem end colour]; palette.accent: the mound's dark core (default: main[0] darkened)
  motion.sway {frames, cycles, amp_deg 6, lag_frames 10, lean .04}   two bones per stem, a wave travelling out to the
      ends; lean = how far the mound top slides with the surge, as a fraction of footprint
  seed: integer (default: hash of id)"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import bmesh
import lib
from mathutils import Vector, noise

BONES_PER = 2  # shape-check caps bones at 32 and every bone adds ~4.5 KB of sampled sway to the 200 KB budget
SKIRT = 0.08  # rim depth below the ground, as a fraction of height (shape-check allows bbox min z to 3% of size)
SIDES = 3  # tube cross-section; thin stems read round once smooth-shaded, and it keeps many branches in budget
STEMS = {}  # stem index -> [Vector] main centre line (rig weights + animation)


def _sh(spec, part, key, default):
    return ((spec.get("shape") or {}).get(part) or {}).get(key, default)


def _H(spec):
    return spec["size"]["height_m"]


def _F(spec):
    return spec["size"].get("footprint_m", 4 * _H(spec))


def _rng(spec):
    return random.Random(spec.get("seed", sum(map(ord, spec["id"]))))


def _cr(spec):
    return _sh(spec, "heap", "radius_ratio", 0.38) * _F(spec)


def _HH(spec):
    return _H(spec) * 0.7  # mound height; lumps and stems on top make up the rest


def _r0(spec):
    return _sh(spec, "stems", "radius_ratio", 0.09) * _H(spec)


def _heap_z(spec, x, y):
    """Height of the (unlumped) mound above (x, y): a bell that meets the ground with zero slope; 0 outside it."""
    u = math.hypot(x, y) / _cr(spec)
    return _HH(spec) * (1 - u * u) ** 2 if u < 1 else 0.0


def _run(spec, rng, start, yaw, length, n, wander=None):
    """One stem as n+1 points: heads along `yaw`, turning steadily one way plus a slow wiggle (so it curves, never a
    straight spike), lying on the mound with small loose loops, then on the ground past it."""
    r0 = _r0(spec)
    wander = _sh(spec, "stems", "wander", 0.7) if wander is None else wander
    bend = rng.uniform(-1, 1) * wander * 1.6
    wig = rng.uniform(0.3, 0.6) * wander
    ph = rng.uniform(0, 2 * math.pi)
    loops = rng.uniform(0.6, 1.0)
    pts = [start.copy()]
    for k in range(1, n + 1):
        t = k / n
        a = yaw + bend * t + wig * math.sin(2 * math.pi * 1.3 * t + ph)
        p = pts[-1] + Vector((math.cos(a), math.sin(a), 0)) * (length / n)
        hz = _heap_z(spec, p.x, p.y)
        off = 1 - min(1.0, hz / (0.3 * _HH(spec)))  # 1 once past the mound
        # past the mound the stem rides higher and its end curls up: the Ecosystem sets props on uneven sand, sunk ~2 mm,
        # and a stem lying flat there gets buried mid-way, leaving its tip as a floating fragment
        p.z = hz + r0 * (1.3 + 1.4 * loops * math.sin(math.pi * t) * (1 - t) + off * (1.2 * t + 1.6 * t**4))
        pts.append(p)
    return pts


def _plan(spec):
    """Every stem tube as (part, stem index, path, radii), deterministic from the spec."""
    rng = _rng(spec)
    F, cr, r0 = _F(spec), _cr(spec), _r0(spec)
    n = int(min(max(_sh(spec, "stems", "count", 12), 4), 24))
    segs = int(_sh(spec, "stems", "segs", 7))
    reach = _sh(spec, "stems", "reach", 0.95)
    forks = int(min(max(_sh(spec, "stems", "forks", 2), 0), 4))
    fang = math.radians(_sh(spec, "stems", "fork_deg", 35))
    twigs = int(min(max(_sh(spec, "stems", "twigs", 3), 0), 6))
    taper = lambda r, m, end=0.55: [r * (1 - end * q / m) for q in range(m + 1)]
    out = []
    for i in range(n):
        ang = 2 * math.pi * (i + rng.uniform(-0.35, 0.35)) / n
        rr = cr * math.sqrt(rng.uniform(0.0, 0.35))
        start = Vector((math.cos(ang) * rr, math.sin(ang) * rr, 0))
        start.z = _heap_z(spec, start.x, start.y) + r0 * 0.3
        yaw = ang + rng.uniform(-0.6, 0.6)  # outward-ish but skewed: no radial star
        length = max(F / 2 * reach - rr, cr) * rng.uniform(0.75, 1.05)
        main = _run(spec, rng, start, yaw, length, segs)
        out.append((f"s{i}", i, main, taper(r0, segs)))
        STEMS[i] = main
        branches = [(main, yaw, length, r0)]
        for f in range(forks):  # side branches, alternating sides, shorter outward
            path, yw, ln, rad = branches[0] if f < 2 else rng.choice(branches)
            k = max(1, min(len(path) - 2, int(len(path) * rng.uniform(0.3, 0.7))))
            sgn = (-1) ** f * rng.choice((1, 1, -1))
            ns = max(3, segs - 3)
            nl = ln * (1 - k / len(path)) * rng.uniform(0.7, 1.0)
            fp = _run(spec, rng, path[k], yw + sgn * fang * rng.uniform(0.8, 1.2), nl, ns)
            fr = rad * (1 - 0.55 * k / (len(path) - 1)) * 0.9
            out.append((f"s{i}_f{f}", i, fp, taper(fr, ns, 0.5)))
            branches.append((fp, yw + sgn * fang, nl, fr))
        for t in range(twigs):  # short blunt branchlets on the outer halves
            path, yw, ln, rad = rng.choice(branches)
            k = max(1, min(len(path) - 1, int(len(path) * rng.uniform(0.5, 0.95))))
            sgn = rng.choice((-1, 1))
            tp = _run(
                spec, rng, path[k], yw + sgn * math.radians(rng.uniform(45, 70)), ln * rng.uniform(0.12, 0.22), 2, 0.4
            )
            out.append((f"s{i}_t{t}", i, tp, taper(rad * 0.55, 2, 0.35)))
    return out


def _heap(spec):
    """The mound: a radial grid whose height is the bell profile pushed by 3D noise (lumps), with an uneven lobed
    outline; the rim sinks just below the ground and a flat base closes it."""
    cr, hh = _cr(spec), _HH(spec)
    knobs = _sh(spec, "heap", "knobs", 0.3)
    lob = _sh(spec, "heap", "lobes", 0.18)
    rng = _rng(spec)
    seed = Vector((rng.uniform(0, 50),) * 3)
    NR, NS = 6, 22
    ph = [rng.uniform(0, 2 * math.pi) for _ in range(3)]
    edge = lambda a: (
        cr
        * (1 + lob * (0.6 * math.sin(2 * a + ph[0]) + 0.3 * math.sin(3 * a + ph[1]) + 0.25 * math.sin(5 * a + ph[2])))
    )
    bm = bmesh.new()
    top = bm.verts.new((0, 0, hh * (1 + knobs * noise.noise(seed))))
    rings = []
    for i in range(1, NR + 1):
        u = (i / NR) ** 0.8
        ring = []
        for s in range(NS):
            a = 2 * math.pi * s / NS
            r = edge(a) * u
            x, y = math.cos(a) * r, math.sin(a) * r
            d = Vector((x, y, 0)) / cr
            nz = noise.noise(d * 2.4 + seed) * 0.65 + noise.noise(d * 5.5 + seed) * 0.35
            # the rim is a skirt sunk below the ground: on sloped sand a flat base edge would show as a pale plate
            z = -SKIRT * _H(spec) if i == NR else max(hh * (1 - u * u) ** 2 * (1 + knobs * nz), 0.0)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for s in range(NS):
        bm.faces.new((top, rings[0][s], rings[0][(s + 1) % NS]))
    for i in range(NR - 1):
        for s in range(NS):
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][(s + 1) % NS], rings[i][(s + 1) % NS]))
    bm.faces.new(list(reversed(rings[-1])))  # flat base on the ground
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    return lib.mesh_from_bmesh("heap", bm)


def model(spec):
    STEMS.clear()
    parts = {"heap": _heap(spec)}
    for name, i, path, radii in _plan(spec):
        parts[name] = lib.tube(name, [tuple(p) for p in path], radii, segs=SIDES)
    # matted cover: short curled stems lying over the mound, so the mass reads as stems, not a smooth shell
    rng = random.Random(_rng(spec).random() + 1)
    cr = _cr(spec)
    r0 = _r0(spec)
    for j in range(int(_sh(spec, "heap", "cover", 18))):
        a = rng.uniform(0, 2 * math.pi)
        rr = cr * math.sqrt(rng.uniform(0, 1.0))
        st = Vector((math.cos(a) * rr, math.sin(a) * rr, 0))
        st.z = _heap_z(spec, st.x, st.y) + r0 * 0.3
        path = _run(spec, rng, st, rng.uniform(0, 2 * math.pi), cr * rng.uniform(0.45, 0.8), 3, 1.0)
        cw = r0 * _sh(spec, "heap", "cover_width", 0.85)
        parts[f"cover{j}"] = lib.tube(f"cover{j}", [tuple(p) for p in path], [cw, cw, cw * 0.8, cw * 0.55], segs=SIDES)
    return parts


def _dark(rgba, f):
    return (rgba[0] * f, rgba[1] * f, rgba[2] * f, 1.0)


def material(spec, parts):
    pal = spec["palette"]
    main = [lib.hex_rgba(c) for c in pal["main"]]
    F = _F(spec)
    core = lib.hex_rgba(pal["accent"]) if pal.get("accent") else _dark(main[0], 0.6)
    # stems: the stem colour over the mound, rust only toward the ends (distance from the centre)
    m, nt, b = lib.principled("tangle", main[0], 0.5, 0.05)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vl = nt.nodes.new("ShaderNodeVectorMath")
    vl.operation = "LENGTH"
    nt.links.new(tc.outputs["Object"], vl.inputs[0])
    sc = nt.nodes.new("ShaderNodeMath")
    sc.operation = "MULTIPLY"
    sc.inputs[1].default_value = 2 / F
    nt.links.new(vl.outputs["Value"], sc.inputs[0])
    v = lib.wobble(nt, sc.outputs[0], tc, 0.12, 40 * 0.3 / F)
    r = nt.nodes.new("ShaderNodeValToRGB")
    el = r.color_ramp.elements
    el[0].color = main[0]
    el[0].position = 0.5
    el[1].color = main[-1]
    el[1].position = 0.92
    nt.links.new(v, r.inputs[0])
    nt.links.new(r.outputs[0], b.inputs["Base Color"])
    # mound: the dark matted core, mottled with the stem colour so it reads as packed stems, not a smooth shell
    # (a heavily distorted wave texture draws thin wandering strands, like packed stems seen from above)
    hm, hnt, hb = lib.principled("tangle_core", core, 0.5, 0.05)
    htc = hnt.nodes.new("ShaderNodeTexCoord")
    wv = hnt.nodes.new("ShaderNodeTexWave")
    wv.inputs["Scale"].default_value = 40 * 0.3 / F
    wv.inputs["Distortion"].default_value = 14
    wv.inputs["Detail"].default_value = 3
    hnt.links.new(htc.outputs["Object"], wv.inputs["Vector"])
    hr = hnt.nodes.new("ShaderNodeValToRGB")
    he = hr.color_ramp.elements
    he[0].color = core
    he[0].position = 0.45
    he[1].color = main[0]
    he[1].position = 0.75
    hnt.links.new(wv.outputs["Color"], hr.inputs[0])
    sep = hnt.nodes.new("ShaderNodeSeparateXYZ")
    hnt.links.new(htc.outputs["Object"], sep.inputs[0])
    fl = hnt.nodes.new("ShaderNodeMapRange")
    fl.inputs["From Max"].default_value = 0.5 * _HH(spec)
    fl.inputs["To Min"].default_value = 0.55
    hnt.links.new(
        sep.outputs["Z"], fl.inputs["Value"]
    )  # low flanks darker: the rim reads as shadowed tangle, not a pale disc
    mul = hnt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    gry = hnt.nodes.new("ShaderNodeCombineXYZ")
    [hnt.links.new(fl.outputs[0], gry.inputs[c]) for c in "XYZ"]
    hnt.links.new(hr.outputs[0], mul.inputs["A"])
    hnt.links.new(gry.outputs[0], mul.inputs["B"])
    hnt.links.new(mul.outputs["Result"], hb.inputs["Base Color"])
    for name, o in parts.items():
        o.data.materials.append(hm if name == "heap" else m)


def rig(spec, mesh):
    if not (spec.get("motion") or {}).get("sway"):
        return None, None
    H = _H(spec)
    bones = [("root", (0, 0, 0), (0, 0, H), None), ("heap", (0, 0, 0), (0, 0, H), "root")]
    for i, p in STEMS.items():
        n = len(p) - 1
        prev = "heap"
        for j in range(BONES_PER):
            a, b = p[round(n * j / BONES_PER)], p[round(n * (j + 1) / BONES_PER)]
            bones.append((f"s{i}_{j}", tuple(a), tuple(b), prev))
            prev = f"s{i}_{j}"
    arm = lib.armature(spec["id"] + "_rig", bones)

    def wf(co, parts):
        p = next(iter(parts))
        if not p.startswith("s"):  # mound + cover: the higher, the more it leans with the surge
            w = min(max(co.z / _HH(spec), 0.0), 1.0)
            return {"heap": w, "root": 1 - w} if w > 0 else {"root": 1.0}
        i = int(p[1:].split("_")[0])
        path = STEMS[i]
        k = min(range(len(path)), key=lambda q: (path[q] - co).length)
        t = k / (len(path) - 1)
        return lib.lerp_weights(t, [((j + 0.5) / BONES_PER, f"s{i}_{j}") for j in reversed(range(BONES_PER))])

    lib.skin(mesh, arm, wf)
    return arm, None


def animate(spec, arm):
    ms = spec["motion"]["sway"]
    N, k = ms["frames"], int(ms["cycles"])
    amp = math.radians(ms.get("amp_deg", 6))
    lag = ms.get("lag_frames", 10)
    TAU = 2 * math.pi
    act = lib.new_action(arm, "sway")
    for f in range(N + 1):
        x0 = TAU * k * f / N
        lean = ms.get("lean", 0.04) * _F(spec)  # surge: the mound top slides ~4% of the footprint, base stays
        rots = {"root": [((0, 0, 1), amp * 0.15 * math.sin(x0))]}
        locs = {"heap": Vector((lean * math.sin(x0), lean * 0.6 * math.sin(x0 + 1.1), 0))}
        for i, p in STEMS.items():
            d = p[-1] - p[0]
            d.z = 0
            d = d.normalized() if d.length else Vector((1, 0, 0))
            side = (-d.y, d.x, 0)
            ph = (i % 3) * 0.5  # neighbouring stems out of step
            for j in range(BONES_PER):
                x = TAU * (k * f / N - lag * (j + 1) / N) - ph
                g = 0.5 + 1.2 * j  # one wave travelling out to the ends
                lift = amp * g * 0.4 * (1 - math.cos(x))  # lifts only (never into the sand)
                rots[f"s{i}_{j}"] = [(side, -lift), ((0, 0, 1), amp * 0.8 * g * math.sin(x))]
        lib.key_pose(arm, 1 + f, rots, locs)
    lib.ease_all(act)
    return [act]


def sway_weights(spec, co):
    """Shader sway (motion.sway.mode "shader"): the packed core barely moves, loose stem ends move most and lag behind it.
    Returns (w, phase) for a vertex at co (meters)."""
    r = math.hypot(co.x, co.y)
    core = 0.5 * _cr(spec)
    edge = max(core * 1.5, _F(spec) / 2)
    loose = max(0.0, (r - core) / (edge - core)) ** 1.2
    w = 0.08 + 0.92 * min(1.0, loose + 0.25 * co.z / _H(spec))
    return w, min(1.0, r / edge)
