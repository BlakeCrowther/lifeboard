"""Shared machinery for plant growth forms (models/plant/archetypes/*.py other than stem_bloom, which predates it).
A growth form only describes shape: model() parts prefixed s<n>_, bones(spec) and a weight function. This kit does the
rest the plant contract asks for (models/plant/CONTRACT.md): one mesh per stage (stage_0..4), one armature, a seamless
sway_<n> per stage and a tend reaction, every action starting and ending on the rest pose.

Bone roles come from bone names, so sway and tend work for any form:
  s0_seed               the seed (rocks a little)
  s<n>_stem<j>          a stalk chain, j = 0 at the soil (bends, lagging up the chain; tend straightens and stretches it)
  s<n>_blade<i>_<j>     blade i of a clump, segment j (bends like a stalk, each blade on its own phase; tend lifts it)
  s<n>_leaf<i>          a leaf or branch on a stalk (flutters; tend lifts it about its own hinge)
  s<n>_head<i>          a head, fan, plume, floret cluster or brush (nods; tend opens it a little), i optional
Contract: origin at the soil point, +Z up, +X is the best side, meters."""

import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared", "blender"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared", "tools"))
import bmesh
import bpy
import lib
import model_files
from mathutils import Vector

STAGES = 5
GOLDEN = math.radians(137.5)
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
STAGE_AMP = [0.2, 0.55, 0.8, 0.92, 1.0]  # a seed barely rocks, a bloom nods
MAX_BONES = 32  # shape-check: bones <= 32 for the whole file (all five stages share one armature)


def group(i, cap):
    """Bone group of part i when a stage has more parts than bones to spare: round-robin, so neighbours differ."""
    return i % cap


def g(spec, sect, key, default):
    v = spec.get("shape", {}).get(sect, {})
    return float(v.get(key, default)) if isinstance(v, dict) else default


def gi(spec, sect, key, default, lo, hi):
    return int(round(min(max(g(spec, sect, key, default), lo), hi)))


def height(spec):
    return spec["size"]["height_m"]


def heights(spec):
    return [f * height(spec) for f in spec.get("shape", {}).get("stage_heights", [0.07, 0.3, 0.6, 0.85, 1.0])]


def thickness(spec):
    return max(0.004 * height(spec), 0.0006)


def seed(spec, parts):
    """Stage 0: a seed resting on the soil (bone s0_seed)."""
    rs = spec.get("shape", {}).get("seed_ratio", 0.035) * height(spec)
    o = lib.sphere("s0_seed", rs, (0, 0, rs * 0.8), 12)
    o.scale = (1.3, 1.0, 0.8)
    o.rotation_euler = (0, math.radians(-20), 0)
    parts["s0_seed"] = o


def seed_bone(spec):
    rs = spec.get("shape", {}).get("seed_ratio", 0.035) * height(spec)
    return ("s0_seed", (0, 0, 0), (0, 0, 2 * rs), None)


def arc(base, yaw, length, pitch0, droop, n=7):
    """Points of an arching blade/branch: leaves `base` at pitch0 (degrees above horizontal) toward `yaw`, and bends
    down by `droop` degrees in total by the tip, staying in its own vertical plane."""
    pts, p = [Vector(base)], Vector(base)
    d = Vector((math.cos(yaw), math.sin(yaw), 0))
    for k in range(n - 1):
        pitch = math.radians(pitch0 - droop * (k + 0.5) / (n - 1))
        p = p + (d * math.cos(pitch) + Vector(Z) * math.sin(pitch)) * (length / (n - 1))
        pts.append(p.copy())
    return pts


def ribbon(name, path, widths, thick, side=None, segs=8):
    """Flat strap along a polyline (grass blades, straps, fronds): an ellipse `widths[i]` wide and `thick` deep at
    each point, width along `side` (default: horizontal, across the path). Capped, watertight."""
    path = [Vector(p) for p in path]
    rings = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        w = Vector(side) if side is not None else t.cross(Vector(Z))
        if w.length < 1e-6:
            w = Vector(X)
        w = (w - t * w.dot(t)).normalized()
        nrm = t.cross(w).normalized()
        rings.append(
            [
                tuple(
                    p
                    + w * math.cos(2 * math.pi * k / segs) * widths[i] / 2
                    + nrm * math.sin(2 * math.pi * k / segs) * thick / 2
                )
                for k in range(segs)
            ]
        )
    t0 = (path[1] - path[0]).normalized()
    t1 = (path[-1] - path[-2]).normalized()
    return lib.loft(name, rings, cap_front=tuple(path[0] - t0 * thick * 0.3), cap_back=tuple(path[-1] + t1 * thick))


