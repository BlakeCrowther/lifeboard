"""Archetype: rosette: a ring (or rings) of leaves spreading from one point at the soil, and at bud/bloom either a
flowering stalk from the centre, a tight cluster of florets sitting in the centre, or nothing. Examples: lettuce,
plantain, dandelion, a succulent (echeveria), sea lavender's basal rosette with its flower stalk, a strawberry crown.
Built on models/plant/plant_kit.py (stages, rig, sway and tend by bone role).

Spec fields (all optional except size/palette/motion):
  size.height_m                       bloom height, soil to the top (flower head, or leaf tips with no stalk)
  shape.stage_heights [5 floats]      stage height / bloom height (default .07 .3 .6 .85 1); with no centre stalk they
                                      scale the leaf arch
  shape.rosette {leaves 9 (3-16), rings 2 (1-3), length_ratio .5, width_ratio .35, pitch_deg 28, droop_deg 30,
                 fleshy 0, round 0}
        length = outer leaf length / height; width = leaf width / leaf length; pitch = rise at the base (outer ring;
        inner rings stand taller); droop = bend by the tip; fleshy 0 = thin leaf .. 1 = thick succulent leaf;
        round 0 = lance tip .. 1 = spoon/paddle tip
  shape.center {kind "stalk" | "cluster" | "none", stalk_ratio .55, radius_ratio .02, petals 7 (0-16),
                head_ratio .07, florets 9 (0-24)}
        stalk: a flowering stalk from the centre (stalk_ratio = its length / height before the head), the head is a
        disc ringed by `petals` (0 = a round bud-like head); cluster: `florets` beads sitting in the centre
  shape.seed_ratio .035
  palette.main [stalk, leaf], palette.accent (flower / florets), palette.disc (flower centre), palette.seed
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
_LEAF_BONES = 5  # per stage; leaves share them round-robin to stay under kit.MAX_BONES


def _center(spec):
    v = spec.get("shape", {}).get("center", {}).get("kind", "stalk")
    return v if v in ("stalk", "cluster", "none") else "stalk"


def _leaf_scale(spec, n):
    """Leaf length factor per stage: rosettes grow outward, so leaves set the early stages' size."""
    return [0, 0.35, 0.65, 0.9, 1.0][n]


def _leaves(spec, n):
    """(name, yaw, ring, length factor) for stage n's leaves; inner rings are shorter and stand taller."""
    if n == 1:
        return [(f"s1_leaf{i}", math.pi / 2 + math.pi * i, 0, 1.0) for i in range(2)]
    cnt = kit.gi(spec, "rosette", "leaves", 9, 3, 16)
    rings = kit.gi(spec, "rosette", "rings", 2, 1, 3)
    if n == 2:
        cnt, rings = max(3, math.ceil(cnt * 0.6)), max(1, rings - 1)
    out = []
    for i in range(cnt):
        ring = i % rings
        out.append((f"s{n}_leaf{i}", kit.GOLDEN * i + 0.3, ring, 1 - 0.22 * ring))
    return out


def _leaf_path(spec, n, yaw, ring, lf):
    H = kit.height(spec)
    ln = kit.g(spec, "rosette", "length_ratio", 0.5) * H * _leaf_scale(spec, n) * lf
    pitch = kit.g(spec, "rosette", "pitch_deg", 28) + 18 * ring
    droop = kit.g(spec, "rosette", "droop_deg", 30) * (1 - 0.3 * ring)
    return kit.arc((0, 0, ln * 0.02), yaw, ln, pitch, droop, n=7), ln


def _stalk(spec, n):
    H = kit.height(spec)
    hr = kit.g(spec, "center", "head_ratio", 0.07) * H
    top = kit.heights(spec)[n] - hr * (1.2 if n == 4 else 1.6)
    return [Vector((0.02 * top * (k / 6) ** 2, 0, top * k / 6)) for k in range(7)], hr


