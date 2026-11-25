// Turns demo/seed.json (dates as day offsets from "today") into ArtifactData batch files for the demo board.
//   node tools/demo-seed.ts [--today YYYY-MM-DD] [--out <file>] [--existing <dir>]
//   node tools/demo-seed.ts [--today YYYY-MM-DD] --mock <file>   (pnpm demo:mock: mockdata.js for the local preview)
// Writes `<out>-1.json`, `<out>-2.json`, ...: each a JSON array of at most BATCH_SIZE `{op, collection, doc_id, ...}` entries
// (default <out>: demo-batch under the OS temp dir). Every doc is checked against the db schemas first; any invalid doc
// prints why and exits 1 with no files written. --today defaults to today in the seed profile's time zone.
// Reseeding: ArtifactData `batch` refuses a `set` on an existing doc without `if_version`. --existing is a dump of the
// board's seeded collections (ArtifactData `list` with `out_dir`: <dir>/<collection>/<doc_id>.json, each with `version`);
// existing docs then get `if_version`, and docs in a seeded collection that the seed lacks (the page's starter tasks,
// old sessions) get a pinned `delete`.
// --mock writes the same docs as `window.MOCK = {collection: {doc_id: doc}}`, the fake db's seed (src/fake-db-page.ts),
// instead of batch files. mockdata.js is gitignored.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate } from '../src/packages/db/schema.ts';

export const BATCH_SIZE = 50;

export interface SetOp { op: 'set'; collection: string; doc_id: string; data: Record<string, unknown>; if_version?: number }
export interface DeleteOp { op: 'delete'; collection: string; doc_id: string; if_version: number }
export type Op = SetOp | DeleteOp;
/** collection -> doc id -> version, as read from an ArtifactData dump. */
export type Existing = ReadonlyMap<string, ReadonlyMap<string, number>>;

interface Seed {
  profile: Record<string, unknown>;
  tasks: { id: string; title: string; category: string; due: number | null; done?: boolean; repeat?: Record<string, unknown> }[];
  habits: { id: string; sessionDays: number[]; [field: string]: unknown }[];
  goals: { id: string; year: number; [field: string]: unknown }[];
  listItems: { id: string; [field: string]: unknown }[];
  countdowns: { id: string; date: number; [field: string]: unknown }[];
}

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `text` is YYYY-MM-DD and a real calendar date (2026-02-30 is not). */
export const isRealDate = (text: string): boolean => {
  const ms = Date.parse(`${text}T00:00:00Z`);
  return DATE_RE.test(text) && !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === text;
};

/** Today's date in `tz`, falling back to UTC when `tz` is missing or unknown. */
export function todayIn(tz: unknown, now = new Date()): string {
  for (const timeZone of [typeof tz === 'string' ? tz : undefined, 'UTC']) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { /* unknown zone: try the next */ }
  }
  return now.toISOString().slice(0, 10);
}

