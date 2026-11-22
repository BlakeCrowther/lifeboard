/* Garden: one plant at a time per plot (habit). Weeks are plain integers so the sim and the page share this. SPEC.md "Garden". */
import { RULES, type Rarity, type WeekResult } from './rules.ts';

export interface Seed {
  rarity: Rarity;
  mutated?: boolean;
}

export interface Plant {
  seed: Seed;
  /** index into RULES.garden.stages */
  stage: number;
  alive: boolean;
  score: number;
  flourishes: number;
  targetWeeks: number;
  diedWeek: number | null;
  wilted?: boolean;
}

export interface FinishedPlant {
  bloomed: boolean;
  died: boolean;
  score: number;
  compost: boolean;
  seed: Required<Seed>;
}

export interface Plot {
  plant: Plant;
  /** plants finished in this plot so far */
  gen: number;
  /** weeks left on show; -1 while growing */
  rest: number;
}

const LAST_STAGE = 4;

/** floor and target may arrive as strings from the db. */
export function weekResult(count: number, floor: number | string, target: number | string): WeekResult {
  const safeFloor = Math.max(1, Number(floor) || 1);
  const safeTarget = Math.max(safeFloor, Number(target) || safeFloor);
  if (count < safeFloor) return 'died';
  if (count > safeTarget) return 'above';
  if (count === safeTarget) return 'target';
  return 'floor';
}

/** compost: the plot's last plant died, so the new seed starts already sprouted. */
export const newPlant = (seed: Seed, compost: boolean): Plant => ({ seed, stage: compost ? 1 : 0, alive: true, score: 0, flourishes: 0, targetWeeks: 0, diedWeek: null });

/** One closed week. A seed waits (no loss) until its first floor week; once sprouted, a week below floor kills it. Mutates and returns the plant. */
export function plantWeek(plant: Plant, result: WeekResult, week: number): Plant {
  if (!plant.alive) return plant;
  if (result === 'died') {
    if (plant.stage === 0) return plant;
    if (RULES.garden.wilt && !plant.wilted) {
      plant.wilted = true;
      return plant;
    }
    plant.alive = false;
    plant.diedWeek = week;
    return plant;
  }
  plant.wilted = false;
  plant.stage = Math.min(LAST_STAGE, plant.stage + 1);
  plant.score += RULES.garden.points[result];
  if (result === 'target' || result === 'above') plant.targetWeeks++;
  if (result === 'above') plant.flourishes++;
  return plant;
}

export const rarityOf = (score: number): Rarity => (score >= RULES.garden.rarity.exotic ? 'exotic' : score >= RULES.garden.rarity.rare ? 'rare' : 'common');

/** A finished plant (bloomed or dead): its score earns the plot's next seed. random() returns [0, 1). */
export function finishPlant(plant: Plant, random: () => number): FinishedPlant {
  const bloomed = plant.alive && plant.stage === LAST_STAGE;
  return { bloomed, died: !plant.alive, score: plant.score, compost: !plant.alive, seed: { rarity: bloomed ? rarityOf(plant.score) : 'common', mutated: random() < RULES.garden.mutation } };
}

export const newPlot = (seed?: Seed): Plot => ({ plant: newPlant(seed ?? { rarity: 'common' }, false), gen: 0, rest: -1 });

/** One closed week for a plot. A bloom (or dead plant) shows for bloomWeeks (restWeeks) more weeks, ignoring the habit;
    then it is pressed and the next seed (gen + 1) goes in. options.rest overrides restWeeks (a daily habit's plant that
    died mid-week has already shown withered). Returns the finished plant, or null. */
export function plotWeek(plot: Plot, result: WeekResult, week: number, random: () => number, options?: { rest?: number }): FinishedPlant | null {
  if (plot.rest > 0) plot.rest--;
  else if (plot.rest < 0) {
    plantWeek(plot.plant, result, week);
    if (!plot.plant.alive) plot.rest = options?.rest ?? RULES.garden.restWeeks;
    else if (plot.plant.stage === LAST_STAGE) plot.rest = RULES.garden.bloomWeeks;
  }
  if (plot.rest !== 0) return null;
  const finished = finishPlant(plot.plant, random);
  plot.plant = newPlant(finished.seed, finished.compost);
  plot.gen++;
  plot.rest = -1;
  return finished;
}
