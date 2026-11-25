"""Archetype: blade_fan: a short stalk holding one (or a few) broad, upright, flat blades shaped like a fan or a
paddle, with ribs radiating from the stalk and an optional pale crust along the rim at bloom. Examples: mermaid's fan
alga (Udotea), a ginkgo-like leaf, a sea fan sprig, a paddle-shaped blade, a fan palm seedling.
Built on models/plant/plant_kit.py (stages, rig, sway and tend by bone role).

Spec fields (all optional except size/palette/motion):
  size.height_m                       bloom height, soil to the top of the fan
  shape.stage_heights [5 floats]      stage height / bloom height (default .07 .3 .6 .85 1)
  shape.stem {radius_ratio .05, length_ratio .28, lean .03}   stalk radius / height, stalk length / stage height
  shape.fan {blades 1 (1-3), spread_deg 110, wave .04, splay_deg 25, ribs 7 (0-12), rib_ratio .012, base_ratio .05,
             rim .0}
        spread = the fan's opening angle (30 = paddle, 180 = half disc); wave = rim ripple / radius;
        splay = angle between blades about the vertical when there are several (like pages of a book); ribs radiating from the base (0 = smooth blade),
        rib_ratio = rib radius / height; base_ratio = blade half-width where it meets the stalk / height;
        rim > 0: a crust along the rim at bloom, this thick / height (palette.disc)
  shape.seed_ratio .035
  palette.main [stalk, ribs], palette.accent (blade), palette.disc (rim crust; default main[1]), palette.seed
  motion.sway {frames, cycles, amp_deg, lag_frames}, motion.tend {frames, lift_deg, stretch, open}
Contract: origin at the soil point, +Z up, +X is the best side (the fan faces between +X and +Y), meters."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib
import plant_kit as kit
from mathutils import Matrix, Vector

_PATHS = {}
_STEM_K = 2
FACE = 0.3 * math.pi  # blade yaw: its face turned toward +X (the garden camera) and partly +Y (side views)


def _stalk_len(spec, n):
    return kit.heights(spec)[n] * kit.g(spec, "stem", "length_ratio", 0.28)


def _stem_pt(spec, n, t):
    top = _stalk_len(spec, n)
    lean = kit.g(spec, "stem", "lean", 0.03) * top
    return Vector((lean * t * t, 0, top * t))


def _blades(spec, n):
    """(name, splay radians) per fan blade of stage n (stages 2+; the sprout is a club)."""
    if n < 2:
        return []
    k = kit.gi(spec, "fan", "blades", 1, 1, 3)
    k = 1 if n == 2 else k
    sp = math.radians(kit.g(spec, "fan", "splay_deg", 25))
    return [(f"s{n}_head{i}", (i - (k - 1) / 2) * sp) for i in range(k)]


def _outline(R, spread, wave, base_w, pts=18):
    """Fan in the XZ plane: base on the stalk at the origin, opening upward; rim rippled by `wave`."""
    half = spread / 2
    rim = []
    for i in range(pts + 1):
        a = -half + spread * i / pts
        r = R * (1 + wave * math.sin(i * 2.7) * (0.3 + 0.7 * math.sin(math.pi * i / pts)))
        rim.append((r * math.sin(a), r * math.cos(a)))
    return [(-base_w, 0.0)] + rim + [(base_w, 0.0)]


def _turn(splay):
    """Blade frame: the outline's XZ plane turned to face +X, then fanned by `splay` about the vertical."""
    return Matrix.Rotation(FACE + splay, 3, "Z")


def _place(local, top, splay):
    """Fan-local XZ point -> world."""
    return top + _turn(splay) @ Vector((local[0], 0, local[1]))


