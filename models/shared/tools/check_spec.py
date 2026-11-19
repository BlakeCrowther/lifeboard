"""G1: validate a model spec (any kind; spec.kind default creature). Usage: python3 check_spec.py <kind>/specs/<id>.json  → JSON report on stdout, exit 1 on failure."""
import json, re, sys, colorsys, os

RARITY = {"creature": {"common", "rare", "legendary"}, "plant": {"common", "heirloom", "exotic"}}
TRIS = {"common": 8000, "rare": 12000, "legendary": 20000, "heirloom": 12000, "exotic": 20000}

def hsv(hexc):
    h = hexc.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return colorsys.rgb_to_hsv(r, g, b)

def main(path):
    s = json.load(open(path)); fails = []
    root = os.path.dirname(os.path.abspath(path))
    while root != "/" and not os.path.exists(os.path.join(root, "roster.json")): root = os.path.dirname(root)
    kind = s.get("kind", "creature")
    if kind not in RARITY: return {"gate": "G1", "pass": False, "fails": [f"kind {kind} must be creature|plant"]}
    need = ["id", "name", "biome", "rarity", "archetype", "reference", "size", "palette", "motion", "budget"] + (["locomotion"] if kind == "creature" else [])
    fails += [f"missing {k}" for k in need if k not in s]
    if fails: return {"gate": "G1", "pass": False, "fails": fails}
    if not re.fullmatch(r"[a-z][a-z0-9_]{2,31}", s["id"]): fails.append("id must be snake_case 3-32 chars")
    fn = os.path.basename(path); parent = os.path.basename(os.path.dirname(os.path.abspath(path)))
    if fn != s["id"] + ".json" and not (fn == "spec.json" and parent == s["id"]):  # specs/<id>.json or out/dryrun/<id>/spec.json
        fails.append("filename must be <id>.json (or <id>/spec.json)")
    if s["rarity"] not in RARITY[kind]: fails.append(f"rarity must be one of {sorted(RARITY[kind])} for kind {kind}")
    if kind == "creature" and s["locomotion"] not in {"swim", "walk", "fly", "drift", "rooted", "crawl"}: fails.append("locomotion")
    bpath = os.path.join(root, "biomes.json")
    if os.path.exists(bpath):
        bs = {b["id"]: b for b in json.load(open(bpath))["biomes"]}
        b = bs.get(s["biome"])
        if b is None: fails.append(f"biome {s['biome']} not in biomes.json")
        elif kind == "creature" and s["locomotion"] not in b["locomotion"]: fails.append(f"locomotion {s['locomotion']} not allowed in biome {b['name']} ({b['locomotion']})")
    L = s["size"].get("length_m", s["size"].get("height_m", 0))
    if not 0.03 <= L <= 3: fails.append(f"length_m {L} outside 0.03-3")
    pal = s["palette"]; mains = pal.get("main", [])
    if not 1 <= len(mains) <= 4: fails.append("palette.main needs 1-4 colors")
    for c in mains:
        _, S, V = hsv(c)
        if V < 0.35 or V > 0.98: fails.append(f"{c} value {V:.2f} outside 0.35-0.98")
        if S > 0.15 and not 0.45 <= S <= 0.95: fails.append(f"{c} saturation {S:.2f} outside 0.45-0.95 (neutrals <0.15 allowed)")
    if kind == "plant": return _plant(s, fails)
    idle = s["motion"].get("idle", {}); feed = s["motion"].get("feed", {})
    if not 48 <= idle.get("frames", 0) <= 144: fails.append("idle.frames 48-144")
    if not 36 <= feed.get("frames", 0) <= 96: fails.append("feed.frames 36-96")
    if idle.get("cycles", 0) < 1 or int(idle.get("cycles", 0)) != idle.get("cycles"): fails.append("idle.cycles whole number >=1")
    if not feed.get("technique"): fails.append("feed.technique must describe how this body plan eats")
    sulk = s["motion"].get("sulk", {})
    if not 48 <= sulk.get("frames", 0) <= 144: fails.append("sulk.frames 48-144")
    if sulk.get("cycles", 0) < 1 or int(sulk.get("cycles", 0)) != sulk.get("cycles"): fails.append("sulk.cycles whole number >=1")
    if not sulk.get("technique"): fails.append("sulk.technique must describe how this body plan mopes")
    if s.get("symmetry", "bilateral") not in {"bilateral", "radial"}: fails.append("symmetry must be bilateral|radial")
    if s.get("mouth", "front") not in {"front", "underside"}: fails.append("mouth must be front|underside")
    if "eye" in s and not 0.08 <= s["eye"].get("ratio", 0.1) <= 0.12: fails.append("eye.ratio 0.08-0.12 (STYLE)")
    mat = s.get("material", {})
    if not 0.25 <= mat.get("roughness", 0.35) <= 0.55: fails.append("material.roughness 0.25-0.55 (STYLE)")
    if not 0 <= mat.get("coat", 0.35) <= 0.6: fails.append("material.coat 0-0.6 (STYLE)")
    if s["budget"].get("tris", 1e9) > TRIS.get(s["rarity"], 0): fails.append("tris over rarity budget")
    # uniqueness vs. roster: idle length/cycles combo should differ from shipped creatures
    roster = os.path.join(root, "roster.json")
    if os.path.exists(roster):
        for c in json.load(open(roster))["models"]:
            if c["id"] == s["id"] or c.get("kind", "creature") != "creature": continue
            p = os.path.join(root, c["spec"])
            if os.path.exists(p):
                o = json.load(open(p))["motion"]["idle"]
                if (o.get("frames"), o.get("cycles")) == (idle.get("frames"), idle.get("cycles")):
                    fails.append(f"idle loop identical to {c['id']}; vary frames or cycles")
    return {"gate": "G1", "pass": not fails, "fails": fails}

def _plant(s, fails):
    """Plant draft contract (models/plant/CONTRACT.md): per-stage sway loops + a tend reaction."""
    sw = s["motion"].get("sway", {}); td = s["motion"].get("tend", {})
    if not 48 <= sw.get("frames", 0) <= 144: fails.append("motion.sway.frames 48-144")
    if sw.get("cycles", 0) < 1 or int(sw.get("cycles", 0)) != sw.get("cycles"): fails.append("motion.sway.cycles whole number >=1")
    if not 24 <= td.get("frames", 0) <= 72: fails.append("motion.tend.frames 24-72")
    if s["budget"].get("tris", 1e9) > TRIS.get(s["rarity"], 0): fails.append("tris over rarity budget")
    return {"gate": "G1", "pass": not fails, "fails": fails}

if __name__ == "__main__":
    r = main(sys.argv[1]); print(json.dumps(r, indent=1)); sys.exit(0 if r["pass"] else 1)
