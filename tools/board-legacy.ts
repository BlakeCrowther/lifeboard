// Moves a board copy made before the board store into models/board/. Run inside a lifeboard-update merge:
//   node tools/board-legacy.ts --from ORIG_HEAD --upstream <target>
// --from: the copy's pre-merge commit, whose models/roster.json, models/biomes.json and the roster entries' js, glb
// and spec files are this board's models. Writes them to models/board/ (paths relative to models/, as published),
// resets models/starter/ to upstream's, and at each old path either matches upstream (a file upstream tracks, such
// as a golden asset) or removes the board's leftover. Prints a JSON summary; exit 1 when --from has no roster.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface RosterEntry { js?: string; glb?: string; spec?: string }

const arg = (name: string): string => {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) { console.error(`usage: node tools/board-legacy.ts --from <ref> --upstream <ref> (missing ${name})`); process.exit(2); }
  return value;
};
const from = arg('--from'), upstream = arg('--upstream');

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });
const blob = (ref: string, path: string): Buffer | null => {
  try { return execFileSync('git', ['show', `${ref}:${path}`], { maxBuffer: 1 << 30 }); } catch { return null; }
};
const tracked = (ref: string, path: string): boolean => {
  try { execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], { stdio: 'ignore' }); return true; } catch { return false; }
};

const rosterBlob = blob(from, 'models/roster.json');
if (!rosterBlob) { console.error(`board-legacy: ${from} has no models/roster.json; nothing to move`); process.exit(1); }
const entries = (JSON.parse(rosterBlob.toString('utf8')) as { models?: RosterEntry[] }).models ?? [];
const relPaths = new Set(['roster.json', 'biomes.json']);
for (const e of entries) for (const p of [e.js, e.glb, e.spec]) if (p) relPaths.add(p);

const written: string[] = [], missing: string[] = [], removed: string[] = [], matched: string[] = [];
for (const rel of [...relPaths].sort()) {
  const data = blob(from, `models/${rel}`);
  if (!data) { missing.push(rel); continue; }
  const out = join('models/board', rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
  written.push(rel);
}

if (tracked(upstream, 'models/starter')) git('checkout', upstream, '--', 'models/starter');

for (const rel of relPaths) {
  const old = `models/${rel}`;
  if (tracked(upstream, old)) { git('checkout', upstream, '--', old); matched.push(old); continue; }
  if (git('ls-files', '--', old).trim()) { git('rm', '-q', '--cached', '--', old); removed.push(old); }
  rmSync(old, { force: true });
}

console.log(JSON.stringify({ from, upstream, models: entries.length, written: written.length, missing, removed, matched }, null, 2));
