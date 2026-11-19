"""Archetype: slender_tube: a long, thin, armoured stick of a body with a tube snout, a small fluttering dorsal fin and a
tiny fan tail. Hovers by fin flutter and sways like a grass blade (no tail sweep for thrust). Pivot-feeds: the head
flicks up and forward and the snout sips. Examples: pipefish, trumpetfish, needlefish-ish, seadragon-less syngnathids.
Everything is parametric from the spec; nothing species-specific.

Spec fields used (all optional except size/palette/motion):
  size.length_m, size.height_ratio (head depth / length), size.width_ratio (thickness / depth)
  shape.profile [[u, r], ...] u: 0 snout tip -> 1 tail tip, r: 0..1 of max half-depth (default: thin snout, deeper head, slim trunk, whip tail)
  shape.snout_u (end of the tube snout along u, default 0.13)
  parts.dorsal {u0, u1, height (x head half-depth)}   parts.tail_fan (size x L, default 0.05)   parts.pectoral (size x L, 0 = none)
  pattern.rings (count, default 18), pattern.ring_w (0..1 of each ring period, default 0.28), pattern.eye_stripe (bool)
  palette.main [back, belly, rings], palette.accent (fins, eye stripe), palette.lip
  motion.idle {frames, cycles, amp_deg, chain_lag_frames}, motion.feed {frames, reach_ratio}, motion.sulk {...}
Contract: head +X, up +Z, meters, origin at body center (see models/creature/CONTRACT.md)."""
import math, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import lib
from mathutils import Vector

NOSE, BASE = 0.5, -0.47          # body loft spans snout tip -> tail tip; tail fan reaches ~-0.5L
DEFAULT_PROFILE = [(0, 0.26), (0.06, 0.26), (0.11, 0.32), (0.15, 0.8), (0.19, 1.0), (0.24, 0.92), (0.28, 0.72),
                   (0.34, 0.78), (0.48, 0.74), (0.58, 0.55), (0.75, 0.36), (0.92, 0.2), (1.0, 0.14)]

def _dims(spec):
    s = spec["size"]; L = s["length_m"]; hh = s.get("height_ratio", 0.11) * L / 2
    return L, hh, hh * s.get("width_ratio", 0.8)

def _r(spec, u):
    prof = spec.get("shape", {}).get("profile", DEFAULT_PROFILE)
    for (ua, ra), (ub, rb) in zip(prof, prof[1:]):
        if ua <= u <= ub: t = (u - ua) / (ub - ua or 1); return ra + (rb - ra) * (t * t * (3 - 2 * t))
    return prof[-1][1]

def _x(u): return NOSE + (BASE - NOSE) * u
def _zc(spec, u):
    """Body axis height: the snout sits a touch high (syngnathid snouts run in line with the top of the head)."""
    L, hh, hw = _dims(spec); su = spec.get("shape", {}).get("snout_u", 0.13)
    return (0.22 * hh if u < su else 0.22 * hh * max(0.0, 1 - (u - su) / 0.08))

def _rings(spec, nu, seg):
    L, hh, hw = _dims(spec); rings = []
    for i in range(1, nu):
        u = i / nu; r = _r(spec, u); zc = _zc(spec, u)
        rings.append([(_x(u) * L, math.cos(2 * math.pi * k / seg) * hw * r, zc + math.sin(2 * math.pi * k / seg) * hh * r) for k in range(seg)])
    return rings

def _body(spec, nu, seg, sub):
    L, hh, hw = _dims(spec); rr = _r(spec, 0.0)
    b = lib.loft("body", _rings(spec, nu, seg), cap_front=(NOSE * L, 0, _zc(spec, 0)), cap_back=(BASE * L, 0, 0))
    if sub: lib.subsurf(b, sub)
    return b

def _fan(spec, th):
    L, hh, hw = _dims(spec); s = spec.get("parts", {}).get("tail_fan", 0.05) * L
    pts = [(0.012 * L, 0.25 * s), (0, 0.45 * s), (-0.5 * s, 0.75 * s), (-0.9 * s, 0.5 * s), (-1.0 * s, 0), (-0.9 * s, -0.5 * s), (-0.5 * s, -0.75 * s), (0, -0.45 * s), (0.012 * L, -0.25 * s)]
    return lib.flat_part("tail", pts, th, at=(BASE * L + 0.01 * L, 0, 0), rim=0.004 * L)

