// Drift check between this checkout's page files and the live artifact's page files.
//   node tools/live-diff.ts --list [--models]        print the page publish set (index.html, dist/app.js, dist/chunks/*); with
//                                                    --models also the board's model files, in a separate list
//   node tools/live-diff.ts <live-dir> [--models]    compare <live-dir> (live files pulled with the Artifact tool's `read` +
//                                                    `paths`, same relative paths) to a fresh `pnpm build` of this checkout
// Exit 0 = live page files match; 1 = a page file differs or is missing (stale live, or live-only edits to port first);
// 2 = bad usage or no build. The exit code reflects page files only. Model files (a board's models ship separately, through
// model-ship) are reported with --models and never change the exit code: the store holding models the repo lacks is expected.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { modelDir, resolveModelFile } from '../models/shared/tools/model-files.ts';
import { publishedFiles, type Roster } from './board.ts';

const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** Relative paths of the page files a page publish sends. Needs `pnpm build` (dist/ is gitignored). */
export function pageSet(): string[] {
  if (!existsSync('dist/app.js')) throw new Error('dist/app.js missing: run pnpm build first');
  const dist = walk('dist').filter((f) => f.endsWith('.js') && (f === 'dist/app.js' || f.startsWith('dist/chunks/')));
  return ['index.html', ...dist].sort();
}

/** Published paths of the board's model files (the model dir's roster and what it lists). */
export function modelSet(): string[] {
  return publishedFiles(JSON.parse(readFileSync(join(modelDir(), 'roster.json'), 'utf8')) as Roster).sort();
}

/** The artifact service wraps index.html in a document skeleton (AGENTS.md "Publish"); remove it before comparing. */
const unwrap = (html: string): string =>
  html.replace(/^<!doctype html><html><head><meta charset=utf8>[^\n]*<body>\n/, '').replace(/\s*<\/body><\/html>\s*$/, '').trimEnd();

function main(): number {
  const args = process.argv.slice(2);
  const withModels = args.includes('--models');
  const arg = args.find((a) => a !== '--models');
  if (!arg) { console.error('usage: live-diff.ts --list [--models] | <live-dir> [--models]'); return 2; }
  const set = pageSet();
  if (arg === '--list') {
    console.log(set.join('\n'));
    if (withModels) console.log(`\nmodel files (not part of a page publish):\n${modelSet().join('\n')}`);
    return 0;
  }
  const bytes = (dir: string, path: string): string | undefined => {
    const file = join(dir, path);
    if (!existsSync(file)) return undefined;
    const raw = readFileSync(file);
    return sha(path === 'index.html' ? unwrap(raw.toString('utf8')) : raw);
  };
  const localBytes = (path: string): string => (path === 'index.html' ? sha(readFileSync(path, 'utf8').trimEnd()) : sha(readFileSync(path)));
  const stale: string[] = [], missing: string[] = [];
  for (const path of set) {
    const live = bytes(arg, path);
    if (live === undefined) missing.push(path);
    else if (live !== localBytes(path)) stale.push(path);
  }
  console.log(`live-diff: ${String(set.length)} page files, ${String(stale.length)} differ, ${String(missing.length)} missing from live`);
  for (const f of stale) console.log(`  differs  ${f}`);
  for (const f of missing) console.log(`  missing  ${f}`);
  if (withModels) {
    const models = modelSet();
    const liveModels = existsSync(join(arg, 'models')) ? walk(join(arg, 'models')).map((f) => f.slice(arg.length + 1)) : [];
    console.log('model files (informational, never fail the check):');
    for (const f of models) {
      const live = bytes(arg, f);
      const file = resolveModelFile(f.slice('models/'.length));
      const local = file ? sha(readFileSync(file)) : undefined;
      if (live === undefined) console.log(`  not in the store  ${f}`);
      else if (local !== undefined && live !== local) console.log(`  differs from the board's copy  ${f}`);
    }
    for (const f of liveModels.filter((f) => !models.includes(f))) console.log(`  store-only (expected)  ${f}`);
  }
  return stale.length || missing.length ? 1 : 0;
}

process.exit(main());
