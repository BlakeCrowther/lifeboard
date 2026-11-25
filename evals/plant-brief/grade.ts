/* plant-brief grader. check_spec.py (plant contract) plus the skill's own rules, then a short rubric. */
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ok, py, readJson, writeJson } from '../lib.ts';
import type { BiomesFile, Case, Check, RosterFile, SkillEval } from '../lib.ts';

interface PlantCase extends Case { biome: number; rarity: string; habit: string; season: string; plot: string; gen: number }
interface PlantSpec {
  id: string; kind?: string; biome?: number; rarity?: string; plot?: string; gen?: number; habit?: string; archetype?: string; based_on?: string;
  lore?: string; reference?: string; budget?: { tris?: number };
  shape?: { head?: { petals: number }; leaf?: { count: number } };
  accessory?: { item?: string; why?: string; stage_from?: number; attach?: string };
}

const TRIS_CAP: Record<string, number> = { common: 8000, rare: 12000, exotic: 20000 };
const specsDir = (wd: string) => join(wd, 'models/board/plant/specs');
const rosterOf = (wd: string) => (readJson(join(wd, 'models/board/roster.json')) as RosterFile).models;
const biomeOf = (wd: string, id: number) => (readJson(join(wd, 'models/board/biomes.json')) as BiomesFile).biomes.find((b) => b.id === id);

const grade: SkillEval<PlantCase, PlantSpec> = {
  task: (c) => `Design a seed species for one garden plant. Biome id ${String(c.biome)}, rarity ${c.rarity}, habit "${c.habit}", calendar season ${c.season}, plot ${c.plot}, gen ${String(c.gen)}. Write models/plant/specs/<id>.json (include plot, gen, habit) and make check_spec.py pass.`,

  place(wd, _c, output) {
    writeJson(join(specsDir(wd), `${output.id}.json`), output);
    /* a fixture names its own generator (archetype = id) but carries no code: stand in a copy of the form it is based on */
    const arch = join(wd, 'models/plant/archetypes');
    if (output.archetype === output.id && output.based_on && existsSync(join(arch, `${output.based_on}.py`))) {
      copyFileSync(join(arch, `${output.based_on}.py`), join(arch, `${output.id}.py`));
    }
  },

  collect(wd) {
    const fresh = readdirSync(specsDir(wd)).filter((f) => f.endsWith('.json') && f !== 'mermaids_cup.json');
    if (fresh.length !== 1) throw new Error(`expected exactly one new spec in models/board/plant/specs, found ${String(fresh.length)}`);
    const only = fresh[0];
    if (only === undefined) throw new Error('no new spec');
    return readJson(join(specsDir(wd), only)) as PlantSpec;
  },

  checks(wd, c, s): Check[] {
    const out: Check[] = [];
    const path = join('models/board/plant/specs', `${s.id}.json`);
    const sc = existsSync(join(wd, path)) ? py(wd, 'models/shared/tools/check_spec.py', [path]) : { status: 1, out: 'spec file missing' };
    out.push(ok('spec-check', sc.status === 0, sc.out.replace(/\s+/g, ' ').slice(0, 300)));
    const roster = rosterOf(wd).filter((m) => m.kind === 'plant');
    out.push(ok('kind-plant', s.kind === 'plant', `kind ${String(s.kind)}`));
    out.push(ok('biome-matches-case', s.biome === c.biome, `biome ${String(s.biome)}, case says ${String(c.biome)}`));
    out.push(ok('rarity-matches-case', s.rarity === c.rarity, `rarity ${String(s.rarity)}, case says ${c.rarity}`));
    out.push(ok('plot-gen-habit-carried', s.plot === c.plot && s.gen === c.gen && s.habit === c.habit, `plot/gen/habit ${String(s.plot)}/${String(s.gen)}/${String(s.habit)}, case ${c.plot}/${String(c.gen)}/${c.habit}`));
    out.push(ok('new-species', !roster.some((m) => m.id === s.id), `${s.id} already in roster`));
    const taken = roster.map((m) => (readJson(join(wd, 'models/board', m.spec)) as PlantSpec).reference?.split(':')[0]?.trim().toLowerCase());
    out.push(ok('new-binomial', !taken.includes((s.reference ?? '').split(':')[0]?.trim().toLowerCase()), 'same binomial as a roster plant'));
    out.push(ok('reference-binomial', /^[A-Z][a-z]+ [a-z]+/.test(s.reference ?? ''), 'reference must start with a binomial name'));
    const archs = new Set<string | undefined>(readdirSync(join(wd, 'models/plant/archetypes')).map((f) => f.replace(/\.py$/, '')));
    out.push(ok('generator-lineage', archs.has(s.archetype) || archs.has(s.based_on), `archetype ${String(s.archetype)} not in library and based_on ${String(s.based_on)} is not either`));
    out.push(ok('lore-60', typeof s.lore === 'string' && s.lore.length > 0 && s.lore.length <= 60, `lore length ${String(s.lore?.length ?? 0)}`));
    const sh = s.shape ?? {};
    out.push(ok('shape-in-range', (!sh.head || (sh.head.petals >= 3 && sh.head.petals <= 24)) && (!sh.leaf || (sh.leaf.count >= 1 && sh.leaf.count <= 5)), 'head.petals 3-24, leaf.count 1-5'));
    out.push(ok('budget-tier', (s.budget?.tris ?? 1e9) <= (TRIS_CAP[s.rarity ?? ''] ?? 0), `tris ${String(s.budget?.tris)} over ${String(s.rarity)} cap`));
    const acc = s.accessory;
    if (c.rarity === 'common') out.push(ok('accessory-rule', !acc, 'common plants get no accessory'));
    else out.push(ok('accessory-rule', !!acc && !!acc.item && !!acc.why && [3, 4].some((n) => n === acc.stage_from) && ['head', 'stem', 'leaf'].some((a) => a === acc.attach), 'rare/exotic needs accessory {item, why, stage_from 3|4, attach head|stem|leaf}'));
    return out;
  },

  rubric(wd, c) {
    const biome = biomeOf(wd, c.biome);
    const criteria = [
      { id: 'fits-biome', question: 'Species, shape and bloom colour follow the biome look (plants, shape, palette) and use no motif another biome owns; medium decides wind vs water sway sensibly.' },
      { id: 'season-shaped', question: `The calendar season (${c.season}) visibly shapes the plant: a species in its prime that season, plus a seasonal finish noted in reference.` },
      { id: 'real-species-honest-traits', question: 'reference names a real plant/alga/fungus and its late-stage traits are stated accurately.' },
    ];
    if (c.rarity !== 'common') criteria.push({ id: 'accessory-tied-to-habit', question: `The accessory is playful, plausibly small enough for the plant, and clearly tied to the habit "${c.habit}" (and may nod to the season).` });
    return {
      context: `Brief: garden plant for habit "${c.habit}", biome ${String(c.biome)}, rarity ${c.rarity}, season ${c.season}.\nBiome: ${JSON.stringify({ name: biome?.name, medium: biome?.medium, look: biome?.look })}\nExisting plants: ${JSON.stringify(rosterOf(wd).filter((m) => m.kind === 'plant').map((m) => m.id))}`,
      criteria,
    };
  },
};
export default grade;
