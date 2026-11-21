"""Creature-kind gates (models/creature/CONTRACT.md), exec'd by shared/blender/qa_structural.py.
shape-check (REST pose): length/axes/symmetry/origin by body plan, `mouth` empty + `part:mouth` geometry.
motion-check (actions): idle loop + feed (start/end on idle, speed caps, visible amplitude, no pops, mouth reach) + sulk (mood loop:
 slower than idle, a side silhouette at card size that no idle pose matches, frown on front mouths) + perch when present (resting loop: seamless, no pops, calmer than idle)."""

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
    fin_taper_check()

FIN_TAPER_MAX = 0.5      # edge thickness / root thickness; a uniform slab measures ~1

def fin_taper_check():
    """Fins and tails taper (thick root, thin free edge) so they read as fins, not cut-out slabs. Measured per part at
    build time (lib.measure_flat_parts) because the join loses part identity. A finned archetype with no records fails."""
    fins = meta.get("flat_parts")
    if fins is None:
        check("shape-check", "build_meta.json records fin thickness (flat_parts)", False, "rebuild with blender/build.py"); return
    if not fins:
        check("shape-check", "fins recorded (lib.flat_part), or the archetype sets HAS_FINS = False", not meta.get("has_fins", True),
              f"has_fins {meta.get('has_fins', True)}, 0 flat parts"); return
    for p in fins:
        r, e = p.get("root_thickness_m"), p.get("edge_thickness_m")
        name = f"fin {p['name']} tapers (edge thickness <= {FIN_TAPER_MAX:.0%} of root)"
        if not p.get("tapered"): check("shape-check", name, False, "uniform plate: build it with lib.flat_part(..., root=n)")
        elif not r or e is None: check("shape-check", name, False, f"not measured (root {r}, edge {e}): sample rays missed the part")
        else: check("shape-check", name, e <= FIN_TAPER_MAX * r, f"root {r * 1000:.2f} mm, edge {e * 1000:.2f} mm ({e / r:.0%})")

CARD_PX_PER_M = json.load(open(os.path.join(root, "shared", "card_view.json")))["px_per_m"]
CELLS_PER_PX = 4          # raster cells per card pixel side: sub-pixel changes still count, as they do on an antialiased screen
SULK_SILHOUETTE_CHANGE_MIN = 0.25   # changed cells / silhouette cells; sulks judges called idle-like measured ~0.1, one
                                    # they called distinct ~0.5. A share, not px, so small and large bodies are held alike

def side_silhouette(f):
    """Side-view (XZ) silhouette at frame f at card scale: a set of raster cells (1/CELLS_PER_PX card px), shifted so its
    centroid sits at 0. The runtime swims creatures around, so where the body sits (a sink, a bob) is not a pose."""
    sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); k = CARD_PX_PER_M * CELLS_PER_PX; cells = set()
    for o in meshes:
        e = o.evaluated_get(dg); m = e.to_mesh(); mw = o.matrix_world; P = []
        for v in m.vertices:
            w = mw @ v.co; P.append((w.x * k, w.z * k))
        for t in m.loop_triangles:
            (ax, az), (bx, bz), (cx, cz) = (P[i] for i in t.vertices)
            area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
            if area == 0: continue
            sg = 1 if area > 0 else -1
            for i in range(math.ceil(min(ax, bx, cx) - 0.5), math.floor(max(ax, bx, cx) - 0.5) + 1):
                px = i + 0.5
                for j in range(math.ceil(min(az, bz, cz) - 0.5), math.floor(max(az, bz, cz) - 0.5) + 1):
                    if (i, j) in cells: continue
                    pz = j + 0.5
                    if (sg * ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) >= 0 and sg * ((cx - bx) * (pz - bz) - (cz - bz) * (px - bx)) >= 0
                            and sg * ((ax - cx) * (pz - cz) - (az - cz) * (px - cx)) >= 0): cells.add((i, j))
        e.to_mesh_clear()
    ci = round(sum(i for i, _ in cells) / len(cells)); cj = round(sum(j for _, j in cells) / len(cells))
    return frozenset((i - ci, j - cj) for i, j in cells)

def sulk_card_difference(idle, sulk):
    """Card px that differ between the sulk's side silhouette and the nearest idle pose anywhere in the idle loop, for the
    sulk frame closest to idle (a pose idle already passes through is not a different pose). Returns (px, silhouette px)."""
    use(idle); s, e = map(int, idle.frame_range); idle_sils = [side_silhouette(f) for f in range(s, e)]
    use(sulk); s, e = map(int, sulk.frame_range); sulk_sils = [side_silhouette(f) for f in range(s, e, 4)]
    near = min(min(len(a ^ b) for b in idle_sils) for a in sulk_sils)
    return near / CELLS_PER_PX ** 2, sum(len(a) for a in sulk_sils) / len(sulk_sils) / CELLS_PER_PX ** 2

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
            far, area = sulk_card_difference(idle, sulk); use(sulk)
            check("motion-check", f"sulk reads as its own pose at card size (side silhouette >= {SULK_SILHOUETTE_CHANGE_MIN:.0%} changed vs every idle pose)",
                  far / area >= SULK_SILHOUETTE_CHANGE_MIN, f"{far / area:.0%} changed ({far:.1f} of {area:.0f} card px)")
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
