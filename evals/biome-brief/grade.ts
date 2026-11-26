/* biome-brief grader. check_biome.py decides validity; extra script checks cover the skill's design rules; a rubric covers taste. */
import { join } from 'node:path';
import { EVALS, ok, py, readJson, writeJson } from '../lib.ts';
import type { BiomesFile, Biome, Case, Check, SkillEval } from '../lib.ts';

/* The new biome's id, which is also how many biomes the frozen world keeps. */
interface BiomeCase extends Case { worldBiomes: number }
/* The new biome, how many biomes the file now holds, and whether an old one was rewritten. */
interface BiomeOutput { entry: Biome; count: number; priorChanged: boolean }

const biomesPath = (wd: string) => join(wd, 'models/board/biomes.json');
const LOOKS = ['reef', 'kelp', 'tidepool', 'mangrove', 'deep', 'meadow', 'canopy', 'jungle'];

const grade: SkillEval<BiomeCase, BiomeOutput> = {
  task: (c) => `The Ecosystem has moved on: biomes.json has biomes 0..${String(c.worldBiomes - 1)} and no entry for id ${String(c.worldBiomes)}. Brief exactly that one id (${String(c.worldBiomes)}) and append it to models/biomes.json. Scenery pieces are not built in this sandbox; the check will only warn about them.`,

  place(wd, _c, output) {
    const f = readJson(biomesPath(wd)) as BiomesFile;
    f.biomes.push(output.entry);
    writeJson(biomesPath(wd), f);
  },

  collect(wd, c) {
    const f = readJson(biomesPath(wd)) as BiomesFile;
    const n = c.worldBiomes;
    const before = (readJson(join(EVALS, 'fixtures/world/models/board/biomes.json')) as BiomesFile).biomes.slice(0, n);
    const entry = f.biomes[n];
    if (!entry) throw new Error(`biomes.json still has ${String(f.biomes.length)} biomes; nothing appended`);
    return { entry, count: f.biomes.length, priorChanged: JSON.stringify(before) !== JSON.stringify(f.biomes.slice(0, n)) };
  },

  checks(wd, c, o): Check[] {
    const out: Check[] = [];
    const e = o.entry;
    const id = c.worldBiomes;
    const cb = py(wd, 'models/shared/tools/check_biome.py', [String(id)]);
    const fails = cb.out.split('\n').filter((l) => l.startsWith('FAIL')).join(' | ');
    out.push(ok('check_biome', cb.status === 0, fails || cb.out.slice(0, 300)));
    out.push(ok('appended-as-next-id', e.id === id && o.count === id + 1, `id ${String(e.id)}, file holds ${String(o.count)} biomes (want id ${String(id)}, ${String(id + 1)} total)`));
    out.push(ok('existing-biomes-untouched', !o.priorChanged, 'an existing biome was rewritten; the skill must only append'));
    const prior = (readJson(biomesPath(wd)) as BiomesFile).biomes.filter((b) => b.id < id);
    const media = prior.map((b) => b.medium);
    const last = media.slice(-2);
    const sameTwice = last.length === 2 && last[0] === last[1];
    out.push(ok('medium-varies', !(sameTwice && e.medium === last[1]) && !(prior.length === 1 && prior[0]?.medium === 'water' && e.medium === 'water'),
      `medium ${String(e.medium)} after [${media.join(', ')}]: never three in a row, and the second biome of a fresh game leaves water`));
    out.push(ok('scene-is-a-known-builder', (e.scene !== undefined && LOOKS.includes(e.scene)) || (!!e.scenery && !!e.frame), `scene ${String(e.scene)}`));
    out.push(ok('name-1-3-words', typeof e.name === 'string' && e.name.trim().split(/\s+/).length <= 3, `name "${String(e.name)}"`));
    out.push(ok('examples-4-6', Array.isArray(e.examples) && e.examples.length >= 4 && e.examples.length <= 6, `examples ${String(e.examples?.length)}`));
    const owns = e.look?.owns;
    out.push(ok('owns-3-5', Array.isArray(owns) && owns.length >= 3 && owns.length <= 5, `owns ${String(owns?.length)}`));
    const pieces = new Set((e.scenery ?? []).map((sc) => sc.id));
    const blight = e.neglect?.blight;
    out.push(ok('scenery-3-5-with-neglect', e.scenery === undefined ? true : pieces.size >= 3 && pieces.size <= 5 && !!blight && !pieces.has(blight),
      `scenery ${String(pieces.size)} distinct pieces, blight ${String(blight)}`));
    return out;
  },

  rubric(wd, c) {
    const f = readJson(biomesPath(wd)) as BiomesFile;
    const archive = (readJson(join(wd, 'models/board/biomes.archive.json')) as BiomesFile).biomes;
    const neighbours = f.biomes.filter((b) => b.id < c.worldBiomes).slice(-2);
    return {
      context: [
        `Brief: design biome id ${String(c.worldBiomes)}.`,
        `Identity rules: ${JSON.stringify(f.identity_rules)}`,
        `Previous two biomes: ${JSON.stringify(neighbours.map((b) => ({ name: b.name, medium: b.medium, look: b.look })))}`,
        `Archived biomes (past games; a replay of one is a fail): ${JSON.stringify(archive.map((a) => ({ name: a.name, medium: a.medium, shape: a.look?.shape, palette: a.look?.palette, owns: a.look?.owns })))}`,
      ].join('\n'),
      criteria: [
        { id: 'real-environment-not-an-archive-replay', question: 'It is a real-world environment that is not a replay of any archived biome (two or more of: environment, shape language, palette family, owned motifs match one = replay).' },
        { id: 'passes-swap-test', question: 'Against the previous two biomes it would not pass as either after a recolor: its shape language, palette hue family and owned motifs are distinct.' },
        { id: 'examples-real-and-iconic', question: 'examples are real species with strong silhouettes, include one rare-worthy and one exotic-worthy icon, and suit the medium and locomotion.' },
        { id: 'look-coherent', question: 'look.shape names one shape language; creatures/plants/motion lines all echo it and the biome light; palette suits the environment.' },
        { id: 'neglect-true-to-place', question: 'If neglect is present, its form is how neglect really shows in this place (not generic overgrowth) and murk fits the medium. Pass if neglect is absent.' },
      ],
    };
  },
};
export default grade;
