"""Archetype: soft_glider: a soft, low, elongated body that glides on a flat foot (no fins, no legs), with optional
soft dorsal outgrowths. Examples: nudibranch (cerata, rhinophores), sea slug, land slug, flatworm-ish.
Everything is parametric from the spec; nothing species-specific.

Spec fields used (all optional except size/palette/motion):
  size.length_m, size.height_ratio (body height / length), size.width_ratio (body width / length)
  shape.profile  [[u, r], ...]  u: 0 head → 1 tail tip, r: 0..1 of max half-width/height
  parts.cerata {rows, per_side, length_ratio, radius_ratio (default 0.032), u0, u1}   (rows: 0 = smooth back)
  parts.rhinophores {length_ratio}  (0 = none)        parts.oral_tentacles {length_ratio}  (0 = none)
  palette.main [body, outgrowths, ...], palette.accent (rhinophores), palette.lip (mouth part + lip line, default accent; pushed dark), palette.oral (optional, default body)
  motion.idle {frames, cycles, amp_deg, chain_lag_frames, sway_deg (cerata sway, default 16)}, motion.feed {frames, reach_ratio}
Contract: head +X, up +Z, meters, origin at body center (see models/creature/CONTRACT.md)."""
import math, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import lib
from mathutils import Vector

NOSE, BASE = 0.5, -0.5            # body spans the full length along X
HAS_FINS = False                  # outgrowths are tubes, not lib.flat_part fins: shape-check expects no fin records
DEFAULT_PROFILE = [(0, 0.0), (0.03, 0.5), (0.1, 0.82), (0.25, 1.0), (0.55, 0.95), (0.8, 0.6), (0.95, 0.22), (1.0, 0.08)]

def _dims(spec):
    s = spec["size"]; L = s["length_m"]
    hh = s.get("height_ratio", 0.2) * L / 1.5          # dome height above the foot line (foot is 0.5 hh below)
    hw = s.get("width_ratio", 0.22) * L / 2
    return L, hh, hw

def _zc(hh): return -0.25 * hh                          # body axis height, so the bbox (with outgrowths) centres near 0

def _r(spec, u):
    prof = spec.get("shape", {}).get("profile", DEFAULT_PROFILE)
    for (ua, ra), (ub, rb) in zip(prof, prof[1:]):
        if ua <= u <= ub: t = (u - ua) / (ub - ua or 1); return ra + (rb - ra) * (t * t * (3 - 2 * t))
    return prof[-1][1]

def _x(u): return NOSE + (BASE - NOSE) * u

def _surf(spec, u, theta_deg, sgn=1, inset=1.0):
    """Point on the body surface at length u and angle theta (0 = side, 90 = top) on side sgn."""
    L, hh, hw = _dims(spec); r = _r(spec, u) * inset; th = math.radians(theta_deg)
    return Vector((_x(u) * L, sgn * math.cos(th) * hw * r, _zc(hh) + math.sin(th) * hh * r))

def _p(spec, key, field, default):
    v = spec.get("parts", {}).get(key, {})
    return v.get(field, default) if isinstance(v, dict) else default

