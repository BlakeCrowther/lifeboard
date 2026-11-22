/* Skill evals runner. See evals/README.md.
   node evals/run.ts <skill|all> [--case <name>] [--model sonnet] [--judge-model sonnet] [--no-rubric] [--max-usd 3] [--keep]
   node evals/run.ts --self-test [<skill>]     graders on committed good/bad fixtures; no Claude, no cost, deterministic. */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVALS, SKILLS, loadCases, prepareWorkdir, readJson, runRubric, runSkill } from './lib.ts';
import type { Case, Check, SkillEval } from './lib.ts';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const selfTest = flag('self-test');
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--case', '--model', '--judge-model', '--max-usd'].includes(argv[i - 1]));
const target = positional[0] ?? (selfTest ? 'all' : '');
const skills = target === 'all' ? SKILLS : SKILLS.filter((s) => s === target);
if (!skills.length) {
  console.error(`usage: node evals/run.ts <${SKILLS.join('|')}|all> [--case x] | --self-test [skill]`);
  process.exit(2);
}

const load = async (skill: string): Promise<SkillEval> => (await import(`./${skill}/grade.ts`)).default;
const tmp = () => mkdtempSync(join(tmpdir(), 'lifeboard-eval-'));
const table = (rows: string[][]) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd());
};
const failing = (cs: Check[]) => cs.filter((c) => !c.ok);

async function selfTestSkill(skill: string): Promise<{ rows: string[][]; bad: number }> {
  const g = await load(skill);
  const dir = join(EVALS, skill, 'fixtures');
  const cases = new Map(loadCases(skill).map((c) => [c.name, c]));
  const rows: string[][] = [];
  let bad = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const fx = readJson(join(dir, f)) as { case: string; expect_fail?: string[]; output: any };
    const c = cases.get(fx.case) as Case;
    const wd = tmp();
    try {
      prepareWorkdir(wd, c);
      g.place(wd, c, fx.output);
      const checks = g.checks(wd, c, fx.output);
      const failed = failing(checks).map((x) => x.id);
      const want = fx.expect_fail ?? [];
      const missed = want.filter((id) => !failed.includes(id));
      const verdict = want.length === 0 ? (failed.length === 0 ? 'ok' : `BAD: good fixture fails ${failed.join(',')}`)
        : (missed.length === 0 ? 'ok' : `BAD: grader missed ${missed.join(',')}`);
      if (verdict !== 'ok') bad++;
      const rb = g.rubric(wd, c, fx.output);
      if (!rb.criteria.length) { bad++; rows.push([skill, f, 'BAD: empty rubric']); continue; }
      rows.push([skill, f, want.length ? 'must fail' : 'must pass', `${checks.length - failed.length}/${checks.length} pass`, want.length ? `caught: ${want.filter((x) => failed.includes(x)).join(',')}` : '', verdict]);
      if (verdict !== 'ok') for (const x of failing(checks)) console.log(`  ${f}: ${x.id}: ${x.detail}`);
    } finally { rmSync(wd, { recursive: true, force: true }); }
  }
  if (!rows.some((r) => r[2] === 'must pass') || !rows.some((r) => r[2] === 'must fail')) { bad++; rows.push([skill, '-', 'BAD: need at least one good and one bad fixture']); }
  return { rows, bad };
}

async function liveSkill(skill: string, outDir: string) {
  const g = await load(skill);
  const model = opt('model', 'sonnet');
  const judge = opt('judge-model', 'sonnet');
  const rows: string[][] = [];
  let cost = 0, ms = 0, failedCases = 0;
  for (const c of loadCases(skill, opt('case', ''))) {
    const wd = tmp();
    prepareWorkdir(wd, c);
    const run = runSkill(skill, c, g.task(c), wd, model, Number(opt('max-usd', '3')));
    cost += run.costUsd; ms += run.ms;
    let checks: Check[] = [];
    let output: any = null;
    let note = run.error ?? '';
    try {
      output = g.collect(wd, c);
      checks = g.checks(wd, c, output);
      if (!flag('no-rubric')) {
        const rb = runRubric(g.rubric(wd, c, output), output, judge, wd);
        checks = checks.concat(rb.checks);
        cost += rb.info.costUsd; ms += rb.info.ms;
      }
    } catch (e) { note = note || String((e as Error).message); checks = [{ id: 'produced-output', ok: false, kind: 'script', detail: note }]; }
    const f = failing(checks);
    if (f.length) failedCases++;
    const script = checks.filter((x) => x.kind === 'script'), rub = checks.filter((x) => x.kind === 'rubric');
    rows.push([skill, c.name, f.length ? 'FAIL' : 'PASS', `${script.filter((x) => x.ok).length}/${script.length}`, rub.length ? `${rub.filter((x) => x.ok).length}/${rub.length}` : '-', `$${run.costUsd.toFixed(2)}`, `${Math.round(run.ms / 1000)}s`, `${run.turns}`, `${Math.round(run.tokens / 1000)}k`]);
    for (const x of f) console.log(`  ${skill}/${c.name}: FAIL ${x.kind} ${x.id}: ${x.detail}`);
    writeFileSync(join(outDir, `${skill}--${c.name}.json`), JSON.stringify({ case: c, run: { ...run, text: run.text.slice(0, 4000) }, checks, output }, null, 1));
    if (flag('keep')) console.log(`  kept sandbox: ${wd}`); else rmSync(wd, { recursive: true, force: true });
  }
  return { rows, cost, ms, failedCases };
}

if (selfTest) {
  let bad = 0;
  const rows: string[][] = [['skill', 'fixture', 'expect', 'checks', 'caught', 'verdict']];
  for (const s of skills) { const r = await selfTestSkill(s); rows.push(...r.rows); bad += r.bad; }
  table(rows);
  console.log(bad ? `\nself-test FAILED (${bad})` : '\nself-test ok: graders pass the good fixtures and catch every bad one');
  process.exit(bad ? 1 : 0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(EVALS, 'out', stamp);
mkdirSync(outDir, { recursive: true });
const rows: string[][] = [['skill', 'case', 'result', 'script', 'rubric', 'cost', 'time', 'turns', 'tokens']];
let cost = 0, ms = 0, failed = 0;
for (const s of skills) { const r = await liveSkill(s, outDir); rows.push(...r.rows); cost += r.cost; ms += r.ms; failed += r.failedCases; }
table(rows);
console.log(`\n${failed ? `${failed} case(s) FAILED` : 'all cases passed'}; total $${cost.toFixed(2)}, ${Math.round(ms / 1000)}s. Details: ${outDir}`);
process.exit(failed ? 1 : 0);
