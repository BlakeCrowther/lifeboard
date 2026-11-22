/* creature-brief grader. Script checks first (check_spec.py plus the skill's own rules), then a short rubric. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ok, py, readJson, writeJson } from '../lib.ts';
import type { Case, Check, SkillEval } from '../lib.ts';

const TRIS_CAP: Record<string, number> = { common: 8000, rare: 9000, exotic: 16000 };
const specsDir = (wd: string) => join(wd, 'models/creature/specs');
const rosterOf = (wd: string) => readJson(join(wd, 'models/roster.json')).models as any[];
const biomesOf = (wd: string) => readJson(join(wd, 'models/biomes.json')).biomes as any[];

const grade: SkillEval = {
  task: (c) => `Brief the next visitor. Biome id ${c.biome}, rarity ${c.rarity}. Write models/creature/specs/<id>.json and make check_spec.py pass.`,

  place: (wd, _c, output) => writeJson(join(specsDir(wd), `${output.id}.json`), output),

  collect(wd) {
    const known = new Set(rosterOf(wd).map((m) => m.id + '.json').concat(['pronghorn.json', 'gulf_pipefish.json']));
    const fresh = readdirSync(specsDir(wd)).filter((f) => f.endsWith('.json') && !known.has(f));
    if (fresh.length !== 1) throw new Error(`expected exactly one new spec in models/creature/specs, found ${fresh.length}`);
    return readJson(join(specsDir(wd), fresh[0]));
  },

  checks(wd, c, s): Check[] {
    const out: Check[] = [];
    const path = join('models/creature/specs', `${s.id}.json`);
    const sc = existsSync(join(wd, path)) ? py(wd, 'models/shared/tools/check_spec.py', [path]) : { status: 1, out: 'spec file missing' };
    out.push(ok('spec-check', sc.status === 0, sc.out.replace(/\s+/g, ' ').slice(0, 300)));
    const roster = rosterOf(wd);
    const biomes = biomesOf(wd);
    out.push(ok('biome-matches-case', s.biome === c.biome, `biome ${s.biome}, case says ${c.biome}`));
    out.push(ok('rarity-matches-case', s.rarity === c.rarity, `rarity ${s.rarity}, case says ${c.rarity}`));
    out.push(ok('new-species', !roster.some((m) => m.id === s.id) && !roster.some((m) => String(m.name || '').toLowerCase() === String(s.name || '').toLowerCase()), `${s.id} already in roster`));
    const last = [...roster].reverse().find((m) => m.kind === 'creature');
    const lastArch = last ? readJson(join(wd, 'models', last.spec)).archetype : null;
    out.push(ok('archetype-not-repeated', !lastArch || s.archetype !== lastArch, `same archetype as ${last?.id}: ${lastArch}`));
    const archDir = join(wd, 'models/creature/archetypes');
    const archs = new Set(readdirSync(archDir).map((f) => f.replace(/\.py$/, '')));
    out.push(ok('generator-lineage', archs.has(s.archetype) || archs.has(s.based_on), `archetype ${s.archetype} is new but based_on ${s.based_on} is not an archetype in the library`));
    const path_ = String(s.notes?.path ?? '');
    out.push(ok('notes.path-records-choice', path_.length >= 60 && /novel|safe/i.test(path_), 'notes.path must name novel/safe and the struck candidates'));
    out.push(ok('notes.traits-2-4', Array.isArray(s.notes?.traits) && s.notes.traits.length >= 2 && s.notes.traits.length <= 4, 'notes.traits needs 2-4 entries'));
    out.push(ok('rest-decided', (s.rest && typeof s.rest === 'object') || String(s.notes?.rest ?? '').length > 5, 'give rest {} or notes.rest saying it never rests'));
    out.push(ok('lore-60', typeof s.lore === 'string' && s.lore.length > 0 && s.lore.length <= 60, `lore length ${String(s.lore ?? '').length}`));
    out.push(ok('reference-binomial', /^[A-Z][a-z]+ [a-z]+/.test(String(s.reference ?? '')), 'reference must start with a binomial name'));
    out.push(ok('palette-2-4-mains-accent', (s.palette?.main?.length ?? 0) >= 2 && (s.palette?.main?.length ?? 0) <= 4 && !!s.palette?.accent, 'palette needs 2-4 mains plus accent'));
    out.push(ok('ecosystem.shelter', !!s.ecosystem?.shelter, 'ecosystem.shelter missing'));
    out.push(ok('budget-tier', (s.budget?.tris ?? 1e9) <= (TRIS_CAP[s.rarity] ?? 0), `tris ${s.budget?.tris} over ${s.rarity} cap ${TRIS_CAP[s.rarity]}`));
    const prose = [s.name, s.reference, s.lore, JSON.stringify(s.notes ?? {})].join(' ').toLowerCase();
    const foreign = biomes.filter((b) => b.id !== s.biome).flatMap((b) => (b.look?.owns ?? []) as string[]).filter((m) => prose.includes(m.toLowerCase()));
    out.push(ok('no-other-biome-motif', foreign.length === 0, `uses motif owned by another biome: ${foreign.join(', ')}`));
    return out;
  },

  rubric(wd, c, s) {
    const biome = biomesOf(wd).find((b) => b.id === c.biome);
    const others = rosterOf(wd).filter((m) => m.kind === 'creature').map((m) => readJson(join(wd, 'models', m.spec)));
    return {
      context: [
        `Brief: next Ecosystem visitor, biome ${c.biome}, rarity ${c.rarity}.`,
        `Biome: ${JSON.stringify({ name: biome.name, medium: biome.medium, examples: biome.examples, look: biome.look })}`,
        `Existing roster creatures: ${JSON.stringify(others.map((o) => ({ id: o.id, biome: o.biome, archetype: o.archetype, reference: o.reference, palette: o.palette?.main })))}`,
      ].join('\n'),
      criteria: [
        { id: 'fits-biome-look', question: 'Body plan, silhouette and palette echo the biome look (shape, palette, creatures, motion); it would read as from this biome at card size.' },
        { id: 'not-a-roster-recolor', question: 'It is not a recolor of an existing roster creature: it differs in at least two of body plan, silhouette, pattern, hue family, size class, motion.' },
        { id: 'real-species-honest-traits', question: 'reference names a real species whose traits are stated accurately, and locomotion and rest suit the real animal.' },
        { id: 'rarity-feels-right', question: 'Common is a typical animal of the biome; rare/exotic is the biome\'s iconic animal pushed one notch more dramatic.' },
      ],
    };
  },
};
export default grade;
