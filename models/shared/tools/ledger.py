"""Run ledger: the single source of truth for a pipeline run's budget and judge freshness.
Agents must not count builds or minutes in their heads; every build goes through it (build.py --run <id>) and every
The judge-panel result is recorded here.

Usage: python3 models/shared/tools/ledger.py start  <run_id> [--rounds 4] [--minutes 30]
       python3 models/shared/tools/ledger.py build  <run_id> <creature_id>      # exit 4 + "BUDGET EXHAUSTED" when spent
       python3 models/shared/tools/ledger.py judge  <run_id> <creature_id> <agent_id> [--reply '<judge JSON>'|@file|-]   (- = stdin)   # exit 5 if agent_id already judged
       python3 models/shared/tools/ledger.py notes  <run_id> [<id>]   # every judged build's medians + every fix, by the criterion it raises
       python3 models/shared/tools/ledger.py plan   <run_id> <id> --fixes artifacts[,sway_readable] [--skip "reads_as: why"] "<what the next build changes>"
       python3 models/shared/tools/ledger.py best   <run_id> <id>     # the passing build to ship (highest mean, ties: newer) + its snapshot
       python3 models/shared/tools/ledger.py best   <run_id> <id> --below-bar   # budget spent, nothing passed: the best judged build (never empty-handed)
       python3 models/shared/tools/ledger.py status <run_id>
       python3 models/shared/tools/ledger.py wait   <run_id> <seconds>   # time queued for a build slot (slots.py records it)
Run log: a judge recorded with --reply is filed under the latest build; judges tag each fix with the criterion it raises
(or "placement" for runtime placement, which plans ignore). After a build is judged, the next build is refused (exit 6,
PLAN NEEDED) until `plan` names the criteria it fixes; `plan` refuses unless one of the build's lowest-median criteria is
fixed or skipped with a reason. A plan after a passing build (judge_verdict.py's verdict under the kind's pass_rule) is a polish round (max 2;
retries after a failed build don't count) and first snapshots out/<id>/ to out/runs/<run_id>/build<N>/.
Budget: judge rounds (a round = a counted build that judges saw), wall-clock minutes less time queued for a build slot
(slots.py), at most rounds+2 counted builds, and
at most 5 uncounted preflight trial builds between counted ones. Tokens go to judge rounds, so rounds are the limit.
State: models/out/runs/<run_id>.json. Exit codes: 0 ok, 2 usage / unknown or duplicate run, 4 budget, 5 reused judge, 6 plan needed / refused."""

import json
import os
import re
import shutil
import statistics
import sys
import time
from collections.abc import Iterator
from typing import Any

RUNS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "out", "runs"
)  # models/out/runs
MODELS = os.path.dirname(os.path.dirname(RUNS))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judge_verdict  # the pass rule lives there (numbers in models/<kind>/qa_calibration.json); the ledger never restates it


