"""Archetype: stem_bloom: one upright stem with alternate leaves and a single terminal head (petal whorl, ray cap,
parasol). Examples: tulip, daisy, poppy, cosmos, mermaid's cup alga (Acetabularia), a polyp tuft on a stalk.
Everything is parametric from the spec and every parameter is blendable (numbers; counts are floats rounded here).

Stages (models/plant/CONTRACT.md): parts are prefixed s<n>_ and rig() splits the baked mesh into one mesh per stage,
named stage_0 (seed) .. stage_4 (bloom). One armature; each stage has its own bones (s<n>_*), so a stage's sway moves
only that stage, and every action's frame 0 is the rest pose (tend crossfades with any sway_<n>).

Spec fields (all optional except size/palette/motion):
  size.height_m                       bloom height, soil to top of the head
  shape.stage_heights [5 floats]      stage height / bloom height (default .07 .3 .6 .85 1)
  shape.stem {radius_ratio .022, lean .06}            radius / height; lean = tip offset toward +X / stem height
  shape.leaf {count 4 (1-5), whorl 1 (1-8), length_ratio .22, width_ratio .3, pitch_deg 40, low .12, high .55}
        count = leaf nodes; whorl = leaves per node (>1: a ring of blades/hairs around the stem, one bone per node);
        width_ratio = leaf width / leaf length; low/high = attach span along the stem (0 soil .. 1 top)
  shape.head {petals 8 (3-24), radius_ratio .16, petal_width_ratio .45, cup_deg 30, disc_ratio .22, bud_ratio .5, bud_stretch 1.5}
        radius = petal tip distance / height; cup_deg = petal rise above horizontal; disc = centre / radius;
        petal_width_ratio ~0.9+ overlaps the petals into one fused, ribbed cap (parasol); bud = bud radius / head
        radius, bud_stretch = bud height / width (2+ = club)
  shape.seed_ratio .035               seed radius / height
  palette.main [stem, leaf], palette.accent (head; the biome accent), palette.disc (default main[0]), palette.seed
  motion.sway {frames, cycles, amp_deg, lag_frames}, motion.tend {frames, lift_deg 8, stretch 0.12, open 0.15}
  motion.medium  air|water (default: the biome's medium in models/biomes.json)
Contract: origin at the soil point, +Z up, +X is the best side, meters."""
import math, sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import lib, bpy, bmesh
from mathutils import Vector

STAGES = 5
GOLDEN = math.radians(137.5)
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

def _g(spec, sect, key, default):
    v = spec.get("shape", {}).get(sect, {})
    return float(v.get(key, default)) if isinstance(v, dict) else default

def _H(spec): return spec["size"]["height_m"]

def _heights(spec):
    return [f * _H(spec) for f in spec.get("shape", {}).get("stage_heights", [0.07, 0.3, 0.6, 0.85, 1.0])]

def _head_r(spec): return _g(spec, "head", "radius_ratio", 0.16) * _H(spec)

def _stem_top(spec, n):
    """Stem height for stage n: bud/bloom heads sit on top, so the stem stops below the stage height."""
    h = _heights(spec)[n]; R = _head_r(spec); rise = math.sin(math.radians(_g(spec, "head", "cup_deg", 30)))
    if n == 4: return h - R * rise - 0.1 * R
    if n == 3: return h - 2 * _g(spec, "head", "bud_ratio", 0.5) * R * _g(spec, "head", "bud_stretch", 1.5)
    return h

def _stem_pt(spec, n, t):
    """Point on stage n's stem at t (0 soil .. 1 top): a gentle lean toward +X, growing with t^2."""
    top = _stem_top(spec, n); lean = _g(spec, "stem", "lean", 0.06) * top
    return Vector((lean * t * t, 0, top * t))

def _whorl(spec): return int(round(min(max(_g(spec, "leaf", "whorl", 1), 1), 8)))

def _nodes(spec, n):
    """(bone name, attach t, yaw, length) per leaf node of stage n (no nodes in seed/sprout)."""
    if n < 2: return []
    H = _H(spec); cnt = int(round(min(max(_g(spec, "leaf", "count", 4), 1), 5)))
    ln = _g(spec, "leaf", "length_ratio", 0.22) * H
    k = cnt if n >= 3 else max(1, math.ceil(cnt * 0.6))
    lo, hi = _g(spec, "leaf", "low", 0.12), _g(spec, "leaf", "high", 0.55)
    grow = 0.75 if n == 2 else 1.0
    return [(f"s{n}_leaf{i}", lo + (hi - lo) * i / max(k - 1, 1), math.pi / 2 + GOLDEN * i, ln * grow * (1 - 0.25 * i / max(k - 1, 1))) for i in range(k)]

