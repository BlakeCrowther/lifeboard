"""Creature-kind gates (models/creature/CONTRACT.md), exec'd by shared/blender/qa_structural.py.
g2 (REST pose): length/axes/symmetry/origin by body plan, `mouth` empty + `part:mouth` geometry.
g3 (actions): idle loop + feed (start/end on idle, speed caps, visible amplitude, no pops, mouth reach)."""

def g2():
    global L, RADIAL, MOUTH_SIDE, ctr, mouth
    RADIAL = spec.get("symmetry", "bilateral") == "radial"      # CONTRACT.md "Body plans": radial bodies have no long axis
    MOUTH_SIDE = spec.get("mouth", "front")                     # front (+X) | underside (-Z, near the vertical axis)
    L = max(dim.x, dim.y) if RADIAL else dim.x                  # "length" = X extent (bilateral) / max horizontal extent (radial)
    want = spec["size"]["length_m"]
    check("G2", "length matches spec ±15%", abs(L - want) <= 0.15 * want, f"{L:.3f} m vs {want} ({'radial: max horizontal' if RADIAL else 'X extent'})")
    if not RADIAL:
        check("G2", "longest axis is X (head/tail along X)", dim.x >= dim.y and dim.x >= dim.z * 0.8, f"dims {tuple(round(d,3) for d in dim)}")
    ctr = (mn + mx) / 2
    check("G2", "origin near body center", (ctr.length <= 0.2 * L), f"bbox center {tuple(round(c,3) for c in ctr)}")
    if RADIAL:   # symmetric about the vertical axis: centred in X and Y, footprint not elongated
        sym = abs(mx.y + mn.y) <= 0.1 * dim.y and abs(mx.x + mn.x) <= 0.1 * dim.x and 0.67 <= dim.x / max(dim.y, 1e-6) <= 1.5
        check("G2", "radially symmetric about Z (centred, footprint aspect 0.67-1.5)", sym, f"x {mn.x:.3f}..{mx.x:.3f} y {mn.y:.3f}..{mx.y:.3f}")
    else:
        sym = abs(mx.y + mn.y) <= 0.1 * max(dim.y, 1e-6)
        check("G2", "symmetric about XZ plane", sym, f"y {mn.y:.3f}..{mx.y:.3f}")
    mouth = empties.get("mouth")
    check("G2", "has 'mouth' empty", mouth is not None)
    if mouth:
        mp = mouth.matrix_world.translation
        if MOUTH_SIDE == "underside":
            check("G2", "mouth on underside (below center, near vertical axis)", mp.z < ctr.z and math.hypot(mp.x - ctr.x, mp.y - ctr.y) <= 0.25 * L, f"{tuple(round(c,3) for c in mp)}")
        else:
            check("G2", "mouth at head end (+X half, inside bbox)", mp.x > ctr.x and mn.x - 0.05 * L <= mp.x <= mx.x + 0.05 * L, f"{tuple(round(c,3) for c in mp)}")
    # mouth geometry (STYLE/CONTRACT): a real `mouth` part from lib.mouth(), recorded at build time because the part
    # tag is gone after the join + skinning. Must exist, have vertices, and the `mouth` empty must sit at its opening.
    mps = [m for m in meta.get("mouth_parts", []) if m.get("verts", 0) > 0]
    check("G2", "part:mouth exists (visible mouth geometry, lib.mouth)", bool(mps),
          f"{len(mps)} part(s), verts {[m.get('verts') for m in meta.get('mouth_parts', [])]}" if meta.get("mouth_parts") else "no mouth_parts in build_meta.json (archetype must call lib.mouth)")
    if mps and mouth:
        dist = min((Vector(m["tip"]) - mouth.matrix_world.translation).length for m in mps)
        check("G2", "mouth empty at the mouth part (<= 8% length)", dist <= 0.08 * L, f"{dist / L:.3f} of length")

def g3():
    acts = {act.name: act for act in bpy.data.actions}
    def find(name): return next((v for k, v in acts.items() if k == name or k.startswith(name + "_") or k.startswith(name + ".")), None)
    idle, feed = find("idle"), find("feed")
    check("G3", "has 'idle' animation", idle is not None, f"actions: {sorted(acts)}")
    check("G3", "has 'feed' animation", feed is not None)
    IDLE_MIN, FEED_MIN = 0.04, 0.12   # STYLE "gentle but readable": visible at card size
    if idle:
        use(idle); s, e = map(int, idle.frame_range); n = e - s
        check("G3", "idle length 48-144 frames", 48 <= n <= 144, f"{n}")
        check("G3", "idle length matches spec", abs(n - spec["motion"]["idle"]["frames"]) <= 1, f"{n} vs {spec['motion']['idle']['frames']}")
        d = delta(pose(s), pose(e)); check("G3", "idle loops seamlessly", d < 1e-3, f"max bone delta {d:.2e}")
        sp, pk, am = motion(idle)
        check("G3", "idle gentle (max speed <= 8% length/frame)", sp <= 0.08, f"{sp:.3f}")
        check("G3", f"idle visible (max vertex displacement from frame 0 >= {IDLE_MIN:.0%} length)", am >= IDLE_MIN, f"{am:.3f}")
        check("G3", "idle has no pops (no acceleration spikes)", pk == 0, f"spike {pk:.3f}")
        idle0 = pose(s)
    if feed:
        use(feed); s, e = map(int, feed.frame_range); n = e - s
        check("G3", "feed length 36-96 frames", 36 <= n <= 96, f"{n}")
        if idle:
            check("G3", "feed starts on idle pose", delta(pose(s), idle0) < 1e-2, f"{delta(pose(s), idle0):.2e}")
            check("G3", "feed ends on idle pose", delta(pose(e), idle0) < 1e-2, f"{delta(pose(e), idle0):.2e}")
        sp, pk, am = motion(feed)
        check("G3", "feed not flailing (max speed <= 25% length/frame)", sp <= 0.25, f"{sp:.3f}")
        check("G3", f"feed visible (max vertex displacement from frame 0 >= {FEED_MIN:.0%} length)", am >= FEED_MIN, f"{am:.3f}")
        check("G3", "feed has no pops (no acceleration spikes)", pk == 0, f"spike {pk:.3f}")
        if mouth:
            m0 = (sc.frame_set(s), mouth.matrix_world.translation.copy())[1]
            if MOUTH_SIDE == "underside":   # radial/underside mouths reach toward food in any direction (often down)
                reach = max(((sc.frame_set(f), (mouth.matrix_world.translation - m0).length)[1] for f in range(s, e + 1)))
                check("G3", "feed visibly moves the mouth (>= 5% length, any direction)", reach >= 0.05 * L, f"{reach / L:.2f} of length")
            else:
                reach = max((sc.frame_set(f), mouth.matrix_world.translation.x)[1] for f in range(s, e + 1)) - m0.x
                check("G3", "feed visibly reaches forward (mouth +X >= 5% length)", reach >= 0.05 * L, f"{reach / L:.2f} of length")
