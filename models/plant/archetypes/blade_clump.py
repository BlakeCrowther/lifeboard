"""Archetype: blade_clump: a tuft of long strap or ribbon blades rising from one base, arching out, with an optional
seed spike (or spikes) on a stalk as the bud and bloom. Examples: cordgrass, eelgrass and turtle grass shoots,
lemongrass, an iris or daylily clump, a grass with a flowering spike.
Built on models/plant/plant_kit.py (stages, rig, sway and tend by bone role).

Spec fields (all optional except size/palette/motion):
  size.height_m                       bloom height, soil to the highest point (spike tip, or blade arch if no spike)
  shape.stage_heights [5 floats]      stage height / bloom height (default .07 .3 .6 .85 1)
  shape.blades {count 7 (3-14), width_ratio .05, thick_ratio .008, pitch_deg 78, droop_deg 55, spread .035,
                vary .3, tip_taper .85, reach .85}
        width/thick = blade width/thickness at the base / height; pitch = rise angle at the base (90 = straight up);
        droop = how far the blade bends over by its tip (degrees); spread = base ring radius / height;
        vary = random-ish spread in blade length and lean (0 = all equal); tip_taper = 1 pointed .. 0 square tip;
        reach = blade top / stage height when there is a spike (1.0 without one)
  shape.spike {count 1 (0-3), length_ratio .28, radius_ratio .028, spikelets 10 (0-24), lean .06}
        spike = a stalk rising from the clump's centre ending in a seed head; length = head length / height;
        spikelets = small grains pressed along the head (0 = a smooth club)
  shape.seed_ratio .035
  palette.main [stalk, blade], palette.accent (seed head), palette.disc (spikelets; default accent), palette.seed
  motion.sway {frames, cycles, amp_deg, lag_frames}, motion.tend {frames, lift_deg, stretch, open}
Contract: origin at the soil point, +Z up, +X is the best side, meters."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib
import plant_kit as kit
from mathutils import Vector

_PATHS = {}  # part name -> polyline, filled by model() for rig()
_SPIKE_K = 1
_BUNDLES = 4  # blade bone chains per stage (blades share them round-robin): keeps the rig under kit.MAX_BONES
_BLADE_K = 2


def _blades(spec, n):
    """(name, yaw, pitch, droop, length scale) per blade of stage n."""
    cnt = kit.gi(spec, "blades", "count", 7, 3, 14)
    k = 2 if n == 1 else max(3, math.ceil(cnt * 0.6)) if n == 2 else cnt
    vary = kit.g(spec, "blades", "vary", 0.3)
    pitch = kit.g(spec, "blades", "pitch_deg", 78)
    droop = kit.g(spec, "blades", "droop_deg", 55) * (0.5 if n == 1 else 0.8 if n == 2 else 1.0)
    out = []
    for i in range(k):
        yaw = (math.pi / 2 + kit.GOLDEN * i) if n > 1 else (math.pi / 2 + math.pi * i)
        wob = math.sin(i * 2.3 + 0.7)  # deterministic per-blade variation
        out.append(
            (
                f"s{n}_blade{i}",
                yaw,
                pitch - 10 * vary * (1 + wob),
                droop * (1 + 0.4 * vary * wob),
                1 - 0.3 * vary * abs(wob),
            )
        )
    return out


def _spikes(spec):
    return kit.gi(spec, "spike", "count", 1, 0, 3)


def _spike_stalk(spec, n, j):
    """Stalk polyline of spike j for stage n (bud n=3, bloom n=4); its top sits under the head."""
    H = kit.height(spec)
    h = kit.heights(spec)[n]
    hl = kit.g(spec, "spike", "length_ratio", 0.28) * H * (0.75 if n == 3 else 1.0)
    top = h - hl
    lean = kit.g(spec, "spike", "lean", 0.06) * top
    yaw = 2 * math.pi * j / max(_spikes(spec), 1) + 0.4
    off = Vector((math.cos(yaw), math.sin(yaw), 0)) * (0.25 * kit.g(spec, "blades", "spread", 0.035) * H * (j > 0))
    return [off + Vector((lean * (t / 6) ** 2, 0, top * t / 6)) for t in range(7)], hl


def model(spec):
    H = kit.height(spec)
    parts = {}
    _PATHS.clear()
    kit.seed(spec, parts)
    spread = kit.g(spec, "blades", "spread", 0.035) * H
    bw = kit.g(spec, "blades", "width_ratio", 0.05) * H
    bt = max(kit.g(spec, "blades", "thick_ratio", 0.008) * H, 0.0005)
    taper = kit.g(spec, "blades", "tip_taper", 0.85)
    has_spike = _spikes(spec) > 0
    for n in range(1, kit.STAGES):
        reach = kit.g(spec, "blades", "reach", 0.85) if has_spike and n >= 3 else 1.0
        target = kit.heights(spec)[n] * reach
        for name, yaw, pitch, droop, ls in _blades(spec, n):
            base = Vector((math.cos(yaw), math.sin(yaw), 0)) * spread * (0.5 if n == 1 else 1.0)
            unit = kit.arc((0, 0, 0), yaw, 1.0, pitch, droop)
            top = max(p.z for p in unit)
            pts = [base + p * (target * ls / top) for p in unit]
            widths = [
                bw * (0.6 if n == 1 else 1.0) * (1 - taper * (k / (len(pts) - 1)) ** 2.2) for k in range(len(pts))
            ]
            parts[name] = kit.ribbon(name, pts, widths, bt)
            _PATHS[name] = pts
        if n >= 3 and has_spike:
            sr = kit.g(spec, "spike", "radius_ratio", 0.028) * H
            for j in range(_spikes(spec)):
                stalk, hl = _spike_stalk(spec, n, j)
                nm = f"s{n}_stem_{j}"
                parts[nm] = lib.tube(nm, stalk, [sr * 0.35 * (1 - 0.3 * k / 6) for k in range(7)], segs=6)
                _PATHS[nm] = stalk
                top = stalk[-1]
                prof = [0.55, 0.85, 1.0, 1.0, 0.9, 0.6, 0.25] if n == 4 else [0.5, 0.75, 0.85, 0.8, 0.6, 0.3, 0.1]
                r = sr * (1.0 if n == 4 else 0.7)
                hp = [top + Vector((0, 0, hl * k / (len(prof) - 1))) for k in range(len(prof))]
                hn = f"s{n}_head0_{j}"
                parts[hn] = lib.tube(hn, hp, [r * p for p in prof], segs=8)
                _PATHS[hn] = hp
                cnt = kit.gi(spec, "spike", "spikelets", 10, 0, 24) if n == 4 else 0
                for s in range(cnt):  # grains pressed along the head, in a loose spiral
                    u = 0.1 + 0.8 * s / max(cnt - 1, 1)
                    a = kit.GOLDEN * s
                    rr = r * prof[min(int(u * (len(prof) - 1)), len(prof) - 1)]
                    c = top + Vector((math.cos(a) * rr * 0.9, math.sin(a) * rr * 0.9, hl * u))
                    gn = f"s{n}_head0_{j}grain{s}"
                    o = lib.sphere(gn, r * 0.55, tuple(c), 6)
                    o.scale = (0.8, 0.8, 1.5)
                    parts[gn] = o
    return parts


def material(spec, parts):
    kit.materials(
        spec,
        parts,
        lambda n: "leaf" if "_blade" in n else "disc" if "grain" in n else "head" if "_head" in n else "stem",
    )


def _bundles(n):
    return min(_BUNDLES, n + 1)  # young stages have few blades: fewer bones


def _bundle(n, i):
    return f"s{n}_blade{kit.group(i, _bundles(n))}_"


def _bones(spec):
    """Blades share _BUNDLES two-bone chains per stage (laid along the first blade of each bundle); all spikes of a
    stage share one stalk bone and one head bone."""
    bones = [kit.seed_bone(spec)]
    for n in range(1, kit.STAGES):
        for i, (name, *_) in enumerate(_blades(spec, n)[: _bundles(n)]):
            bones += kit.chain_bones(_bundle(n, i), _PATHS[name], _BLADE_K)
        if n >= 3 and _spikes(spec):
            stalk = _PATHS[f"s{n}_stem_0"]
            bones += kit.chain_bones(f"s{n}_stem", stalk, _SPIKE_K)
            hp = _PATHS[f"s{n}_head0_0"]
            bones.append((f"s{n}_head0", tuple(hp[0]), tuple(hp[-1]), f"s{n}_stem{_SPIKE_K - 1}"))
    return bones


def rig(spec, mesh):
    def wf(co, p):
        n = int(p[1])
        kind = p.split("_", 1)[1]
        if kind.startswith("blade"):
            return kit.chain_weights(co, _PATHS[p], _bundle(n, int(kind[5:])), _BLADE_K)
        if kind.startswith("head"):
            return {f"s{n}_head0": 1.0}  # every spike head and its grains
        return kit.chain_weights(co, _PATHS[p], f"s{n}_stem", _SPIKE_K)

    return kit.rig(spec, mesh, _bones(spec), wf)


def animate(spec, arm):
    return kit.animate(spec, arm)