def _leaves(spec, n):
    """(part name, attach t, yaw, length) for stage n's blades. Sprout = two small round cotyledons; whorl > 1 = a ring
    of blades per node (part s<n>_leaf<i>_<j>, skinned to node bone s<n>_leaf<i>)."""
    if n == 1:
        ln = _g(spec, "leaf", "length_ratio", 0.22) * _H(spec)
        return [(f"s1_cot{i}", 0.95, math.pi / 2 + math.pi * i, ln * 0.4) for i in range(2)]
    w = _whorl(spec)
    if w == 1: return _nodes(spec, n)
    return [(f"{nm}_{j}", t, yaw + 2 * math.pi * j / w, ln) for nm, t, yaw, ln in _nodes(spec, n) for j in range(w)]

def _leaf_outline(ln, w, round_=False):
    """Lanceolate (or round, for cotyledons/petals) outline in XZ, base at x=0, tip at +X."""
    top, bot = [], []
    for i in range(1, 10):
        u = i / 10; hw = w / 2 * (math.sin(math.pi * u) ** (0.6 if round_ else 0.9)) * (1.0 if round_ else (1.2 - 0.4 * u))
        top.append((u * ln, hw)); bot.append((u * ln, -hw))
    return [(0, 0)] + top + [(ln, 0)] + bot[::-1]

def _leaf_dir(yaw, pitch):
    return Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))

def model(spec):
    H = _H(spec); parts = {}
    sr = _g(spec, "stem", "radius_ratio", 0.022) * H; R = _head_r(spec)
    th = max(0.004 * H, 0.0006)                                          # leaf / petal plate thickness
    rs = spec.get("shape", {}).get("seed_ratio", 0.035) * H            # stage 0: seed resting on the soil
    seed = lib.sphere("s0_seed", rs, (0, 0, rs * 0.8), 12); seed.scale = (1.3, 1.0, 0.8); seed.rotation_euler = (0, math.radians(-20), 0)
    parts["s0_seed"] = seed
    for n in range(1, STAGES):
        path = [_stem_pt(spec, n, k / 6) for k in range(7)]
        r = sr * (0.55 + 0.45 * n / 4)
        parts[f"s{n}_stem"] = lib.tube(f"s{n}_stem", path, [r * (1 - 0.35 * k / 6) for k in range(7)], segs=8)
        for name, t, yaw, ln in _leaves(spec, n):
            cot = name.startswith("s1_cot"); w = ln * (0.7 if cot else _g(spec, "leaf", "width_ratio", 0.3))
            pitch = math.radians(20 if cot else _g(spec, "leaf", "pitch_deg", 40))
            parts[name] = lib.flat_part(name, _leaf_outline(ln, w, cot), th, at=tuple(_stem_pt(spec, n, t)), rot=(math.pi / 2, -pitch, yaw))
        top = _stem_pt(spec, n, 1.0)
        if n == 3:                                                       # closed bud: tall ovoid in the head colour
            br = _g(spec, "head", "bud_ratio", 0.5) * R
            st = _g(spec, "head", "bud_stretch", 1.5)                    # club: tapered tube, widest near the tip
            prof = [0.45, 0.7, 0.9, 1.0, 0.9, 0.55]
            path = [top + Vector((0, 0, 2 * br * st * k / (len(prof) - 1))) for k in range(len(prof))]
            parts["s3_bud"] = lib.tube("s3_bud", path, [br * r for r in prof], segs=12)
        if n == 4:                                                       # open head: petal whorl around a centre disc
            cnt = int(round(min(max(_g(spec, "head", "petals", 8), 3), 24)))
            pw = _g(spec, "head", "petal_width_ratio", 0.45); cup = math.radians(_g(spec, "head", "cup_deg", 30))
            dr = _g(spec, "head", "disc_ratio", 0.22) * R; pl = R - dr * 0.6
            for i in range(cnt):
                yaw = 2 * math.pi * i / cnt; base = top + Vector((math.cos(yaw), math.sin(yaw), 0)) * dr * 0.6
                parts[f"s4_petal{i}"] = lib.flat_part(f"s4_petal{i}", _leaf_outline(pl, pl * pw, True), th, at=tuple(base), rot=(math.pi / 2, -cup, yaw))
            disc = lib.sphere("s4_disc", dr, tuple(top + Vector((0, 0, dr * 0.25))), 14); disc.scale = (1, 1, 0.55); parts["s4_disc"] = disc
    return parts

