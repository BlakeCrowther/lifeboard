"""Archetype: brush: a stalk (or none) topped by a dense tuft or dome of fine filaments radiating from one point:
a shaving brush, a pom-pom, a dandelion clock, a thistle head, a moss cushion or a tuft of hair-like algae.
Built on models/plant/plant_kit.py (stages, rig, sway and tend by bone role).

Spec fields (all optional except size/palette/motion):
  size.height_m                       bloom height, soil to the top of the tuft
  shape.stage_heights [5 floats]      stage height / bloom height (default .07 .3 .6 .85 1)
  shape.stem {radius_ratio .07, length_ratio .5, lean .03}   stalk radius / height; stalk length / stage height
                                                             (length_ratio 0: a cushion sitting on the soil)
  shape.brush {filaments 40 (8-70), radius_ratio .22, cone_deg 55, jitter .2, filament_ratio .008, collar .0}
        radius = filament length / height; cone = half-angle of the tuft around vertical (90 = a dome, 140+ = a ball);
        jitter = variation in filament length; filament_ratio = filament radius / height;
        collar > 0: a ring of short bracts under the tuft (thistle, dandelion), this long / height
  shape.seed_ratio .035
  palette.main [stalk, collar], palette.accent (filaments), palette.disc (filament tips; default accent), palette.seed
  motion.sway {frames, cycles, amp_deg, lag_frames}, motion.tend {frames, lift_deg, stretch, open}
Contract: origin at the soil point, +Z up, +X is the best side, meters."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib
import plant_kit as kit
from mathutils import Vector

_PATHS = {}
_STEM_K = 2
_SECTORS = 3  # head bones per stage: the tuft ripples in three sectors instead of moving as one block


def _stalk_len(spec, n):
    return kit.heights(spec)[n] * kit.g(spec, "stem", "length_ratio", 0.5)


def _stem_pt(spec, n, t):
    top = _stalk_len(spec, n)
    lean = kit.g(spec, "stem", "lean", 0.03) * top
    return Vector((lean * t * t, 0, top * t))


def _tuft(spec, n):
    """(count, filament length, cone half-angle) for stage n: sprout = a few hairs, bud = a tight closed tuft."""
    cnt = kit.gi(spec, "brush", "filaments", 40, 8, 70)
    top = _stem_pt(spec, n, 1.0)
    reach = kit.heights(spec)[n] - top.z
    cone = math.radians(kit.g(spec, "brush", "cone_deg", 55))
    k, c = {1: (6, 0.5), 2: (max(8, cnt // 3), 0.75), 3: (max(10, cnt * 2 // 3), 0.45), 4: (cnt, 1.0)}[n]
    return k, reach, cone * c  # the near-vertical filaments set the top, so filament length = reach


def model(spec):
    H = kit.height(spec)
    parts = {}
    _PATHS.clear()
    kit.seed(spec, parts)
    sr = kit.g(spec, "stem", "radius_ratio", 0.07) * H
    fr = max(kit.g(spec, "brush", "filament_ratio", 0.008) * H, 0.0004)
    jit = kit.g(spec, "brush", "jitter", 0.2)
    col = kit.g(spec, "brush", "collar", 0.0) * H
    for n in range(1, kit.STAGES):
        top = _stem_pt(spec, n, 1.0)
        if top.z > 1e-4:
            path = [_stem_pt(spec, n, k / 6) for k in range(7)]
            r = sr * (0.6 + 0.4 * n / 4)
            parts[f"s{n}_stem"] = lib.tube(f"s{n}_stem", path, [r * (1 - 0.2 * k / 6) for k in range(7)], segs=8)
            _PATHS[f"s{n}_stem"] = path
        k, ln, cone = _tuft(spec, n)
        knob = lib.sphere(f"s{n}_head0_knob", max(sr * 0.9, fr * 3), tuple(top), 8)
        parts[f"s{n}_head0_knob"] = knob
        for i in range(k):  # fibonacci spread over the cone's cap, so the tuft is even from every side
            u = (i + 0.5) / k
            polar = cone * math.sqrt(u)
            yaw = kit.GOLDEN * i
            d = Vector((math.sin(polar) * math.cos(yaw), math.sin(polar) * math.sin(yaw), math.cos(polar)))
            L = ln * (1 - jit * 0.5 * (1 + math.sin(i * 3.1)))
            pts = [top + d * L * t + Vector((0, 0, -0.08 * L * t * t * math.sin(polar))) for t in (0, 0.5, 1.0)]
            fn = f"s{n}_head{kit.group(i, _SECTORS)}_f{i}"
            parts[fn] = lib.tube(fn, pts, [fr * 1.3, fr, fr * 0.8], segs=3)
            tip = lib.sphere(f"{fn}tip", fr * 1.6, tuple(pts[-1]), 4)
            parts[f"{fn}tip"] = tip
        if col > 0 and n >= 3:
            for i in range(8):
                yaw = 2 * math.pi * i / 8
                d = Vector((math.cos(yaw), math.sin(yaw), 0))
                bp = [top - Vector((0, 0, col * 0.3)) + d * sr * 0.8, top + d * col * 0.6 + Vector((0, 0, col * 0.2))]
                cn = f"s{n}_head{kit.group(i, _SECTORS)}_col{i}"
                parts[cn] = lib.tube(cn, bp, [sr * 0.5, sr * 0.15], segs=4)
        _PATHS[f"s{n}_tuft"] = [top, top + Vector((0, 0, ln))]
    return parts


def material(spec, parts):
    def role(n):
        if n.endswith("tip"):
            return "disc"
        if "_col" in n:
            return "leaf"
        return "head" if "_head" in n and "_knob" not in n else "stem"

    if not spec["palette"].get("disc"):
        spec = dict(spec, palette=dict(spec["palette"], disc=spec["palette"].get("accent", spec["palette"]["main"][0])))
    kit.materials(spec, parts, role)


def _bones(spec):
    bones = [kit.seed_bone(spec)]
    for n in range(1, kit.STAGES):
        parent = None
        if f"s{n}_stem" in _PATHS:
            bones += kit.chain_bones(f"s{n}_stem", _PATHS[f"s{n}_stem"], _STEM_K)
            parent = f"s{n}_stem{_STEM_K - 1}"
        a, b = _PATHS[f"s{n}_tuft"]
        for j in range(_SECTORS):
            yaw = 2 * math.pi * j / _SECTORS
            tail = b + Vector((math.cos(yaw), math.sin(yaw), 0)) * (b - a).length * 0.4
            bones.append((f"s{n}_head{j}", tuple(a), tuple(tail), parent))
    return bones


def rig(spec, mesh):
    def wf(co, p):
        n = int(p[1])
        kind = p.split("_", 1)[1]
        if kind.startswith("head"):
            return {"_".join(p.split("_")[:2]): 1.0}  # filaments, tips and collar bracts -> their sector bone
        if f"s{n}_stem" not in _PATHS:
            return {f"s{n}_head0": 1.0}
        return kit.chain_weights(co, _PATHS[f"s{n}_stem"], f"s{n}_stem", _STEM_K)

    return kit.rig(spec, mesh, _bones(spec), wf)


def animate(spec, arm):
    return kit.animate(spec, arm)
