import { describe, expect, it } from 'vitest';
import { blight, cloudiness, dayTide, newPlot, overdueReward, plotWeek, rarityOf, weekResult, type FinishedPlant, type WeekResult } from '../index.ts';
import { deriveGame, type GameHabit } from '../derive.ts';
import { ringPercent } from '../../tasks/index.ts';

const neverMutates = (): number => 0.99;

/** Runs a fresh plot through the given week results and returns what it finished with. */
function growPlot(results: WeekResult[]): { finished: FinishedPlant | null; stage: number; score: number } {
  const plot = newPlot();
  let finished: FinishedPlant | null = null;
  results.forEach((result, week) => {
    finished = plotWeek(plot, result, week, neverMutates) ?? finished;
  });
  return { finished, stage: plot.plant.stage, score: plot.plant.score };
}

describe('weekResult (SPEC.md week result table)', () => {
  it('scores a week against floor and target', () => {
    expect(weekResult(1, 2, 3)).toBe('died');
    expect(weekResult(2, 2, 3)).toBe('floor');
    expect(weekResult(3, 2, 3)).toBe('target');
    expect(weekResult(4, 2, 3)).toBe('above');
  });
});

describe('garden seeds (SPEC.md "When a plant finishes")', () => {
  // A seed blooms after 4 growing weeks, shows a week, then is pressed.
  it('four floor weeks score 4: a common seed', () => {
    const { finished } = growPlot(['floor', 'floor', 'floor', 'floor', 'floor']);
    expect(finished).toMatchObject({ bloomed: true, score: 4, seed: { rarity: 'common' } });
  });

  it('two weeks at target make it rare', () => {
    expect(growPlot(['target', 'target', 'floor', 'floor', 'floor']).finished).toMatchObject({ score: 6, seed: { rarity: 'rare' } });
  });

  it('one week above target makes it rare', () => {
    expect(growPlot(['above', 'floor', 'floor', 'floor', 'floor']).finished).toMatchObject({ score: 6, seed: { rarity: 'rare' } });
  });

  it('exotic needs most weeks above target', () => {
    expect(growPlot(['above', 'above', 'above', 'floor', 'floor']).finished).toMatchObject({ score: 10, seed: { rarity: 'exotic' } });
    expect(rarityOf(9)).toBe('rare');
  });

  it('a seed waits through missed weeks; a sprouted plant dies and leaves compost', () => {
    expect(growPlot(['died', 'died']).stage).toBe(0);
    const { finished, stage } = growPlot(['floor', 'died', 'died']);
    expect(finished).toMatchObject({ died: true, compost: true, seed: { rarity: 'common' } });
    expect(stage).toBe(1);
  });
});

describe('habitat growth', () => {
  it('earns ring % x 10 plus 5 for a full ring', () => {
    expect(ringPercent({ done: 3, committed: 4 })).toBe(0.75);
    expect(dayTide(4, 3)).toEqual({ pct: 0.75, full: false, pts: 7.5 });
    expect(dayTide(4, 4)).toEqual({ pct: 1, full: true, pts: 15 });
    expect(dayTide(0, 2)).toBeNull();
  });

  it('grows blight from tasks first committed 4+ days ago, full at 10 such tasks', () => {
    expect(blight([1, 3])).toBe(0);
    expect(blight([3, 4, 12])).toBe(0.2);
    expect(blight(Array.from({ length: 12 }, () => 5))).toBe(1);
    expect(cloudiness(5)).toBe(0.5);
  });

  it('caps overdue visitor drops at one a week and one exotic a biome', () => {
    const counter = { weekDrops: 0, exotics: 0 };
    expect(overdueReward(counter, 30)).toBe('exotic');
    expect(overdueReward(counter, 30)).toBeNull();
    counter.weekDrops = 0;
    expect(overdueReward(counter, 45)).toBe('rare');
    counter.weekDrops = 0;
    expect(overdueReward(counter, 6)).toBeNull();
  });
});

describe('deriveGame', () => {
  it('blooms a habit kept at floor for four weeks and presses it the week after', () => {
    // Mondays from 2026-10-05; one session a week, floor 1, target 2
    const sessions = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'].map((date) => ({ h: 'read', date }));
    const game = deriveGame({ today: '2026-11-11', tasks: [], habits: [{ key: 'read', name: 'Read', floor: 1, target: 2 }], sessions });
    expect(game.history).toHaveLength(1);
    expect(game.history[0]).toMatchObject({ bloomed: true, score: 4, earned: { rarity: 'common' }, from: '2026-10-05', to: '2026-11-08' });
    expect(game.plots[0]).toMatchObject({ gen: 1, stage: 0 });
  });

  it('counts blight from a task pushed since its first commitment', () => {
    const game = deriveGame({ today: '2026-11-21', tasks: [{ eff: '2026-11-25', done: false, days: ['2026-11-10', '2026-11-18'] }] });
    expect(game.blight).toBe(0.1);
    expect(game.overdue).toBe(0);
  });
});

describe('deriveGame: a habit created mid-week (SPEC.md Garden)', () => {
  // weeks start Monday; habits created Wednesday 2026-11-04
  const plotOf = (habit: GameHabit, dates: string[]) =>
    deriveGame({ today: '2026-11-10', start: '2026-11-02', tasks: [], habits: [habit], sessions: dates.map((date) => ({ h: habit.key, date })) }).plots[0];
  const weekly: GameHabit = { key: 'run', name: 'Run', floor: 2, target: 3, since: '2026-11-04' };

  it('sprouts when its first partial week hits the floor', () => {
    expect(plotOf(weekly, ['2026-11-05', '2026-11-06'])?.stageName).toBe('sprout');
  });

  it('leaves the seed waiting, alive, when its first partial week misses the floor', () => {
    expect(plotOf(weekly, ['2026-11-05'])).toMatchObject({ stageName: 'seed', alive: true });
  });

  it('does not count days before a daily habit existed as misses', () => {
    const daily: GameHabit = { key: 'read', name: 'Read', floor: 1, target: 1, daily: true, since: '2026-11-04' };
    expect(plotOf(daily, ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])?.stageName).toBe('sprout');
  });
});
