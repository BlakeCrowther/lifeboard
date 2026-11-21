"""judge-panel rule check: each kind's qa_calibration.json pass_rule is well formed, and no pipeline doc or skill
states a pass-rule number (median, mean, floor or bar threshold) itself; they point at the json instead.
Shape-check and motion-check thresholds (percent, frames, KB, fps, ...) are not judge rule numbers and are skipped.

Usage: python3 models/shared/tools/check_judge_rule.py      # exit 1 naming file:line for each stray number
"""
import re, sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parents[2]
KINDS = ("creature", "plant", "scenery")
DOCS = ["models/README.md", "models/PIPELINE.md", "models/pipeline.html", "models/STYLE.md", "AGENTS.md", *(f"models/{k}/CONTRACT.md" for k in KINDS)]
DOC_GLOBS = [".claude/skills/**/SKILL.md", ".claude/scheduled/*.md"]

NUMBER = r"\d+(?:\.\d+)?(?![\d.])(?!\s*(?:%|fps|frames?\b|kb\b|mb\b|px\b|cm\b|mm\b|deg\b|°|ms\b|s\b|×|x\b))"
STRAY = re.compile("|".join([
    rf"\bmedians?\b[^.;\n]{{0,30}}?(?:≥|>=|>|≤|<=|<)\s*{NUMBER}",
    rf"\bmean\b[^.;\n]{{0,40}}?(?:≥|>=|>|≤|<=|<)\s*{NUMBER}",
    rf"\b(?:floor|bar)\b`?\s*(?:\(|=|:|of|is)?\s*{NUMBER}",
    r"\d\.\d+\s*[−-]\s*\d*\.\d+\s*=\s*\d\.\d+",
]), re.IGNORECASE)


def stray_numbers():
    paths = [REPO / d for d in DOCS] + [p for g in DOC_GLOBS for p in sorted(REPO.glob(g))]
    for path in paths:
        if not path.exists(): continue
        text = path.read_text()
        # pipeline.html's data block is generated from the code (render_pipeline_map.py); only its hand-written part is checked
        text = re.sub(r'(<script id="pipeline-data"[^>]*>)(.*?)(</script>)', lambda m: m[1] + "\n" * m[2].count("\n") + m[3], text, flags=re.S)
        for n, line in enumerate(text.splitlines(), 1):
            m = STRAY.search(line)
            if m: yield f"{path.relative_to(REPO)}:{n}: '{m.group(0)}' (state it only in models/<kind>/qa_calibration.json pass_rule)"


def bad_rules():
    sys.path.insert(0, str(TOOLS))
    import judge_verdict
    for kind in KINDS:
        try: judge_verdict.load_rule(kind)
        except judge_verdict.NoVerdict as e: yield str(e)


if __name__ == "__main__":
    problems = list(bad_rules()) + list(stray_numbers())
    print("\n".join(problems) or "judge rule: one source, well formed")
    sys.exit(1 if problems else 0)