def material(spec, parts):
    pal = spec["palette"]; main = [lib.hex_rgba(c) for c in pal["main"]]
    stem, _, _ = lib.principled("stem", main[0], 0.45, 0.2)
    leaf, _, _ = lib.principled("leaf", main[1] if len(main) > 1 else main[0], 0.4, 0.25)
    head, _, _ = lib.principled("head", lib.hex_rgba(pal.get("accent", pal["main"][0])), 0.35, 0.3)
    disc, _, _ = lib.principled("disc", lib.hex_rgba(pal["disc"]) if pal.get("disc") else main[0], 0.4, 0.3)
    seed, _, _ = lib.principled("seed", lib.hex_rgba(pal.get("seed", "#b08a5a")), 0.45, 0.2)
    for n, o in parts.items():
        kind = n.split("_", 1)[1]
        o.data.materials.append(seed if kind == "seed" else stem if kind == "stem" else disc if kind == "disc"
                                else head if kind.startswith(("petal", "bud")) else leaf)

def _nstem(n): return 2 if n == 1 else 3

def _bones(spec):
    """(name, head, tail, parent). Per stage: stem chain (2 bones sprout, 3 later), one bone per true leaf, a head bone."""
    rs = spec.get("shape", {}).get("seed_ratio", 0.035) * _H(spec)
    bones = [("s0_seed", (0, 0, 0), (0, 0, 2 * rs), None)]
    for n in range(1, STAGES):
        k = _nstem(n); prev = None
        for i in range(k):
            nm = f"s{n}_stem{i}"; bones.append((nm, tuple(_stem_pt(spec, n, i / k)), tuple(_stem_pt(spec, n, (i + 1) / k)), prev)); prev = nm
        for name, t, yaw, ln in _nodes(spec, n):             # whorls: the node bone points up the stem, the ring bends with it
            pitch = math.radians(_g(spec, "leaf", "pitch_deg", 40) if _whorl(spec) == 1 else 90); b = _stem_pt(spec, n, t)
            bones.append((name, tuple(b), tuple(b + _leaf_dir(yaw, pitch) * ln), f"s{n}_stem{min(int(t * k), k - 1)}"))
        if n >= 3:
            top = _stem_pt(spec, n, 1.0); bones.append((f"s{n}_head", tuple(top), tuple(top + Vector((0, 0, _head_r(spec)))), f"s{n}_stem{k - 1}"))
    return bones

def _split_stages(mesh):
    """One mesh per stage, named stage_<n>, from the part:s<n>_* vertex groups finalize() left on the joined mesh."""
    out = []
    for n in range(STAGES):
        o = mesh.copy(); o.data = mesh.data.copy(); lib.link(o); o.name = o.data.name = f"stage_{n}"
        keep = {vg.index for vg in o.vertex_groups if vg.name.startswith(f"part:s{n}_")}
        bm = bmesh.new(); bm.from_mesh(o.data); dl = bm.verts.layers.deform.verify()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not any(g in keep for g in v[dl].keys())], context="VERTS")
        bm.to_mesh(o.data); bm.free(); out.append(o)
    bpy.data.objects.remove(mesh, do_unlink=True)
    return out

def rig(spec, mesh):
    bones = _bones(spec); names = {b[0] for b in bones}
    arm = lib.armature(spec["id"] + "_rig", bones)
    def wf(co, parts):
        p = next(iter(parts)); n = int(p[1]); kind = p.split("_", 1)[1]
        if p in names: return {p: 1.0}                                         # true leaves, seed
        if kind.startswith("leaf"): return {p.rsplit("_", 1)[0]: 1.0}         # whorl blade -> its node bone
        if kind.startswith(("petal", "bud", "disc")): return {f"s{n}_head": 1.0}
        k = _nstem(n); top = _stem_top(spec, n)
        if kind.startswith("cot"): return {f"s1_stem{k - 1}": 1.0}
        return lib.lerp_weights(co.z, [(top * (i + 0.5) / k, f"s{n}_stem{i}") for i in reversed(range(k))])
    for o in _split_stages(mesh): lib.skin(o, arm, wf)
    return arm, None

def _medium(spec):
    m = spec.get("motion", {}).get("medium")
    if m: return m
    p = os.path.join(os.path.dirname(__file__), "..", "..", "biomes.json")
    try: return next(b["medium"] for b in json.load(open(p))["biomes"] if b["id"] == spec["biome"])
    except Exception: return "air"

STAGE_AMP = [0.2, 0.55, 0.8, 0.92, 1.0]          # a seed barely rocks, a bloom nods

