"""spec-check: validate a model spec (any kind; spec.kind default creature). Usage: python3 check_spec.py <kind>/specs/<id>.json  → JSON report on stdout, exit 1 on failure."""

import colorsys
import json
import os
import re
import sys
from typing import Any

RARITY = {"creature": {"common", "rare", "exotic"}, "plant": {"common", "rare", "exotic"}, "scenery": {"common"}}
TRIS = {"common": 8000, "rare": 12000, "exotic": 20000}


def hsv(hexc: str) -> tuple[float, float, float]:
    h = hexc.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return colorsys.rgb_to_hsv(r, g, b)


def main(path: str) -> dict[str, Any]:
    s = json.load(open(path))
    fails = []
    root = os.path.dirname(os.path.abspath(path))
    while root != "/" and not os.path.exists(os.path.join(root, "roster.json")):
        root = os.path.dirname(root)
    kind = s.get("kind", "creature")
    if kind not in RARITY:
        return {"gate": "spec-check", "pass": False, "fails": [f"kind {kind} must be creature|plant|scenery"]}
    need = (
        ["id", "name", "biome", "rarity", "archetype", "reference", "size", "palette", "budget"]
        + (["motion"] if kind != "scenery" else [])
        + (["locomotion"] if kind == "creature" else [])
    )
    fails += [f"missing {k}" for k in need if k not in s]
    if fails:
        return {"gate": "spec-check", "pass": False, "fails": fails}
    if not re.fullmatch(r"[a-z][a-z0-9_]{2,31}", s["id"]):
        fails.append("id must be snake_case 3-32 chars")
    fn = os.path.basename(path)
    parent = os.path.basename(os.path.dirname(os.path.abspath(path)))
    if fn != s["id"] + ".json" and not (
        fn == "spec.json" and parent == s["id"]
    ):  # specs/<id>.json or out/dryrun/<id>/spec.json
        fails.append("filename must be <id>.json (or <id>/spec.json)")
    if s["rarity"] not in RARITY[kind]:
        fails.append(f"rarity must be one of {sorted(RARITY[kind])} for kind {kind}")
    if kind == "creature" and s["locomotion"] not in {"swim", "walk", "fly", "drift", "rooted", "crawl"}:
        fails.append("locomotion")
    bpath = os.path.join(root, "biomes.json")
    if os.path.exists(bpath):
        bs = {b["id"]: b for b in json.load(open(bpath))["biomes"]}
        b = bs.get(s["biome"])
        if b is None:
            fails.append(f"biome {s['biome']} not in biomes.json")
        elif kind == "creature" and s["locomotion"] not in b["locomotion"]:
            fails.append(f"locomotion {s['locomotion']} not allowed in biome {b['name']} ({b['locomotion']})")
    L = s["size"].get("length_m", s["size"].get("height_m", 0))
    if kind == "scenery":
        L = max(s["size"].get("height_m", 0), s["size"].get("footprint_m", 0))  # flat props: their width
    if not 0.03 <= L <= 3:
        fails.append(f"length_m {L} outside 0.03-3")
    pal = s["palette"]
    mains = pal.get("main", [])
    if not 1 <= len(mains) <= 4:
        fails.append("palette.main needs 1-4 colors")
    for c in mains:
        _, S, V = hsv(c)
        if V < 0.35 or V > 0.98:
            fails.append(f"{c} value {V:.2f} outside 0.35-0.98")
        if S > 0.15 and not 0.45 <= S <= 0.95:
            fails.append(f"{c} saturation {S:.2f} outside 0.45-0.95 (neutrals <0.15 allowed)")
    if kind == "plant":
        return _plant(s, fails, root)
    if kind == "scenery":
        return _scenery(s, fails)
    idle = s["motion"].get("idle", {})
    feed = s["motion"].get("feed", {})
    if not 48 <= idle.get("frames", 0) <= 144:
        fails.append("idle.frames 48-144")
    if not 36 <= feed.get("frames", 0) <= 96:
        fails.append("feed.frames 36-96")
    if idle.get("cycles", 0) < 1 or int(idle.get("cycles", 0)) != idle.get("cycles"):
        fails.append("idle.cycles whole number >=1")
    if not feed.get("technique"):
        fails.append("feed.technique must describe how this body plan eats")
    sulk = s["motion"].get("sulk", {})
    if not 48 <= sulk.get("frames", 0) <= 144:
        fails.append("sulk.frames 48-144")
    if sulk.get("cycles", 0) < 1 or int(sulk.get("cycles", 0)) != sulk.get("cycles"):
        fails.append("sulk.cycles whole number >=1")
    if not sulk.get("technique"):
        fails.append("sulk.technique must describe how this body plan mopes")
    if s.get("symmetry", "bilateral") not in {"bilateral", "radial"}:
        fails.append("symmetry must be bilateral|radial")
    if s.get("mouth", "front") not in {"front", "underside"}:
        fails.append("mouth must be front|underside")
    if "eye" in s and not 0.08 <= s["eye"].get("ratio", 0.1) <= 0.12:
        fails.append("eye.ratio 0.08-0.12 (STYLE)")
    mat = s.get("material", {})
    if not 0.25 <= mat.get("roughness", 0.35) <= 0.55:
        fails.append("material.roughness 0.25-0.55 (STYLE)")
    if not 0 <= mat.get("coat", 0.35) <= 0.6:
        fails.append("material.coat 0-0.6 (STYLE)")
    if s["budget"].get("tris", 1e9) > TRIS.get(s["rarity"], 0):
        fails.append("tris over rarity budget")
    fails += _rest(s)
    # uniqueness vs. roster: idle length/cycles combo should differ from shipped creatures
    roster = os.path.join(root, "roster.json")
    if os.path.exists(roster):
        for c in json.load(open(roster))["models"]:
            if c["id"] == s["id"] or c.get("kind", "creature") != "creature":
                continue
            p = os.path.join(root, c["spec"])
            if os.path.exists(p):
                o = json.load(open(p))["motion"]["idle"]
                if (o.get("frames"), o.get("cycles")) == (idle.get("frames"), idle.get("cycles")):
                    fails.append(f"idle loop identical to {c['id']}; vary frames or cycles")
    return {"gate": "spec-check", "pass": not fails, "fails": fails}


