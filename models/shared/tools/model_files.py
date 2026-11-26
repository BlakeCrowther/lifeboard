"""Where a board's model files live; the Python twin of model-files.ts.

Published paths (`models/roster.json`, `models/assets/x-glb.js`) never change. On disk they come from layers:
`models/board/` (one board's own models, absent in the public repo), `models/starter/` (the starter set) and
`models/` itself (goldens and pipeline files). See models/README.md "Layout".
"""

from pathlib import Path

MODELS = Path(__file__).resolve().parents[2]
BOARD = MODELS / "board"
STARTER = MODELS / "starter"


def model_dir(models: Path = MODELS) -> Path:
    """The model dir in use: `board/` once it has a roster.json, else `starter/`. Writers of shipped models use BOARD."""
    return models / "board" if (models / "board" / "roster.json").exists() else models / "starter"


def resolve(rel: str, models: Path = MODELS) -> Path | None:
    """Local path of a path relative to `models/` as published (`roster.json`, `assets/x-glb.js`): the first existing of
    board, starter, then `models/` itself. None when none exists."""
    return next((p for p in (models / "board" / rel, models / "starter" / rel, models / rel) if p.exists()), None)


if __name__ == "__main__":
    import sys

    # for shell scripts: `model_files.py dir` | `board` | `resolve <rel>` (prints a path; resolve exits 1 when nothing exists)
    cmd, *rest = sys.argv[1:] or [""]
    if cmd == "dir":
        print(model_dir())
    elif cmd == "board":
        print(BOARD)
    elif cmd == "resolve" and rest:
        found = resolve(rest[0])
        print(found or "")
        sys.exit(0 if found else 1)
    else:
        sys.exit("usage: model_files.py dir | board | resolve <rel>")
