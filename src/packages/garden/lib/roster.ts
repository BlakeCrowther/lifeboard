/* Readers for the model pipeline's JSON (models/roster.json, models/biomes.json) and the plant pool built from them. */
import type { PlantPool } from '../../game/derive.ts';
import { speciesNames } from './labels.ts';
import { requestRerender } from './rerender.ts';

export interface RosterModel {
  id: string;
  kind?: string;
  name?: string;
  biome?: number;
  rarity?: string;
  added?: string;
  /** plants: the habit key this plant was made for, and which plant of that plot */
  plot?: string | null;
  gen?: number | null;
  /** the script under models/ that sets window.LB_PLANTS[id] */
  js?: string;
  /** plants: the SVG species drawn until the 3D model is on screen */
  svg?: string;
}

export interface BiomeLook {
  palette?: string[];
  owns?: string[];
}

export interface Biome {
  id: number;
  name: string;
  medium?: string;
  scene?: string;
  look?: BiomeLook;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const optionalNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
const stringList = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined);

function setDefined<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

/** roster.json `models`, keeping entries with a string id. */
export function readRosterModels(json: unknown): RosterModel[] {
  const models = isRecord(json) && Array.isArray(json.models) ? json.models : [];
  return models.filter(isRecord).flatMap((raw): RosterModel[] => {
    if (typeof raw.id !== 'string') return [];
    const model: RosterModel = { id: raw.id };
    setDefined(model, 'kind', optionalString(raw.kind));
    setDefined(model, 'name', optionalString(raw.name));
    setDefined(model, 'biome', optionalNumber(raw.biome));
    setDefined(model, 'rarity', optionalString(raw.rarity));
    setDefined(model, 'added', optionalString(raw.added));
    setDefined(model, 'plot', raw.plot === null ? null : optionalString(raw.plot));
    setDefined(model, 'gen', raw.gen === null ? null : optionalNumber(raw.gen));
    setDefined(model, 'js', optionalString(raw.js));
    setDefined(model, 'svg', optionalString(raw.svg));
    return [model];
  });
}

/** biomes.json `biomes`, keeping entries with a numeric id and a name. */
export function readBiomes(json: unknown): Biome[] {
  const biomes = isRecord(json) && Array.isArray(json.biomes) ? json.biomes : [];
  return biomes.filter(isRecord).flatMap((raw): Biome[] => {
    if (typeof raw.id !== 'number' || typeof raw.name !== 'string') return [];
    const biome: Biome = { id: raw.id, name: raw.name };
    setDefined(biome, 'medium', optionalString(raw.medium));
    setDefined(biome, 'scene', optionalString(raw.scene));
    if (isRecord(raw.look)) {
      const look: BiomeLook = {};
      setDefined(look, 'palette', stringList(raw.look.palette));
      setDefined(look, 'owns', stringList(raw.look.owns));
      biome.look = look;
    }
    return [biome];
  });
}

/** Roster plants by id, filled when the plant pool loads. */
export const rosterPlants: Record<string, RosterModel> = {};

let pool: PlantPool | null = null;
let version = 0;

export const poolVersion = (): number => version;

const readableName = (id: string): string => id.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());

/** Feeds deriveGame: loads models/roster.json once, then asks the board to redraw. */
export function plantPool(): PlantPool {
  if (!pool) {
    pool = { n: 1, byBiome: {} };
    Promise.all([
      fetch('models/roster.json').then((response) => response.json() as Promise<unknown>),
      fetch('models/biomes.json')
        .then((response) => response.json() as Promise<unknown>)
        .catch(() => null),
    ])
      .then(([rosterJson, biomesJson]) => {
        const plants = readRosterModels(rosterJson).filter((model) => model.kind === 'plant');
        const byBiome: Record<string, string[]> = {};
        const meta: NonNullable<PlantPool['plants']> = {};
        for (const model of plants) {
          rosterPlants[model.id] = model;
          speciesNames[model.id] = model.name || readableName(model.id);
          (byBiome[String(model.biome)] ??= []).push(model.id);
          meta[model.id] = { ...(model.added ? { added: model.added } : {}), plot: model.plot ?? null, gen: model.gen ?? null };
        }
        const biomeCount = isRecord(biomesJson) && Array.isArray(biomesJson.biomes) ? biomesJson.biomes.length : 0;
        pool = { n: biomeCount || 1, byBiome, plants: meta };
        version++;
        if (plants.length) requestRerender();
      })
      .catch(() => undefined);
  }
  return pool;
}

let biomeList: Biome[] | null = null;
const FALLBACK_BIOMES: Biome[] = [{ id: 0, name: 'Coral shallows', medium: 'water' }];

/** The biome with this id from models/biomes.json, or one picked by id while it loads (redraws after). */
export function biomeById(id: number): Biome {
  if (!biomeList) {
    biomeList = [];
    fetch('models/biomes.json')
      .then((response) => response.json() as Promise<unknown>)
      .then((json) => {
        biomeList = readBiomes(json);
        requestRerender();
      })
      .catch(() => undefined);
  }
  const list = biomeList.length ? biomeList : FALLBACK_BIOMES;
  return list.find((biome) => biome.id === id) ?? list[((id % list.length) + list.length) % list.length] ?? FALLBACK_BIOMES[0] ?? { id: 0, name: '' };
}

let creatures: RosterModel[] | null = null;

/** The creatures from models/roster.json that live in a biome (empty until the roster loads, then a redraw). */
export function visitorsOf(biomeId: number): { name: string; rarity: string }[] {
  if (!creatures) {
    creatures = [];
    fetch('models/roster.json')
      .then((response) => response.json() as Promise<unknown>)
      .then((json) => {
        creatures = readRosterModels(json).filter((model) => (model.kind || 'creature') === 'creature');
        requestRerender();
      })
      .catch(() => undefined);
  }
  return creatures
    .filter((model) => model.biome === biomeId)
    .map((model) => ({ name: model.name || model.id.replace(/[-_]/g, ' ').replace(/^./, (char) => char.toUpperCase()), rarity: model.rarity || 'common' }));
}