REST_ON = {"lie": {"sand"}, "cling": {"rock", "branch", "prop"}, "hang": {"branch", "prop"}}


def _rest(s: dict[str, Any]) -> list[str]:
    """Optional creature `rest` (models/creature/CONTRACT.md "Resting"; docs/design/creature-rest.md)."""
    r = s.get("rest")
    if r is None:
        return []  # never rests; a rooted creature without rest stands on the sand
    f = []
    if not isinstance(r, dict):
        return ["rest must be an object {on, pose, why, share?, bout_s?}"]
    pose, on = r.get("pose"), r.get("on")
    if pose not in REST_ON:
        f.append("rest.pose must be cling|lie|hang")
    elif on not in REST_ON[pose]:
        f.append(f"rest.on {on} doesn't fit pose {pose} (allowed: {sorted(REST_ON[pose])})")
    if not str(r.get("why", "")).strip():
        f.append("rest.why: one sentence on how the real animal rests")
    share = r.get("share", 0.35)
    if not isinstance(share, (int, float)) or not 0 < share <= 1:
        f.append("rest.share must be > 0 and <= 1")
    elif (share == 1) != (s["locomotion"] == "rooted"):
        f.append("rest.share 1 (sessile) and locomotion rooted go together")
    b = r.get("bout_s", [10, 25])
    if not (
        isinstance(b, list) and len(b) == 2 and all(isinstance(x, (int, float)) for x in b) and 3 <= b[0] <= b[1] <= 300
    ):
        f.append("rest.bout_s must be [min, max] seconds, 3-300")
    if (pose == "hang" or s["locomotion"] == "fly") and not s["motion"].get("perch"):
        f.append("motion.perch required (hanging or flying creatures can't rest on their idle)")
    p = s["motion"].get("perch")
    if p:
        if not 48 <= p.get("frames", 0) <= 144:
            f.append("perch.frames 48-144")
        if p.get("cycles", 0) < 1 or int(p.get("cycles", 0)) != p.get("cycles"):
            f.append("perch.cycles whole number >=1")
        if not p.get("technique"):
            f.append("perch.technique must describe the resting body (wings folded, tentacles fanned...)")
    return f


LIBRARY_REASON_MIN = 20  # characters: a real sentence, not "ok"


