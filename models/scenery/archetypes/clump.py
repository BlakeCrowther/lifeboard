"""Archetype: clump: blades, fronds or tufts rising from one base (eelgrass tuft, turtle grass, sedge, kelp stipe
bunch, fern crown, reed clump). Everything is parametric from the spec. Sways (optional `motion.sway`).

Contract (models/scenery/CONTRACT.md): origin at the ground contact point, +Z up (glTF +Y), meters, one baked material.

Spec fields (all optional except size/palette):
  size.height_m                          tallest blade tip above the ground
  shape.blades {count 7 (1-10), width_ratio .06, thick_ratio .006, spread .08, lean_deg 14, curl .35,
                tip "point"|"round", vary .25, segs 7}
      width_ratio / thick_ratio / spread = blade width / blade thickness / base ring radius, as a fraction of height;
      lean_deg = blade tilt from vertical at the base; curl = extra outward bend toward the tip (0 straight .. 1 arcs over);
      vary = random length spread (0 = all equal); tip: point = tapered, round = strap with a rounded end.
  shape.base {radius_ratio .07, height_ratio .03}   sand mound / rhizome nub the blades rise from (0 = none)
  palette.main [base colour, tip colour]  blade gradient, ground to tip; palette.base: the nub (default main[0])
  palette.accent  optional tip speckle (epiphytes), shape.blades.speckle 0..1 (default 0)
  motion.sway {frames, cycles, amp_deg 6, lag_frames 6}   three bones per blade, lag grows up the blade
  seed: integer for the per-blade randomness (default: hash of id)"""
import math, sys, os, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import lib, bpy
from mathutils import Vector

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
BONES_PER = 3
PATHS = {}            # part name -> [Vector] blade centre line, used by rig() weights

def _b(spec, key, default):
    return (spec.get("shape", {}).get("blades") or {}).get(key, default)

def _H(spec): return spec["size"]["height_m"]

def _count(spec): return int(round(min(max(_b(spec, "count", 7), 1), 10)))

def _rng(spec): return random.Random(spec.get("seed", sum(map(ord, spec["id"]))))

def _blades(spec):
    """(name, yaw, length, lean, base point) per blade, deterministic from the spec."""
    H = _H(spec); n = _count(spec); rng = _rng(spec); vary = _b(spec, "vary", 0.25)
    out = []
    for i in range(n):
        yaw = 2 * math.pi * i / n + rng.uniform(-0.4, 0.4)
        ln = H * (1 - vary * rng.random()) if i else H        # blade 0 is the tallest (sets height_m)
        lean = math.radians(_b(spec, "lean_deg", 14) * rng.uniform(0.5, 1.3))
        r = _b(spec, "spread", 0.08) * H * (0.4 + 0.6 * rng.random())
        out.append((f"blade{i}", yaw, ln, lean, Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.006 * H))))
    return out

def _path(spec, yaw, ln, lean, base, segs):
    """Blade centre line: leans out at `lean`, curls further out toward the tip; arc length ~ ln.
    Height is rescaled so the tip sits at ln (blade 0 tip = height_m)."""
    curl = _b(spec, "curl", 0.35); out = Vector((math.cos(yaw), math.sin(yaw), 0)); pts = [base.copy()]; p = base.copy()
    for k in range(1, segs + 1):
        t = k / segs; a = lean + curl * 1.2 * t * t
        p = p + (out * math.sin(a) + Vector(Z) * math.cos(a)) * (ln / segs); pts.append(p.copy())
    s = (ln - base.z) / max(pts[-1].z - base.z, 1e-6)
    return [Vector((q.x, q.y, base.z + (q.z - base.z) * s)) for q in pts]

def _width(spec, t):
    tip = _b(spec, "tip", "point")
    if tip == "round": return 1.0 if t < 0.85 else math.sqrt(max(0.0, 1 - ((t - 0.85) / 0.15) ** 2)) * 0.9 + 0.1
    return (1 - t) ** 0.7 * 0.92 + 0.08

def _ribbon(name, path, wid, th, yaw):
    """Flat strip with a real thickness: 4-point cross-section per path point (width across the blade's side
    direction), lofted. The flat face points out from the clump, so blades read as ribbons, not tubes."""
    side = Vector((-math.sin(yaw), math.cos(yaw), 0)); rings = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized(); nrm = side.cross(t).normalized()
        w = wid[i] / 2; d = th / 2
        rings.append([tuple(p + side * w), tuple(p + nrm * d), tuple(p - side * w), tuple(p - nrm * d)])
    return lib.loft(name, rings, cap_front=tuple(path[0]), cap_back=tuple(path[-1] + (path[-1] - path[-2]).normalized() * th))

