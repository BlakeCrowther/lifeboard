#!/usr/bin/env bash
# Lint, format-check and type-check the model pipeline Python (models/**/*.py); config in pyproject.toml.
# Keeps going after a failure, exits 1 if any failed. Prints SKIP and exits 0 when uv is missing.
cd "$(dirname "$0")/.." || exit 2
if ! command -v uv >/dev/null; then echo "SKIP  python lint (uv not installed)"; exit 0; fi
fail=0
for cmd in "ruff check" "ruff format --check" "pyright"; do
  echo "--- uv run $cmd"
  # shellcheck disable=SC2086
  uv run $cmd || fail=1
done
exit $fail
