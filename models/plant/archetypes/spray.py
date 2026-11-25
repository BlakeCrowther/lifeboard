"""Archetype: spray: one stalk with strap leaves that branches near the top into stalklets carrying many small
florets or fruits (beads or puffs). Layouts: umbel (all branches from one point, like a parasol of stalklets), panicle
(branches up the top of the stalk, shortening upward: a plume or cone), raceme (short stalklets along the top, one
floret each). Examples: goldenrod plume, sea lavender spray, yarrow, Queen Anne's lace, a fruit umbel on a stalk.
Built on models/plant/plant_kit.py (stages, rig, sway and tend by bone role).

Spec fields (all optional except size/palette/motion):
  size.height_m                       bloom height, soil to the top florets
  shape.stage_heights [5 floats]      stage height / bloom height (default .07 .3 .6 .85 1)
  shape.stem {radius_ratio .025, lean .05}
  shape.leaf {count 3 (0-6), length_ratio .26, width_ratio .12, pitch_deg 35, droop_deg 30, low .08, high .5}
        strap leaves along the stalk (ribbons); width_ratio = width / leaf length
  shape.spray {layout "panicle", branches 6 (2-12), branch_ratio .18, angle_deg 40, span .3, florets 5 (1-12),
               floret_ratio .022, puff 0, droop_deg 12}
        branch_ratio = longest branch / height; angle = branch angle from vertical; span = top fraction of the stalk
        the branches attach along (panicle/raceme); florets per branch, floret_ratio = floret radius / height;
        puff 0 = round beads .. 1 = flattened puffs; droop = how far branches bend down by their tips
  shape.seed_ratio .035
  palette.main [stalk, leaf], palette.accent (florets), palette.disc (bud florets; default accent), palette.seed
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
_LEAF_BONES = 3  # per stage; leaves and branches share bones round-robin to stay under kit.MAX_BONES
_HEAD_BONES = 4


def _layout(spec):
    v = spec.get("shape", {}).get("spray", {}).get("layout", "panicle")
    return v if v in ("umbel", "panicle", "raceme") else "panicle"


def _stem_top(spec, n):
    """The stalk stops below the stage height so the spray's top florets reach it."""
    H = kit.height(spec)
    h = kit.heights(spec)[n]
    if n < 3:
        return h
    bl = kit.g(spec, "spray", "branch_ratio", 0.18) * H * (0.55 if n == 3 else 1.0)
    ang = math.radians(kit.g(spec, "spray", "angle_deg", 40))
    lay = _layout(spec)
    up = bl * math.cos(ang) * (1.0 if lay == "umbel" else 0.35 if lay == "panicle" else 0.15)
    return h - up - kit.g(spec, "spray", "floret_ratio", 0.022) * H


def _stem_pt(spec, n, t):
    top = _stem_top(spec, n)
    lean = kit.g(spec, "stem", "lean", 0.05) * top
    return Vector((lean * t * t, 0, top * t))


def _leaves(spec, n):
    if n == 1:
        return [(f"s1_leaf{i}", 0.9, math.pi / 2 + math.pi * i, 0.45) for i in range(2)]
    if n < 2:
        return []
    cnt = kit.gi(spec, "leaf", "count", 3, 0, 6)
    k = cnt if n >= 3 else max(1, math.ceil(cnt * 0.6))
    lo, hi = kit.g(spec, "leaf", "low", 0.08), kit.g(spec, "leaf", "high", 0.5)
    return [
        (f"s{n}_leaf{i}", lo + (hi - lo) * i / max(k - 1, 1), math.pi / 2 + kit.GOLDEN * i, 1 - 0.3 * i / max(k - 1, 1))
        for i in range(k)
    ]


def _branches(spec, n):
    """(bone/part name, attach t on the stalk, yaw, length) for stage n's spray (bud: short, closed)."""
    if n < 3:
        return []
    H = kit.height(spec)
    cnt = kit.gi(spec, "spray", "branches", 6, 2, 12)
    bl = kit.g(spec, "spray", "branch_ratio", 0.18) * H * (0.55 if n == 3 else 1.0)
    span = kit.g(spec, "spray", "span", 0.3)
    lay = _layout(spec)
    out = []
    for i in range(cnt):
        if lay == "umbel":
            t, ln = 1.0, bl
        else:
            u = i / max(cnt - 1, 1)  # 0 = lowest branch
            t = 1 - span + span * u
            ln = bl * ((1 - 0.6 * u) if lay == "panicle" else 0.35)
        out.append((f"s{n}_head{i}", t, math.pi / 2 + kit.GOLDEN * i, ln))
    return out


def _branch_path(spec, n, t, yaw, ln):
    ang = kit.g(spec, "spray", "angle_deg", 40)
    droop = kit.g(spec, "spray", "droop_deg", 12) * (0.5 if n == 3 else 1.0)
    return kit.arc(_stem_pt(spec, n, t), yaw, ln, 90 - ang, droop, n=5)


