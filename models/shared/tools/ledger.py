"""Run ledger: the single source of truth for a pipeline run's budget and judge freshness.
Agents must not count builds or minutes in their heads; every build goes through it (build.py --run <id>) and every
G5 judge is recorded here.

Usage: python3 models/shared/tools/ledger.py start  <run_id> [--builds 8] [--minutes 120]
       python3 models/shared/tools/ledger.py build  <run_id> <creature_id>      # exit 4 + "BUDGET EXHAUSTED" when spent
       python3 models/shared/tools/ledger.py judge  <run_id> <creature_id> <agent_id>   # exit 5 if agent_id already judged
       python3 models/shared/tools/ledger.py status <run_id>
State: models/out/runs/<run_id>.json. Exit codes: 0 ok, 2 usage / unknown or duplicate run, 4 budget, 5 reused judge."""
import json, os, sys, time, re

RUNS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "out", "runs")  # models/out/runs

def _path(run_id):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", run_id): raise SystemExit(f"bad run_id {run_id!r}")
    return os.path.join(RUNS, run_id + ".json")

def _load(run_id):
    p = _path(run_id)
    if not os.path.exists(p): return None
    return json.load(open(p))

def _save(st):
    os.makedirs(RUNS, exist_ok=True); p = _path(st["run_id"]); tmp = p + ".tmp"
    json.dump(st, open(tmp, "w"), indent=1); os.replace(tmp, p)

def _now(): return time.time()

def _summary(st):
    mins = (_now() - st["started_at"]) / 60
    return {"run_id": st["run_id"], "builds_used": len(st["builds"]), "builds_max": st["builds_max"],
            "builds_left": max(0, st["builds_max"] - len(st["builds"])), "minutes_used": round(mins, 1),
            "minutes_max": st["minutes_max"], "exhausted": len(st["builds"]) >= st["builds_max"] or mins >= st["minutes_max"],
            "judges": len(st["judges"])}

def start(run_id, builds=6, minutes=90):
    if _load(run_id) is not None: return False, f"run {run_id} already exists (a run's budget is never reset)"
    _save({"run_id": run_id, "started_at": _now(), "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "builds_max": int(builds), "minutes_max": float(minutes), "builds": [], "judges": [], "refused": []})
    return True, f"run {run_id} started: {builds} builds, {minutes} minutes"

def record_build(run_id, creature_id):
    """Called by build.py --run before any Blender work. Returns (ok, message)."""
    st = _load(run_id)
    if st is None: return False, f"BUDGET EXHAUSTED: unknown run {run_id} (start it with ledger.py start)"
    s = _summary(st)
    if s["exhausted"]:
        st["refused"].append({"kind": "build", "creature": creature_id, "at": time.strftime("%H:%M:%S")}); _save(st)
        return False, f"BUDGET EXHAUSTED: {s['builds_used']}/{s['builds_max']} builds, {s['minutes_used']}/{s['minutes_max']:g} min"
    st["builds"].append({"n": len(st["builds"]) + 1, "creature": creature_id, "at": time.strftime("%H:%M:%S"),
                         "minute": s["minutes_used"]}); _save(st)
    return True, f"build {len(st['builds'])}/{st['builds_max']} ({creature_id}), {s['minutes_used']}/{s['minutes_max']:g} min used"

def record_judge(run_id, creature_id, agent_id):
    st = _load(run_id)
    if st is None: return False, f"unknown run {run_id}"
    prev = next((j for j in st["judges"] if j["agent_id"] == agent_id), None)
    if prev:
        st["refused"].append({"kind": "judge", "creature": creature_id, "agent_id": agent_id, "at": time.strftime("%H:%M:%S")}); _save(st)
        return False, f"REFUSED: judge agent {agent_id} already judged {prev['creature']} (judge #{prev['n']}); spawn a fresh judge"
    st["judges"].append({"n": len(st["judges"]) + 1, "creature": creature_id, "agent_id": agent_id,
                         "at": time.strftime("%H:%M:%S")}); _save(st)
    return True, f"judge {len(st['judges'])} recorded: {agent_id} -> {creature_id}"

def main(argv):
    if not argv: print(__doc__); return 2
    cmd, rest = argv[0], argv[1:]
    def opt(name, default):
        if name in rest: i = rest.index(name); v = rest[i + 1]; del rest[i:i + 2]; return v
        return default
    if cmd == "start":
        b, m = opt("--builds", 8), opt("--minutes", 120)
        if len(rest) != 1: print(__doc__); return 2
        ok, msg = start(rest[0], b, m); print(msg); return 0 if ok else 2
    if cmd == "build" and len(rest) == 2:
        ok, msg = record_build(*rest); print(msg); return 0 if ok else 4
    if cmd == "judge" and len(rest) == 3:
        ok, msg = record_judge(*rest); print(msg)
        return 0 if ok else (2 if msg.startswith("unknown") else 5)
    if cmd == "status" and len(rest) == 1:
        st = _load(rest[0])
        if st is None: print(f"unknown run {rest[0]}"); return 2
        print(json.dumps(dict(_summary(st), builds=st["builds"], judges=st["judges"], refused=st["refused"]), indent=1)); return 0
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
