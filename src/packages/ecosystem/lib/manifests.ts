/* Typed readers for the model manifests (models/roster.json, models/biomes.json, creature specs). The JSON is written by the
   model pipeline; anything malformed is dropped here so the scene reads only fields it understands. */

export type ColorValue = string | number;
export type Range = [number, number];

export interface RestInput {
  on?: string;
  pose?: string;
  share?: number;
  bout_s?: Range;
}

export interface RosterEntry {
  id: string;
  js: string;
  kind?: string;
  biome?: number | null;
  rarity?: string;
  spec?: string;
  locomotion?: string;
  forward?: string;
  rest?: RestInput;
  name?: string;
  pass_through?: boolean;
}

export interface Roster {
  creatures: RosterEntry[];
  plants: RosterEntry[];
  scenery: RosterEntry[];
}

export interface SceneryPlacement {
  id: string;
  count?: number;
  scale?: Range;
  phases?: Range;
  phase?: number;
  spread?: string;
  pass_through?: boolean;
  landmark?: boolean;
}

export interface Neglect {
  blight?: string;
  murk?: ColorValue;
  murk_name?: string;
  count?: number;
  scale?: Range;
  grows_on?: string;
}

export interface FrameOverride {
  water?: [ColorValue, ColorValue];
  dens?: number;
  light?: number;
  ground?: string;
}

export interface Biome {
  id: number;
  name: string;
  medium?: string;
  scene?: string;
  scenery?: SceneryPlacement[];
  neglect?: Neglect;
  frame?: FrameOverride;
  pass_through?: string[];
}

export interface CreatureSpec {
  name?: string;
  locomotion?: string;
  /** spec field name from the creature contract: where it shelters */
  shelter?: string;
  rest?: RestInput;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const number = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const color = (value: unknown): ColorValue | undefined => text(value) ?? number(value);
const range = (value: unknown): Range | undefined => {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const first = number(value[0]);
  const second = number(value[1]);
  return first !== undefined && second !== undefined ? [first, second] : undefined;
};
const records = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

/** Copies only the defined values, so optional fields stay absent (exactOptionalPropertyTypes). */
function defined<T extends object>(value: { [K in keyof T]: T[K] | undefined }): T {
  const out: Partial<T> = {};
  for (const key of Object.keys(value) as (keyof T)[]) if (value[key] !== undefined) out[key] = value[key];
  return out as T;
}

function readRest(value: unknown): RestInput | undefined {
  if (!isRecord(value)) return undefined;
  return defined<RestInput>({ on: text(value['on']), pose: text(value['pose']), share: number(value['share']), bout_s: range(value['bout_s']) });
}

function readEntry(value: Json): RosterEntry | null {
  const id = text(value['id']);
  if (!id) return null;
  const biome = value['biome'] === null ? null : number(value['biome']);
  return {
    id,
    js: text(value['js']) ?? '',
    ...defined<Omit<RosterEntry, 'id' | 'js'>>({
      kind: text(value['kind']), biome, rarity: text(value['rarity']), spec: text(value['spec']), locomotion: text(value['locomotion']),
      forward: text(value['forward']), rest: readRest(value['rest']), name: text(value['name']),
      pass_through: typeof value['pass_through'] === 'boolean' ? value['pass_through'] : undefined,
    }),
  };
}

/** roster v2 `{ models: [...] }` with kind creature|plant|scenery, v1 `{ creatures: [...] }`, or a flat array */
export function readRoster(raw: unknown): Roster {
  const list = Array.isArray(raw) ? raw : isRecord(raw) ? (raw['models'] || raw['creatures'] || []) : [];
  const all = records(list).map(readEntry).filter((entry): entry is RosterEntry => entry !== null);
  return {
    creatures: all.filter((entry) => !entry.kind || entry.kind === 'creature'),
    plants: all.filter((entry) => entry.kind === 'plant'),
    scenery: all.filter((entry) => entry.kind === 'scenery'),
  };
}

function readPlacement(value: Json): SceneryPlacement | null {
  const id = text(value['id']);
  if (!id) return null;
  return {
    id,
    ...defined<Omit<SceneryPlacement, 'id'>>({
      count: number(value['count']), scale: range(value['scale']), phases: range(value['phases']), phase: number(value['phase']),
      spread: text(value['spread']), pass_through: typeof value['pass_through'] === 'boolean' ? value['pass_through'] : undefined,
      landmark: typeof value['landmark'] === 'boolean' ? value['landmark'] : undefined,
    }),
  };
}

function readBiome(value: Json): Biome | null {
  const id = number(value['id']);
  if (id === undefined) return null;
  const neglect = value['neglect'];
  const frame = value['frame'];
  const water = isRecord(frame) && Array.isArray(frame['water']) ? frame['water'] : null;
  const waterPair = water ? [color(water[0]), color(water[1])] : null;
  const scenery = value['scenery'];
  const passThrough = value['pass_through'];
  return {
    id,
    name: text(value['name']) ?? '',
    ...defined<Omit<Biome, 'id' | 'name'>>({
      medium: text(value['medium']),
      scene: text(value['scene']),
      scenery: Array.isArray(scenery) ? records(scenery).map(readPlacement).filter((item): item is SceneryPlacement => item !== null) : undefined,
      neglect: isRecord(neglect)
        ? defined<Neglect>({
            blight: text(neglect['blight']), murk: color(neglect['murk']), murk_name: text(neglect['murk_name']), count: number(neglect['count']),
            scale: range(neglect['scale']), grows_on: text(neglect['grows_on']),
          })
        : undefined,
      frame: isRecord(frame)
        ? defined<FrameOverride>({
            water: waterPair && waterPair[0] !== undefined && waterPair[1] !== undefined ? [waterPair[0], waterPair[1]] : undefined,
            dens: number(frame['dens']), light: number(frame['light']), ground: text(frame['ground']),
          })
        : undefined,
      pass_through: Array.isArray(passThrough) ? passThrough.filter((kind): kind is string => typeof kind === 'string') : undefined,
    }),
  };
}

/** biomes.json `{ biomes: [...] }` -> its biomes ([] when none) */
export function readBiomes(raw: unknown): Biome[] {
  return isRecord(raw) ? records(raw['biomes']).map(readBiome).filter((biome): biome is Biome => biome !== null) : [];
}

export function readSpec(raw: unknown): CreatureSpec {
  if (!isRecord(raw)) return {};
  const shelterField = raw['habitat']; /* the spec's key name (creature contract) */
  const shelter = isRecord(shelterField) ? (text(shelterField['shelter']) || text(shelterField['anchor'])) : undefined;
  return defined<CreatureSpec>({ name: text(raw['name']), locomotion: text(raw['locomotion']), shelter, rest: readRest(raw['rest']) });
}

/** The biome with this id, else the id wrapped round the list. With no biomes.json the default reef; with an empty one, uncharted. */
export function biomeFor(biomes: Biome[], loaded: boolean, id: number): Biome {
  const fallback: Biome = { id: 0, name: loaded ? 'Uncharted' : 'Coral shallows', medium: 'water' };
  const list = biomes.length ? biomes : [fallback];
  return list.find((biome) => biome.id === id) ?? list[((id % list.length) + list.length) % list.length] ?? fallback;
}

/** Scene key: the forced scene, else biomes.json `scene`, else by medium. Each key has its own scenery and look. */
export function sceneKeyOf(biome: Biome, forcedScene: string | null): string {
  const byMedium: Record<string, string> = { water: 'reef', land: 'meadow', air: 'canopy' };
  return forcedScene || biome.scene || byMedium[biome.medium || 'water'] || 'reef';
}
