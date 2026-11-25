/* The repo is public: committed plant models must not name the owner's habits. A plant's `plot` is its
   habit's random plot id (habits.plot_id), and no roster entry or plant spec carries the habit's name. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PLOT_ID = /^p[0-9a-f]{12}$/;
const read = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const roster = (read('models/roster.json')['models'] as Record<string, unknown>[]).filter((m) => m['kind'] === 'plant');
const specs = readdirSync('models/plant/specs').filter((f) => f.endsWith('.json')).map((f) => ({ f, spec: read(`models/plant/specs/${f}`) }));

describe('committed plant models name no habit', () => {
  it.each(roster.map((m) => [m['id'], m] as const))('roster %s', (_id, m) => {
    expect(m).not.toHaveProperty('habit');
    expect(m['plot']).toMatch(PLOT_ID);
  });
  it.each(specs.map(({ f, spec }) => [f, spec] as const))('spec %s', (_f, spec) => {
    expect(spec).not.toHaveProperty('habit');
    if (spec['plot'] != null) expect(spec['plot']).toMatch(PLOT_ID);
  });
});
