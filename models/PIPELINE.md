# Pipeline map

The map is [`pipeline.html`](pipeline.html): open it in a browser, or with the repo preview running at `/models/pipeline.html` (`?kind=creature|plant|scenery`). It shows every stage, what each gate checks (generated from the code), how the judge panel turns scores into a verdict (interactive), the run budget and loops, and the open weak spots.

Change the pipeline → update `pipeline.html` in the same commit and run `python3 models/shared/tools/render_pipeline_map.py`; `pnpm verify` checks it.

Judge-panel criteria, floor, bar and panel size per kind live only in `<kind>/qa_calibration.json` `pass_rule`; `judge_verdict.py` is the only thing that applies them, and `shared/tools/check_judge_rule.py` (run by `./setup.sh --check`) fails if a doc restates a rule number.