def model(spec):
    H = kit.height(spec)
    parts = {}
    _PATHS.clear()
    kit.seed(spec, parts)
    sr = kit.g(spec, "stem", "radius_ratio", 0.05) * H
    th = kit.thickness(spec) * 1.5
    spread = math.radians(kit.g(spec, "fan", "spread_deg", 110))
    wave = kit.g(spec, "fan", "wave", 0.04)
    nribs = kit.gi(spec, "fan", "ribs", 7, 0, 12)
    rr = kit.g(spec, "fan", "rib_ratio", 0.012) * H
    bw = kit.g(spec, "fan", "base_ratio", 0.05) * H
    rim = kit.g(spec, "fan", "rim", 0.0) * H
    for n in range(1, kit.STAGES):
        path = [_stem_pt(spec, n, k / 6) for k in range(7)]
        r = sr * (0.6 + 0.4 * n / 4)
        parts[f"s{n}_stem"] = lib.tube(f"s{n}_stem", path, [r * (1 - 0.25 * k / 6) for k in range(7)], segs=8)
        _PATHS[f"s{n}_stem"] = path
        top = path[-1]
        if n == 1:  # sprout: a small club on the stalk
            cl = kit.heights(spec)[1] - top.z
            cp = [top + Vector((0, 0, cl * k / 5)) for k in range(6)]
            parts["s1_head0"] = lib.tube("s1_head0", cp, [r * f for f in (1.0, 1.3, 1.5, 1.5, 1.2, 0.6)], segs=8)
            _PATHS["s1_head0"] = cp
            continue
        R = kit.heights(spec)[n] - top.z
        for name, splay in _blades(spec, n):
            o = lib.flat_part(name, _outline(R, spread, wave, bw), th, at=tuple(top), rot=(0, 0, FACE + splay))
            parts[name] = o
            _PATHS[name] = [top, _place((0, R), top, splay)]
            for j in range(nribs):  # ribs fan out over both faces, from the stalk toward the rim
                a = -spread / 2 * 0.85 + spread * 0.85 * j / max(nribs - 1, 1)
                for side in (-1, 1):
                    rib = [
                        _place((R * u * math.sin(a), R * u * math.cos(a)), top, splay)
                        + _turn(splay) @ Vector((0, side * th * 0.6, 0))
                        for u in (0.05, 0.35, 0.65, 0.92)
                    ]
                    rn = f"{name}_rib{j}{'a' if side > 0 else 'b'}"
                    parts[rn] = lib.tube(rn, rib, [rr, rr * 0.9, rr * 0.75, rr * 0.5], segs=4)
            if n == 4 and rim > 0:
                arc = [_place(p, top, splay) for p in _outline(R * 0.985, spread * 0.97, wave, bw)[1:-1]]
                cn = f"{name}_crust"
                parts[cn] = lib.tube(cn, arc, [rim] * len(arc), segs=6)
    return parts


def material(spec, parts):
    def role(n):
        if "_crust" in n:
            return "disc"
        if "_rib" in n:
            return "leaf"
        return "head" if "_head" in n else "stem"

    if not spec["palette"].get("disc"):
        spec = dict(spec, palette=dict(spec["palette"], disc=spec["palette"]["main"][-1]))
    kit.materials(spec, parts, role)


def _bones(spec):
    bones = [kit.seed_bone(spec)]
    for n in range(1, kit.STAGES):
        bones += kit.chain_bones(f"s{n}_stem", _PATHS[f"s{n}_stem"], _STEM_K)
        heads = ["s1_head0"] if n == 1 else [b[0] for b in _blades(spec, n)]
        for name in heads:
            p = _PATHS[name]
            bones.append((name, tuple(p[0]), tuple(p[-1]), f"s{n}_stem{_STEM_K - 1}"))
    return bones


def rig(spec, mesh):
    def wf(co, p):
        n = int(p[1])
        kind = p.split("_", 1)[1]
        if kind.startswith("head"):
            return {"_".join(p.split("_")[:2]): 1.0}  # blade, its ribs and rim crust -> the blade bone
        return kit.chain_weights(co, _PATHS[f"s{n}_stem"], f"s{n}_stem", _STEM_K)

    return kit.rig(spec, mesh, _bones(spec), wf)


def animate(spec, arm):
    return kit.animate(spec, arm)
