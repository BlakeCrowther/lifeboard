"""Archetype: solid: a static lofted body (shells, stones, sand dollars, coral heads, rock arches, dune ridges).
A radius profile is swept along an axis path (straight up, lying along X, or an arch), with optional shoulder knobs,
a flared lip plate and petal plates on top. No rig, no animation (scenery CONTRACT: static props ship no actions).

Contract (models/scenery/CONTRACT.md): origin at the ground contact point, +Z up (glTF +Y), meters, one baked
material. model() re-centres the result so its lowest point is z = 0 and it is centred over the origin in X/Y.

Spec fields (all optional except size/palette):
  size.height_m                 final height (checked by shape-check); size.footprint_m: widest horizontal extent (checked)
  shape.axis "up"|"lying"|"arch"   up: profile runs ground->top; lying: along +X, resting on its side; arch: a
                                half-circle over the ground (rock arch), shape.arch_span_ratio (span / axis length, .7)
  shape.axis_m                  axis length in meters (default: height_m for up, footprint_m otherwise)
  shape.profile [[t, r], ...]   t 0..1 along the axis, r = radius / axis_m (linear between stations, >= 2 stations)
  shape.cap .2                  end caps bulge out by cap x the end radius (small = flat top, e.g. a sand dollar)
  shape.cross {flatten 1, segs 16}   flatten scales the cross-section on its second axis (pebbles, flat shells)
  shape.ridges {count 0, from 0, to 1, depth .1}   sin bumps on the radius between t from..to (spire whorls, sutures)
  shape.knobs {count 0, at .4, size_ratio .12, arc 200, tilt_deg 35}   blunt cones on the ring at t, over `arc`
                                degrees of the upper side (conch shoulder spines)
  shape.lip {from .35, to .9, flare_ratio .35, side 1}   flared plate along the body (conch outer lip), accent colour
  shape.petals {count 0, length_ratio .38, width_ratio .32, lift .5}   flat petals on the top face (sand dollar
                                petaloid), accent colour; length/width are fractions of the top radius
  palette.main [body, shade]    body gradient along the axis; palette.accent: lip/petals/knob tips
Contract checks live in models/scenery/qa.py."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared", "blender"))
import bpy
import lib
from mathutils import Vector


def _s(spec, sect, key, default):
    v = spec.get("shape", {}).get(sect) or {}
    return v.get(key, default) if isinstance(v, dict) else default


def _axis(spec):
    return spec.get("shape", {}).get("axis", "up")


def _A(spec):
    sz = spec["size"]
    return spec.get("shape", {}).get("axis_m") or (
        sz["height_m"] if _axis(spec) == "up" else sz.get("footprint_m", sz["height_m"])
    )


def _radius(spec, t):
    prof = spec.get("shape", {}).get("profile") or [[0, 0.2], [0.5, 0.35], [1, 0.05]]
    r = prof[-1][1]
    for (t0, r0), (t1, r1) in zip(prof, prof[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-9)
            r = r0 + (r1 - r0) * (u * u * (3 - 2 * u))
            break
    n = _s(spec, "ridges", "count", 0)
    a, b = _s(spec, "ridges", "from", 0), _s(spec, "ridges", "to", 1)
    if n and a <= t <= b:
        r *= 1 - _s(spec, "ridges", "depth", 0.1) * (0.5 - 0.5 * math.cos(2 * math.pi * n * (t - a) / max(b - a, 1e-9)))
    return r * _A(spec)


def _frame(spec, t):
    """Axis point, tangent and cross-section axes (u = 'up' side, v = flattened side) at t."""
    A = _A(spec)
    ax = _axis(spec)
    if ax == "up":
        return Vector((0, 0, t * A)), Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0))
    if ax == "lying":
        return Vector((t * A, 0, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))
    R = spec.get("shape", {}).get("arch_span_ratio", 0.7) * A / 2
    Hh = spec["size"]["height_m"] - _radius(spec, 0.5)
    pt = lambda tt: Vector(
        (-R * math.cos(math.pi * tt), 0, Hh * math.sin(math.pi * tt))
    )  # half ellipse, feet on the ground
    tan = (pt(min(t + 1e-3, 1)) - pt(max(t - 1e-3, 0))).normalized()
    return pt(t), tan, tan.cross(Vector((0, 1, 0))).normalized(), Vector((0, 1, 0))


def model(spec):
    segs = int(_s(spec, "cross", "segs", 16))
    fl = _s(spec, "cross", "flatten", 1.0)
    N = 24
    parts = {}
    rings = []
    for i in range(N + 1):
        t = i / N
        p, tan, u, v = _frame(spec, t)
        r = max(_radius(spec, t), 1e-4)
        rings.append(
            [
                tuple(p + u * math.cos(2 * math.pi * k / segs) * r + v * math.sin(2 * math.pi * k / segs) * r * fl)
                for k in range(segs)
            ]
        )
    p0, t0, _, _ = _frame(spec, 0)
    p1, t1, _, _ = _frame(spec, 1)
    cap = spec.get("shape", {}).get("cap", 0.2)
    parts["body"] = lib.loft(
        "body",
        rings,
        cap_front=tuple(p0 - t0 * _radius(spec, 0) * cap),
        cap_back=tuple(p1 + t1 * _radius(spec, 1) * cap),
    )
    kn = int(_s(spec, "knobs", "count", 0))
    if kn:
        t = _s(spec, "knobs", "at", 0.4)
        p, tan, u, v = _frame(spec, t)
        r = _radius(spec, t)
        kr = _s(spec, "knobs", "size_ratio", 0.12) * _A(spec)
        arc = math.radians(_s(spec, "knobs", "arc", 200))
        tilt = math.radians(_s(spec, "knobs", "tilt_deg", 35))
        for k in range(kn):
            a = math.pi / 2 - arc / 2 + arc * k / max(kn - 1, 1)  # spread over the upper side (u = up)
            d = (u * math.sin(a) + v * math.cos(a) * fl).normalized()
            base = p + d * r * 0.85
            base = p + d * r * 0.7
            tip = base + (d * math.cos(tilt) - tan * math.sin(tilt)) * (
                kr * 1.6 + r * 0.15
            )  # seated in the shell, blunt
            parts[f"knob{k}"] = lib.tube(
                f"knob{k}", [base, base.lerp(tip, 0.5), tip], [kr * 0.7, kr * 0.5, kr * 0.32], segs=6
            )
    if spec.get("shape", {}).get("lip"):
        a, b = _s(spec, "lip", "from", 0.35), _s(spec, "lip", "to", 0.9)
        side = _s(spec, "lip", "side", 1)
        fr = _s(spec, "lip", "flare_ratio", 0.35) * _A(spec)
        inner, outer = [], []
        for i in range(9):
            t = a + (b - a) * i / 8
            p, tan, u, v = _frame(spec, t)
            r = _radius(spec, t)
            bell = math.sin(math.pi * i / 8)
            d = (v * side * fl * 0.9 + u * 0.35).normalized()
            inner.append(p + d * r * 0.6)  # rooted inside the whorl: no seam
            outer.append(p + d * (r + fr * (0.25 + 0.75 * bell)) + u * fr * 0.35 * bell)
        th = 0.05 * _A(spec)
        n = (outer[4] - inner[4]).cross(inner[5] - inner[3]).normalized()
        rings = [
            [tuple(q + n * th), tuple(o + n * th * 0.4), tuple(o - n * th * 0.4), tuple(q - n * th)]
            for q, o in zip(inner, outer)
        ]
        parts["lip"] = lib.loft(
            "lip", rings, cap_front=tuple((inner[0] + outer[0]) / 2), cap_back=tuple((inner[-1] + outer[-1]) / 2)
        )
    pc = int(_s(spec, "petals", "count", 0))
    if pc:
        R = max(_radius(spec, t / 10) for t in range(11))
        top = Vector((0, 0, _top_z(spec)))
        ln, wd = _s(spec, "petals", "length_ratio", 0.38) * R, _s(spec, "petals", "width_ratio", 0.32) * R
        outline = [(ln * u, wd / 2 * math.sin(math.pi * u) ** 0.8) for u in (i / 8 for i in range(9))]
        outline = outline + [(x, -z) for x, z in reversed(outline[1:-1])]
        for k in range(pc):
            yaw = 2 * math.pi * k / pc + math.pi / 2
            st = Vector((math.cos(yaw), math.sin(yaw), 0)) * R * 0.08
            parts[f"petal{k}"] = lib.flat_part(
                f"petal{k}", outline, 0.06 * _A(spec), at=tuple(top + st), rot=(math.pi / 2, 0, yaw)
            )
    _ground(parts)
    return parts


def _top_z(spec):
    """Top face height for petals (axis up): the plates sit a little proud of the (nearly flat) upper cap."""
    return _A(spec) * (1 + spec.get("shape", {}).get("cap", 0.2) * 0.5) + 0.02 * _A(spec)


def _ground(parts):
    """Shift every part so the lowest vertex sits at z = 0 and the whole is centred over the origin in X/Y."""
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in parts.values() for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in parts.values():
        o.location = o.location - off


def material(spec, parts):
    pal = spec["palette"]
    main = [lib.hex_rgba(c) for c in pal["main"]]
    m, nt, b = lib.principled("body", main[0], 0.45, 0.2)
    if len(main) > 1:  # gradient along the axis (spire -> body, rim -> centre)
        ax = {"up": 2, "lying": 0, "arch": 2}[_axis(spec)]
        v, _ = lib.coord_along(nt, ax, 1 / _A(spec), 0)
        r = nt.nodes.new("ShaderNodeValToRGB")
        r.color_ramp.elements[0].color = main[1]
        r.color_ramp.elements[1].color = main[0]
        r.color_ramp.elements[1].position = 0.6
        nt.links.new(v, r.inputs[0])
        nt.links.new(r.outputs[0], b.inputs["Base Color"])
    acc, _, _ = lib.principled("accent", lib.hex_rgba(pal.get("accent", pal["main"][0])), 0.35, 0.3)
    for n, o in parts.items():
        o.data.materials.append(acc if n.startswith(("lip", "petal")) else m)


def rig(spec, mesh):
    return None, None


def animate(spec, arm):
    return []
