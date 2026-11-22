"""Archetype: streamlined_swimmer: a torpedo/teardrop body that swims by sweeping its rear body + tail.
Examples: clownfish, tuna, wrasse, dolphin-ish, tadpole. Everything is parametric from the spec; nothing species-specific.

Spec fields used (all optional except size/palette/motion):
  size.length_m, size.height_ratio (body depth / length), size.width_ratio (thickness / depth)
  shape.profile  [[u, r], ...]  u: 0 nose → 1 tail base, r: 0..1 of max half-depth
  parts.dorsal  rounded|pointed|sail|none     parts.tail rounded|forked|lunate
  parts.pectoral paddle|wing|none             parts.anal rounded|pointed|none
  pattern.type bands|spots|gradient|solid; pattern.bands [{u, w}] (u: 0 nose → 1 tail tip, w width in u)
  palette.main [body, pattern, ...], palette.accent (edges/eyes rim), palette.fins (optional)
  motion.idle {frames, cycles, amp_deg, chain_lag_frames}, motion.feed {frames, reach_ratio}
Contract: head +X, up +Z, meters, origin at body center (see models/creature/CONTRACT.md)."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import lib
from mathutils import Matrix, Vector

NOSE, BASE = 0.5, -0.34  # body spans x = +0.5L (nose) … -0.34L (tail base); tail fin reaches ~-0.52L
DEFAULT_PROFILE = [
    (0, 0.0),
    (0.03, 0.36),
    (0.1, 0.68),
    (0.22, 0.92),
    (0.37, 1.0),
    (0.52, 0.94),
    (0.67, 0.76),
    (0.8, 0.5),
    (0.92, 0.33),
    (1.0, 0.26),
]


def _dims(spec):
    s = spec["size"]
    L = s["length_m"]
    hh = s.get("height_ratio", 0.45) * L / 2
    return L, hh, hh * s.get("width_ratio", 0.6)


def _r(spec, u):
    prof = spec.get("shape", {}).get("profile", DEFAULT_PROFILE)
    for (ua, ra), (ub, rb) in zip(prof, prof[1:]):
        if ua <= u <= ub:
            t = (u - ua) / (ub - ua or 1)
            return ra + (rb - ra) * (t * t * (3 - 2 * t))
    return prof[-1][1]


def _x(u):
    return NOSE + (BASE - NOSE) * u  # u → x in units of L


def _u(x):
    return (NOSE - x) / (NOSE - BASE)


TAIL = {
    "rounded": [
        (0, 0),
        (-0.05, 0.09),
        (-0.12, 0.13),
        (-0.17, 0.09),
        (-0.185, 0),
        (-0.17, -0.09),
        (-0.12, -0.13),
        (-0.05, -0.09),
    ],
    "forked": [
        (0, 0),
        (-0.07, 0.1),
        (-0.15, 0.19),
        (-0.19, 0.17),
        (-0.12, 0.04),
        (-0.11, 0),
        (-0.12, -0.04),
        (-0.19, -0.17),
        (-0.15, -0.19),
        (-0.07, -0.1),
    ],
    "lunate": [
        (0, 0),
        (-0.05, 0.08),
        (-0.1, 0.2),
        (-0.14, 0.21),
        (-0.1, 0.06),
        (-0.09, 0),
        (-0.1, -0.06),
        (-0.14, -0.21),
        (-0.1, -0.2),
        (-0.05, -0.08),
    ],
}
RIM = 0.012  # fin rim width (x L), coloured palette.accent
SAIL = {
    "rounded": [0, 0.45, 0.7, 0.78, 0.7, 0.5, 0],
    "pointed": [0, 0.9, 0.6, 0.45, 0.35, 0.25, 0],
    "sail": [0, 1.0, 1.1, 1.05, 0.9, 0.6, 0],
}


def blockout(spec):
    """Primitive proportions only (no subdivision, no fins detail): body loft + tail plate, for the silhouette check."""
    L, hh, hw = _dims(spec)
    seg, nu = 10, 8
    rings = [
        [
            (
                _x(i / nu) * L,
                math.cos(2 * math.pi * k / seg) * hw * _r(spec, i / nu),
                math.sin(2 * math.pi * k / seg) * hh * _r(spec, i / nu),
            )
            for k in range(seg)
        ]
        for i in range(1, nu)
    ]
    body = lib.loft("body", rings, cap_front=(NOSE * L, 0, 0), cap_back=(BASE * L, 0, 0))
    t = TAIL.get(spec.get("parts", {}).get("tail", "rounded"), TAIL["rounded"])
    tail = lib.flat_part(
        "tail",
        [(x * L, z * L * spec["size"].get("height_ratio", 0.45) / 0.45) for x, z in t],
        0.012 * L,
        at=(BASE * L + 0.03 * L, 0, 0),
    )
    return {"body": body, "tail": tail}


PEC_U, PEC_Z = 0.3, -0.15  # pectoral root: along the body (u) and down the flank (x half-depth)
PEC_FLARE = 25  # degrees the fin opens from the flank at rest; idle, feed and sulk turn it about its root
PEC_SLANT = 30  # degrees the root line leans back from vertical, within the flank: the fin angles down-back
# and its outer face tips up to the light, while the whole root stays on the surface
PEC_MOUNT = {}  # side -> (root point, root-line axis, trailing direction), from model(); rig() and the
# actions need them after the body has been joined


def _pec_mount(spec, body, sgn, root_thickness):
    """Root point and orientation for a pectoral: the root line lies in the flank (on the subdivided surface, sunk just
    enough that the root band never shows), slanted PEC_SLANT, and the fin trails back from it, opened PEC_FLARE from
    the flank. Rooted along the surface, the whole fin stays outside the body: a fin tilted through the flank shows as
    a slot, and one tilted about its own trailing edge lifts an end of its root off the body."""
    L, hh, hw = _dims(spec)
    hit, n = lib.surface_hit(body, (_x(PEC_U) * L, sgn * 2 * hw, PEC_Z * hh), (0, -sgn, 0))
    up, back = Vector((0, 0, 1)), Vector((-1, 0, 0))
    ev = (up - up.dot(n) * n).normalized()  # vertical, in the flank
    eb = (back - back.dot(n) * n - back.dot(ev) * ev).normalized()  # straight back, in the flank
    sl, f = math.radians(PEC_SLANT), math.radians(PEC_FLARE)
    ez = ev * math.cos(sl) + eb * math.sin(sl)  # root line
    trail = (eb * math.cos(sl) - ev * math.sin(sl)) * math.cos(f) + n * math.sin(f)
    ex = -trail
    frame = Matrix((ex, ez.cross(ex), ez)).transposed()  # outline -X trails, outline Z is the root line
    return hit - n * 0.6 * root_thickness, frame


def _pec_open(sgn, deg):
    """Pose rotation that opens a pectoral `deg` further from the flank (negative: folds it in) about its root line."""
    m = PEC_MOUNT.get("pecL" if sgn > 0 else "pecR")
    return [(tuple(m[1]), -sgn * math.radians(deg))] if m else []


def model(spec):
    L, hh, hw = _dims(spec)
    parts = {}
    seg, nu = 18, 14
    rings = []
    for i in range(1, nu):
        u = i / nu
        r = _r(spec, u)
        rings.append(
            [
                (_x(u) * L, math.cos(2 * math.pi * k / seg) * hw * r, math.sin(2 * math.pi * k / seg) * hh * r)
                for k in range(seg)
            ]
        )
    body = lib.loft("body", rings, cap_front=(NOSE * L * 1.01, 0, -0.04 * hh), cap_back=(BASE * L * 1.02, 0, 0))
    lib.subsurf(body, 2)
    parts["body"] = body
    th = 0.012 * L
    pd = spec.get("parts", {})
    t = [(0.03, -0.05), (0.03, 0.05)] + TAIL.get(pd.get("tail", "rounded"), TAIL["rounded"])[1:]  # root edge first
    tail = lib.flat_part(
        "tail",
        [(x * L, z * L * spec["size"].get("height_ratio", 0.45) / 0.45) for x, z in t],
        th,
        at=(BASE * L + 0.07 * L, 0, 0),
        rim=RIM * L,
        root=1,
    )  # root overlaps the tapered body so subdivision never opens a gap
    parts["tail"] = tail

    def ridge(name, u0, u1, heights, top=True, scale=0.62):
        n = len(heights)
        us = [u0 + (u1 - u0) * i / (n - 1) for i in range(n)]
        sg = 1 if top else -1
        base = [(_x(u) * L, sg * _r(spec, u) * hh * 0.55) for u in us]  # sunk in the body: the fin's root
        edge = [(_x(u) * L, sg * (_r(spec, u) * hh * 0.8 + h * hh * scale)) for u, h in zip(us, heights)]
        o = lib.flat_part(name, base + edge[::-1], th, rim=RIM * L, root=n - 1)
        parts[name] = o

    d = pd.get("dorsal", "rounded")
    if d != "none":
        ridge("dorsal", 0.3, 0.85, SAIL.get(d, SAIL["rounded"]), True)
    a = pd.get("anal", "rounded")
    if a != "none":
        ridge("anal", 0.6, 0.9, SAIL["pointed" if a == "pointed" else "rounded"][:5], False, 0.45)
    PEC_MOUNT.clear()
    if pd.get("pectoral", "paddle") != "none":
        ps = pd.get("pectoral_scale", 1.5)  # paddle size multiplier (default 1.5: reads at card size)
        shape = [
            (x * L * ps, z * L * ps)
            for x, z in ((0, -0.02), (0, 0.02), (-0.05, 0.045), (-0.11, 0.03), (-0.12, -0.015), (-0.06, -0.035))
        ]
        for side, sgn in (("pecL", 1), ("pecR", -1)):
            at, frame = _pec_mount(spec, body, sgn, th * 0.8)
            parts[side] = lib.flat_part(
                side, shape, th * 0.8, at=tuple(at), rot=tuple(frame.to_euler()), rim=RIM * L * 0.7, root=1
            )
            PEC_MOUNT[side] = (at, frame.col[2].copy(), -frame.col[0])
    # eyes (shared STYLE eye: glossy dark sphere, ~10% body depth)
    eu = 0.12
    for side, sgn in (("eyeL", 1), ("eyeR", -1)):
        parts[side] = lib.eye(
            side,
            2 * hh,
            (_x(eu) * L, sgn * _r(spec, eu) * hw * 0.82, 0.18 * hh),
            spec.get("eye", {}).get("ratio", 0.10),
        )
    # mouth (shared STYLE mouth): dark lip slit at the nose tip, facing forward and slightly down
    parts["mouth"] = lib.mouth(
        spec,
        (NOSE * L * 0.99, 0, -0.06 * hh),
        (1, 0, -0.15),
        2 * hh * _r(spec, 0.12),
        width=0.32,
        gape=0.13,
        protrude=0.08,
    )
    return parts


def material(spec, parts):
    L, hh, hw = _dims(spec)
    pal = spec["palette"]
    main = [lib.hex_rgba(c) for c in pal["main"]]
    acc = lib.hex_rgba(pal.get("accent", "#111111"))
    pat = spec.get("pattern", {"type": "solid"})
    m, nt, b = lib.principled("skin", main[0], 0.35, 0.4)
    ptype = pat.get("type", "solid")
    if ptype == "bands":
        u_out, tc = lib.coord_along(
            nt, 0, -1 / ((NOSE - BASE + 0.18) * L), NOSE / (NOSE - BASE + 0.18)
        )  # 0 nose → 1 tail tip
        u_out = lib.wobble(nt, u_out, tc, 0.02 * (1 / L) * L)
        body, band, edge = main[0], (main[1] if len(main) > 1 else (0.95, 0.95, 0.92, 1)), acc
        e = pat.get("edge_w", 0.008)
        stops = [(0, body)]
        for bd in sorted(pat.get("bands", []), key=lambda q: q["u"]):
            c, w = bd["u"], bd["w"] / 2
            if pat.get("edge"):
                stops += [(c - w - e, edge), (c - w, band), (c + w, edge), (c + w + e, body)]
            else:
                stops += [(c - w, band), (c + w, body)]
        nt.links.new(lib.constant_ramp(nt, u_out, stops), b.inputs["Base Color"])
    elif ptype == "gradient":  # back (main0) → belly (main1)
        z_out, tc = lib.coord_along(nt, 2, -0.5 / hh, 0.5)
        r = nt.nodes.new("ShaderNodeValToRGB")
        r.color_ramp.elements[0].color = main[0]
        r.color_ramp.elements[1].color = main[-1]
        nt.links.new(z_out, r.inputs[0])
        nt.links.new(r.outputs[0], b.inputs["Base Color"])
    elif ptype == "spots":
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = pat.get("density", 9) / L
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
        r = nt.nodes.new("ShaderNodeValToRGB")
        cr = r.color_ramp
        cr.interpolation = "CONSTANT"
        cr.elements[0].color = main[1] if len(main) > 1 else acc
        cr.elements[1].position = pat.get("spot_size", 0.22)
        cr.elements[1].color = main[0]
        nt.links.new(vor.outputs["Distance"], r.inputs[0])
        nt.links.new(r.outputs[0], b.inputs["Base Color"])
    fin_col = lib.hex_rgba(pal["fins"]) if pal.get("fins") else main[0]
    fm, fnt, fb = lib.principled("fin", fin_col, 0.4, 0.2, 0.2)
    # fin rays: fine darker stripes running root→edge so fins read as webbed membrane, not flat paper
    wv = fnt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = "X"
    wv.inputs["Scale"].default_value = spec.get("fin_rays", 14) / L
    wv.inputs["Distortion"].default_value = 1.5
    ftc = fnt.nodes.new("ShaderNodeTexCoord")
    fnt.links.new(ftc.outputs["Object"], wv.inputs["Vector"])
    ray = tuple(c * 0.55 for c in fin_col[:3]) + (1,)
    fr = fnt.nodes.new("ShaderNodeValToRGB")
    fr.color_ramp.elements[0].color = ray
    fr.color_ramp.elements[1].color = fin_col
    fr.color_ramp.elements[0].position = 0.35
    fr.color_ramp.elements[1].position = 0.6
    fnt.links.new(wv.outputs["Fac"], fr.inputs[0])
    fnt.links.new(fr.outputs[0], fb.inputs["Base Color"])
    rim, _, _ = lib.principled("fin_rim", acc, 0.4, 0.2)
    for n, o in parts.items():
        if o.data.materials:
            continue  # eyes come with the shared eye material
        if n == "body":
            o.data.materials.append(m)
        else:
            o.data.materials.append(fm)
            o.data.materials.append(rim)  # fins: index 1 = rim faces


def rig(spec, mesh):
    L, hh, hw = _dims(spec)
    X = lambda u: _x(u) * L
    bones = [
        ("root", (X(0.42), 0, 0), (X(0.3), 0, 0), None),
        ("head", (X(0.3), 0, 0), (NOSE * L, 0, 0), "root"),
        ("spine1", (X(0.42), 0, 0), (X(0.6), 0, 0), "root"),
        ("spine2", (X(0.6), 0, 0), (X(0.78), 0, 0), "spine1"),
        ("spine3", (X(0.78), 0, 0), (BASE * L, 0, 0), "spine2"),
        ("tail", (BASE * L, 0, 0), ((BASE - 0.17) * L, 0, 0), "spine3"),
    ]
    for side, (
        at,
        axis,
        trail,
    ) in PEC_MOUNT.items():  # pivot on the fin's root, so turning it never swings it into the flank
        bones.append((side, tuple(at), tuple(at + trail * 0.1 * L), "root"))
    bones.append(lib.jaw_bone("head"))
    bones += lib.mouth_corner_bones()
    arm = lib.armature(spec["id"] + "_rig", bones)
    stations = [
        (X(0.12), "head"),
        (X(0.36), "root"),
        (X(0.52), "spine1"),
        (X(0.69), "spine2"),
        (X(0.86), "spine3"),
        ((BASE - 0.06) * L, "tail"),
    ]

    def wf(co, parts):
        if "pecL" in parts:
            return {"pecL": 0.85, "root": 0.15}
        if "pecR" in parts:
            return {"pecR": 0.85, "root": 0.15}
        if parts & {"eyeL", "eyeR"}:
            return {"head": 1.0}
        if "mouth" in parts:
            return lib.mouth_weights(co)
        if "tail" in parts and co.x < BASE * L - 0.03 * L:
            return {"tail": 1.0}
        return lib.lerp_weights(co.x, stations)

    lib.skin(mesh, arm, wf)
    mouth = lib.empty("mouth", lib.MOUTHS[-1]["tip"], "head", arm)  # at the mouth part's opening
    return arm, mouth


CHAIN = ["spine1", "spine2", "spine3", "tail"]
Z, Y, Xax = (0, 0, 1), (0, 1, 0), (1, 0, 0)


def _idle_pose(spec, f):
    mi = spec["motion"]["idle"]
    N, k = mi["frames"], mi["cycles"]
    amp = math.radians(mi.get("amp_deg", 14))
    lag = mi.get("chain_lag_frames", 3)
    rots = {}
    for i, bn in enumerate(CHAIN):
        a = 1.6 * amp / (1.3 ** (len(CHAIN) - 1 - i))
        ph = 2 * math.pi * k * (f - lag * i) / N
        rots[bn] = [(Z, a * math.sin(ph))]
    rots["head"] = [(Z, -0.22 * amp * math.sin(2 * math.pi * k * f / N))]
    # hover: slow pitch (k=1) + roll wave (k), whole cycles so the loop stays seamless; bob lives in _idle_locs
    rots["root"] = [
        (Y, math.radians(4) * math.sin(2 * math.pi * f / N)),
        (Xax, math.radians(5) * math.sin(2 * math.pi * k * f / N + 1.1)),
    ]
    for side, sgn in (("pecL", 1), ("pecR", -1)):
        rots[side] = _pec_open(sgn, 12 * math.sin(2 * math.pi * 2 * k * f / N + (0 if sgn > 0 else 0.6)))
    return rots


def _idle_locs(spec, f):
    """Hover bob: root up/down, whole cycles, zero at f=0 (feed starts/ends there), zero mean → no net root motion."""
    mi = spec["motion"]["idle"]
    N, k = mi["frames"], mi["cycles"]
    L = spec["size"]["length_m"]
    return {
        "root": Vector((0, 0, L * (0.03 * math.sin(2 * math.pi * f / N) + 0.012 * math.sin(2 * math.pi * k * f / N))))
    }


def animate(spec, arm):
    L, hh, hw = _dims(spec)
    acts = []
    mi = spec["motion"]["idle"]
    N = mi["frames"]
    idle = lib.new_action(arm, "idle")
    for f in range(0, N + 1):
        lib.key_pose(arm, 1 + f, _idle_pose(spec, f), _idle_locs(spec, f))
    lib.ease_all(idle)
    acts.append(idle)
    mf = spec["motion"]["feed"]
    M = mf["frames"]
    reach = mf.get("reach_ratio", 0.2) * L
    amp = math.radians(mi.get("amp_deg", 14))
    base = _idle_pose(spec, 0)
    feed = lib.new_action(arm, "feed")
    #        t     root dx           head pitch   tail sweep
    # anticipation: pull back + S-curve tuck (spine bends alternate) + pectoral flare; strike: the fastest beat, gape
    # held through it; two bites: jaw snaps shut with a head nod; chew; slow settle
    #        t     root dx        head pitch  tail sweep  S-curve
    beats = [
        (0.0, 0.0, 0, 0, 0),
        (0.12, -0.25 * reach, 7, 0.3, 0.6),
        (0.22, -0.3 * reach, 10, 0.4, 1.0),
        (0.34, reach, -10, -0.8, -0.2),
        (0.42, reach, -6, -0.3, 0),
        (0.52, 0.95 * reach, 6, 0.2, 0),
        (0.58, 0.92 * reach, -5, 0.1, 0),
        (0.67, 0.9 * reach, 6, -0.1, 0),
        (0.76, 0.88 * reach, -2, 0, 0),
        (0.86, 0.35 * reach, -1, 0.05, 0),
        (1.0, 0.0, 0, 0, 0),
    ]
    for t, dx, pitch, sweep, sc in beats:
        rots = {bn: list(v) for bn, v in base.items()}
        rots["head"] = rots.get("head", []) + [(Y, math.radians(pitch))]
        rots["root"] = rots.get("root", []) + [
            (Y, math.radians(9) * sc)
        ]  # whole-body nose-up tuck on anticipation (reads side-on)
        for i, bn in enumerate(CHAIN):
            rots[bn] = rots[bn] + [
                (Z, sweep * amp * (0.4 + 0.25 * i) + sc * math.radians(26) * (1 if i % 2 == 0 else -1))
            ]
        for side, sgn in (("pecL", 1), ("pecR", -1)):
            rots[side] = rots[side] + _pec_open(sgn, 25 * max(sc, 0))
        lib.key_pose(arm, 1 + round(t * M), rots, {"root": Vector((dx, 0, 0))})
    lib.key_mouth(
        arm,
        [
            (0.0, 0),
            (0.24, 0),
            (0.3, 1.0),
            (0.42, 1.0),
            (0.5, 0),
            (0.53, 0),
            (0.58, 0.9),
            (0.62, 0.9),
            (0.69, 0),
            (0.72, 0),
            (0.76, 0.35),
            (0.81, 0),
            (1.0, 0),
        ],
        frames=M,
    )
    lib.ease_all(feed)
    acts.append(feed)
    acts.append(_sulk(spec, arm))
    return acts


SULK_DROOP_MIN = (
    30  # degrees nose-down; the 14 degree hang this archetype used to default to reads as idle at card size
)


def _sulk(spec, arm):
    """Mope loop (runtime plays it instead of idle while sad): hangs nose-down by motion.sulk.droop_deg (at least
    SULK_DROOP_MIN), head bowed, tail limp, fins clamped, a slow tired tail beat, sunk a little, mouth corners down.
    Whole cycles only, so it loops seamlessly. The tail stays near the body line: curling it down as well would undo
    the tilt in silhouette (creature/qa.py measures the sulk against idle at card size)."""
    L, hh, hw = _dims(spec)
    mi = spec["motion"]["idle"]
    ms = spec["motion"]["sulk"]
    N, k = ms["frames"], ms["cycles"]
    amp = math.radians(mi.get("amp_deg", 14)) * ms.get("energy", 0.35)
    droop = math.radians(max(ms.get("droop_deg", SULK_DROOP_MIN), SULK_DROOP_MIN))
    w = lambda kk, f, ph=0: math.sin(2 * math.pi * kk * f / N + ph)
    act = lib.new_action(arm, "sulk")
    for f in range(0, N + 1):
        rots = {
            bn: [(Z, amp * (0.6 + 0.3 * i) * w(k, f - 4 * i)), (Y, -droop * 0.06)] for i, bn in enumerate(CHAIN)
        }  # limp tail
        rots["root"] = [(Y, droop + math.radians(1.5) * w(1, f))]  # nose down, slow sigh
        rots["head"] = [(Y, droop * 0.4)]
        for side, sgn in (("pecL", 1), ("pecR", -1)):
            rots[side] = _pec_open(sgn, -12 + 2 * w(k, f))  # clamped to the flank
        locs = {"root": Vector((0, 0, -L * (0.05 + 0.01 * w(1, f))))}
        locs.update(lib.frown_locs(ms.get("frown", 1.0)))
        lib.key_pose(arm, 1 + f, rots, locs)
    lib.ease_all(act)
    return act