def chain_bones(prefix, pts, k, parent=None):
    """k bones along polyline pts (named <prefix>0..k-1), each child of the previous."""
    out = []
    prev = parent
    for j in range(k):
        a = pts[round(j * (len(pts) - 1) / k)]
        b = pts[round((j + 1) * (len(pts) - 1) / k)]
        out.append((f"{prefix}{j}", tuple(a), tuple(b), prev))
        prev = f"{prefix}{j}"
    return out


def chain_weights(co, pts, prefix, k):
    """Weights for a vertex near polyline pts skinned to chain <prefix>0..k-1: nearest point index -> blended bones."""
    best = min(range(len(pts)), key=lambda i: (Vector(co) - pts[i]).length_squared)
    x = best / (len(pts) - 1) * k
    return lib.lerp_weights(x, [(j + 0.5, f"{prefix}{j}") for j in reversed(range(k))])


def materials(spec, parts, role):
    """role(part_name) -> 'stem' | 'leaf' | 'head' | 'disc' | 'seed'. Colours: palette.main [stem, leaf], accent
    (head), disc, seed."""
    pal = spec["palette"]
    main = [lib.hex_rgba(c) for c in pal["main"]]
    mats = {
        "stem": lib.principled("stem", main[0], 0.45, 0.2)[0],
        "leaf": lib.principled("leaf", main[1] if len(main) > 1 else main[0], 0.4, 0.25)[0],
        "head": lib.principled("head", lib.hex_rgba(pal.get("accent", pal["main"][0])), 0.35, 0.3)[0],
        "disc": lib.principled("disc", lib.hex_rgba(pal["disc"]) if pal.get("disc") else main[0], 0.4, 0.3)[0],
        "seed": lib.principled("seed", lib.hex_rgba(pal.get("seed", "#b08a5a")), 0.45, 0.2)[0],
    }
    for n, o in parts.items():
        o.data.materials.append(mats["seed"] if n == "s0_seed" else mats[role(n)])


def split_stages(mesh):
    """One mesh per stage, named stage_<n>, from the part:s<n>_* vertex groups finalize() left on the joined mesh."""
    out = []
    for n in range(STAGES):
        o = mesh.copy()
        o.data = mesh.data.copy()
        lib.link(o)
        o.name = o.data.name = f"stage_{n}"
        keep = {vg.index for vg in o.vertex_groups if vg.name.startswith(f"part:s{n}_")}
        bm = bmesh.new()
        bm.from_mesh(o.data)
        dl = bm.verts.layers.deform.verify()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not any(gr in keep for gr in v[dl].keys())], context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        out.append(o)
    bpy.data.objects.remove(mesh, do_unlink=True)
    return out


def rig(spec, mesh, bones, weight_fn):
    """bones: lib.armature entries; weight_fn(co, part_name) -> {bone: w}. The seed part goes to s0_seed."""
    if len(bones) > MAX_BONES:  # shape-check's cap; every bone also costs animation keys in the file
        raise SystemExit(f"BUILD FAIL rig: {len(bones)} bones > {MAX_BONES}: group parts onto shared bones (kit.group)")
    arm = lib.armature(spec["id"] + "_rig", bones)

    def wf(co, part_names):
        p = next(iter(part_names))
        return {"s0_seed": 1.0} if p == "s0_seed" else weight_fn(co, p)

    for o in split_stages(mesh):
        lib.skin(o, arm, wf)
    return arm, None


def medium(spec):
    m = spec.get("motion", {}).get("medium")
    if m:
        return m
    try:
        return next(
            b["medium"]
            for b in json.load(open(model_files.resolve("biomes.json")))["biomes"]
            if b["id"] == spec["biome"]
        )
    except Exception:
        return "air"


def role(bone):
    kind = bone.split("_", 1)[1] if "_" in bone else bone
    for r in ("seed", "stem", "blade", "leaf", "head"):
        if kind.startswith(r):
            return r
    return "leaf"


def _depth(b):
    d = 0
    while b.parent:
        d += 1
        b = b.parent
    return d


def _index(bone):
    nums = re.findall(r"\d+", bone.split("_", 1)[1] if "_" in bone else bone)
    return int(nums[0]) if nums else 0


def _chain(bone):
    """Chain a stalk/blade bone belongs to: s2_stem3 -> s2_stem, s4_blade2_1 -> s4_blade2."""
    return re.sub(r"_?\d+$", "", bone) if role(bone) == "blade" else re.sub(r"\d+$", "", bone)