def model(spec):
    H = kit.height(spec)
    parts = {}
    _PATHS.clear()
    kit.seed(spec, parts)
    sr = kit.g(spec, "stem", "radius_ratio", 0.025) * H
    th = kit.thickness(spec)
    fr = kit.g(spec, "spray", "floret_ratio", 0.022) * H
    puff = kit.g(spec, "spray", "puff", 0.0)
    nfl = kit.gi(spec, "spray", "florets", 5, 1, 12)
    for n in range(1, kit.STAGES):
        path = [_stem_pt(spec, n, k / 6) for k in range(7)]
        r = sr * (0.55 + 0.45 * n / 4)
        parts[f"s{n}_stem"] = lib.tube(f"s{n}_stem", path, [r * (1 - 0.35 * k / 6) for k in range(7)], segs=8)
        _PATHS[f"s{n}_stem"] = path
        ll = kit.g(spec, "leaf", "length_ratio", 0.26) * H * (0.75 if n == 2 else 1.0)
        for name, t, yaw, ls in _leaves(spec, n):
            pts = kit.arc(
                _stem_pt(spec, n, t),
                yaw,
                ll * ls,
                kit.g(spec, "leaf", "pitch_deg", 35),
                kit.g(spec, "leaf", "droop_deg", 30),
                n=6,
            )
            w = ll * ls * kit.g(spec, "leaf", "width_ratio", 0.12) * (2.0 if n == 1 else 1.0)
            parts[name] = kit.ribbon(
                name, pts, [w * (0.5 + 0.5 * math.sin(math.pi * min(0.15 + k / 5, 0.95))) for k in range(6)], th * 1.5
            )
            _PATHS[name] = pts
        for name, t, yaw, ln in _branches(spec, n):
            pts = _branch_path(spec, n, t, yaw, ln)
            parts[name] = lib.tube(name, pts, [r * 0.45 * (1 - 0.5 * k / 4) for k in range(5)], segs=5)
            _PATHS[name] = pts
            k_fl = 1 if _layout(spec) == "raceme" else nfl
            for s in range(k_fl):
                u = 1.0 if k_fl == 1 else 0.35 + 0.65 * s / (k_fl - 1)
                i0 = min(int(u * (len(pts) - 1)), len(pts) - 2)
                c = pts[i0].lerp(pts[i0 + 1], u * (len(pts) - 1) - i0)
                side = Vector((math.cos(s * 2.4), math.sin(s * 2.4), 0.6)).normalized() * fr * 0.9 * (k_fl > 1)
                rr = fr * (0.65 if n == 3 else 1.0) * (0.8 + 0.2 * math.sin(s * 1.7))
                fn = f"{name}_fl{s}"
                o = lib.sphere(fn, rr, tuple(c + side), 6)
                o.scale = (1, 1, 1 - 0.5 * puff)
                parts[fn] = o
    return parts


def material(spec, parts):
    def role(n):
        if "_fl" in n:
            return "disc" if n.startswith("s3_") else "head"
        return "leaf" if "_leaf" in n else "stem"

    kit.materials(spec, parts, role)


def _bones(spec):
    bones = [kit.seed_bone(spec)]
    for n in range(1, kit.STAGES):
        path = _PATHS[f"s{n}_stem"]
        bones += kit.chain_bones(f"s{n}_stem", path, _STEM_K)
        for group, cap in ((_leaves(spec, n), _LEAF_BONES), (_branches(spec, n), _HEAD_BONES)):
            for name, t, *_ in group[:cap]:
                p = _PATHS[name]
                bones.append(
                    (_bone(name, cap), tuple(p[0]), tuple(p[-1]), f"s{n}_stem{min(int(t * _STEM_K), _STEM_K - 1)}")
                )
    return bones


def _bone(part, cap=None):
    """Leaf or branch part (or a floret on it) -> the shared bone it is skinned to."""
    n, kind = part[1], part.split("_")[1]
    base = "leaf" if kind.startswith("leaf") else "head"
    cap = cap or (_LEAF_BONES if base == "leaf" else _HEAD_BONES)
    return f"s{n}_{base}{kit.group(int(kind[len(base) :]), cap)}"


def rig(spec, mesh):
    def wf(co, p):
        n = int(p[1])
        kind = p.split("_", 1)[1]
        if kind.startswith(("leaf", "head")):
            return {_bone(p): 1.0}  # leaf, branch and its florets -> their shared bone
        return kit.chain_weights(co, _PATHS[f"s{n}_stem"], f"s{n}_stem", _STEM_K)

    return kit.rig(spec, mesh, _bones(spec), wf)


def animate(spec, arm):
    return kit.animate(spec, arm)
