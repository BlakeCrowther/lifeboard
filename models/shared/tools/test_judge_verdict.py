"""Self-check for judge_verdict.py on synthetic judgements. Run: python3 models/shared/tools/test_judge_verdict.py"""

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judge_verdict as jv

RULE = {"criteria": ["shape", "motion"], "floor": 2, "bar": 3.0, "judges": 3}


def panel(*scores: tuple[int, int | None], **extra: Any) -> list[tuple[str, dict[str, Any]]]:
    return [(f"judge{i}", dict(shape=s, motion=m, notes=[], fix=[], **extra)) for i, (s, m) in enumerate(scores)]


def refuses(rule: dict[str, Any], judgements: list[tuple[str, dict[str, Any]]]) -> bool:
    try:
        jv.verdict(rule, judgements)
    except jv.NoVerdict:
        return True
    return False


v = jv.verdict(RULE, panel((4, 3), (3, 3), (4, 2)))
assert v["pass"] and v["medians"] == {"shape": 4, "motion": 3} and v["mean_of_medians"] == 3.5, v

v = jv.verdict(RULE, panel((5, 1), (5, 1), (5, 3)))
assert not v["pass"] and v["failed"] == ["floor: motion median 1 < 2"], v

v = jv.verdict(RULE, panel((3, 2), (3, 3), (3, 2)))
assert not v["pass"] and v["failed"] == ["bar: mean of medians 2.50 < 3.0"], v

assert refuses(RULE, panel((4, 3), (4, 3))), "fewer judgements than pass_rule.judges must give no verdict"
assert refuses(RULE, panel((4, 3), (4, 3), (4, 9))), "a score outside 1-5 must give no verdict"

v = jv.verdict(RULE, panel((4, 3), (3, 3), (4, 2), retired_criterion=False))
assert v["pass"] and v["ignored_keys"] == ["retired_criterion"], "keys outside the criteria must not affect the verdict"

v = jv.verdict(dict(RULE, bar=None, floor=3), panel((3, None), (4, None), (3, None)))
assert v["pass"] and v["not_applicable"] == ["motion"], "a criterion most judges score null is left out"

fixes = [
    [{"criterion": "shape", "fix": "taller dorsal"}],
    [{"criterion": "motion", "fix": "slower tail"}],
    ["fork the tail"],
]
j = [(f"judge{i}", dict(shape=4, motion=2, fix=f)) for i, f in enumerate(fixes)]
assert list(jv.verdict(RULE, j)["fixes"]) == ["motion", "shape", "general"], (
    "fixes are keyed by criterion, lowest median first"
)

# The ledger's notes/plan/best must reach the same verdict (its own floor-only copy of the rule drifted before: all 3s
# passed there while under the creature bar).
import tempfile

import ledger

ledger.RUNS = tempfile.mkdtemp()
rule = jv.load_rule("creature")
ok_reply = {c: 4 for c in rule["criteria"]}
all_threes = {c: 3 for c in rule["criteria"]}
for name, reply in (("pass", ok_reply), ("threes", all_threes)):
    run = f"selfcheck-{name}"
    ledger.start(run)
    ledger.record_build(run, "clownfish")
    for a in range(rule["judges"]):
        ledger.record_judge(run, "clownfish", f"{name}{a}", reply=reply)
    want = jv.verdict(rule, [(f"{name}{a}", reply) for a in range(rule["judges"])])["pass"]
    assert ledger.best(run, "clownfish")[0] == want, f"ledger best disagrees with judge_verdict on {name}"
    v = jv.from_ledger(rule, run, "clownfish")
    assert v["pass"] == want, f"judge_verdict ledger mode disagrees on {name}"

print("judge_verdict self-check ok")
