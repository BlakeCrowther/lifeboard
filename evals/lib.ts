/* Shared helpers for the skill evals (README.md). Node runs this .ts directly; no build, no deps. */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../src/packages/db/schema.ts';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EVALS = join(REPO, 'evals');
export const SKILLS = ['creature-brief', 'plant-brief', 'biome-brief', 'lesson-make'];

export type Check = { id: string; ok: boolean; detail?: string; kind: 'script' | 'rubric' };
/* A case is fixed input. `worldBiomes` truncates the frozen world (fixtures/world) to its first N biomes. Each skill's
   grade.ts extends it with its own keys. */
export interface Case { name: string; skill: string; worldBiomes?: number }
export type Criterion = { id: string; question: string };

/* Shapes of the JSON the graders read. Files are trusted as written; fields a grader checks stay optional so a malformed
   skill output fails a check instead of crashing the grader. */
export interface Biome {
  id: number; name?: string; medium?: string; scene?: string; frame?: unknown; examples?: string[];
  look?: { owns?: string[]; shape?: unknown; palette?: unknown };
  scenery?: { id: string }[]; neglect?: { blight?: string };
}
export interface BiomesFile { identity_rules?: unknown; biomes: Biome[] }
export interface RosterModel { id: string; kind?: string; name?: string; spec: string; biome?: number }
export interface RosterFile { models: RosterModel[] }

/* What each skill's grade.ts exports. C is the skill's case, O the output it writes. */
export interface SkillEval<C extends Case = Case, O = unknown> {
  /* The inputs line(s) the skill's caller would pass (weekly-visitor, season-seeds, the user). */
  task(c: C): string;
  /* Write `output` where the skill would have (self-test and fixtures). */
  place(wd: string, c: C, output: O): void;
  /* Read what the skill wrote in `wd`; throws if it wrote nothing usable. */
  collect(wd: string, c: C): O;
  /* Deterministic checks (reuse the repo's own graders where one exists). */
  checks(wd: string, c: C, output: O): Check[];
  /* What a script can't judge. Context is shown to the judge next to the output. */
  rubric(wd: string, c: C, output: O): { context: string; criteria: Criterion[] };
}

/* Callers assert the shape they expect (`as BiomesFile`). */
export const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
export const writeJson = (p: string, v: unknown) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + '\n');
};
export const ok = (id: string, pass: boolean, detail = ''): Check => ({ id, ok: pass, detail: pass ? '' : detail, kind: 'script' });

export function loadCases(skill: string, only?: string): Case[] {
  const dir = join(EVALS, skill, 'cases');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(dir, f)) as Case)
    .filter((c) => !only || c.name === only);
}

