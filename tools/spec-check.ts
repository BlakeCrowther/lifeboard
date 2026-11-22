/* SPEC.md <-> the game package's RULES. Fails when a `section.key = value` in SPEC.md differs from RULES,
   names a key RULES doesn't have, or when a RULES entry is never mentioned in SPEC.md.
   Run: node tools/spec-check.ts */
import { readFileSync } from 'node:fs';
import { RULES } from '../src/packages/game/index.ts';

const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8');

const leaves: Record<string, unknown> = {};
(function walk(node: object, prefix: string): void {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) walk(value as object, path);
    else leaves[path] = value;
  }
})(RULES, '');

const errors: string[] = [];
const seen = new Set<string>();
for (const match of spec.matchAll(/`([a-z]+(?:\.[A-Za-z]+)+) = ([^`]+)`/g)) {
  const [, key = '', raw = ''] = match;
  if (!(key in leaves)) {
    errors.push(`SPEC.md names ${key}, which is not in RULES`);
    continue;
  }
  seen.add(key);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    errors.push(`SPEC.md ${key}: can't read value ${raw}`);
    continue;
  }
  if (JSON.stringify(value) !== JSON.stringify(leaves[key])) errors.push(`${key}: SPEC.md says ${raw}, RULES has ${JSON.stringify(leaves[key])}`);
}
for (const key of Object.keys(leaves)) if (!seen.has(key)) errors.push(`RULES.${key} = ${JSON.stringify(leaves[key])} is not in SPEC.md`);

if (errors.length) {
  console.error('spec-check: SPEC.md and src/packages/game RULES disagree\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`spec-check: ok (${String(seen.size)} rules match)`);