def blockout(spec):
    return {"body": _body(spec, 16, 8, 0), "tail": _fan(spec, 0.006 * spec["size"]["length_m"])}

def model(spec):
    L, hh, hw = _dims(spec); parts = {}; pd = spec.get("parts", {})
    parts["body"] = _body(spec, 44, 14, 1)
    th = 0.006 * L
    parts["tail"] = _fan(spec, th); lib.subsurf(parts["tail"], 1)
    d = pd.get("dorsal", {}); u0, u1 = d.get("u0", 0.4), d.get("u1", 0.56); H = d.get("height", 1.1) * hh
    n = 7; pts = []
    for i in range(n):                                    # rounded sail: sin-shaped top edge
        u = u0 + (u1 - u0) * i / (n - 1); pts.append((_x(u) * L, _zc(spec, u) + _r(spec, u) * hh * 0.7 + H * math.sin(math.pi * i / (n - 1)) ** 0.7))
    for i in reversed(range(n)):
        u = u0 + (u1 - u0) * i / (n - 1); pts.append((_x(u) * L, _zc(spec, u) + _r(spec, u) * hh * 0.45))
    parts["dorsal"] = lib.flat_part("dorsal", pts, th, rim=0.004 * L); lib.subsurf(parts["dorsal"], 1)
    ps = pd.get("pectoral", 0.035) * L
    if ps > 0:
        u = 0.26; x = _x(u) * L; y = _r(spec, u) * hw * 0.9
        shape = [(0, 0.15 * ps), (-0.6 * ps, 0.55 * ps), (-1.0 * ps, 0.2 * ps), (-1.0 * ps, -0.25 * ps), (-0.5 * ps, -0.45 * ps), (0, -0.15 * ps)]
        for side, sgn in (("pecL", 1), ("pecR", -1)):
            o = lib.flat_part(side, shape, th * 0.8, at=(x, sgn * y, -0.1 * hh), rot=(0, 0, sgn * math.radians(-35)), rim=0.003 * L)
            lib.subsurf(o, 1); parts[side] = o
    eu = 0.165; er = _r(spec, eu)
    for side, sgn in (("eyeL", 1), ("eyeR", -1)):
        parts[side] = lib.eye(side, 2 * hh, (_x(eu) * L, sgn * er * hw * 0.86, _zc(spec, eu) + 0.22 * hh), spec.get("eye", {}).get("ratio", 0.12))
    # mouth: round sipping opening at the tip of the tube snout, facing forward
    snout_d = 2 * hh * _r(spec, 0.0)
    parts["mouth"] = lib.mouth(spec, (NOSE * L * 0.995, 0, _zc(spec, 0)), (1, 0, 0), snout_d * 2.2, kind="slit", width=0.42, gape=0.22, depth=0.3, protrude=0.35)
    return parts