def model(spec):
    H = _H(spec); parts = {}; segs = int(_b(spec, "segs", 7))
    W = _b(spec, "width_ratio", 0.06) * H; th = max(_b(spec, "thick_ratio", 0.006) * H, 0.0008)
    PATHS.clear()
    for name, yaw, ln, lean, base in _blades(spec):
        path = _path(spec, yaw, ln, lean, base, segs); PATHS[name] = path
        wid = [W * _width(spec, k / segs) for k in range(segs + 1)]
        parts[name] = _ribbon(name, path, wid, th, yaw)
    br = (spec.get("shape", {}).get("base") or {}).get("radius_ratio", 0.07) * H
    bh = (spec.get("shape", {}).get("base") or {}).get("height_ratio", 0.03) * H
    if br > 0 and bh > 0:
        nub = lib.sphere("base", br, (0, 0, bh / 2), 12); nub.scale = (1, 1, bh / (2 * br)); parts["base"] = nub
    return parts

def _gradient(nt, b, c0, c1, H, speck=None, amount=0.0):
    v, tc = lib.coord_along(nt, 2, 1 / H, 0)
    r = nt.nodes.new("ShaderNodeValToRGB"); r.color_ramp.elements[0].color = c0; r.color_ramp.elements[1].color = c1
    r.color_ramp.elements[0].position = 0.05; nt.links.new(v, r.inputs[0]); out = r.outputs[0]
    if speck and amount > 0:                                   # epiphyte speckle, only on the upper half
        n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 140 * 0.3 / H; nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
        g = nt.nodes.new("ShaderNodeMath"); g.operation = "GREATER_THAN"; g.inputs[1].default_value = 1 - 0.35 * amount; nt.links.new(n.outputs[0], g.inputs[0])
        hi = nt.nodes.new("ShaderNodeMath"); hi.operation = "GREATER_THAN"; hi.inputs[1].default_value = 0.5; nt.links.new(v, hi.inputs[0])
        m = nt.nodes.new("ShaderNodeMath"); m.operation = "MULTIPLY"; nt.links.new(g.outputs[0], m.inputs[0]); nt.links.new(hi.outputs[0], m.inputs[1])
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(m.outputs[0], mix.inputs["Factor"])
        nt.links.new(out, mix.inputs["A"]); mix.inputs["B"].default_value = speck; out = mix.outputs["Result"]
    nt.links.new(out, b.inputs["Base Color"])

def material(spec, parts):
    pal = spec["palette"]; main = [lib.hex_rgba(c) for c in pal["main"]]; H = _H(spec)
    m, nt, b = lib.principled("blade", main[0], 0.45, 0.2)
    _gradient(nt, b, main[0], main[-1], H, lib.hex_rgba(pal["accent"]) if pal.get("accent") else None, _b(spec, "speckle", 0))
    base, _, _ = lib.principled("base", lib.hex_rgba(pal.get("base", pal["main"][0])), 0.5, 0.1)
    for n, o in parts.items(): o.data.materials.append(base if n == "base" else m)

def rig(spec, mesh):
    if not (spec.get("motion") or {}).get("sway"): return None, None
    H = _H(spec); bones = [("root", (0, 0, 0), (0, 0, 0.08 * H), None)]
    for name in PATHS:
        p = PATHS[name]; n = len(p) - 1; prev = "root"
        for j in range(BONES_PER):
            a, b = p[round(n * j / BONES_PER)], p[round(n * (j + 1) / BONES_PER)]
            bones.append((f"{name}_{j}", tuple(a), tuple(b), prev)); prev = f"{name}_{j}"
    arm = lib.armature(spec["id"] + "_rig", bones)
    def wf(co, parts):
        p = next(iter(parts))
        if p not in PATHS: return {"root": 1.0}
        path = PATHS[p]; k = min(range(len(path)), key=lambda i: (path[i] - co).length); t = k / (len(path) - 1)
        return lib.lerp_weights(t, [((j + 0.5) / BONES_PER, f"{p}_{j}") for j in reversed(range(BONES_PER))])
    lib.skin(mesh, arm, wf)
    return arm, None

def animate(spec, arm):
    ms = spec["motion"]["sway"]; N, k = ms["frames"], int(ms["cycles"]); amp = math.radians(ms.get("amp_deg", 6)); lag = ms.get("lag_frames", 6)
    w = lambda ff, f, ph: math.sin(2 * math.pi * k * ff / N + ph) - math.sin(2 * math.pi * k * (ff - f) / N + ph)   # frame 0 = rest = frame N
    blades = {b[0]: b for b in _blades(spec)}
    act = lib.new_action(arm, "sway")
    for f in range(N + 1):
        rots = {}
        for name, yaw, ln, lean, base in blades.values():
            out = Vector((math.cos(yaw), math.sin(yaw), 0)); side = Vector((-math.sin(yaw), math.cos(yaw), 0)); ph = yaw * 1.7
            for j in range(BONES_PER):
                ff = f - lag * j; g = 0.6 + 0.4 * j            # the tip swings further and later than the base
                rots[f"{name}_{j}"] = [(tuple(side), amp * g * w(ff, f, ph)), (tuple(out), amp * 0.5 * g * w(ff, f, ph + 1.3))]
        lib.key_pose(arm, 1 + f, rots)
    lib.ease_all(act)
    return [act]