def _cerata(spec):
    """Yields (part_name, bone_group, side_sign, base, direction, length, u) for every dorsal outgrowth."""
    L, hh, hw = _dims(spec)
    rows = _p(spec, "cerata", "rows", 6); per = _p(spec, "cerata", "per_side", 2)
    lr = _p(spec, "cerata", "length_ratio", 0.18); u0 = _p(spec, "cerata", "u0", 0.25); u1 = _p(spec, "cerata", "u1", 0.85)
    for i in range(rows):
        u = u0 + (u1 - u0) * i / max(rows - 1, 1); g = min(2, i * 3 // max(rows, 1))
        for j in range(per):
            th = 50 if per == 1 else 28 + 44 * j / (per - 1)
            for sgn, side in ((1, "L"), (-1, "R")):
                base = _surf(spec, u, th, sgn, 0.85)
                d = Vector((-0.35, sgn * math.cos(math.radians(th)) * 0.7, math.sin(math.radians(th)) + 0.35)).normalized()
                yield f"cer{side}_{g}_{i}_{j}", f"cer{side}{g}", sgn, base, d, lr * L * (0.6 + 0.4 * _r(spec, u)), u

def _curve(base, d, length, back, n=4):
    """Points along d, bending gently backward (-X) toward the tip."""
    return [base + d * length * (k / (n - 1)) + Vector((-back * length * (k / (n - 1)) ** 2, 0, 0)) for k in range(n)]

def _oral(spec, sgn):
    """Oral tentacle base + direction: set wide and swept outward so the mouth between/below them stays visible."""
    L, hh, hw = _dims(spec)
    return Vector((_x(0.05) * L, sgn * 0.5 * hw, _zc(hh) - 0.05 * hh)), Vector((0.7, sgn * 0.7, -0.1)).normalized()

def _mouth_at(spec):
    """Mouth opening on the body surface + facing: `front` = low on the head front, facing forward-down, between and
    below the oral tentacles; `underside` = under the head, facing down."""
    L, hh, hw = _dims(spec); zc = _zc(hh)
    if spec.get("mouth", "front") == "underside":
        u = 0.12; return Vector((_x(u) * L, 0, zc - 0.5 * hh * _r(spec, u) * 0.98)), Vector((0, 0, -1))
    u = 0.025; return Vector((_x(u) * L, 0, zc - 0.32 * hh * _r(spec, u))), Vector((1, 0, -0.5))

def model(spec):
    L, hh, hw = _dims(spec); parts = {}; seg, nu = 24, 22; zc = _zc(hh)
    rings = []
    for i in range(1, nu):
        u = i / nu; r = _r(spec, u); ring = []
        for k in range(seg):
            th = 2 * math.pi * k / seg; s = math.sin(th)
            ring.append((_x(u) * L, math.cos(th) * hw * r * (1.12 if s < 0 else 1.0), zc + s * hh * r * (1.0 if s > 0 else 0.5)))
        rings.append(ring)
    body = lib.loft("body", rings, cap_front=(NOSE * L * 1.01, 0, zc - 0.05 * hh), cap_back=(BASE * L * 1.01, 0, zc - 0.1 * hh))
    lib.subsurf(body, 1); parts["body"] = body

    for name, _, sgn, base, d, ln, u in _cerata(spec):
        rr = _p(spec, "cerata", "radius_ratio", 0.032) * L * (0.7 + 0.3 * _r(spec, u))
        o = lib.tube(name, _curve(base, d, ln, 0.12), [rr * 0.8, rr, rr * 0.95, rr * 0.45] if _p(spec, "cerata", "club", False) else [rr, rr * 0.85, rr * 0.6, rr * 0.28]); lib.subsurf(o, 1); parts[name] = o

    rl = _p(spec, "rhinophores", "length_ratio", 0.15)
    if rl > 0:
        for sgn, side in ((1, "L"), (-1, "R")):
            base = _surf(spec, 0.13, 72, sgn, 0.8); d = Vector((-0.2, sgn * 0.3, 1)).normalized()
            o = lib.tube("rhino" + side, _curve(base, d, rl * L, 0.15), [k * _p(spec, "rhinophores", "radius_ratio", 0.019) * L for k in (1, 0.9, 0.63, 0.32)]); lib.subsurf(o, 1); parts["rhino" + side] = o
    ol = _p(spec, "oral_tentacles", "length_ratio", 0.15)
    if ol > 0:
        for sgn, side in ((1, "L"), (-1, "R")):
            base, d = _oral(spec, sgn)
            o = lib.tube("oral" + side, _curve(base, d, ol * L, 0.35), [k * _p(spec, "oral_tentacles", "radius_ratio", 0.02) * L for k in (1, 0.8, 0.55, 0.3)]); lib.subsurf(o, 1); parts["oral" + side] = o
    # shared STYLE eye: glossy dark sphere ~10% of body height, just in front of the rhinophores
    for side, sgn in (("eyeL", 1), ("eyeR", -1)):    # body height = dome (hh) + foot (0.5 hh)
        parts[side] = lib.eye(side, 1.5 * hh, _surf(spec, 0.08, 55, sgn, 0.92), spec.get("eye", {}).get("ratio", 0.10))
    at, d = _mouth_at(spec)            # shared STYLE mouth part (dark lip slit), sized from the head height
    parts["mouth"] = lib.mouth(spec, at, d, 1.5 * hh * _r(spec, 0.1), width=0.4, gape=0.13)
    return parts

def material(spec, parts):
    pal = spec["palette"]; main = [lib.hex_rgba(c) for c in pal["main"]]
    acc = lib.hex_rgba(pal.get("accent", "#111111"))
    skin, _, _ = lib.principled("skin", main[0], 0.4, 0.35)
    outg, nt, b = lib.principled("cerata", main[1] if len(main) > 1 else main[0], 0.35, 0.4)
    rhino, _, _ = lib.principled("rhino", acc, 0.4, 0.3)
    oral, _, _ = lib.principled("oral", lib.hex_rgba(pal["oral"]) if pal.get("oral") else main[0], 0.4, 0.3)
    L, hh, hw = _dims(spec); zc = _zc(hh)
    pat = spec.get("pattern", {})
    if pat.get("type") == "stripe":   # pale dorsal/head stripe: |y| < width_ratio*L/2 on the upper half, from head back to u_end
        nt = skin.node_tree; b = nt.nodes["Principled BSDF"]
        tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
        def op(kind, a, bb):
            n = nt.nodes.new("ShaderNodeMath"); n.operation = kind
            for i, v in enumerate((a, bb)):
                if isinstance(v, (int, float)): n.inputs[i].default_value = v
                else: nt.links.new(v, n.inputs[i])
            return n.outputs[0]
        w = pat.get("width_ratio", 0.1) * L / 2; xe = _x(pat.get("u_end", 0.8)) * L
        m = op("MULTIPLY", op("MULTIPLY", op("LESS_THAN", op("ABSOLUTE", sep.outputs[1], 0), w), op("GREATER_THAN", sep.outputs[2], zc + 0.25 * hh)), op("GREATER_THAN", sep.outputs[0], xe))
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(m, mix.inputs["Factor"])
        mix.inputs["A"].default_value = b.inputs["Base Color"].default_value; mix.inputs["B"].default_value = lib.hex_rgba(pat.get("color", "#e8f0ff"))
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    # accent lip line across the front underside of the head
    lib.accent_line(skin.node_tree, skin.node_tree.nodes["Principled BSDF"], lib.hex_rgba(pal.get("lip", pal.get("accent", "#111111"))), NOSE * L * 0.78, zc - 0.22 * hh, 0.2 * hh)
    for n, o in parts.items():
        if o.data.materials: continue            # eyes come with the shared eye material
        o.data.materials.append(outg if n.startswith("cer") else rhino if n.startswith("rhino")
                                else oral if n.startswith("oral") else skin)

def _bones(spec):
    L, hh, hw = _dims(spec); zc = _zc(hh); X = lambda u: _x(u) * L
    bones = [("root", (X(0.45), 0, zc), (X(0.25), 0, zc), None),
             ("head", (X(0.25), 0, zc), (NOSE * L, 0, zc), "root"),
             ("spine1", (X(0.45), 0, zc), (X(0.65), 0, zc), "root"),
             ("spine2", (X(0.65), 0, zc), (X(0.85), 0, zc), "spine1"),
             ("tail", (X(0.85), 0, zc), (BASE * L, 0, zc), "spine2")]
    seen = {}
    for name, bone, sgn, base, d, ln, u in _cerata(spec): seen.setdefault(bone, []).append((base, d, ln, u))
    for bone, items in seen.items():
        n = len(items); base = sum((b for b, *_ in items), Vector()) / n; d = sum((x for _, x, *_ in items), Vector()).normalized()
        ln = sum(x for *_, x, _ in items) / n; u = sum(x for *_, x in items) / n
        parent = "root" if u < 0.45 else "spine1" if u < 0.65 else "spine2" if u < 0.85 else "tail"
        bones.append((bone, tuple(base), tuple(base + d * ln), parent))
    if _p(spec, "rhinophores", "length_ratio", 0.15) > 0:
        for sgn, side in ((1, "L"), (-1, "R")):
            b = _surf(spec, 0.13, 72, sgn, 0.8); bones.append(("rhino" + side, tuple(b), tuple(b + Vector((-0.2, sgn * 0.3, 1)).normalized() * 0.1 * L), "head"))
    if _p(spec, "oral_tentacles", "length_ratio", 0.15) > 0:
        for sgn, side in ((1, "L"), (-1, "R")):
            b, d = _oral(spec, sgn); bones.append(("oral" + side, tuple(b), tuple(b + d * 0.1 * L), "head"))
    return bones

def rig(spec, mesh):
    L, hh, hw = _dims(spec); X = lambda u: _x(u) * L
    bones = _bones(spec) + [lib.jaw_bone("head")] + lib.mouth_corner_bones(); names = {b[0] for b in bones}
    arm = lib.armature(spec["id"] + "_rig", bones)
    stations = [(X(0.08), "head"), (X(0.35), "root"), (X(0.55), "spine1"), (X(0.75), "spine2"), (X(0.92), "tail")]
    def wf(co, parts):
        for p in parts:
            if p.startswith("cer"): return {p.split("_")[0] + p.split("_")[1]: 1.0}
            if p in names: return {p: 1.0}                    # rhinoL/R, oralL/R
            if p.startswith("eye"): return {"head": 1.0}
            if p == "mouth": return lib.mouth_weights(co)
        return lib.lerp_weights(co.x, stations)
    lib.skin(mesh, arm, wf)
    mouth = lib.empty("mouth", lib.MOUTHS[-1]["tip"], "head", arm)   # at the mouth part's opening
    return arm, mouth

CHAIN = ["spine1", "spine2", "tail"]
Z, Y, Xax = (0, 0, 1), (0, 1, 0), (1, 0, 0)

def _idle_pose(spec, f, bone_names):
    mi = spec["motion"]["idle"]; N, k = mi["frames"], mi["cycles"]; amp = math.radians(mi.get("amp_deg", 6))
    lag = mi.get("chain_lag_frames", 4); w = lambda kk, ff, ph=0: math.sin(2 * math.pi * kk * ff / N + ph); rots = {}
    for i, bn in enumerate(CHAIN):
        rots[bn] = [(Z, amp * 1.3 ** i * w(k, f - lag * (i + 1)))]
    rots["head"] = [(Z, -0.4 * amp * w(k, f))]
    rots["root"] = [(Y, math.radians(1.2) * w(1, f))]                                    # slow breathing pitch, k=1
    for sgn, side in ((1, "L"), (-1, "R")):
        for g in range(3):                                                               # cerata ripple head → tail
            bn = f"cer{side}{g}"
            if bn in bone_names:
                rots[bn] = [(Xax, sgn * math.radians(mi.get("sway_deg", 16)) * 1.2 ** g * w(k, f - lag * (g + 1))), (Y, math.radians(10) * w(k, f - lag * (g + 1), 1.0))]
        if "rhino" + side in bone_names:
            rots["rhino" + side] = [(Y, math.radians(12) * w(2 * k, f, 0 if sgn > 0 else 1.3))]
        if "oral" + side in bone_names:
            rots["oral" + side] = [(Z, sgn * math.radians(10) * w(k, f - lag, 0 if sgn > 0 else 0.8))]
    return rots

def animate(spec, arm):
    L, hh, hw = _dims(spec); acts = []; names = {b.name for b in arm.data.bones}
    N = spec["motion"]["idle"]["frames"]
    idle = lib.new_action(arm, "idle")
    for f in range(0, N + 1): lib.key_pose(arm, 1 + f, _idle_pose(spec, f, names))
    lib.ease_all(idle); acts.append(idle)
    mf = spec["motion"]["feed"]; M = mf["frames"]; reach = mf.get("reach_ratio", 0.14) * L
    base = _idle_pose(spec, 0, names)
    feed = lib.new_action(arm, "feed")
    #        t     root dx           head dip(deg, + = nose down)  cerata flare
    beats = [(0.0, 0.0, 0, 0), (0.15, -0.9 * reach, -28, 0.3), (0.22, -0.85 * reach, -26, 0.4), (0.36, reach, 22, 1.0),
             (0.48, 0.95 * reach, 9, 0.8), (0.58, 0.92 * reach, 22, 0.6), (0.68, 0.9 * reach, 9, 0.5), (0.77, 0.88 * reach, 21, 0.4),
             (0.9, 0.3 * reach, 3, 0.1), (1.0, 0.0, 0, 0)]
    for t, dx, dip, flare in beats:
        rots = {bn: list(v) for bn, v in base.items()}
        rots["head"] = rots.get("head", []) + [(Y, math.radians(dip))]
        for i, bn in enumerate(CHAIN): rots[bn] = rots[bn] + [(Y, -math.radians(dip) * 0.25 * (i + 1) / 3)]
        for sgn, side in ((1, "L"), (-1, "R")):
            for g in range(3):
                bn = f"cer{side}{g}"
                if bn in names: rots[bn] = rots[bn] + [(Xax, sgn * math.radians(12) * flare)]
            if "oral" + side in names: rots["oral" + side] = rots["oral" + side] + [(Z, sgn * math.radians(20) * flare)]   # spread apart, clear of the mouth
        lib.key_pose(arm, 1 + round(t * M), rots, {"root": Vector((dx, 0, 0))})
    # mouth opens as the head dips toward each bite, shuts on the bite (three rasps on the dip peaks above)
    lib.key_mouth(arm, [(0.0, 0), (0.22, 0), (0.3, 1.0), (0.36, 0), (0.5, 0.9), (0.58, 0), (0.7, 0.8), (0.77, 0), (1.0, 0)], frames=M)
    lib.ease_all(feed); acts.append(feed)
    acts.append(_sulk(spec, arm, names))
    return acts

SULK_DROOP_MIN = 20   # degrees; a smaller head dip reads as idle at card size

def _sulk(spec, arm, names):
    """Mope loop (runtime plays it instead of idle while sad): goes limp. Head dipped by motion.sulk.droop_deg (at
    least SULK_DROOP_MIN), the tail end draped down, rhinophores folded back, cerata flattened outward, sunk a little,
    a barely-there ripple, mouth corners down. Whole cycles only, so it loops seamlessly."""
    ms = spec["motion"]["sulk"]; N, k = ms["frames"], ms["cycles"]; mi = spec["motion"]["idle"]; L = spec["size"]["length_m"]
    amp = math.radians(mi.get("amp_deg", 6)) * ms.get("energy", 0.35)
    droop = math.radians(max(ms.get("droop_deg", SULK_DROOP_MIN), SULK_DROOP_MIN))
    w = lambda kk, f, ph=0: math.sin(2 * math.pi * kk * f / N + ph)
    act = lib.new_action(arm, "sulk")
    for f in range(0, N + 1):
        rots = {bn: [(Z, amp * 1.3 ** i * w(k, f - 5 * (i + 1))), (Y, -droop * 0.25)] for i, bn in enumerate(CHAIN)}
        rots["head"] = [(Y, droop)]
        rots["root"] = [(Y, math.radians(1) * w(1, f))]
        for sgn, side in ((1, "L"), (-1, "R")):
            for g in range(3):
                if f"cer{side}{g}" in names: rots[f"cer{side}{g}"] = [(Xax, -sgn * math.radians(45) + sgn * math.radians(3) * w(k, f - 5 * g))]
            if "rhino" + side in names: rots["rhino" + side] = [(Y, -math.radians(60))]
            if "oral" + side in names: rots["oral" + side] = [(Z, -sgn * math.radians(8))]
        locs = {"root": Vector((0, 0, -L * (0.03 + 0.005 * w(1, f))))}
        locs.update(lib.frown_locs(ms.get("frown", 1.0)))
        lib.key_pose(arm, 1 + f, rots, locs)
    lib.ease_all(act); return act