def model(spec):
    H = kit.height(spec)
    parts = {}
    _PATHS.clear()
    kit.seed(spec, parts)
    th = kit.thickness(spec) * (1 + 5 * kit.g(spec, "rosette", "fleshy", 0.0))
    wr = kit.g(spec, "rosette", "width_ratio", 0.35)
    rnd = kit.g(spec, "rosette", "round", 0.0)
    ck = _center(spec)
    for n in range(1, kit.STAGES):
        for name, yaw, ring, lf in _leaves(spec, n):
            pts, ln = _leaf_path(spec, n, yaw, ring, lf)
            w = ln * wr * (1.4 if n == 1 else 1.0)
            prof = [
                w * (0.25 + 0.75 * math.sin(math.pi * min(0.12 + 0.88 * k / 6, 0.97) ** (1 - 0.5 * rnd)))
                for k in range(7)
            ]
            prof[-1] *= 0.35 + 0.5 * rnd
            parts[name] = kit.ribbon(name, pts, prof, th)
            _PATHS[name] = pts
        if n >= 3 and ck == "stalk":
            path, hr = _stalk(spec, n)
            sr = kit.g(spec, "center", "radius_ratio", 0.02) * H
            parts[f"s{n}_stem"] = lib.tube(f"s{n}_stem", path, [sr * (1 - 0.3 * k / 6) for k in range(7)], segs=6)
            _PATHS[f"s{n}_stem"] = path
            top = path[-1]
            hn = f"s{n}_head0"
            if n == 3:  # closed bud
                bp = [top + Vector((0, 0, hr * 1.6 * k / 5)) for k in range(6)]
                parts[hn] = lib.tube(hn, bp, [hr * f for f in (0.4, 0.7, 0.85, 0.8, 0.55, 0.2)], segs=10)
                _PATHS[hn] = bp
            else:
                d = lib.sphere(f"{hn}_disc", hr * 0.5, tuple(top + Vector((0, 0, hr * 0.25))), 10)
                d.scale = (1, 1, 0.6)
                parts[f"{hn}_disc"] = d
                pc = kit.gi(spec, "center", "petals", 7, 0, 16)
                for i in range(pc):
                    yaw = 2 * math.pi * i / pc
                    pn = f"{hn}_petal{i}"
                    outline = [(0, 0)] + [(hr * u, hr * 0.32 * math.sin(math.pi * u)) for u in (0.2, 0.4, 0.6, 0.8)]
                    outline += [(hr, 0)] + [(hr * u, -hr * 0.32 * math.sin(math.pi * u)) for u in (0.8, 0.6, 0.4, 0.2)]
                    parts[pn] = lib.flat_part(
                        pn, outline, kit.thickness(spec), at=tuple(top), rot=(math.pi / 2, -0.4, yaw)
                    )
                _PATHS[hn] = [top, top + Vector((0, 0, hr))]
        elif n >= 3 and ck == "cluster":
            fc = kit.gi(spec, "center", "florets", 9, 0, 24)
            hr = kit.g(spec, "center", "head_ratio", 0.07) * H
            c0 = Vector((0, 0, hr * 0.4))
            for i in range(fc):
                a = kit.GOLDEN * i
                rr = hr * 0.9 * math.sqrt((i + 0.5) / fc)
                fn = f"s{n}_head0_fl{i}"
                parts[fn] = lib.sphere(
                    fn,
                    hr * (0.28 if n == 4 else 0.2),
                    tuple(c0 + Vector((math.cos(a) * rr, math.sin(a) * rr, hr * 0.3 * (1 - rr / hr)))),
                    6,
                )
            _PATHS[f"s{n}_head0"] = [c0, c0 + Vector((0, 0, hr))]
    return parts


def material(spec, parts):
    def role(n):
        if "_disc" in n:
            return "disc"
        if "_head" in n:
            return "head"
        return "leaf" if "_leaf" in n else "stem"

    kit.materials(spec, parts, role)


def _bones(spec):
    bones = [kit.seed_bone(spec)]
    for n in range(1, kit.STAGES):
        for i, (name, *_) in enumerate(_leaves(spec, n)[:_LEAF_BONES]):
            p = _PATHS[name]
            bones.append((f"s{n}_leaf{i}", tuple(p[0]), tuple(p[-1]), None))
        if f"s{n}_stem" in _PATHS:
            bones += kit.chain_bones(f"s{n}_stem", _PATHS[f"s{n}_stem"], _STEM_K)
        if f"s{n}_head0" in _PATHS:
            p = _PATHS[f"s{n}_head0"]
            parent = f"s{n}_stem{_STEM_K - 1}" if f"s{n}_stem" in _PATHS else None
            bones.append((f"s{n}_head0", tuple(p[0]), tuple(p[-1]), parent))
    return bones


def rig(spec, mesh):
    def wf(co, p):
        n = int(p[1])
        kind = p.split("_", 1)[1]
        if kind.startswith("leaf"):
            return {f"s{n}_leaf{kit.group(int(kind[4:]), _LEAF_BONES)}": 1.0}
        if kind.startswith("head"):
            return {f"s{n}_head0": 1.0}
        return kit.chain_weights(co, _PATHS[f"s{n}_stem"], f"s{n}_stem", _STEM_K)

    return kit.rig(spec, mesh, _bones(spec), wf)


def animate(spec, arm):
    return kit.animate(spec, arm)
