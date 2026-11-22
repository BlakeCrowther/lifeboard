// Drift check between this checkout's publish set and the live artifact's files.
//   node tools/live-diff.ts --list        print the publish set (what the Artifact tool should receive as `files`)
//   node tools/live-diff.ts <live-dir>    compare <live-dir> (live files pulled with the Artifact tool's `read` +
//                                         `paths`, same relative paths) to a fresh `pnpm build` of this checkout
// Exit 0 = live matches; 1 = a published file differs or is missing (stale live, or live-only edits to port first);
// 2 = bad usage or no build. Files live has that this checkout would not publish are reported but do not fail.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Roster { models: { js: string; spec?: string }[] }

const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** Relative paths of every file the board publishes. Needs `pnpm build` (dist/ is gitignored). */
export function publishSet(): string[] {
  if (!existsSync('dist/app.js')) throw new Error('dist/app.js missing: run pnpm build first');
  const roster = JSON.parse(readFileSync('models/roster.json', 'utf8')) as Roster;
  const models = roster.models.flatMap((m) => [`models/${m.js}`, ...(m.spec ? [`models/${m.spec}`] : [])]);
  const dist = walk('dist').filter((f) => f.endsWith('.js') && (f === 'dist/app.js' || f.startsWith('dist/chunks/')));
  return [...new Set(['index.html', ...dist, 'models/roster.json', 'models/biomes.json', ...models])].sort();
}

/** The artifact service wraps index.html in a document skeleton (AGENTS.md "Publish"); remove it before comparing. */
const unwrap = (html: string): string =>
  html.replace(/^<!doctype html><html><head><meta charset=utf8>[^\n]*<body>\n/, '').replace(/\s*<\/body><\/html>\s*$/, '').trimEnd();

function main(): number {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: live-diff.ts --list | <live-dir>'); return 2; }
  const set = publishSet();
  if (arg === '--list') { console.log(set.join('\n')); return 0; }
  const bytes = (dir: string, path: string): string | undefined => {
    const file = join(dir, path);
    if (!existsSync(file)) return undefined;
    const raw = readFileSync(file);
    return sha(path === 'index.html' ? unwrap(raw.toString('utf8')) : raw);
  };
  const stale: string[] = [], missing: string[] = [];
  for (const path of set) {
    const local = path === 'index.html' ? sha(readFileSync(path, 'utf8').trimEnd()) : sha(readFileSync(path));
    const live = bytes(arg, path);
    if (live === undefined) missing.push(path);
    else if (live !== local) stale.push(path);
  }
  const extra = walk(arg).map((f) => f.slice(arg.length + 1)).filter((f) => !set.includes(f));
  console.log(`live-diff: ${String(set.length)} published files, ${String(stale.length)} differ, ${String(missing.length)} missing from live`);
  for (const f of stale) console.log(`  differs  ${f}`);
  for (const f of missing) console.log(`  missing  ${f}`);
  for (const f of extra) console.log(`  live-only (not published by this checkout, ignored)  ${f}`);
  return stale.length || missing.length ? 1 : 0;
}

process.exit(main());