def _plant(s: dict[str, Any], fails: list[str], root: str) -> dict[str, Any]:
    """Plant contract (models/plant/CONTRACT.md): per-stage sway loops + a tend reaction, and the species' own
    generator (archetype == id, models/plant/archetypes/<id>.py, copied from a growth form named in `based_on`).
    Building straight on a library growth form needs notes.why_library_form: why that form, as is, is the species."""
    arch_dir = os.path.join(root, "plant", "archetypes")
    if s["archetype"] == s["id"]:
        if not os.path.exists(os.path.join(arch_dir, s["id"] + ".py")):
            fails.append(
                f"archetype {s['id']}: write models/plant/archetypes/{s['id']}.py (the species' own generator)"
            )
        if not os.path.exists(os.path.join(arch_dir, str(s.get("based_on", "")) + ".py")):
            fails.append("based_on must name the growth form the generator was copied from (models/plant/archetypes/)")
    else:
        why = str((s.get("notes") or {}).get("why_library_form", "")).strip()
        if len(why) < LIBRARY_REASON_MIN:
            fails.append(
                f"archetype {s['archetype']} is a shared growth form: give the species its own generator "
                f"(archetype = id, based_on = the form) or say in notes.why_library_form why the form as is is the species"
            )
    sw = s["motion"].get("sway", {})
    td = s["motion"].get("tend", {})
    if not 48 <= sw.get("frames", 0) <= 144:
        fails.append("motion.sway.frames 48-144")
    if sw.get("cycles", 0) < 1 or int(sw.get("cycles", 0)) != sw.get("cycles"):
        fails.append("motion.sway.cycles whole number >=1")
    if not 24 <= td.get("frames", 0) <= 72:
        fails.append("motion.tend.frames 24-72")
    if s["budget"].get("tris", 1e9) > TRIS.get(s["rarity"], 0):
        fails.append("tris over rarity budget")
    return {"gate": "spec-check", "pass": not fails, "fails": fails}


def _scenery(s: dict[str, Any], fails: list[str]) -> dict[str, Any]:
    """Scenery contract (models/scenery/CONTRACT.md): one prop, small budget, optional seamless sway."""
    if "height_m" not in s["size"]:
        fails.append("size.height_m required (ground to top)")
    if s["budget"].get("tris", 1e9) > 3000:
        fails.append("budget.tris <= 3000 (scenery)")
    if s["budget"].get("texture", 512) > 512:
        fails.append("budget.texture <= 512 (scenery)")
    sw = (s.get("motion") or {}).get("sway")
    if (
        sw and sw.get("mode") == "shader"
    ):  # Ecosystem vertex shader: amp is a fraction of the prop's size, period in seconds
        if not 0.01 <= sw.get("amp", 0) <= 0.15:
            fails.append("motion.sway.amp 0.01-0.15 (fraction of size)")
        if not 3 <= sw.get("period_s", 0) <= 12:
            fails.append("motion.sway.period_s 3-12")
        if not 0 <= sw.get("lift", 0) <= 1:
            fails.append("motion.sway.lift 0-1")
    elif sw:
        if not 48 <= sw.get("frames", 0) <= 144:
            fails.append("motion.sway.frames 48-144")
        if sw.get("cycles", 0) < 1 or int(sw.get("cycles", 0)) != sw.get("cycles"):
            fails.append("motion.sway.cycles whole number >=1")
    sit = s.get("sit") or {}
    if sit.get("mode") not in ("upright", "follow", "drape"):
        fails.append("sit.mode upright|follow|drape (how it rests on the ground; see scenery/CONTRACT.md)")
    if len(str(sit.get("why", "")).split()) < 6:
        fails.append("sit.why: reason from the real thing (what holds it, is it rigid, does it hug bumps)")
    if sw:
        if len(str(sw.get("personality", "")).split()) < 4:
            fails.append(
                "motion.sway.personality: a sentence on how it should move (the judges grade sway_readable against it)"
            )
    if not isinstance(s.get("pass_through", False), bool):
        fails.append("pass_through must be true|false")
    mat = s.get("material", {})
    if not 0.25 <= mat.get("roughness", 0.5) <= 0.55:
        fails.append("material.roughness 0.25-0.55 (STYLE)")
    return {"gate": "spec-check", "pass": not fails, "fails": fails}


if __name__ == "__main__":
    r = main(sys.argv[1])
    print(json.dumps(r, indent=1))
    sys.exit(0 if r["pass"] else 1)