/** `today` shifted by whole days, as YYYY-MM-DD (UTC arithmetic, so no daylight-saving drift). */
export function addDays(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every demo document with its dates resolved against `today`. `now` stamps created_at/updated_at. */
export function buildDocs(seed: Seed, today: string, now = Date.parse(`${today}T12:00:00Z`)): SetOp[] {
  const set = (collection: string, doc_id: string, data: Record<string, unknown>): SetOp => ({ op: 'set', collection, doc_id, data });
  /* checks/starter stops the page seeding its starter tasks on the demo */
  const ops: SetOp[] = [set('checks', 'profile', { value: seed.profile, updated_at: now }), set('checks', 'starter', { value: { seeded_at: now }, updated_at: now })];
  seed.tasks.forEach((t, i) => {
    const due = t.due === null ? null : addDays(today, t.due);
    ops.push(set('tasks', t.id, {
      title: t.title, category: t.category, status: t.done ? 'done' : 'open', due_date: due, sort_order: i + 1, created_at: now - 7 * DAY_MS,
      ...(t.done ? { completed_at: now - DAY_MS } : {}),
      ...(t.repeat ? { recurrence_rule: { ...t.repeat, basis: 'schedule' } } : {}),
    }));
  });
  seed.habits.forEach(({ id, sessionDays, ...fields }, i) => {
    ops.push(set('habits', id, { cadence: 'week', ...fields, sort_order: i + 1, created_at: now - 40 * DAY_MS }));
    for (const offset of sessionDays) {
      const date = addDays(today, offset);
      /* named by offset, not date, so a reseed on another day replaces them */
      ops.push(set('habit_sessions', `${id}-d${String(offset).replace('-', 'm')}`, { habit_id: id, date, created_at: Date.parse(`${date}T18:00:00Z`) }));
    }
  });
  const year = Number(today.slice(0, 4));
  seed.goals.forEach(({ id, year: offset, ...fields }, i) => ops.push(set('goals', id, { ...fields, year: year + offset, status: 'active', sort_order: i + 1, created_at: now - 30 * DAY_MS })));
  seed.listItems.forEach(({ id, ...fields }, i) => ops.push(set('list_items', id, { ...fields, sort_order: i + 1, created_at: now - 20 * DAY_MS })));
  seed.countdowns.forEach(({ id, date, ...fields }) => ops.push(set('countdowns', id, { ...fields, date: addDays(today, date) })));
  return ops;
}

/** Adds `if_version` to sets of existing docs and a pinned delete for each existing doc of a seeded collection the seed lacks. */
export function reconcile(ops: readonly SetOp[], existing: Existing): Op[] {
  const seeded = new Set(ops.map((o) => o.collection));
  const out: Op[] = ops.map((o) => { const version = existing.get(o.collection)?.get(o.doc_id); return version === undefined ? o : { ...o, if_version: version }; });
  const keep = new Set(ops.map((o) => `${o.collection}/${o.doc_id}`));
  for (const collection of seeded) {
    for (const [doc_id, version] of existing.get(collection) ?? []) {
      if (!keep.has(`${collection}/${doc_id}`)) out.push({ op: 'delete', collection, doc_id, if_version: version });
    }
  }
  return out;
}

/** Reads an ArtifactData `list` dump: <dir>/<collection>/<doc_id>.json, each file carrying `version`. */
export function readExisting(dir: string): Existing {
  const result = new Map<string, Map<string, number>>();
  for (const c of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const docs = new Map<string, number>();
    for (const f of readdirSync(join(dir, c.name)).filter((n) => n.endsWith('.json'))) {
      const version = (JSON.parse(readFileSync(join(dir, c.name, f), 'utf8')) as { version?: unknown }).version;
      if (typeof version !== 'number') throw new Error(`${c.name}/${f} has no numeric version`);
      docs.set(f.slice(0, -'.json'.length), version);
    }
    result.set(c.name, docs);
  }
  return result;
}

/** One line per doc that the db schemas reject. */
export function invalidDocs(ops: readonly Op[]): string[] {
  return ops.flatMap((o) => { if (o.op !== 'set') return []; const why = validate(o.collection, o.data); return why ? [`${o.collection}/${o.doc_id}: ${why}`] : []; });
}

/** The docs as the fake db's `window.MOCK`: collection -> doc id -> doc. */
export function mockData(ops: readonly SetOp[]): Record<string, Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const o of ops) (out[o.collection] ??= {})[o.doc_id] = o.data;
  return out;
}

export function batches(ops: readonly Op[]): Op[][] {
  const out: Op[][] = [];
  for (let i = 0; i < ops.length; i += BATCH_SIZE) out.push(ops.slice(i, i + BATCH_SIZE));
  return out;
}

function main(argv: string[]): number {
  const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const usage = 'usage: demo-seed.ts [--today YYYY-MM-DD] [--out <file>] [--existing <dir>] | [--today YYYY-MM-DD] --mock <file>';
  const seed = JSON.parse(readFileSync(new URL('../demo/seed.json', import.meta.url), 'utf8')) as Seed;
  const today = arg('--today') ?? todayIn(seed.profile['tz']);
  if (!isRealDate(today)) { console.error(`demo-seed: --today must be a real YYYY-MM-DD date\n${usage}`); return 2; }
  const existingDir = arg('--existing');
  if (existingDir && !existsSync(existingDir)) { console.error(`demo-seed: --existing ${existingDir} not found\n${usage}`); return 2; }
  const seeded = buildDocs(seed, today);
  const bad = invalidDocs(seeded);
  if (bad.length) { console.error(`demo-seed: ${String(bad.length)} invalid doc(s):\n- ${bad.join('\n- ')}`); return 1; }
  const mock = arg('--mock');
  if (mock) {
    writeFileSync(mock, `window.MOCK = ${JSON.stringify(mockData(seeded), null, 1)};\n`);
    console.log(`demo-seed: ${String(seeded.length)} made-up docs for ${today} in ${mock} (window.MOCK for the local preview)`);
    return 0;
  }
  const ops = existingDir ? reconcile(seeded, readExisting(existingDir)) : seeded;
  const out = arg('--out') ?? join(tmpdir(), 'demo-batch');
  const files = batches(ops).map((batch, i) => { const file = `${out}-${String(i + 1)}.json`; writeFileSync(file, JSON.stringify(batch, null, 1) + '\n'); return file; });
  console.log(`demo-seed: ${String(ops.length)} operations for ${today} in ${String(files.length)} file(s):\n${files.join('\n')}`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) process.exit(main(process.argv.slice(2)));
