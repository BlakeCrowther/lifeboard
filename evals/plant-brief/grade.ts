/* plant-brief grader. check_spec.py (plant contract) plus the skill's own rules, then a short rubric. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ok, py, readJson, writeJson } from '../lib.ts';
import type { Check, SkillEval } from '../lib.ts';

const TRIS_CAP: Record<string, number> = { common: 8000, rare: 12000, exotic: 20000 };
const specsDir = (wd: string) => join(wd, 'models/plant/specs');
const rosterOf = (wd: string) => readJson(join(wd, 'models/roster.json')).models as any[];
const biomeOf = (wd: string, id: number) => (readJson(join(wd, 'models/biomes.json')).biomes as any[]).find((b) => b.id === id);

const grade: SkillEval = {
  task: (c) => `Design a seed species for one garden plant. Biome id ${c.biome}, rarity ${c.rarity}, habit "${c.habit}", calendar season ${c.season}, plot ${c.plot}, gen ${c.gen}. Write models/plant/specs/<id>.json (include plot, gen, habit) and make check_spec.py pass.`,

  place: (wd, _c, output) => writeJson(join(specsDir(wd), `${output.id}.json`), output),

  collect(wd) {
    const fresh = readdirSync(specsDir(wd)).filter((f) => f.endsWith('.json') && f !== 'mermaids_cup.json');
    if (fresh.length !== 1) throw new Error(`expected exactly one new spec in models/plant/specs, found ${fresh.length}`);
    return readJson(join(specsDir(wd), fresh[0]));
  },

  checks(wd, c, s): Check[] {
    const out: Check[] = [];
    const path = join('models/plant/specs', `${s.id}.json`);
    const sc = existsSync(join(wd, path)) ? py(wd, 'models/shared/tools/check_spec.py', [path]) : { status: 1, out: 'spec file missing' };
    out.push(ok('spec-check', sc.status === 0, sc.out.replace(/\s+/g, ' ').slice(0, 300)));
    const roster = rosterOf(wd).filter((m) => m.kind === 'plant');
    out.push(ok('kind-plant', s.kind === 'plant', `kind ${s.kind}`));
    out.push(ok('biome-matches-case', s.biome === c.biome, `biome ${s.biome}, case says ${c.biome}`));
    out.push(ok('rarity-matches-case', s.rarity === c.rarity, `rarity ${s.rarity}, case says ${c.rarity}`));
    out.push(ok('plot-gen-habit-carried', s.plot === c.plot && s.gen === c.gen && s.habit === c.habit, `plot/gen/habit ${s.plot}/${s.gen}/${s.habit}, case ${c.plot}/${c.gen}/${c.habit}`));
    out.push(ok('new-species', !roster.some((m) => m.id === s.id), `${s.id} already in roster`));
    const taken = roster.map((m) => readJson(join(wd, 'models', m.spec)).reference?.split(':')[0]?.trim().toLowerCase());
    out.push(ok('new-binomial', !taken.includes(String(s.reference ?? '').split(':')[0].trim().toLowerCase()), 'same binomial as a roster plant'));
    out.push(ok('reference-binomial', /^[A-Z][a-z]+ [a-z]+/.test(String(s.reference ?? '')), 'reference must start with a binomial name'));
    const archs = new Set(readdirSync(join(wd, 'models/plant/archetypes')).map((f) => f.replace(/\.py$/, '')));
    out.push(ok('generator-lineage', archs.has(s.archetype) || archs.has(s.based_on), `archetype ${s.archetype} not in library and based_on ${s.based_on} is not either`));
    out.push(ok('lore-60', typeof s.lore === 'string' && s.lore.length > 0 && s.lore.length <= 60, `lore length ${String(s.lore ?? '').length}`));
    const sh = s.shape ?? {};
    out.push(ok('shape-in-range', (!sh.head || (sh.head.petals >= 3 && sh.head.petals <= 24)) && (!sh.leaf || (sh.leaf.count >= 1 && sh.leaf.count <= 5)), 'head.petals 3-24, leaf.count 1-5'));
    out.push(ok('budget-tier', (s.budget?.tris ?? 1e9) <= (TRIS_CAP[s.rarity] ?? 0), `tris ${s.budget?.tris} over ${s.rarity} cap`));
    const acc = s.accessory;
    if (c.rarity === 'common') out.push(ok('accessory-rule', !acc, 'common plants get no accessory'));
    else out.push(ok('accessory-rule', !!acc && !!acc.item && !!acc.why && [3, 4].includes(acc.stage_from) && ['head', 'stem', 'leaf'].includes(acc.attach), 'rare/exotic needs accessory {item, why, stage_from 3|4, attach head|stem|leaf}'));
    return out;
  },

  rubric(wd, c, s) {
    const biome = biomeOf(wd, c.biome);
    const criteria = [
      { id: 'fits-biome', question: 'Species, shape and bloom colour follow the biome look (plants, shape, palette) and use no motif another biome owns; medium decides wind vs water sway sensibly.' },
      { id: 'season-shaped', question: `The calendar season (${c.season}) visibly shapes the plant: a species in its prime that season, plus a seasonal finish noted in reference.` },
      { id: 'real-species-honest-traits', question: 'reference names a real plant/alga/fungus and its late-stage traits are stated accurately.' },
    ];
    if (c.rarity !== 'common') criteria.push({ id: 'accessory-tied-to-habit', question: `The accessory is playful, plausibly small enough for the plant, and clearly tied to the habit "${c.habit}" (and may nod to the season).` });
    return {
      context: `Brief: garden plant for habit "${c.habit}", biome ${c.biome}, rarity ${c.rarity}, season ${c.season}.\nBiome: ${JSON.stringify({ name: biome.name, medium: biome.medium, look: biome.look })}\nExisting plants: ${JSON.stringify(rosterOf(wd).filter((m) => m.kind === 'plant').map((m) => m.id))}`,
      criteria,
    };
  },
};
export default grade;
