# Skill evals

An **eval** runs one skill against a fixed input (a **case**) in a throwaway sandbox and grades what it wrote. It answers "did this edit to a skill or prompt make the output better or worse?". Evals cost tokens, so they are **not** part of `pnpm verify`; run them when you change a skill, a contract, or a grader.

Only skills whose output a script can grade have evals:

| Skill | Output graded | Script grader reused |
|---|---|---|
| `creature-brief` | creature spec JSON | `models/shared/tools/check_spec.py` |
| `plant-brief` | plant spec JSON | `models/shared/tools/check_spec.py` |
| `biome-brief` | a new `biomes.json` entry | `models/shared/tools/check_biome.py` |
| `lesson-make` | `sources` + `lessons` rows | `src/packages/db/schema.ts` (`validate`) |

Not here: the model skills whose output is a 3D model. Their judge-panel goldens (`models/<kind>/qa_calibration.json` plus `calibration/*/contact.png`) already act as that eval set; see `models/README.md`.

## Run

```bash
node evals/run.ts --self-test                 # graders on committed good/bad fixtures; free, deterministic, no Claude
node evals/run.ts creature-brief              # every case of one skill (live: calls Claude)
node evals/run.ts biome-brief --case after-reset
node evals/run.ts all --no-rubric             # scripts only: skips the LLM rubric
```

Flags: `--model sonnet` (the skill run), `--judge-model sonnet` (the rubric), `--max-usd 3` (cap per skill run), `--keep` (keep the sandbox). Results print as a table (script checks passed, rubric criteria passed, cost, time, turns, tokens) and are written to `evals/out/<timestamp>/` (gitignored). Exit code 1 if any case fails.

A live run does this per case: copy the frozen world (`evals/fixtures/world`, synthetic biomes, roster and specs) plus the repo's current contracts, archetypes and graders into a temp dir; start `claude -p` there with the skill's text and the case inputs (sonnet, only file tools and the graders, project settings only); read what the skill wrote; run `grade.ts`. Nothing touches the real repo or any board.

Runner choice: `claude plugin eval` targets plugins, takes `case.yaml` plus markdown graders (LLM) and publishes a report to claude.ai by default, so it cannot call `check_spec.py` or the db `validate` and does not fit repo skills. This runner is about 200 lines and uses the same `claude` CLI.

## Layout

```
evals/
  run.ts  lib.ts         runner and shared helpers
  fixtures/world/        frozen sandbox: models/board/{biomes,roster,biomes.archive}.json, two specs (check_biome.py reads LOOKS from the real src/packages/ecosystem/lib/frames.ts, copied in)
  <skill>/
    grade.ts             task(), place(), collect(), checks() (script), rubric() (LLM)
    cases/*.json         fixed inputs
    fixtures/good-*.json outputs that must pass every script check
    fixtures/bad-*.json  broken outputs; `expect_fail` lists the checks that must catch them
```

Grading order: script checks first (cheap, exact), then a short LLM rubric only for what a script cannot judge (fits the biome, not a roster recolor, faithful to the source). A case passes only if every script check and every rubric criterion passes.

## Add a case

1. Add `evals/<skill>/cases/<name>.json`. Common keys: `name`, `skill`, `worldBiomes` (cut the frozen world to its first N biomes). Skill keys: creature `biome`, `rarity`; plant also `habit`, `season`, `plot`, `gen`; lesson `type`, `title`, `source`, `ladder`, `countRange`, `today`, `created_at`.
2. Use only synthetic or committed data. Never copy anything from a real board.
3. Run it live once. If it fails for a good reason, fix the skill; if the grader was wrong, fix the grader and add a fixture that shows why.

## Add or change a check

Put it in the skill's `grade.ts`. Every new check needs a bad fixture that trips it (`expect_fail`), or `--self-test` cannot prove it bites. `--self-test` also fails if a skill has no good or no bad fixture, or an empty rubric.

## Cost

A creature or plant case is one skill run (about a dozen turns of reading and writing) plus one small rubric call; a biome case reads more. Expect cents to a dollar per case on sonnet; `all` is 10 cases. The self-test is free. These figures are estimates: the live path was not run end to end when this landed (see `LESSONS.md`), so measure the first real run and update this section.

A later change adds a `pnpm eval` script; until then call `node` directly.
