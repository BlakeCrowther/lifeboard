/* lesson-make grader. Rows are checked with the board's own validator (src/packages/db/schema.ts `validate`), then the skill's authoring rules, then a rubric.
   The live board (ArtifactData) is replaced by one file: out/rows.json = { sources: {<slug>: doc}, lessons: {<slug>-<nn>: doc} }. */
import { join } from 'node:path';
import { ok, readJson, schemaValidator, writeJson } from '../lib.ts';
import type { Check, SkillEval } from '../lib.ts';

const rowsPath = (wd: string) => join(wd, 'out/rows.json');
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const grade: SkillEval = {
  task: (c) => [
    'Do it for me (skip the interview). Make lessons from the source below.',
    `Today is ${c.today}; use created_at ${c.created_at}. There is no live board in this sandbox: skip steps 0 and 1 and, instead of ArtifactData writes in step 6, write ONE file out/rows.json = {"sources": {"<slug>": <doc>}, "lessons": {"<slug>-<nn>": <doc>}} with docs shaped exactly as step 6 says. Check every doc with validate() from src/packages/db/schema.ts (node) before finishing.`,
    c.hint ? `Note from the user: ${c.hint}` : '',
    `Source (type ${c.type}, title "${c.title}"):`, c.source,
  ].filter(Boolean).join('\n'),

  place: (wd, _c, output) => writeJson(rowsPath(wd), output),

  collect: (wd) => readJson(rowsPath(wd)),

  checks(wd, c, o): Check[] {
    const out: Check[] = [];
    const validate = schemaValidator(wd);
    const srcKeys = Object.keys(o.sources ?? {});
    const lessons = Object.entries(o.lessons ?? {}) as [string, any][];
    out.push(ok('one-source', srcKeys.length === 1, `${srcKeys.length} sources`));
    const slug = srcKeys[0];
    const src = o.sources?.[slug] ?? {};
    const bad = [['sources', slug, src] as const, ...lessons.map(([k, d]) => ['lessons', k, d] as const)]
      .map(([col, k, d]) => [k, validate(col, d)] as const).filter(([, r]) => r);
    out.push(ok('schema-valid', bad.length === 0, bad.slice(0, 3).map(([k, r]) => `${k}: ${r}`).join('; ')));
    out.push(ok('source-type-matches', src.type === c.type, `type ${src.type}, case ${c.type}`));
    out.push(ok('ladder-matches-source-kind', JSON.stringify(src.ladder) === JSON.stringify(c.ladder), `ladder ${JSON.stringify(src.ladder)}, want ${JSON.stringify(c.ladder)}`));
    out.push(ok('intervals-match', !c.intervals || JSON.stringify(src.intervals) === JSON.stringify(c.intervals), `intervals ${JSON.stringify(src.intervals)}, want ${JSON.stringify(c.intervals)}`));
    out.push(ok('size-salience-1-3', [src.size, src.salience].every((n) => Number.isInteger(n) && n >= 1 && n <= 3), `size ${src.size}, salience ${src.salience}`));
    out.push(ok('summary-2-3-sentences', typeof src.summary === 'string' && (src.summary.match(/[.!?](\s|$)/g) ?? []).length >= 2 && (src.summary.match(/[.!?](\s|$)/g) ?? []).length <= 3, 'summary needs 2-3 sentences'));
    out.push(ok('source-active-stamped', src.status === 'active' && src.created_at === c.created_at, `status ${src.status}, created_at ${src.created_at}`));
    const [lo, hi] = c.countRange as [number, number];
    out.push(ok('lesson-count-in-range', lessons.length >= lo && lessons.length <= hi, `${lessons.length} lessons, want ${lo}-${hi}`));
    out.push(ok('lesson-ids-slug-nn', lessons.every(([k]) => new RegExp(`^${slug}-\\d{2}$`).test(k)), 'ids must be <slug>-<nn>'));
    out.push(ok('lessons-start-fresh', lessons.every(([, d]) => d.source_id === slug && d.level === 0 && d.state === 'active' && d.due === c.today && d.created_at === c.created_at), 'each lesson: source_id slug, level 0, state active, due today, created_at set'));
    const orders = lessons.map(([, d]) => d.order);
    out.push(ok('order-distinct', new Set(orders).size === orders.length && orders.every((n) => Number.isInteger(n)), 'order must be distinct integers'));
    out.push(ok('rungs-follow-ladder', lessons.every(([, d]) => JSON.stringify((d.rungs ?? []).map((r: any) => r.format)) === JSON.stringify(src.ladder)), 'rungs must be exactly one per ladder step, same order'));
    const rungs = lessons.flatMap(([, d]) => d.rungs ?? []) as any[];
    out.push(ok('tap-prompt-240', rungs.filter((r) => r.format === 'tap').every((r) => r.prompt.length <= 240), 'tap prompt over 240 chars'));
    const rec = rungs.filter((r) => r.format === 'recall');
    out.push(ok('recall-shape', rec.every((r) => r.prompt.includes('___') || r.prompt.trim().endsWith('?')), 'recall prompt needs ___ or a question'));
    out.push(ok('recall-answerable', rec.every((r) => {
      const first = String(r.answer).split('|')[0];
      if (r.choices) return r.choices.length === 3 && r.choices.some((x: string) => x.toLowerCase() === first.toLowerCase());
      return words(first) <= 3;
    }), 'choices must be 3 and include the answer; typed answers must be 1-3 words'));
    out.push(ok('apply-is-a-question', rungs.filter((r) => r.format === 'apply').every((r) => r.prompt.trim().endsWith('?')), 'apply prompt must be one concrete question'));
    return out;
  },

  rubric(_wd, c, o) {
    return {
      context: `Source (type ${c.type}, "${c.title}"):\n${c.source}\n\nRules: one idea per lesson; plain words, no jargon the source did not teach; tap = the idea or a short quote; recall = a fill-in-the-blank or question whose answer is in the source; apply = one concrete, usable question.`,
      criteria: [
        { id: 'faithful-to-source', question: 'Every lesson idea, recall answer and quote comes from the source text; nothing invented or contradicted.' },
        { id: 'one-idea-each-and-distinct', question: 'Each lesson carries exactly one idea, and no two lessons repeat the same idea.' },
        { id: 'recall-fair', question: 'Recall prompts are answerable from the lesson itself, the blank is a key word not a trivial one, and distractors (if any) are plausible but wrong.' },
        { id: 'plain-words', question: 'Wording is plain and short; no jargon the source did not teach; summary is accurate to the source.' },
      ],
    };
  },
};
export default grade;