def _path(run_id: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", run_id):
        raise SystemExit(f"bad run_id {run_id!r}")
    return os.path.join(RUNS, run_id + ".json")


def load_run(run_id: str) -> dict[str, Any] | None:
    p = _path(run_id)
    if not os.path.exists(p):
        return None
    return json.load(open(p))


def _save(st: dict[str, Any]) -> None:
    os.makedirs(RUNS, exist_ok=True)
    p = _path(st["run_id"])
    tmp = p + ".tmp"
    json.dump(st, open(tmp, "w"), indent=1)
    os.replace(tmp, p)


def _now() -> float:
    return time.time()


PREVIEWS_PER_ROUND = 5  # uncounted trial builds allowed between two counted builds
EXTRA_BUILDS = 2  # counted builds that may fail the code gates (no judging) beyond one per round


def _rounds(st: dict[str, Any]) -> int:
    """Judge rounds used: distinct builds that carry at least one judge."""
    return len({j.get("build") for j in st["judges"] if j.get("build")})


def _summary(st: dict[str, Any]) -> dict[str, Any]:
    mins = (_now() - st["started_at"] - st.get("waited_s", 0.0)) / 60
    if "rounds_max" not in st:  # runs started before rounds existed: builds were the limit
        return {
            "run_id": st["run_id"],
            "builds_used": len(st["builds"]),
            "builds_max": st["builds_max"],
            "minutes_used": round(mins, 1),
            "minutes_max": st["minutes_max"],
            "exhausted": len(st["builds"]) >= st["builds_max"] or mins >= st["minutes_max"],
            "judges": len(st["judges"]),
        }
    rmax, used = st["rounds_max"], _rounds(st)
    return {
        "run_id": st["run_id"],
        "rounds_used": used,
        "rounds_max": rmax,
        "builds_used": len(st["builds"]),
        "builds_cap": rmax + EXTRA_BUILDS,
        "minutes_used": round(mins, 1),
        "minutes_max": st["minutes_max"],
        "minutes_queued": round(st.get("waited_s", 0.0) / 60, 1),
        "exhausted": used >= rmax or len(st["builds"]) >= rmax + EXTRA_BUILDS or mins >= st["minutes_max"],
        "judges": len(st["judges"]),
    }


def start(run_id: str, rounds: int = 4, minutes: int = 30) -> tuple[bool, str]:
    if load_run(run_id) is not None:
        return False, f"run {run_id} already exists (a run's budget is never reset)"
    _save(
        {
            "run_id": run_id,
            "started_at": _now(),
            "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "rounds_max": int(rounds),
            "minutes_max": float(minutes),
            "builds": [],
            "judges": [],
            "refused": [],
            "previews": [],
        }
    )
    return True, f"run {run_id} started: {rounds} judge rounds, {minutes} minutes"


def add_wait(run_id: str, seconds: float) -> tuple[bool, str]:
    """Credit time spent queued for a build slot: it doesn't count toward the run's minutes."""
    st = load_run(run_id)
    if st is None:
        return False, f"unknown run {run_id}"
    st["waited_s"] = st.get("waited_s", 0.0) + max(0.0, float(seconds))
    _save(st)
    return True, f"queued {seconds:.0f} s for a build slot ({st['waited_s'] / 60:.1f} min in all, not counted)"


def record_build(run_id: str, creature_id: str) -> tuple[bool, str]:
    """Called by build.py --run before any Blender work. Returns (ok, message)."""
    st = load_run(run_id)
    if st is None:
        return False, f"BUDGET EXHAUSTED: unknown run {run_id} (start it with ledger.py start)"
    last = st["builds"][-1]["n"] if st["builds"] else 0
    if (
        last
        and any(j.get("build") == last and j.get("reply") for j in st["judges"])
        and not any(p["after_build"] == last for p in st.get("plans", []))
    ):
        return (
            False,
            f"PLAN NEEDED: build {last} was judged; run `ledger.py notes {run_id}` then `ledger.py plan {run_id} {creature_id} --fixes ...` before rebuilding",
        )
    s = _summary(st)
    if s["exhausted"]:
        st["refused"].append({"kind": "build", "creature": creature_id, "at": time.strftime("%H:%M:%S")})
        _save(st)
        lim = (
            f"{s['rounds_used']}/{s['rounds_max']} judge rounds, {s['builds_used']}/{s['builds_cap']} builds"
            if "rounds_max" in s
            else f"{s['builds_used']}/{s['builds_max']} builds"
        )
        return False, f"BUDGET EXHAUSTED: {lim}, {s['minutes_used']}/{s['minutes_max']:g} min"
    st["builds"].append(
        {
            "n": len(st["builds"]) + 1,
            "creature": creature_id,
            "at": time.strftime("%H:%M:%S"),
            "at_s": _now(),
            "minute": s["minutes_used"],
        }
    )
    _save(st)
    cap = (
        f"round {s['rounds_used'] + 1}/{s['rounds_max']}"
        if "rounds_max" in s
        else f"{len(st['builds'])}/{st['builds_max']}"
    )
    return True, f"build {len(st['builds'])} ({creature_id}, {cap}), {s['minutes_used']}/{s['minutes_max']:g} min used"


def record_preview(run_id: str, creature_id: str) -> tuple[bool, str]:
    """An uncounted trial build (build.py --preview): refused only when the run's minutes are spent."""
    st = load_run(run_id)
    if st is None:
        return False, f"BUDGET EXHAUSTED: unknown run {run_id}"
    s = _summary(st)
    if s["minutes_used"] >= s["minutes_max"]:
        return False, f"BUDGET EXHAUSTED: {s['minutes_used']}/{s['minutes_max']:g} min"
    last = st["builds"][-1]["at_s"] if st["builds"] and "at_s" in st["builds"][-1] else 0
    since = [p for p in st.get("previews", []) if p.get("at_s", 0) >= last]
    if len(since) >= PREVIEWS_PER_ROUND:
        return (
            False,
            f"PREVIEW CAP: {len(since)} trial builds since the last counted build; rethink the design (spec or archetype) instead of nudging numbers",
        )
    st.setdefault("previews", []).append(
        {"creature": creature_id, "at": time.strftime("%H:%M:%S"), "at_s": _now(), "minute": s["minutes_used"]}
    )
    _save(st)
    return True, f"preview {len(st['previews'])} (uncounted), {s['minutes_used']}/{s['minutes_max']:g} min used"


def record_judge(run_id: str, creature_id: str, agent_id: str, reply: dict[str, Any] | None = None) -> tuple[bool, str]:
    st = load_run(run_id)
    if st is None:
        return False, f"unknown run {run_id}"
    prev = next((j for j in st["judges"] if j["agent_id"] == agent_id), None)
    if prev:
        st["refused"].append(
            {"kind": "judge", "creature": creature_id, "agent_id": agent_id, "at": time.strftime("%H:%M:%S")}
        )
        _save(st)
        return (
            False,
            f"REFUSED: judge agent {agent_id} already judged {prev['creature']} (judge #{prev['n']}); spawn a fresh judge",
        )
    j = {"n": len(st["judges"]) + 1, "creature": creature_id, "agent_id": agent_id, "at": time.strftime("%H:%M:%S")}
    j["build"] = st["builds"][-1]["n"] if st["builds"] else 0
    if reply is not None:
        j["reply"] = reply
    st["judges"].append(j)
    _save(st)
    return True, f"judge {len(st['judges'])} recorded: {agent_id} -> {creature_id}"


ROUTED = "placement"  # judge fixes about how the Ecosystem package (src/packages/ecosystem) places copies (spacing, variety, sinking): the runtime's, not the model's


def _graded(st: dict[str, Any], cid: str | None = None) -> dict[Any, list[dict[str, Any]]]:
    """{build: [judge, ...]} for judges that carried a reply."""
    out = {}
    for j in st["judges"]:
        if j.get("reply") and (cid is None or j["creature"] == cid):
            out.setdefault(j["build"], []).append(j)
    return out


def _medians(js: list[dict[str, Any]]) -> tuple[dict[str, float], float]:
    keys = [k for k, v in js[0]["reply"].items() if isinstance(v, (int, float)) and not isinstance(v, bool)]
    med = {k: statistics.median(j["reply"].get(k, 0) for j in js) for k in keys}
    return med, round(sum(med.values()) / max(1, len(med)), 2)


def _kind(cid: str) -> str | None:
    """The model's kind, from its spec: <kind>/specs/[quarantined/|examples/]<id>.json, else out/[dryrun/]<id>/spec.json."""
    for k in ("creature", "plant", "scenery"):
        for sub in ("", "quarantined", "examples"):
            p = os.path.join(MODELS, k, "specs", sub, cid + ".json")
            if os.path.exists(p):
                return json.load(open(p)).get("kind", k)
    for p in (os.path.join(MODELS, "out", cid, "spec.json"), os.path.join(MODELS, "out", "dryrun", cid, "spec.json")):
        if os.path.exists(p):
            return json.load(open(p)).get("kind", "creature")
    return None


def _judge(js: list[dict[str, Any]]) -> tuple[dict[str, float], float, bool | None]:
    """One build's replies under the kind's pass rule: (medians, mean of medians, passed). passed is None when there is
    no verdict (no spec found, or fewer usable replies than pass_rule.judges); the medians then cover every numeric key."""
    try:
        kind = _kind(js[0]["creature"])
        if kind is None:
            raise judge_verdict.NoVerdict("no spec")
        rule = judge_verdict.load_rule(kind)
        usable = [(j["agent_id"], j["reply"]) for j in js if not judge_verdict.problems(j["reply"], rule)]
        v = judge_verdict.verdict(rule, usable[-rule["judges"] :])
        return v["medians"], v["mean_of_medians"], v["pass"]
    except judge_verdict.NoVerdict:
        med, mean = _medians(js)
        return med, mean, None


def _fixes(j: dict[str, Any]) -> Iterator[tuple[str, str]]:
    """A judge's fixes as (criterion, text). Judges tag each fix with the criterion it raises; untagged ones are 'general'."""
    for f in j["reply"].get("fix") or []:
        yield (f.get("criterion", "general"), f.get("fix", "")) if isinstance(f, dict) else ("general", f)


def _lowest(med: dict[str, float]) -> list[str]:
    lo = min(med.values())
    return sorted(k for k, v in med.items() if v == lo)


def notes(run_id: str, cid: str | None = None) -> tuple[bool, str]:
    """Judged builds in order, then every fix grouped by the criterion it raises, oldest first (lowest median first)."""
    st = load_run(run_id)
    if st is None:
        return False, f"unknown run {run_id}"
    g = _graded(st, cid)
    if not g:
        return True, "nothing judged with --reply yet"
    lines, last = [], max(g)
    for b, js in sorted(g.items()):
        med, mean, passed = _judge(js)
        verdict = {True: "PASS", False: "FAIL", None: "NO VERDICT (too few usable replies or no spec)"}[passed]
        lines.append(
            f"build {b}: {len(js)} judges, mean {mean}, {verdict}  " + " ".join(f"{k}={v:g}" for k, v in med.items())
        )
    med, _, _ = _judge(g[last])
    order = sorted(med, key=lambda k: (med[k], k)) + ["general", ROUTED]
    lines.append(f"fixes by criterion (lowest first; `plan` must take one of {_lowest(med)}):")
    for c in order:
        rows = [(b, t) for b, js in sorted(g.items()) for j in js for cc, t in _fixes(j) if cc == c]
        if not rows:
            continue
        tag = (
            " (routed to the Ecosystem package (src/packages/ecosystem), not the model; plan ignores)"
            if c == ROUTED
            else f" (median now {med[c]:g})"
            if c in med
            else ""
        )
        lines.append(f"  {c}{tag}: asked in builds {sorted({b for b, _ in rows})}")
        lines += [f"    b{b}: {t}" for b, t in rows]
    return True, "\n".join(lines)


def plan(
    run_id: str, cid: str, fixes: list[str], skips: dict[str, str], summary: str, polish_max: int = 2
) -> tuple[bool, str]:
    st = load_run(run_id)
    if st is None:
        return False, f"unknown run {run_id}"
    g = _graded(st, cid)
    if not g:
        return False, "nothing judged with --reply yet; no plan needed"
    last = max(g)
    med, mean, passed = _judge(g[last])
    passed = bool(passed)
    bad = [x for x in fixes + list(skips) if x not in med]
    if bad:
        return False, f"PLAN REFUSED: {bad} are not criteria; use {sorted(med)}"
    lows = _lowest(med)
    if not any(c in fixes or c in skips for c in lows):
        return (
            False,
            f"PLAN REFUSED: build {last}'s lowest median is {lows} ({min(med.values()):g}); fix one of them or --skip it with a reason",
        )
    polish = sum(1 for p in st.get("plans", []) if p["creature"] == cid and p["passed"])
    if passed and polish >= polish_max:
        return (
            False,
            f"PLAN REFUSED: {polish} polish rounds used (plans after a passing build); run `ledger.py best` and ship",
        )
    snap = None
    if passed:
        src = os.path.join(os.path.dirname(RUNS), cid)
        snap = os.path.join(RUNS, run_id, f"build{last}")
        if os.path.isdir(src) and not os.path.exists(snap):
            shutil.copytree(src, snap, ignore=shutil.ignore_patterns("preview"))
        if not os.path.isdir(snap):
            snap = None
    st.setdefault("plans", []).append(
        {
            "after_build": last,
            "creature": cid,
            "fixes": fixes,
            "skips": skips,
            "summary": summary,
            "mean": mean,
            "passed": passed,
            "snapshot": snap,
            "at": time.strftime("%H:%M:%S"),
        }
    )
    _save(st)
    kind = f"polish round {polish + 1}/{polish_max}" if passed else "retry (failed build; not a polish round)"
    return True, f"plan after build {last} recorded, {kind} (fixes {fixes or '-'}; skips {list(skips) or '-'})" + (
        f"; passing build {last} snapshotted to {snap}" if snap else ""
    )


def best(run_id: str, cid: str, below_bar: bool = False) -> tuple[bool, str]:
    """The build to ship: the highest-mean passing build. below_bar: only once the run's budget is spent and no build
    passed, the highest-mean judged build instead, so the week still gets its model (shipped marked below bar)."""
    st = load_run(run_id)
    if st is None:
        return False, f"unknown run {run_id}"
    rows, judged = [], []
    for b, js in _graded(st, cid).items():
        _, mean, passed = _judge(js)
        judged.append((mean, b))
        if passed:
            rows.append((mean, b))
    if below_bar:
        if rows:
            return False, "a build passed: ship it with plain `best`, not --below-bar"
        if not _summary(st)["exhausted"]:
            return False, "budget not spent: keep retrying before shipping below the bar"
        rows = [r for r in judged if r[0] is not None]
    if not rows:
        return False, "no judged build" if below_bar else "no passing build"
    mean, b = max(rows)
    snap = os.path.join(RUNS, run_id, f"build{b}")
    latest = st["builds"][-1]["n"] if st["builds"] else 0
    where = f"out/{cid}/ (latest build)" if b == latest else (snap if os.path.isdir(snap) else "MISSING SNAPSHOT")
    return True, json.dumps({"build": b, "mean": mean, "files": where, **({"below_bar": True} if below_bar else {})})


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]

    def opt(name: str, default: str | None) -> str | None:
        if name in rest[:-1]:
            i = rest.index(name)
            v = rest[i + 1]
            del rest[i : i + 2]
            return v
        return default

    if cmd == "start":
        b, m = int(opt("--rounds", "4") or 4), int(opt("--minutes", "30") or 30)
        if len(rest) != 1:
            print(__doc__)
            return 2
        ok, msg = start(rest[0], b, m)
        print(msg)
        return 0 if ok else 2
    if cmd == "build" and len(rest) == 2:
        ok, msg = record_build(*rest)
        print(msg)
        return 0 if ok else (6 if msg.startswith("PLAN") else 4)
    if cmd == "notes" and len(rest) in (1, 2):
        ok, msg = notes(rest[0], rest[1] if len(rest) == 2 else None)
        print(msg)
        return 0 if ok else 2
    if cmd == "plan":
        fx = [x for x in (opt("--fixes", "") or "").split(",") if x]
        sk = {}
        while "--skip" in rest:
            v = opt("--skip", "") or ""
            k, _, why = v.partition(":")
            if not why.strip():
                print("--skip needs 'T<n>: reason'")
                return 2
            sk[k.strip()] = why.strip()
        if len(rest) != 3:
            print(__doc__)
            return 2
        ok, msg = plan(rest[0], rest[1], fx, sk, rest[2])
        print(msg)
        return 0 if ok else 6
    if cmd == "best" and len(rest) in (2, 3) and rest[2:] in ([], ["--below-bar"]):
        ok, msg = best(rest[0], rest[1], below_bar=rest[2:] == ["--below-bar"])
        print(msg)
        return 0 if ok else 2
    if cmd == "judge":
        rep = opt("--reply", None)
        if rep == "-":
            rep = "@/dev/stdin"
        if len(rest) != 3:
            print(__doc__)
            return 2
        if rep is not None:
            try:
                rep = json.loads(open(rep[1:]).read() if rep.startswith("@") else rep)
            except (ValueError, OSError) as e:
                print(f"bad --reply: {e}")
                return 2
        ok, msg = record_judge(*rest, reply=rep)
        print(msg)
        return 0 if ok else (2 if msg.startswith("unknown") else 5)
    if cmd == "wait" and len(rest) == 2:
        ok, msg = add_wait(rest[0], float(rest[1]))
        print(msg)
        return 0 if ok else 2
    if cmd == "status" and len(rest) == 1:
        st = load_run(rest[0])
        if st is None:
            print(f"unknown run {rest[0]}")
            return 2
        print(json.dumps(dict(_summary(st), builds=st["builds"], judges=st["judges"], refused=st["refused"]), indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