def material(spec, parts):
    L, hh, hw = _dims(spec); pal = spec["palette"]; main = [lib.hex_rgba(c) for c in pal["main"]]
    acc = lib.hex_rgba(pal.get("accent", "#ff9f43")); pat = spec.get("pattern", {})
    back, belly = main[0], main[1] if len(main) > 1 else main[0]; ring = main[2] if len(main) > 2 else tuple(c * 0.5 for c in back[:3]) + (1,)
    m, nt, b = lib.principled("skin", back, 0.35, 0.35)
    # back -> belly gradient with soft noise mottling
    z_out, tc = lib.coord_along(nt, 2, -0.5 / hh, 0.55)
    z_out = lib.wobble(nt, z_out, tc, 0.25, scale=8.0 / L)
    g = nt.nodes.new("ShaderNodeValToRGB"); g.color_ramp.elements[0].color = back; g.color_ramp.elements[1].color = belly
    g.color_ramp.elements[0].position = 0.45; g.color_ramp.elements[1].position = 0.7; nt.links.new(z_out, g.inputs[0])
    # armour rings: thin darker bands along X, behind the snout
    nr = pat.get("rings", 18); rw = pat.get("ring_w", 0.28)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    def op(kind, a, bb):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = kind
        for i, v in enumerate((a, bb)):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    per = (0.34 - BASE) * L / nr                                   # rings run from the neck to the tail tip
    fr = op("FRACT", op("DIVIDE", sep.outputs[0], per), 0)
    band = op("MULTIPLY", op("LESS_THAN", fr, rw), op("LESS_THAN", sep.outputs[0], _x(0.27) * L))
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(band, mix.inputs["Factor"])
    nt.links.new(g.outputs[0], mix.inputs["A"]); mix.inputs["B"].default_value = ring
    col = mix.outputs["Result"]
    if pat.get("eye_stripe", True):     # accent stripe through the eye, snout to gill: reads the face at card size
        sx0, sx1 = _x(0.24) * L, NOSE * L
        inx = op("MULTIPLY", op("GREATER_THAN", sep.outputs[0], sx0), op("LESS_THAN", sep.outputs[0], sx1))
        zc = op("ADD", op("MULTIPLY", op("GREATER_THAN", sep.outputs[0], _x(0.13) * L), 0), 0.22 * hh)
        inz = op("LESS_THAN", op("ABSOLUTE", op("SUBTRACT", sep.outputs[2], zc), 0), 0.13 * hh)
        side = op("GREATER_THAN", op("ABSOLUTE", sep.outputs[1], 0), 0.35 * hw * 0.3)
        mask = op("MULTIPLY", op("MULTIPLY", inx, inz), side)
        m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"; nt.links.new(mask, m2.inputs["Factor"])
        nt.links.new(col, m2.inputs["A"]); m2.inputs["B"].default_value = acc; col = m2.outputs["Result"]
    nt.links.new(col, b.inputs["Base Color"])
    fin_col = lib.hex_rgba(pal["fins"]) if pal.get("fins") else acc
    fm, fnt, fb = lib.principled("fin", fin_col, 0.4, 0.2, 0.2)
    wv = fnt.nodes.new("ShaderNodeTexWave"); wv.wave_type = "BANDS"; wv.bands_direction = "X"
    wv.inputs["Scale"].default_value = spec.get("fin_rays", 40) / L; wv.inputs["Distortion"].default_value = 1.0
    ftc = fnt.nodes.new("ShaderNodeTexCoord"); fnt.links.new(ftc.outputs["Object"], wv.inputs["Vector"])
    fr2 = fnt.nodes.new("ShaderNodeValToRGB"); fr2.color_ramp.elements[0].color = tuple(c * 0.55 for c in fin_col[:3]) + (1,)
    fr2.color_ramp.elements[1].color = fin_col; fr2.color_ramp.elements[0].position = 0.35; fr2.color_ramp.elements[1].position = 0.6
    fnt.links.new(wv.outputs["Fac"], fr2.inputs[0]); fnt.links.new(fr2.outputs[0], fb.inputs["Base Color"])
    rim, _, _ = lib.principled("fin_rim", ring, 0.4, 0.2)
    for n, o in parts.items():
        if o.data.materials: continue
        if n == "body": o.data.materials.append(m)
        else: o.data.materials.append(fm); o.data.materials.append(rim)

# spine stations along u (snout -> tail)
SP = [0.27, 0.42, 0.56, 0.7, 0.84, 1.0]
CHAIN = ["spine1", "spine2", "spine3", "spine4", "tail"]

