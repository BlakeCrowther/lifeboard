"""Plant-kind gates (models/plant/CONTRACT.md, DRAFT), exec'd by shared/blender/qa_structural.py.
No plant generator exists yet: these checks encode the draft contract so the first plant archetype has a target.
g2 (REST pose): rooted origin at the soil point, +Z up, height matches spec, stage_0..stage_4 nodes.
g3 (actions): per-stage seamless sway_<n> loops, tend starts/ends on the sway pose, optional wilt."""
STAGES = ["seed", "sprout", "leafy", "bud", "bloom"]          # game.js RULES.garden.stages

def g2():
    global L
    L = max(dim.z, dim.x, dim.y)                               # plant "length" = its largest extent (usually height)
    want = spec["size"].get("height_m", spec["size"].get("length_m", 0))
    check("G2", "height matches spec ±15% (bloom stage, all stages shown at rest)", abs(dim.z - want) <= 0.15 * want or want == 0, f"{dim.z:.3f} m vs {want}")
    check("G2", "rooted origin: soil point at z=0 (bbox min z within 5%)", abs(mn.z) <= 0.05 * L, f"min z {mn.z:.3f}")
    check("G2", "rooted origin: centred over the soil point in X/Y", abs(mx.x + mn.x) <= 0.2 * L and abs(mx.y + mn.y) <= 0.2 * L, f"x {mn.x:.3f}..{mx.x:.3f} y {mn.y:.3f}..{mx.y:.3f}")
    names = {o.name.split(".")[0] for o in bpy.context.scene.objects}
    for i, st in enumerate(STAGES):
        check("G2", f"stage node stage_{i} ({st})", f"stage_{i}" in names)

def g3():
    acts = {act.name: act for act in bpy.data.actions}
    def find(name): return next((v for k, v in acts.items() if k == name or k.startswith(name + "_") or k.startswith(name + ".")), None)
    pose0 = {}
    for i in range(len(STAGES)):
        sw = find(f"sway_{i}")
        check("G3", f"has 'sway_{i}' loop", sw is not None, f"actions: {sorted(acts)}")
        if not sw: continue
        use(sw); s, e = map(int, sw.frame_range)
        check("G3", f"sway_{i} length 48-144 frames", 48 <= e - s <= 144, f"{e - s}")
        d = delta(pose(s), pose(e)); check("G3", f"sway_{i} loops seamlessly", d < 1e-3, f"max bone delta {d:.2e}")
        sp, pk, am = motion(sw)
        check("G3", f"sway_{i} gentle (<= 6% size/frame)", sp <= 0.06, f"{sp:.3f}")
        check("G3", f"sway_{i} has no pops", pk == 0, f"spike {pk:.3f}")
        pose0[i] = pose(s)
    tend = find("tend")
    check("G3", "has 'tend' reaction", tend is not None)
    if tend and pose0:
        use(tend); s, e = map(int, tend.frame_range); ref = pose0[max(pose0)]
        check("G3", "tend length 24-72 frames", 24 <= e - s <= 72, f"{e - s}")
        check("G3", "tend starts on sway pose", delta(pose(s), ref) < 1e-2, f"{delta(pose(s), ref):.2e}")
        check("G3", "tend ends on sway pose", delta(pose(e), ref) < 1e-2, f"{delta(pose(e), ref):.2e}")
        sp, pk, am = motion(tend)
        check("G3", "tend visible (>= 6% size from frame 0)", am >= 0.06, f"{am:.3f}")
        check("G3", "tend has no pops", pk == 0, f"spike {pk:.3f}")
