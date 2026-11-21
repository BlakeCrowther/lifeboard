"""Creature-kind gates (models/creature/CONTRACT.md), exec'd by shared/blender/qa_structural.py.
shape-check (REST pose): length/axes/symmetry/origin by body plan, `mouth` empty + `part:mouth` geometry.
motion-check (actions): idle loop + feed (start/end on idle, speed caps, visible amplitude, no pops, mouth reach) + sulk (mood loop:
 slower than idle, a visibly different posture, frown on front mouths) + perch when present (resting loop: seamless, no pops, calmer than idle)."""

def shape_check():
    global L, RADIAL, MOUTH_SIDE, ctr, mouth
    RADIAL = spec.get("symmetry", "bilateral") == "radial"      # CONTRACT.md "Body plans": radial bodies have no long axis
    MOUTH_SIDE = spec.get("mouth", "front")                     # front (+X) | underside (-Z, near the vertical axis)
    L = max(dim.x, dim.y) if RADIAL else dim.x                  # "length" = X extent (bilateral) / max horizontal extent (radial)
    want = spec["size"]["length_m"]
    check("shape-check", "length matches spec ±15%", abs(L - want) <= 0.15 * want, f"{L:.3f} m vs {want} ({'radial: max horizontal' if RADIAL else 'X extent'})")
    if not RADIAL:
        check("shape-check", "longest axis is X (head/tail along X)", dim.x >= dim.y and dim.x >= dim.z * 0.8, f"dims {tuple(round(d,3) for d in dim)}")
    ctr = (mn + mx) / 2
    check("shape-check", "origin near body center", (ctr.length <= 0.2 * L), f"bbox center {tuple(round(c,3) for c in ctr)}")
    if RADIAL:   # symmetric about the vertical axis: centred in X and Y, footprint not elongated
        sym = abs(mx.y + mn.y) <= 0.1 * dim.y and abs(mx.x + mn.x) <= 0.1 * dim.x and 0.67 <= dim.x / max(dim.y, 1e-6) <= 1.5
        check("shape-check", "radially symmetric about Z (centred, footprint aspect 0.67-1.5)", sym, f"x {mn.x:.3f}..{mx.x:.3f} y {mn.y:.3f}..{mx.y:.3f}")
    else:
        sym = abs(mx.y + mn.y) <= 0.1 * max(dim.y, 1e-6)
        check("shape-check", "symmetric about XZ plane", sym, f"y {mn.y:.3f}..{mx.y:.3f}")
    mouth = empties.get("mouth")
    check("shape-check", "has 'mouth' empty", mouth is not None)
    if mouth:
        mp = mouth.matrix_world.translation
        if MOUTH_SIDE == "underside":
            check("shape-check", "mouth on underside (below center, near vertical axis)", mp.z < ctr.z and math.hypot(mp.x - ctr.x, mp.y - ctr.y) <= 0.25 * L, f"{tuple(round(c,3) for c in mp)}")
        else:
            check("shape-check", "mouth at head end (+X half, inside bbox)", mp.x > ctr.x and mn.x - 0.05 * L <= mp.x <= mx.x + 0.05 * L, f"{tuple(round(c,3) for c in mp)}")
    # mouth geometry (STYLE/CONTRACT): a real `mouth` part from lib.mouth(), recorded at build time because the part
    # tag is gone after the join + skinning. Must exist, have vertices, and the `mouth` empty must sit at its opening.
    mps = [m for m in meta.get("mouth_parts", []) if m.get("verts", 0) > 0]
    check("shape-check", "part:mouth exists (visible mouth geometry, lib.mouth)", bool(mps),
          f"{len(mps)} part(s), verts {[m.get('verts') for m in meta.get('mouth_parts', [])]}" if meta.get("mouth_parts") else "no mouth_parts in build_meta.json (archetype must call lib.mouth)")
    if mps and mouth:
        dist = min((Vector(m["tip"]) - mouth.matrix_world.translation).length for m in mps)
        check("shape-check", "mouth empty at the mouth part (<= 8% length)", dist <= 0.08 * L, f"{dist / L:.3f} of length")

