// One board's model files: seed, list, hydrate from the store, merge the live roster, and the file map for a model-only publish.
//   node tools/board.ts seed                       copy models/starter to models/board when the board has no roster.json yet
//   node tools/board.ts files [--roster <path>]    published paths of the board's model files, one per line
//   node tools/board.ts hydrate <dir>              copy files pulled from the store (<dir>/models/...) into models/board
//   node tools/board.ts merge-roster <live.json>   add the live roster's entries the board lacks; exit 1 on an id that differs
//   node tools/board.ts publish-set [--ids a,b] [--biomes] [--all] [--live-count n] [--live-bytes n]
//                                                  JSON {published path: local path}; exit 1 at the Artifact version limits
// Layout: models/README.md "Layout". Exit 0 ok, 1 refused (conflict or limit), 2 bad usage.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS_ROOT, boardDir, modelDir, resolveModelFile, starterDir } from '../models/shared/tools/model-files.ts';

export interface RosterEntry { id: string; js: string; spec?: string; [field: string]: unknown }
export interface Roster { models: RosterEntry[]; [field: string]: unknown }

/** Artifact limits for one published version (see the Artifact tool). */
export const LIMITS = { files: 511, bytes: 256 * 1024 * 1024 };
/** Above this share of a limit a publish warns. */
export const WARN_SHARE = 0.7;

const readRoster = (file: string): Roster => JSON.parse(readFileSync(file, 'utf8')) as Roster;
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** Copy models/starter to models/board when the board has no roster.json. True when it copied. */
export function seed(models: string = MODELS_ROOT): boolean {
  if (existsSync(path.join(boardDir(models), 'roster.json'))) return false;
  cpSync(starterDir(models), boardDir(models), { recursive: true });
  return true;
}

/** True for a file only the pipeline layer (`models/` itself: goldens, examples) holds, never a board's or the starter's. */
const pipelineOnly = (rel: string, models: string): boolean =>
  existsSync(path.join(models, rel)) && !existsSync(path.join(boardDir(models), rel)) && !existsSync(path.join(starterDir(models), rel));

/** Published paths (`models/...`) of the model files a roster lists: roster, biomes, then each entry's js and spec.
 *  Golden-only files (held by `models/` alone) are left out: they ship with the pipeline, not with a board. */
export function publishedFiles(roster: Roster, models: string = MODELS_ROOT): string[] {
  const listed = roster.models.flatMap((m) => [`models/${m.js}`, ...(m.spec ? [`models/${m.spec}`] : [])]);
  return ['models/roster.json', 'models/biomes.json', ...listed.filter((p) => !pipelineOnly(p.slice('models/'.length), models))];
}

export interface HydrateReport { added: string[]; changed: string[]; unchanged: number; boardOnly: string[]; kept: string[] }
interface Biomes { biomes: { id: number; [field: string]: unknown }[]; [field: string]: unknown }

/** Entries of `store` the board lacks are added; an id in both with different content keeps the board's (`kept`);
 *  board-only entries stay (`boardOnly`). */
function mergeById<T extends { id: string | number }>(board: T[], store: T[]): { merged: T[]; added: T[]; kept: (string | number)[]; boardOnly: (string | number)[] } {
  const mine = new Map(board.map((e) => [e.id, e]));
  const added = store.filter((e) => !mine.has(e.id));
  const kept = store.filter((e) => mine.has(e.id) && JSON.stringify(sortKeys(mine.get(e.id))) !== JSON.stringify(sortKeys(e))).map((e) => e.id);
  const theirs = new Set(store.map((e) => e.id));
  return { merged: [...board, ...added], added, kept, boardOnly: board.filter((e) => !theirs.has(e.id)).map((e) => e.id) };
}

/** Copy `<dir>/models/**` into the board dir. roster.json and biomes.json merge by id (the board's own entries survive);
 *  files of an id whose content differs, and files only the pipeline layer holds (goldens), are not copied. Never deletes. */
