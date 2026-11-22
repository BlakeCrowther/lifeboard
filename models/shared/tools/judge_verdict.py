"""judge-panel verdict: one model's recorded judgements -> pass/fail under its kind's pass rule.

The rule's numbers live only in models/<kind>/qa_calibration.json `pass_rule`
{criteria, floor, bar, judges}. Agents run this instead of computing medians themselves.
Rule: per criterion, the median of the judges' scores; pass when every median >= floor
and, unless bar is null, the mean of the medians >= bar.

A judgement is the judge's JSON reply: {<criterion>: 1-5 or null, "notes": [...], "fix": [{"criterion": c, "fix": "..."}]}.
null means "does not apply" (a static prop's motion); a criterion counts when most judges score it.
Keys outside pass_rule.criteria (e.g. a criterion an older prompt asked for) are ignored.

Usage: python3 models/shared/tools/judge_verdict.py <kind> <run_id> <model_id>        # from the run ledger
       python3 models/shared/tools/judge_verdict.py <kind> --files <judgement.json>...  # replay, calibration
Ledger mode reads the replies recorded with `ledger.py judge ... --reply` and uses the latest pass_rule.judges usable
ones since the model's latest build. Fix lists and plans are the ledger's job (`ledger.py notes`, `plan`).
Prints JSON on stdout. Exit 0 pass, 1 fail, 2 no verdict (usage, bad rule, too few usable judgements).
"""

import json
import os
import statistics
import sys
from typing import Any

TOOLS = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(os.path.dirname(TOOLS))
TEXT_KEYS = {"notes", "fix"}


class NoVerdict(Exception):
    pass


def load_rule(kind: str) -> dict[str, Any]:
    path = os.path.join(MODELS, kind, "qa_calibration.json")
    if not os.path.exists(path):
        raise NoVerdict(f"no {kind}/qa_calibration.json (kind must be creature|plant|scenery)")
    rule = json.load(open(path)).get("pass_rule") or {}
    crit, floor, bar, judges = (rule.get(k) for k in ("criteria", "floor", "bar", "judges"))
    if not (
        isinstance(crit, list)
        and crit
        and all(isinstance(c, str) for c in crit)
        and isinstance(floor, (int, float))
        and (bar is None or isinstance(bar, (int, float)))
        and isinstance(judges, int)
        and judges >= 1
    ):
        raise NoVerdict(f"{path} pass_rule needs criteria (list), floor (number), bar (number or null), judges (int)")
    return rule


def problems(judgement: object, rule: dict[str, Any]) -> list[str]:
    """Why a judgement can't be used, or [] when it can."""
    if not isinstance(judgement, dict):
        return ["not a JSON object"]
    out = []
    for c in rule["criteria"]:
        if c not in judgement:
            out.append(f"missing {c}")
        elif judgement[c] is not None and not (
            isinstance(judgement[c], int) and not isinstance(judgement[c], bool) and 1 <= judgement[c] <= 5
        ):
            out.append(f"{c} must be an integer 1-5 or null, got {judgement[c]!r}")
    if not out and all(judgement[c] is None for c in rule["criteria"]):
        out.append("no criterion scored")
    return out


def fixes_by_criterion(judgements: list[tuple[str, dict[str, Any]]], medians: dict[str, float]) -> dict[str, list[str]]:
    """Every fix, keyed by the criterion its judge tagged (untagged: "general"), lowest median first."""
    out = {}
    for _, j in judgements:
        for f in j.get("fix") or []:
            c, t = (f.get("criterion", "general"), f.get("fix", "")) if isinstance(f, dict) else ("general", f)
            if isinstance(t, str) and t.strip():
                out.setdefault(c, []).append(t)
    order = sorted(out, key=lambda c: (medians.get(c, float("inf")), c))
    return {c: out[c] for c in order}


def verdict(rule: dict[str, Any], judgements: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    """judgements: [(agent_id, judgement)], exactly rule['judges'] of them, each with no problems()."""
    n = len(judgements)
    if n != rule["judges"]:
        raise NoVerdict(f"pass_rule.judges is {rule['judges']}, got {n} judgement(s)")
    for agent, j in judgements:
        if problems(j, rule):
            raise NoVerdict(f"judgement {agent}: {'; '.join(problems(j, rule))}")
    medians, not_applicable = {}, []
    for c in rule["criteria"]:
        scores = [j[c] for _, j in judgements if j[c] is not None]
        if len(scores) * 2 > n:
            m = statistics.median(scores)
            medians[c] = int(m) if m == int(m) else m
        else:
            not_applicable.append(c)
    if not medians:
        raise NoVerdict("no criterion was scored by most judges")
    mean = sum(medians.values()) / len(medians)
    failed = [f"floor: {c} median {m} < {rule['floor']}" for c, m in medians.items() if m < rule["floor"]]
    if rule["bar"] is not None and mean < rule["bar"]:
        failed.append(f"bar: mean of medians {mean:.2f} < {rule['bar']}")
    ignored = sorted({k for _, j in judgements for k in j} - set(rule["criteria"]) - TEXT_KEYS)
    return {
        "pass": not failed,
        "failed": failed,
        "medians": medians,
        "mean_of_medians": round(mean, 2),
        "not_applicable": not_applicable,
        "ignored_keys": ignored,
        "rule": {k: rule[k] for k in ("floor", "bar", "judges")},
        "judges": [{"agent_id": a, "scores": {c: j[c] for c in rule["criteria"]}} for a, j in judgements],
        "fixes": fixes_by_criterion(judgements, medians),
    }


def from_ledger(rule: dict[str, Any], run_id: str, model_id: str) -> dict[str, Any]:
    sys.path.insert(0, TOOLS)
    import ledger

    st = ledger.load_run(run_id)
    if st is None:
        raise NoVerdict(f"unknown run {run_id}")
    latest_build = max((b["n"] for b in st["builds"] if b["creature"] == model_id), default=None)
    current = [j for j in st["judges"] if j["creature"] == model_id and j.get("build") == latest_build]
    usable, unusable = [], []
    for j in current:
        why = problems(j["reply"], rule) if "reply" in j else ["recorded without --reply"]
        (
            unusable.append({"agent_id": j["agent_id"], "problems": why})
            if why
            else usable.append((j["agent_id"], j["reply"]))
        )
    need = rule["judges"]
    if len(usable) < need:
        raise NoVerdict(
            f"{len(usable)} usable judgement(s) for {model_id} since build {latest_build}, need {need}: "
            f"spawn fresh judges and record each with ledger.py judge --reply. Unusable: {json.dumps(unusable)}"
        )
    out = verdict(rule, usable[-need:])
    out["unused"] = [a for a, _ in usable[:-need]] + [u["agent_id"] for u in unusable]
    return dict(out, run_id=run_id, model=model_id, build=latest_build)


def from_files(rule: dict[str, Any], paths: list[str]) -> dict[str, Any]:
    judgements = []
    for p in paths:
        try:
            judgements.append((os.path.basename(p), json.load(open(p))))
        except (OSError, ValueError) as e:
            raise NoVerdict(f"{p}: {e}") from e
    return verdict(rule, judgements)


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] == "--files":
        kind, mode, rest = argv[0], "files", argv[2:]
    elif len(argv) == 3:
        kind, mode, rest = argv[0], "ledger", argv[1:]
    else:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        rule = load_rule(kind)
        out = from_files(rule, rest) if mode == "files" else from_ledger(rule, *rest)
    except NoVerdict as e:
        print(f"NO VERDICT: {e}", file=sys.stderr)
        return 2
    print(json.dumps(dict(out, kind=kind), indent=1))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
