import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localFileFor } from '../models/shared/tools/static-server.ts';
import { resolveModelFile } from '../models/shared/tools/model-files.ts';
import { LimitError, LIMITS, formatRoster, hydrate, mergeRoster, publishSet, publishedFiles, seed } from './board.ts';

let models: string;
const write = (rel: string, body: string): void => {
  mkdirSync(path.dirname(path.join(models, rel)), { recursive: true });
  writeFileSync(path.join(models, rel), body);
};
const entry = (id: string, extra: Record<string, unknown> = {}) => ({ id, js: `assets/${id}-glb.js`, spec: `creature/specs/${id}.json`, ...extra });
const roster = (...ids: string[]) => formatRoster({ models: ids.map((id) => entry(id)) });
const modelFiles = (dir: string, ...ids: string[]): void => {
  write(`${dir}/roster.json`, roster(...ids));
  write(`${dir}/biomes.json`, '{"biomes":[]}');
  for (const id of ids) { write(`${dir}/assets/${id}-glb.js`, 'x'.repeat(10)); write(`${dir}/creature/specs/${id}.json`, '{}'); }
};

beforeEach(() => { models = mkdtempSync(path.join(os.tmpdir(), 'lb-board-')); });
afterEach(() => { rmSync(models, { recursive: true, force: true }); });

describe('seed', () => {
  it('copies the starter set once and never overwrites a board', () => {
    modelFiles('starter', 'a');
    expect(seed(models)).toBe(true);
    write('board/roster.json', roster('mine'));
    expect(seed(models)).toBe(false);
    expect(readFileSync(path.join(models, 'board/roster.json'), 'utf8')).toContain('mine');
  });
});

describe('merge-roster', () => {
  it('adds live-only entries', () => {
    modelFiles('board', 'a');
    write('live.json', roster('a', 'b'));
    expect(mergeRoster(path.join(models, 'live.json'), models)).toEqual({ added: ['b'], conflicts: [] });
    expect(readFileSync(path.join(models, 'board/roster.json'), 'utf8')).toContain('"id": "b"');
  });

  it('writes nothing and names the id when an entry differs', () => {
    modelFiles('board', 'a');
    const before = readFileSync(path.join(models, 'board/roster.json'), 'utf8');
    write('live.json', formatRoster({ models: [entry('a', { rarity: 'rare' }), entry('b')] }));
    expect(mergeRoster(path.join(models, 'live.json'), models)).toEqual({ added: ['b'], conflicts: ['a'] });
    expect(readFileSync(path.join(models, 'board/roster.json'), 'utf8')).toBe(before);
  });
});

describe('publish-set', () => {
  it('maps the roster and the chosen ids to local files', () => {
    modelFiles('board', 'a', 'b');
    const set = publishSet({ ids: ['b'], biomes: true }, models);
    expect(Object.keys(set.files).sort()).toEqual(['models/assets/b-glb.js', 'models/biomes.json', 'models/creature/specs/b.json', 'models/roster.json']);
  });

  it('refuses when the new version would reach the file limit', () => {
    modelFiles('board', 'a');
    expect(() => publishSet({ ids: ['a'], liveCount: LIMITS.files - 3 }, models)).toThrow(LimitError);
    expect(publishSet({ ids: ['a'], liveCount: LIMITS.files - 4 }, models).warnings[0]).toContain('files');
  });

  it('refuses when the new version would reach the byte limit', () => {
    modelFiles('board', 'a');
    expect(() => publishSet({ ids: ['a'], liveBytes: LIMITS.bytes - 5 }, models)).toThrow(LimitError);
  });
});

describe('hydrate', () => {
  it('copies store files, reports changes and keeps board files the store lacks', () => {
    modelFiles('board', 'a', 'mine');
    write('pull/models/roster.json', roster('a', 'live'));
    write('pull/models/assets/a-glb.js', 'changed');
    write('pull/models/assets/live-glb.js', 'y');
    const report = hydrate(path.join(models, 'pull'), models);
    expect(report.added).toContain('assets/live-glb.js');
    expect(report.changed).toContain('assets/a-glb.js');
    expect(readFileSync(path.join(models, 'board/assets/mine-glb.js'), 'utf8')).toBe('x'.repeat(10));
  });

  it('keeps a board-only roster entry and biome, adds store-only ones', () => {
    modelFiles('board', 'a', 'mine');
    write('board/biomes.json', JSON.stringify({ biomes: [{ id: 0, name: 'mine' }] }));
    write('pull/models/roster.json', roster('a', 'live'));
    write('pull/models/biomes.json', JSON.stringify({ biomes: [{ id: 1, name: 'live' }] }));
    const report = hydrate(path.join(models, 'pull'), models);
    const ids = (JSON.parse(readFileSync(path.join(models, 'board/roster.json'), 'utf8')) as { models: { id: string }[] }).models.map((m) => m.id);
    expect(ids).toEqual(['a', 'mine', 'live']);
    const biomes = (JSON.parse(readFileSync(path.join(models, 'board/biomes.json'), 'utf8')) as { biomes: { id: number }[] }).biomes.map((b) => b.id);
    expect(biomes).toEqual([0, 1]);
    expect(report.boardOnly).toContain('roster mine');
  });

  it('keeps the board entry and its files when an id differs, and copies no golden', () => {
    modelFiles('board', 'a');
    write('assets/gold-glb.js', 'golden');
    write('pull/models/roster.json', formatRoster({ models: [entry('a', { rarity: 'rare' })] }));
    write('pull/models/assets/a-glb.js', 'store version');
    write('pull/models/assets/gold-glb.js', 'golden');
    const report = hydrate(path.join(models, 'pull'), models);
    expect(report.kept).toEqual(['roster a']);
    expect(readFileSync(path.join(models, 'board/assets/a-glb.js'), 'utf8')).toBe('x'.repeat(10));
    expect(readFileSync(path.join(models, 'board/roster.json'), 'utf8')).not.toContain('rare');
    expect(report.added).not.toContain('assets/gold-glb.js');
  });
});

describe('files', () => {
  it('leaves out files only the pipeline layer holds', () => {
    modelFiles('starter', 'a');
    write('assets/gold-glb.js', 'g');
    const list = publishedFiles({ models: [entry('a'), { id: 'gold', js: 'assets/gold-glb.js' }] }, models);
    expect(list).toContain('models/assets/a-glb.js');
    expect(list).not.toContain('models/assets/gold-glb.js');
  });
});

describe('model file resolution', () => {
  it('answers board, then starter, then models/', () => {
    write('x.json', 'root'); expect(resolveModelFile('x.json', models)).toBe(path.join(models, 'x.json'));
    write('starter/x.json', 'starter'); expect(resolveModelFile('x.json', models)).toBe(path.join(models, 'starter/x.json'));
    write('board/x.json', 'board'); expect(resolveModelFile('x.json', models)).toBe(path.join(models, 'board/x.json'));
    expect(resolveModelFile('none.json', models)).toBeUndefined();
  });

  it('maps /models/<path> for the static server the same way and refuses traversal', () => {
    write('models/starter/x.json', 's'); write('models/board/x.json', 'b'); write('models/y.json', 'y'); write('index.html', 'i');
    expect(localFileFor(models, '/models/x.json')).toBe(path.join(models, 'models/board/x.json'));
    expect(localFileFor(models, '/models/y.json')).toBe(path.join(models, 'models/y.json'));
    expect(localFileFor(models, '/index.html')).toBe(path.join(models, 'index.html'));
    expect(localFileFor(models, '/models/../../etc/passwd')).toBeUndefined();
  });
});