/* Find a skill's SKILL.md by name (the skills dir has moved before: look in every known home). */
export function skillText(name: string): string {
  for (const d of ['.agents/skills', '.claude/skills']) {
    const p = join(REPO, d, name, 'SKILL.md');
    if (existsSync(p)) return readFileSync(p, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  }
  throw new Error(`skill ${name} not found in .agents/skills or .claude/skills`);
}

/* A sandbox shaped like the repo for one case: the frozen world (evals/fixtures/world) cut to the case's biomes, plus the
   live reference files the skills read (STYLE, CONTRACTs, archetypes, graders). Paths in the skill text resolve inside it. */
export function prepareWorkdir(wd: string, c: Case) {
  cpSync(join(EVALS, 'fixtures', 'world'), wd, { recursive: true });
  const bp = join(wd, 'models/board/biomes.json');
  const b = readJson(bp) as BiomesFile;
  const n = c.worldBiomes ?? b.biomes.length;
  b.biomes = b.biomes.slice(0, n);
  writeJson(bp, b);
  const rp = join(wd, 'models/board/roster.json');
  const r = readJson(rp) as RosterFile;
  r.models = r.models.filter((m) => (m.biome ?? 0) < n);
  writeJson(rp, r);
  for (const rel of [
    'models/STYLE.md', 'models/README.md', 'models/creature/CONTRACT.md', 'models/plant/CONTRACT.md',
    'models/creature/archetypes', 'models/plant/archetypes', 'models/creature/specs/examples',
    'models/shared/tools/check_spec.py', 'models/shared/tools/check_biome.py', 'models/shared/tools/model_files.py', 'SPEC.md', 'src/packages/db',
    'src/packages/ecosystem/lib/frames.ts',
  ]) {
    const from = join(REPO, rel);
    if (existsSync(from)) cpSync(from, join(wd, rel), { recursive: true });
  }
  /* src/packages/db imports zod; the skill checks its rows with it in the sandbox */
  if (!existsSync(join(wd, 'node_modules'))) symlinkSync(join(REPO, 'node_modules'), join(wd, 'node_modules'));
}

export function py(wd: string, script: string, args: string[]) {
  const r = spawnSync('python3', ['-I', script, ...args], { cwd: wd, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

/** The board's own row validator (src/packages/db): null when the doc is fine, else the first problem. */
export function schemaValidator(): (col: string, doc: unknown) => string | null {
  return validate;
}

export type RunInfo = { text: string; costUsd: number; ms: number; turns: number; tokens: number; error?: string };

interface ClaudeJson {
  result?: string; total_cost_usd?: number; num_turns?: number; is_error?: boolean;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

function claude(prompt: string, cwd: string, args: string[], timeoutMs: number): RunInfo {
  const t0 = Date.now();
  const r = spawnSync('claude', ['-p', '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'project', ...args], {
    cwd, input: prompt, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - t0;
  try {
    const j = JSON.parse(r.stdout) as ClaudeJson;
    const u = j.usage ?? {};
    const text = j.result ?? '';
    return {
      text, costUsd: j.total_cost_usd ?? 0, ms, turns: j.num_turns ?? 0,
      tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      ...(j.is_error ? { error: text } : {}),
    };
  } catch {
    return { text: '', costUsd: 0, ms, turns: 0, tokens: 0, error: `claude failed (exit ${String(r.status)}): ${(r.stderr || r.stdout).slice(0, 400)}` };
  }
}

/* Run the skill headlessly in the sandbox. Unattended, as the weekly run is. */
export function runSkill(skill: string, c: Case, task: string, wd: string, model: string, maxUsd: number): RunInfo {
  const prompt = [
    `You are running the lifeboard skill "${skill}" headlessly inside ${wd}, a sandbox laid out like the repo (paths in the skill resolve here).`,
    'Unattended: never ask questions; decide and write the output files. Do not touch anything outside this directory.',
    '', '## Inputs', task, '', `## Skill: ${skill}`, skillText(skill),
  ].join('\n');
  return claude(prompt, wd, [
    '--model', model, '--permission-mode', 'acceptEdits', '--max-budget-usd', String(maxUsd),
    '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(python3 models/shared/tools/*),Bash(node -e *)',
    '--disable-slash-commands',
  ], 15 * 60 * 1000);
}

/* LLM rubric: one call, strict JSON back. No tools, so it judges only what it is shown. */
export function runRubric(ctx: { context: string; criteria: Criterion[] }, output: unknown, model: string, wd: string): { checks: Check[]; info: RunInfo } {
  const prompt = [
    'You are a strict grader. Judge the OUTPUT against each criterion using only the CONTEXT and OUTPUT below. Be skeptical; pass only when clearly met.',
    'Reply with ONLY a JSON object: {"<criterion id>": {"pass": true|false, "why": "<=20 words"}, ...} and nothing else.',
    '', '## CONTEXT', ctx.context, '', '## OUTPUT', JSON.stringify(output, null, 1), '', '## CRITERIA',
    ...ctx.criteria.map((k) => `- ${k.id}: ${k.question}`),
  ].join('\n');
  const info = claude(prompt, wd, ['--model', model, '--tools', ''], 5 * 60 * 1000);
  let verdict: Record<string, { pass?: boolean; why?: string } | undefined> = {};
  try { verdict = JSON.parse(/\{[\s\S]*\}/.exec(info.text)?.[0] ?? '{}') as typeof verdict; } catch { /* fall through: criteria fail below */ }
  const checks = ctx.criteria.map((k): Check => {
    const v = verdict[k.id];
    return { id: k.id, kind: 'rubric', ok: v?.pass === true, detail: v ? (v.why ?? '') : (info.error ?? 'judge gave no verdict') };
  });
  return { checks, info };
}
