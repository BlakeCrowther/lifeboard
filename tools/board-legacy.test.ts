/* A copy made before the board store keeps every model through an update: after merging upstream's starter split,
   board-legacy moves the copy's models into models/board/ and leaves models/starter/ exactly as upstream has it. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TOOL = resolve('tools/board-legacy.ts');
const entry = (id: string) => ({ id, js: `assets/${id}-glb.js`, spec: `plant/specs/${id}.json` });

function repo(): (...args: string[]) => string {
  const dir = mkdtempSync(join(tmpdir(), 'board-legacy-'));
  const run = (...args: string[]): string => execFileSync(args[0] ?? '', args.slice(1), { cwd: dir, encoding: 'utf8' });
  const put = (path: string, text: string): void => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  run('git', 'init', '-q', '-b', 'main');
  run('git', 'config', 'user.email', 'test@example.com');
  run('git', 'config', 'user.name', 'test');
  // shared base: one starter model at the old layout
  put('models/roster.json', JSON.stringify({ version: 2, models: [entry('kelp')] }));
  put('models/biomes.json', '{"biomes":[]}');
  put('models/assets/kelp-glb.js', 'kelp');
  put('models/plant/specs/kelp.json', '{"id":"kelp"}');
  put('models/assets/golden-glb.js', 'golden');
  run('git', 'add', '-A'); run('git', 'commit', '-qm', 'base');
  // upstream: the starter split
  run('git', 'switch', '-qc', 'upstream');
  run('git', 'mv', 'models/roster.json', 'models/biomes.json', 'models/plant', 'models/assets/kelp-glb.js', '.');
  mkdirSync(join(dir, 'models/starter/assets'), { recursive: true });
  run('git', 'mv', 'roster.json', 'biomes.json', 'plant', 'models/starter/');
  run('git', 'mv', 'kelp-glb.js', 'models/starter/assets/');
  run('git', 'commit', '-qm', 'starter split');
  // the board's copy: grew its own model
  run('git', 'switch', '-q', 'main');
  put('models/roster.json', JSON.stringify({ version: 2, models: [entry('kelp'), entry('aster')] }));
  put('models/assets/aster-glb.js', 'aster');
  put('models/plant/specs/aster.json', '{"id":"aster"}');
  run('git', 'add', '-A'); run('git', 'commit', '-qm', 'weekly run');
  return (...args: string[]) => (args[0] === 'read' ? readFileSync(join(dir, args[1] ?? ''), 'utf8') : args[0] === 'exists' ? String(existsSync(join(dir, args[1] ?? ''))) : run(...args));
}

describe('board-legacy', () => {
  it('moves the copy\'s models into models/board and keeps upstream\'s starter set', () => {
    const r = repo();
    try { r('git', 'merge', '-q', '--no-edit', 'upstream'); } catch { /* conflicts are expected; the tool settles the model paths */ }
    r('node', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', TOOL, '--from', 'ORIG_HEAD', '--upstream', 'upstream');
    const board = JSON.parse(r('read', 'models/board/roster.json')) as { models: { id: string }[] };
    expect(board.models.map((m) => m.id)).toEqual(['kelp', 'aster']);
    expect(r('read', 'models/board/assets/aster-glb.js')).toBe('aster');
    expect(JSON.parse(r('read', 'models/starter/roster.json'))).toEqual({ version: 2, models: [entry('kelp')] });
    expect(r('exists', 'models/roster.json')).toBe('false');
    expect(r('exists', 'models/assets/aster-glb.js')).toBe('false');
    expect(r('read', 'models/assets/golden-glb.js')).toBe('golden');
  });
});