def rig(spec, mesh):
    L, hh, hw = _dims(spec); X = lambda u: _x(u) * L
    bones = [("root", (X(SP[0]), 0, 0), (X(0.2), 0, 0), None),
             ("head", (X(SP[0]), 0, 0), (NOSE * L, 0, _zc(spec, 0)), "root")]
    prev = "root"
    for i, bn in enumerate(CHAIN):
        bones.append((bn, (X(SP[i]), 0, 0), (X(SP[i + 1]), 0, 0), prev)); prev = bn
    du = spec.get("parts", {}).get("dorsal", {}); dm = (du.get("u0", 0.4) + du.get("u1", 0.56)) / 2
    bones.append(("dorsal", (X(dm), 0, _r(spec, dm) * hh * 0.6), (X(dm), 0, _r(spec, dm) * hh * 0.6 + 0.04 * L), "spine2"))
    for side, sgn in (("pecL", 1), ("pecR", -1)):
        y = _r(spec, 0.26) * hw * 0.9
        bones.append((side, (X(0.26), sgn * y, -0.1 * hh), (X(0.26) - 0.035 * L, sgn * (y + 0.01 * L), -0.1 * hh), "root"))
    bones.append(lib.jaw_bone("head")); bones += lib.mouth_corner_bones()
    arm = lib.armature(spec["id"] + "_rig", bones)
    stations = [(X(0.2), "head"), (X(0.3), "root"), (X(0.45), "spine1"), (X(0.6), "spine2"), (X(0.74), "spine3"), (X(0.88), "spine4"), (X(0.97), "tail")]
    du0, du1 = X(du.get("u0", 0.4)), X(du.get("u1", 0.56))
    def wf(co, parts):
        if "pecL" in parts: return {"pecL": 0.85, "root": 0.15}
        if "pecR" in parts: return {"pecR": 0.85, "root": 0.15}
        if parts & {"eyeL", "eyeR"}: return {"head": 1.0}
        if "mouth" in parts: return lib.mouth_weights(co)
        if "tail" in parts: return {"tail": 1.0}
        if "dorsal" in parts:
            base = lib.lerp_weights(co.x, stations); h = max(0.0, min(1.0, (co.z - _r(spec, dm) * hh * 0.55) / (0.9 * hh)))
            out = {k: v * (1 - h) for k, v in base.items()}; out["dorsal"] = out.get("dorsal", 0) + h; return out
        return lib.lerp_weights(co.x, stations)
    lib.skin(mesh, arm, wf)
    mouth = lib.empty("mouth", lib.MOUTHS[-1]["tip"], "head", arm)
    return arm, mouth

Z, Y, Xax = (0, 0, 1), (0, 1, 0), (1, 0, 0)

def _w(k, f, N, ph=0.0): return math.sin(2 * math.pi * k * f / N + ph)

def _idle_pose(spec, f):
    """Grass-blade sway: a slow travelling S-wave down the body (side to side + a little up/down), the body leaning
    with it, the dorsal fin fluttering fast (it is the engine), pectorals buzzing."""
    mi = spec["motion"]["idle"]; N, k = mi["frames"], mi["cycles"]; amp = math.radians(mi.get("amp_deg", 9))
    lag = mi.get("chain_lag_frames", 4); rots = {}
    for i, bn in enumerate(CHAIN):
        a = amp / (1.25 ** (len(CHAIN) - 1 - i))
        rots[bn] = [(Z, a * _w(k, f - lag * i, N)), (Y, 0.4 * a * _w(1, f - lag * i, N, 0.7))]
    rots["root"] = [(Y, math.radians(5) * _w(1, f, N)), (Z, 0.35 * amp * _w(k, f, N, math.pi))]
    rots["head"] = [(Z, -0.3 * amp * _w(k, f, N)), (Y, -math.radians(3) * _w(1, f, N, 1.3))]
    rots["dorsal"] = [(Xax, math.radians(22) * _w(4 * k, f, N))]
    for side, sgn in (("pecL", 1), ("pecR", -1)):
        rots[side] = [(Z, sgn * math.radians(28) * _w(4 * k, f, N, 0 if sgn > 0 else 0.8))]
    return rots

def _idle_locs(spec, f):
    mi = spec["motion"]["idle"]; N = mi["frames"]; L = spec["size"]["length_m"]
    return {"root": Vector((0, 0, L * 0.02 * _w(1, f, N)))}