def _sway(spec, n, f, names):
    """Stage n's sway at frame f. Whole cycles (sin with integer k over N), each term offset so frame 0 == rest."""
    ms = spec["motion"]["sway"]; N, k = ms["frames"], int(ms["cycles"]); amp = math.radians(ms.get("amp_deg", 5)) * STAGE_AMP[n]
    water = _medium(spec) == "water"; lag = ms.get("lag_frames", 8 if water else 3)
    w = lambda kk, ff, ph=0: math.sin(2 * math.pi * kk * ff / N + ph) - math.sin(2 * math.pi * kk * (ff - f) / N + ph)
    if n == 0: return {"s0_seed": [(Y, amp * 0.6 * w(k, f)), (X, amp * 0.3 * w(k, f, 1.1))]}
    rots = {}; nb = _nstem(n)
    for i in range(nb):                                       # bend toward +-Y (main) and +-X (secondary), lagging up the chain
        ff = f - lag * i; g = 1.0 + 0.25 * i
        rots[f"s{n}_stem{i}"] = [(X, amp * g * w(k, ff)), (Y, amp * 0.45 * g * w(k, ff, 1.7))]
    for bn in names:
        if bn.startswith(f"s{n}_leaf"):
            i = int(bn[len(f"s{n}_leaf"):]); kk = k if water else 2 * k   # wind flutters faster than the stem, water drifts with it
            rots[bn] = [(Z, amp * 1.4 * w(kk, f - lag * (nb + 1), i * 1.3)), (X, amp * 0.8 * w(kk, f - lag * nb, i * 0.7))]
    if f"s{n}_head" in names: rots[f"s{n}_head"] = [(X, amp * 1.3 * w(k, f - lag * (nb + 1))), (Y, amp * 0.8 * w(k, f - lag * (nb + 1), 0.9))]
    return rots

def _key_scale(arm, bones, frame, s):
    for bn in bones:
        pb = arm.pose.bones[bn]; pb.scale = Vector((s, s, s)); pb.keyframe_insert("scale", frame=frame)
    for bn in bones: arm.pose.bones[bn].scale = Vector((1, 1, 1))

def animate(spec, arm):
    names = {b.name for b in arm.data.bones}; heads = sorted(b for b in names if b.endswith("_head")); acts = []
    N = spec["motion"]["sway"]["frames"]
    for n in range(STAGES):
        act = lib.new_action(arm, f"sway_{n}")
        for f in range(0, N + 1): lib.key_pose(arm, 1 + f, _sway(spec, n, f, names))
        sc = heads + sorted(b for b in names if "_stem" in b)        # scale channels exist in every clip (tend scales these)
        _key_scale(arm, sc, 1, 1.0); _key_scale(arm, sc, 1 + N, 1.0)
        lib.ease_all(act); acts.append(act)
    # tend: every stage perks up at once (only one is visible): a small dip, then the stem straightens back past rest,
    # leaves lift, the head opens a little; settles back to rest
    mt = spec["motion"]["tend"]; M = mt["frames"]; lift = math.radians(mt.get("lift_deg", 8)); op = mt.get("open", 0.15); sx = mt.get("stretch", 0.12)
    stems = sorted(b for b in names if "_stem" in b)
    act = lib.new_action(arm, "tend")
    #        t     stem (+ = lean back)  leaf lift  head open
    beats = [(0.0, 0.0, 0.0, 0.0), (0.2, -0.35, -0.3, 0.0), (0.5, 1.0, 1.0, 1.0), (0.72, 0.55, 0.7, 0.8), (1.0, 0.0, 0.0, 0.0)]
    for t, sp, ll, ho in beats:
        rots = {}
        for b in arm.data.bones:
            if "_stem" in b.name: rots[b.name] = [(Y, -lift * 0.4 * sp)]
            elif b.name == "s0_seed": rots[b.name] = [(Y, -lift * 0.6 * sp)]
            elif "_leaf" in b.name:                            # lift around the leaf's own hinge (perpendicular to blade and up)
                d = (b.tail_local - b.head_local).normalized(); hinge = d.cross(Vector(Z)).normalized()
                rots[b.name] = [(tuple(hinge), -lift * 1.5 * ll)]
            elif "_leaf" in b.name and _whorl(spec) > 1: rots[b.name] = []      # node bone points up the stem: the stretch lifts it
        lib.key_pose(arm, 1 + round(t * M), rots)
        _key_scale(arm, heads, 1 + round(t * M), 1 + op * ho)
        for bn in stems:                                     # stretch along the bone (local Y): the plant rises, then settles
            pb = arm.pose.bones[bn]; e = 1 + sx * max(sp, -0.5) / len(stems) * 3
            pb.scale = Vector((1 / math.sqrt(e), e, 1 / math.sqrt(e))); pb.keyframe_insert("scale", frame=1 + round(t * M)); pb.scale = Vector((1, 1, 1))
    lib.ease_all(act); acts.append(act)
    return acts
