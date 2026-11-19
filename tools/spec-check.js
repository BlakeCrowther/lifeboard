#!/usr/bin/env node
/* SPEC.md <-> game.js RULES. Fails when a `section.key = value` in SPEC.md differs from RULES,
   names a key RULES doesn't have, or when a RULES entry is never mentioned in SPEC.md.
   Run: node tools/spec-check.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'game.js'));
const RULES = globalThis.LBG.RULES;
const spec = fs.readFileSync(path.join(root, 'SPEC.md'), 'utf8');

const leaves = {};
(function walk(o, p) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key); else leaves[key] = v;
  }
})(RULES, '');

const errs = [], seen = new Set();
for (const m of spec.matchAll(/`([a-z]+(?:\.[A-Za-z]+)+) = ([^`]+)`/g)) {
  const [, key, raw] = m;
  if (!(key in leaves)) { errs.push(`SPEC.md names ${key}, which is not in RULES`); continue; }
  seen.add(key);
  let val; try { val = JSON.parse(raw); } catch { errs.push(`SPEC.md ${key}: can't read value ${raw}`); continue; }
  if (JSON.stringify(val) !== JSON.stringify(leaves[key])) errs.push(`${key}: SPEC.md says ${raw}, game.js has ${JSON.stringify(leaves[key])}`);
}
for (const k of Object.keys(leaves)) if (!seen.has(k)) errs.push(`RULES.${k} = ${JSON.stringify(leaves[k])} is not in SPEC.md`);

if (errs.length) { console.error('spec-check: SPEC.md and game.js disagree\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`spec-check: ok (${seen.size} rules match)`);
