#!/usr/bin/env python3
"""Validate models/biomes.json (all biomes, or one id). Exit 0 = PASS, 1 = FAIL. Warnings never fail.
Usage: python3 models/shared/tools/check_biome.py [biome_id]
Checks: ids 0..n-1 in order, required fields, medium, palette hex, scene is one habitat.js can build (LOOKS keys; optional
when `scenery` + `frame` are given), each `scenery` item is a roster model of kind scenery (or not built yet: warns) with a valid spread/scale/phase
and every phase 0..4 gets at least one piece, `frame` colours are hex,
`owns` motifs unique across biomes, unique names; warns when the main hue sits too close to a neighbour's.
Archive (biomes.archive.json, past games): reusing an archived name fails; an archived owned motif warns (biome-brief's
archive review decides, and must say why in its report)."""
import colorsys, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BIOMES = ROOT / "models" / "biomes.json"
ARCHIVE = ROOT / "models" / "biomes.archive.json"
HABITAT = ROOT / "habitat.js"
ROSTER = ROOT / "models" / "roster.json"
SPREADS = {"cluster", "scatter", "edge", "back"}
HEX = re.compile(r"#[0-9a-fA-F]{6}")
MEDIA = {"water", "land", "air"}
LOCO = {"swim", "drift", "crawl", "rooted", "walk", "fly", "climb", "burrow", "hop", "glide"}
LOOK_KEYS = ["shape", "palette", "ground", "owns", "creatures", "plants", "motion"]


def scenes():
    m = re.search(r"const LOOKS = \{(.*?)\};", HABITAT.read_text(), re.S)
    return set(re.findall(r"(\w+): \{", m.group(1))) if m else set()


def hue(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hls(r, g, b)[0] * 360


def main():
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    data = json.loads(BIOMES.read_text())
    bs, err, warn, known = data.get("biomes", []), [], [], scenes()
    for i, b in enumerate(bs):
        if b.get("id") != i:
            err.append(f"biome #{i}: id must be {i} (ids run 0..n-1 in order), got {b.get('id')}")
    arch = json.loads(ARCHIVE.read_text()).get("biomes", []) if ARCHIVE.exists() else []
    arch_names = {str(a.get("name", "")).lower() for a in arch}
    arch_owns = {m.strip().lower(): a.get("name") for a in arch for m in (a.get("look") or {}).get("owns", [])}
    owners, names = {}, {}
    for b in bs:
        for m in (b.get("look") or {}).get("owns", []):
            owners.setdefault(m.strip().lower(), []).append(b.get("id"))
        names.setdefault(str(b.get("name", "")).lower(), []).append(b.get("id"))
    for b in bs:
        bid = b.get("id")
        if only is not None and bid != only:
            continue
        p = f"biome {bid} ({b.get('name')})"
        sc = b.get("scenery")
        need = ["name", "medium", "light", "locomotion", "examples", "look"] + ([] if sc and b.get("frame") else ["scene"])
        for k in need:
            if not b.get(k):
                err.append(f"{p}: missing {k}")
        if b.get("medium") not in MEDIA:
            err.append(f"{p}: medium must be one of {sorted(MEDIA)}")
        bad = [x for x in b.get("locomotion", []) if x not in LOCO]
        if bad:
            err.append(f"{p}: unknown locomotion {bad} (known: {sorted(LOCO)})")
        if len(b.get("examples", [])) < 3:
            err.append(f"{p}: give at least 3 example species")
        if b.get("scene") and b["scene"] not in known:
            err.append(f"{p}: scene '{b['scene']}' has no builder in habitat.js (have: {sorted(known)})")
        if sc is not None:
            ros = {m["id"]: m for m in json.loads(ROSTER.read_text()).get("models", [])} if ROSTER.exists() else {}
            phases = set()
            for it in sc:
                i = it.get("id")
                if i not in ros:
                    warn.append(f"{p}: scenery '{i}' not built yet; set incomplete, the placer skips it (scenery-make retries)")
                elif ros[i].get("kind") != "scenery":
                    err.append(f"{p}: scenery '{i}' is a roster model of kind {ros[i].get('kind')!r}, not scenery")
                if it.get("spread", "scatter") not in SPREADS:
                    err.append(f"{p}: scenery '{i}' spread must be one of {sorted(SPREADS)}")
                lo, hi = it.get("scale", [1, 1])
                if not 0 < lo <= hi <= 4:
                    err.append(f"{p}: scenery '{i}' scale [min,max] with 0 < min <= max <= 4")
                if not 1 <= it.get("count", 1) <= 40:
                    err.append(f"{p}: scenery '{i}' count 1-40")
                ph = it.get("phases") or [it.get("phase"), it.get("phase")]
                if ph[0] is None or not (0 <= ph[0] <= ph[1] <= 4):
                    err.append(f"{p}: scenery '{i}' needs phase 0-4 or phases [first,last] (habitat grows by phase)")
                else:
                    phases |= set(range(ph[0], min(ph[1], ph[0] + it.get("count", 1) - 1) + 1))
            miss = sorted(set(range(5)) - phases)
            if miss:
                err.append(f"{p}: scenery leaves phase(s) {miss} empty; every phase must add something")
        fr = b.get("frame") or {}
        for c in [fr.get("ground")] + list(fr.get("water") or []):
            if c is not None and not HEX.fullmatch(c):
                err.append(f"{p}: frame colour {c} must be #rrggbb")
        look = b.get("look") or {}
        for k in LOOK_KEYS:
            if not look.get(k):
                err.append(f"{p}: look.{k} missing")
        pal = look.get("palette", [])
        if len(pal) != 4 or not all(re.fullmatch(r"#[0-9a-fA-F]{6}", c or "") for c in pal):
            err.append(f"{p}: look.palette must be 4 hex colours [sky/water, depth/horizon, ground, accent]")
        if len(look.get("owns", [])) < 3:
            err.append(f"{p}: look.owns needs at least 3 motifs")
        for m in look.get("owns", []):
            o = owners.get(m.strip().lower(), [])
            if len(o) > 1:
                err.append(f"{p}: motif '{m}' is also owned by biome(s) {[x for x in o if x != bid]}")
        if str(b.get("name", "")).lower() in arch_names:
            err.append(f"{p}: name was used by an archived biome; pick a new one")
        for m in look.get("owns", []):
            if m.strip().lower() in arch_owns:
                warn.append(f"{p}: motif '{m}' was owned by archived biome '{arch_owns[m.strip().lower()]}' (keep only with a reason)")
        if len(names.get(str(b.get("name", "")).lower(), [])) > 1:
            err.append(f"{p}: name already used")
        if len(pal) == 4 and all(re.fullmatch(r"#[0-9a-fA-F]{6}", c or "") for c in pal):
            for n in (bid - 1, bid + 1):
                if 0 <= n < len(bs):
                    q = (bs[n].get("look") or {}).get("palette", [])
                    if q and re.fullmatch(r"#[0-9a-fA-F]{6}", q[0] or ""):
                        d = abs(hue(pal[0]) - hue(q[0])) % 360
                        if min(d, 360 - d) < 15:
                            warn.append(f"{p}: main hue within 15° of neighbour biome {n}; consider a different hue family")
    for w in warn:
        print("WARN", w)
    for e in err:
        print("FAIL", e)
    print("PASS" if not err else f"FAIL ({len(err)})")
    sys.exit(1 if err else 0)


if __name__ == "__main__":
    main()