export function hydrate(fromDir: string, models: string = MODELS_ROOT): HydrateReport {
  const src = path.join(fromDir, 'models');
  if (!existsSync(src)) throw new Error(`${src} not found: pull the store's files to <dir>/models/... first`);
  const board = boardDir(models);
  const report: HydrateReport = { added: [], changed: [], unchanged: 0, boardOnly: [], kept: [] };
  const skip = new Set<string>();
  const write = (rel: string, text: string): void => {
    const dest = path.join(board, rel);
    if (!existsSync(dest)) report.added.push(rel);
    else if (readFileSync(dest, 'utf8') !== text) report.changed.push(rel);
    else { report.unchanged++; return; }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  };
  const storeRoster = path.join(src, 'roster.json');
  const boardRoster = path.join(board, 'roster.json');
  if (existsSync(storeRoster)) {
    const store = readRoster(storeRoster);
    if (existsSync(boardRoster)) {
      const mine = readRoster(boardRoster);
      const m = mergeById(mine.models, store.models);
      for (const id of m.kept) { report.kept.push(`roster ${String(id)}`); for (const e of store.models.filter((x) => x.id === id)) [e.js, e.spec].forEach((f) => { if (f) skip.add(f); }); }
      report.boardOnly.push(...m.boardOnly.map((id) => `roster ${String(id)}`));
      write('roster.json', m.added.length ? formatRoster({ ...mine, models: m.merged }) : readFileSync(boardRoster, 'utf8'));
    } else write('roster.json', readFileSync(storeRoster, 'utf8'));
  }
  const storeBiomes = path.join(src, 'biomes.json');
  const boardBiomes = path.join(board, 'biomes.json');
  if (existsSync(storeBiomes)) {
    if (existsSync(boardBiomes)) {
      const mine = JSON.parse(readFileSync(boardBiomes, 'utf8')) as Biomes;
      const m = mergeById(mine.biomes, (JSON.parse(readFileSync(storeBiomes, 'utf8')) as Biomes).biomes);
      report.kept.push(...m.kept.map((id) => `biome ${String(id)}`));
      report.boardOnly.push(...m.boardOnly.map((id) => `biome ${String(id)}`));
      write('biomes.json', m.added.length ? `${JSON.stringify({ ...mine, biomes: m.merged }, null, 2)}\n` : readFileSync(boardBiomes, 'utf8'));
    } else write('biomes.json', readFileSync(storeBiomes, 'utf8'));
  }
  const listed = existsSync(boardRoster) ? new Set(readRoster(boardRoster).models.flatMap((e) => [e.js, e.spec ?? ''])) : new Set<string>();
  for (const file of walk(src)) {
    const rel = path.relative(src, file).split(path.sep).join('/');
    if (rel === 'roster.json' || rel === 'biomes.json' || skip.has(rel)) continue;
    if (pipelineOnly(rel, models) && !listed.has(rel)) continue;
    const dest = path.join(board, rel);
    if (existsSync(dest) && readFileSync(file).equals(readFileSync(dest))) { report.unchanged++; continue; }
    (existsSync(dest) ? report.changed : report.added).push(rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(file, dest);
  }
  if (existsSync(boardRoster)) {
    report.boardOnly.push(...publishedFiles(readRoster(boardRoster), models).slice(2)
      .map((p) => p.slice('models/'.length)).filter((rel) => existsSync(path.join(board, rel)) && !existsSync(path.join(src, rel))).map((rel) => `file ${rel}`));
  }
  return report;
}

/** roster.json in the repo's own layout: one field per line for the file and each model, nested values inline. */
export function formatRoster(roster: Roster): string {
  const inline = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
    if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')}}`;
    return JSON.stringify(v);
  };
  const fields = (obj: Record<string, unknown>, indent: string): string =>
    Object.entries(obj).map(([k, v]) => `${indent}${JSON.stringify(k)}: ${k === 'models' ? models(v as RosterEntry[]) : inline(v)}`).join(',\n');
  const models = (list: RosterEntry[]): string =>
    `[\n${list.map((m) => `    {\n${fields(m, '      ')}\n    }`).join(',\n')}\n  ]`;
  return `{\n${fields(roster, '  ')}\n}\n`;
}

export interface MergeResult { added: string[]; conflicts: string[] }

/** Merge the live roster's entries into `<models>/board/roster.json` by id. Writes only when nothing conflicts. */
export function mergeRoster(livePath: string, models: string = MODELS_ROOT): MergeResult {
  const boardPath = path.join(boardDir(models), 'roster.json');
  const board = readRoster(boardPath);
  const live = readRoster(livePath);
  const byId = new Map(board.models.map((m) => [m.id, m]));
  const added: RosterEntry[] = [];
  const conflicts: string[] = [];
  for (const entry of live.models) {
    const mine = byId.get(entry.id);
    if (!mine) added.push(entry);
    else if (JSON.stringify(sortKeys(mine)) !== JSON.stringify(sortKeys(entry))) conflicts.push(entry.id);
  }
  if (!conflicts.length && added.length) writeFileSync(boardPath, formatRoster({ ...board, models: [...board.models, ...added] }));
  return { added: added.map((m) => m.id), conflicts };
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)]));
  return v;
}

/** A publish that would reach an Artifact version limit. */
export class LimitError extends Error {}

export interface PublishOptions { ids?: string[]; biomes?: boolean; all?: boolean; liveCount?: number; liveBytes?: number }
export interface PublishSet { files: Record<string, string>; count: number; bytes: number; warnings: string[] }