def motion_check():
    acts = {act.name: act for act in bpy.data.actions}
    def find(name): return next((v for k, v in acts.items() if k == name or k.startswith(name + "_") or k.startswith(name + ".")), None)
    idle, feed, sulk = find("idle"), find("feed"), find("sulk")
    check("motion-check", "has 'idle' animation", idle is not None, f"actions: {sorted(acts)}")
    check("motion-check", "has 'feed' animation", feed is not None)
    IDLE_MIN, FEED_MIN = 0.04, 0.12   # STYLE "gentle but readable": visible at card size
    if idle:
        use(idle); s, e = map(int, idle.frame_range); n = e - s
        check("motion-check", "idle length 48-144 frames", 48 <= n <= 144, f"{n}")
        check("motion-check", "idle length matches spec", abs(n - spec["motion"]["idle"]["frames"]) <= 1, f"{n} vs {spec['motion']['idle']['frames']}")
        d = delta(pose(s), pose(e)); check("motion-check", "idle loops seamlessly", d < 1e-3, f"max bone delta {d:.2e}")
        sp, pk, am = motion(idle); idle_sp = sp
        check("motion-check", "idle gentle (max speed <= 8% length/frame)", sp <= 0.08, f"{sp:.3f}")
        check("motion-check", f"idle visible (max vertex displacement from frame 0 >= {IDLE_MIN:.0%} length)", am >= IDLE_MIN, f"{am:.3f}")
        check("motion-check", "idle has no pops (no acceleration spikes)", pk == 0, f"spike {pk:.3f}")
        idle0 = pose(s)
    if feed:
        use(feed); s, e = map(int, feed.frame_range); n = e - s
        check("motion-check", "feed length 36-96 frames", 36 <= n <= 96, f"{n}")
        if idle:
            check("motion-check", "feed starts on idle pose", delta(pose(s), idle0) < 1e-2, f"{delta(pose(s), idle0):.2e}")
            check("motion-check", "feed ends on idle pose", delta(pose(e), idle0) < 1e-2, f"{delta(pose(e), idle0):.2e}")
        sp, pk, am = motion(feed)
        check("motion-check", "feed not flailing (max speed <= 25% length/frame)", sp <= 0.25, f"{sp:.3f}")
        check("motion-check", f"feed visible (max vertex displacement from frame 0 >= {FEED_MIN:.0%} length)", am >= FEED_MIN, f"{am:.3f}")
        check("motion-check", "feed has no pops (no acceleration spikes)", pk == 0, f"spike {pk:.3f}")
        if mouth:
            m0 = (sc.frame_set(s), mouth.matrix_world.translation.copy())[1]
            if MOUTH_SIDE == "underside":   # radial/underside mouths reach toward food in any direction (often down)
                reach = max(((sc.frame_set(f), (mouth.matrix_world.translation - m0).length)[1] for f in range(s, e + 1)))
                check("motion-check", "feed visibly moves the mouth (>= 5% length, any direction)", reach >= 0.05 * L, f"{reach / L:.2f} of length")
            else:
                reach = max((sc.frame_set(f), mouth.matrix_world.translation.x)[1] for f in range(s, e + 1)) - m0.x
                check("motion-check", "feed visibly reaches forward (mouth +X >= 5% length)", reach >= 0.05 * L, f"{reach / L:.2f} of length")
    check("motion-check", "has 'sulk' animation (mood loop)", sulk is not None)
    if sulk:
        use(sulk); s, e = map(int, sulk.frame_range); n = e - s
        check("motion-check", "sulk length 48-144 frames", 48 <= n <= 144, f"{n}")
        d = delta(pose(s), pose(e)); check("motion-check", "sulk loops seamlessly", d < 1e-3, f"max bone delta {d:.2e}")
        sp, pk, am = motion(sulk)
        check("motion-check", "sulk has no pops (no acceleration spikes)", pk == 0, f"spike {pk:.3f}")
        if idle:
            check("motion-check", "sulk slower than idle (max speed below idle's)", sp < idle_sp, f"{sp:.3f} vs idle {idle_sp:.3f}")
            sv = verts(s); use(idle); iv = verts(int(idle.frame_range[0])); use(sulk)
            post = max((a - b).length for a, b in zip(sv, iv)) / L
            check("motion-check", "sulk posture visibly differs from idle (>= 4% length)", post >= 0.04, f"{post:.3f}")
        if MOUTH_SIDE == "front":   # a frown: mouth corners drop relative to the jaw (the head pitching down does not count)
            pb = arms[0].pose.bones
            if "cornerL" in pb and "jaw" in pb:
                def corner(f): sc.frame_set(f); return (pb["jaw"].matrix.inverted() @ pb["cornerL"].matrix).translation
                use(idle); c0 = corner(int(idle.frame_range[0])); use(sulk); c1 = corner(s)
                mt = (meta.get("mouth_parts") or [{}])[0]; Wm = mt.get("width_m", 0.01)
                jr = arms[0].data.bones["jaw"].matrix_local.to_3x3().inverted()
                a = Vector(mt.get("direction", (1, 0, 0))).normalized(); up = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
                h = a.cross(up.cross(a).normalized()).normalized(); hl = (jr @ h).normalized()
                drop = -(c1 - c0).dot(hl) / Wm
                check("motion-check", "sulk frowns (mouth corners drop >= 15% mouth width)", drop >= 0.15, f"{drop:.2f} of width")
            else:
                check("motion-check", "sulk frowns (mouth corner bones cornerL/R, lib.mouth_corner_bones)", False, "no cornerL/jaw bones")
    # perch (CONTRACT "Resting"): the resting loop; required when the spec has motion.perch (check_spec decides when), checked when present
    perch = find("perch")
    if spec.get("motion", {}).get("perch"): check("motion-check", "has 'perch' animation (spec motion.perch)", perch is not None)
    if perch:
        use(perch); s, e = map(int, perch.frame_range); n = e - s
        check("motion-check", "perch length 48-144 frames", 48 <= n <= 144, f"{n}")
        d = delta(pose(s), pose(e)); check("motion-check", "perch loops seamlessly", d < 1e-3, f"max bone delta {d:.2e}")
        sp, pk, am = motion(perch)
        check("motion-check", "perch has no pops (no acceleration spikes)", pk == 0, f"spike {pk:.3f}")
        if idle: check("motion-check", "perch calmer than idle (max speed below idle's)", sp < idle_sp, f"{sp:.3f} vs idle {idle_sp:.3f}")