def animate(spec, arm):
    L, hh, hw = _dims(spec); acts = []
    mi = spec["motion"]["idle"]; N = mi["frames"]
    idle = lib.new_action(arm, "idle")
    for f in range(0, N + 1): lib.key_pose(arm, 1 + f, _idle_pose(spec, f), _idle_locs(spec, f))
    lib.ease_all(idle); acts.append(idle)
    mf = spec["motion"]["feed"]; M = mf["frames"]; reach = mf.get("reach_ratio", 0.2) * L
    base = _idle_pose(spec, 0); feed = lib.new_action(arm, "feed")
    # pivot feeding: anticipate (body eases back, head tucks down, aims) -> strike (head flicks up + whole body darts,
    # fastest beat, snout opens) -> sip (two quick slurps) -> chew (small head bobs) -> settle slow
    #        t     dx             head pitch(+ = nose down)  body arch   dorsal buzz
    beats = [(0.0, 0.0, 0, 0, 0), (0.1, -0.15 * reach, 8, 0.3, 0.5), (0.22, -0.25 * reach, 14, 0.6, 1.0),
             (0.32, reach, -16, -0.5, 1.0), (0.4, 0.95 * reach, -10, -0.3, 0.6), (0.5, 0.9 * reach, -4, -0.1, 0.4),
             (0.58, 0.9 * reach, -9, 0, 0.3), (0.66, 0.88 * reach, -3, 0, 0.2), (0.76, 0.8 * reach, -5, 0, 0.1),
             (0.88, 0.3 * reach, -1, 0, 0), (1.0, 0.0, 0, 0, 0)]
    for t, dx, pitch, arch, bz in beats:
        rots = {bn: list(v) for bn, v in base.items()}
        rots["head"] = rots["head"] + [(Y, math.radians(pitch))]
        rots["root"] = rots["root"] + [(Y, math.radians(pitch) * 0.25)]
        for i, bn in enumerate(CHAIN): rots[bn] = rots[bn] + [(Y, -arch * math.radians(9) * (1 if i < 2 else 0.5))]
        rots["dorsal"] = rots["dorsal"] + [(Xax, math.radians(18) * bz * (1 if round(t * 20) % 2 else -1))]
        lib.key_pose(arm, 1 + round(t * M), rots, {"root": Vector((dx, 0, 0.12 * dx))})
    lib.key_mouth(arm, [(0.0, 0), (0.26, 0), (0.32, 1.0), (0.4, 1.0), (0.46, 0), (0.5, 0), (0.55, 0.85), (0.6, 0.85), (0.65, 0), (0.7, 0), (0.75, 0.35), (0.8, 0), (1.0, 0)], frames=M)
    lib.ease_all(feed); acts.append(feed)
    acts.append(_sulk(spec, arm))
    return acts

def _sulk(spec, arm):
    """Wilted blade: snout droops, the body sags into a limp bow, the dorsal fin barely ticks, sinks, mouth frowns."""
    L, hh, hw = _dims(spec); mi = spec["motion"]["idle"]; ms = spec["motion"]["sulk"]
    N, k = ms["frames"], ms["cycles"]; amp = math.radians(mi.get("amp_deg", 9)) * ms.get("energy", 0.3)
    droop = math.radians(ms.get("droop_deg", 14))
    act = lib.new_action(arm, "sulk")
    for f in range(0, N + 1):
        rots = {bn: [(Z, amp * (0.6 + 0.2 * i) * _w(k, f - 5 * i, N)), (Y, -droop * 0.22)] for i, bn in enumerate(CHAIN)}
        rots["root"] = [(Y, droop * 0.6 + math.radians(2) * _w(1, f, N))]
        rots["head"] = [(Y, droop * 0.5)]
        rots["dorsal"] = [(Xax, math.radians(5) * _w(k, f, N))]
        for side, sgn in (("pecL", 1), ("pecR", -1)): rots[side] = [(Z, -sgn * math.radians(15))]
        locs = {"root": Vector((0, 0, -L * (0.04 + 0.008 * _w(1, f, N))))}
        locs.update(lib.frown_locs(ms.get("frown", 0.8)))
        lib.key_pose(arm, 1 + f, rots, locs)
    lib.ease_all(act); return act
