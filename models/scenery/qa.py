"""Scenery-kind gates (models/scenery/CONTRACT.md), exec'd by shared/blender/qa_structural.py.
shape-check (REST pose): ground origin (bbox min z ~ 0, centred over the origin), height matches spec, footprint sane.
motion-check: optional `sway` loop: seamless, whole cycles, gentle but visible, no pops. Static props: no actions at all."""

def shape_check():
    global L
    L = max(dim.z, dim.x, dim.y)
    want = spec["size"]["height_m"]
    check("shape-check", "height matches spec +-20%", abs(dim.z - want) <= 0.2 * want, f"{dim.z:.3f} m vs {want}")
    check("shape-check", "ground origin: contact point at z=0 (bbox min z within 3%)", abs(mn.z) <= 0.03 * L, f"min z {mn.z:.4f}")
    check("shape-check", "ground origin: centred over the origin in X/Y (within 25%)", abs(mx.x + mn.x) <= 0.5 * L and abs(mx.y + mn.y) <= 0.5 * L,
          f"x {mn.x:.3f}..{mx.x:.3f} y {mn.y:.3f}..{mx.y:.3f}")
    fp = spec["size"].get("footprint_m")
    if fp: check("shape-check", "footprint matches spec +-30%", abs(max(dim.x, dim.y) - fp) <= 0.3 * fp, f"{max(dim.x, dim.y):.3f} m vs {fp}")
    check("shape-check", "tris <= 3000 (scenery)", tris <= 3000, f"{tris}")

def motion_check():
    acts = {a.name: a for a in bpy.data.actions}
    want = (spec.get("motion") or {}).get("sway")
    if not want:
        check("motion-check", "static prop: no animations", not acts, f"{sorted(acts)}"); return
    sw = next((v for k, v in acts.items() if k == "sway" or k.startswith("sway_") or k.startswith("sway.")), None)
    check("motion-check", "has 'sway' loop", sw is not None, f"actions: {sorted(acts)}")
    if not sw: return
    use(sw); s, e = map(int, sw.frame_range)
    check("motion-check", "sway length 48-144 frames", 48 <= e - s <= 144, f"{e - s}")
    d = delta(pose(s), pose(e)); check("motion-check", "sway loops seamlessly", d < 1e-3, f"max bone delta {d:.2e}")
    sp, pk, am = motion(sw)
    check("motion-check", "sway gentle (<= 4% size/frame)", sp <= 0.04, f"{sp:.3f}")
    check("motion-check", "sway visible (>= 3% size from frame 0)", am >= 0.03, f"{am:.3f}")
    check("motion-check", "sway has no pops", pk == 0, f"spike {pk:.3f}")