/** The files of a model-only publish, keyed by published path, valued by local path (relative to the repo root).
 *  Throws when the new version would reach a limit (live counts plus this publish; replaced files count twice, which errs safe). */
export function publishSet(opts: PublishOptions, models: string = MODELS_ROOT): PublishSet {
  const roster = readRoster(resolveModelFile('roster.json', models) ?? path.join(modelDir(models), 'roster.json'));
  const ids = opts.all ? roster.models.map((m) => m.id) : opts.ids ?? [];
  const unknown = ids.filter((id) => !roster.models.some((m) => m.id === id));
  if (unknown.length) throw new Error(`not in the roster: ${unknown.join(', ')}`);
  const wanted = new Set<string>(['models/roster.json', ...(opts.biomes || opts.all ? ['models/biomes.json'] : [])]);
  for (const m of roster.models.filter((x) => ids.includes(x.id))) { wanted.add(`models/${m.js}`); if (m.spec) wanted.add(`models/${m.spec}`); }
  const files: Record<string, string> = {};
  let bytes = 0;
  for (const pub of wanted) {
    const local = resolveModelFile(pub.slice('models/'.length), models);
    if (!local) throw new Error(`${pub} has no local file`);
    files[pub] = path.relative(path.dirname(models), local);
    bytes += statSync(local).size;
  }
  const count = Object.keys(files).length;
  const totals = { files: (opts.liveCount ?? 0) + count, bytes: (opts.liveBytes ?? 0) + bytes };
  const over = (['files', 'bytes'] as const).filter((k) => totals[k] >= LIMITS[k]);
  if (over.length) throw new LimitError(`publish would reach the version limit (${over.map((k) => `${k}: ${String(totals[k])} of ${String(LIMITS[k])}`).join(', ')}); remove old models from the store first`);
  const warnings = (['files', 'bytes'] as const).filter((k) => totals[k] > LIMITS[k] * WARN_SHARE)
    .map((k) => `warning: the new version would hold ${String(totals[k])} ${k} (${String(Math.round((100 * totals[k]) / LIMITS[k]))}% of the ${String(LIMITS[k])} limit)`);
  return { files, count, bytes, warnings };
}

const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const num = (args: string[], name: string): number | undefined => {
  const v = flag(args, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} needs a number`);
  return n;
};

export function main(argv: string[]): number {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case 'seed':
        console.log(seed() ? 'board: seeded models/board from models/starter' : 'board: models/board already has a roster, left as is');
        return 0;
      case 'files': {
        const rosterPath = flag(args, '--roster') ?? path.join(modelDir(), 'roster.json');
        console.log(publishedFiles(readRoster(rosterPath)).join('\n'));
        return 0;
      }
      case 'hydrate': {
        if (!args[0]) throw new Error('usage: board hydrate <dir>');
        const r = hydrate(args[0]);
        console.log(`board: hydrated models/board: ${String(r.added.length)} added, ${String(r.changed.length)} changed, ${String(r.unchanged)} unchanged`);
        for (const f of r.added) console.log(`  added    ${f}`);
        for (const f of r.changed) console.log(`  changed  ${f}`);
        for (const f of r.kept) console.log(`  differs from the store, board's kept  ${f}`);
        for (const f of r.boardOnly) console.log(`  board-only (the store lacks it, kept)  ${f}`);
        return 0;
      }
      case 'merge-roster': {
        if (!args[0]) throw new Error('usage: board merge-roster <live-roster.json>');
        const r = mergeRoster(args[0]);
        if (r.conflicts.length) {
          console.error(`board: roster entries differ between the board and the live store: ${r.conflicts.join(', ')}. Nothing written; stop and report.`);
          return 1;
        }
        console.log(r.added.length ? `board: added ${r.added.join(', ')} from the live roster` : 'board: the live roster has nothing the board lacks');
        return 0;
      }
      case 'publish-set': {
        const ids = flag(args, '--ids')?.split(',').filter(Boolean);
        const liveCount = num(args, '--live-count'), liveBytes = num(args, '--live-bytes');
        const set = publishSet({
          ...(ids ? { ids } : {}), biomes: args.includes('--biomes'), all: args.includes('--all'),
          ...(liveCount !== undefined ? { liveCount } : {}), ...(liveBytes !== undefined ? { liveBytes } : {}),
        });
        for (const w of set.warnings) console.error(w);
        console.log(JSON.stringify(set.files, null, 2));
        return 0;
      }
      default:
        console.error('usage: board.ts seed | files [--roster p] | hydrate <dir> | merge-roster <live.json> | publish-set [--ids a,b] [--biomes] [--all] [--live-count n] [--live-bytes n]');
        return 2;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`board: ${message}`);
    return error instanceof LimitError ? 1 : 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