def _sway(spec, n, f, arm):
    """Stage n's sway at frame f: whole cycles (sin with integer k over N), each term offset so frame 0 == rest."""
    ms = spec["motion"]["sway"]
    N, k = ms["frames"], int(ms["cycles"])
    amp = math.radians(ms.get("amp_deg", 5)) * STAGE_AMP[n]
    water = medium(spec) == "water"
    lag = ms.get("lag_frames", 8 if water else 3)

    def w(kk, ff, ph=0.0):
        return math.sin(2 * math.pi * kk * ff / N + ph) - math.sin(2 * math.pi * kk * (ff - f) / N + ph)

    rots = {}
    for b in arm.data.bones:
        if not b.name.startswith(f"s{n}_"):
            continue
        r, d, i = role(b.name), _depth(b), _index(b.name)
        ff = f - lag * d
        if r == "seed":
            rots[b.name] = [(Y, amp * 0.6 * w(k, f)), (X, amp * 0.3 * w(k, f, 1.1))]
        elif r == "stem":
            gg = 1.0 + 0.25 * d
            rots[b.name] = [(X, amp * gg * w(k, ff)), (Y, amp * 0.45 * gg * w(k, ff, 1.7))]
        elif r == "blade":  # each blade of a clump on its own phase, so the tuft ripples instead of tilting as one
            gg = 1.1 + 0.35 * d
            ph = i * 1.9
            rots[b.name] = [(X, amp * gg * w(k, ff, ph)), (Y, amp * 0.6 * gg * w(k, ff, ph + 1.3))]
        elif r == "head":
            rots[b.name] = [(X, amp * 1.3 * w(k, ff, i * 0.8)), (Y, amp * 0.8 * w(k, ff, 0.9 + i * 0.8))]
        else:
            kk = k if water else 2 * k  # wind flutters faster than the stem, water drifts with it
            rots[b.name] = [(Z, amp * 1.4 * w(kk, ff, i * 1.3)), (X, amp * 0.8 * w(kk, ff, i * 0.7))]
    return rots


def _key_scale(arm, bones, frame, s):
    for bn in bones:
        pb = arm.pose.bones[bn]
        pb.scale = Vector(s) if isinstance(s, tuple) else Vector((s, s, s))
        pb.keyframe_insert("scale", frame=frame)
        pb.scale = Vector((1, 1, 1))


def animate(spec, arm):
    names = sorted(b.name for b in arm.data.bones)
    scaled = [b for b in names if role(b) in ("stem", "blade", "head")]
    acts = []
    N = spec["motion"]["sway"]["frames"]
    for n in range(STAGES):
        act = lib.new_action(arm, f"sway_{n}")
        for f in range(0, N + 1):
            lib.key_pose(arm, 1 + f, _sway(spec, n, f, arm))
        _key_scale(arm, scaled, 1, 1.0)  # scale channels exist in every clip (tend scales these)
        _key_scale(arm, scaled, 1 + N, 1.0)
        lib.ease_all(act)
        acts.append(act)
    # tend: every stage perks up at once (only one is visible): a small dip, then stalks and blades straighten and
    # stretch, leaves and blades lift toward the light, heads open a little; settles back to rest
    mt = spec["motion"]["tend"]
    M = mt["frames"]
    lift = math.radians(mt.get("lift_deg", 8))
    op = mt.get("open", 0.15)
    sx = mt.get("stretch", 0.12)
    chains = [b for b in names if role(b) in ("stem", "blade")]
    chain_len = {}
    for bn in chains:
        chain_len[_chain(bn)] = chain_len.get(_chain(bn), 0) + 1
    act = lib.new_action(arm, "tend")
    beats = [
        (0.0, 0.0, 0.0, 0.0),
        (0.2, -0.35, -0.3, 0.0),
        (0.5, 1.0, 1.0, 1.0),
        (0.72, 0.55, 0.7, 0.8),
        (1.0, 0, 0, 0),
    ]
    for t, sp, ll, ho in beats:
        frame = 1 + round(t * M)
        rots = {}
        for b in arm.data.bones:
            r = role(b.name)
            d = (b.tail_local - b.head_local).normalized()
            hinge = d.cross(Vector(Z))
            if r == "seed":
                rots[b.name] = [(Y, -lift * 0.6 * sp)]
            elif r == "stem":
                rots[b.name] = [(Y, -lift * 0.4 * sp)]
            elif r in ("blade", "leaf") and hinge.length > 1e-3:  # lift about its own hinge (across the blade, level)
                rots[b.name] = [(tuple(hinge.normalized()), -lift * (1.0 if r == "blade" else 1.5) * ll)]
        lib.key_pose(arm, frame, rots)
        _key_scale(arm, [b for b in names if role(b) == "head"], frame, 1 + op * ho)
        for bn in chains:  # stretch along the bone (local Y), shared along its chain: the plant rises, then settles
            e = 1 + sx * max(sp, -0.5) / chain_len[_chain(bn)]
            _key_scale(arm, [bn], frame, (1 / math.sqrt(e), e, 1 / math.sqrt(e)))
    lib.ease_all(act)
    acts.append(act)
    return acts
