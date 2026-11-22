import { describe, expect, it } from 'vitest';
import { visitorFromUrl } from '../index.ts';
import {
  biomeFor, createSeededRandom, fieldOfView, hookFromUrl, infoLine, nextDayRecord, phaseFill, phaseLabel, pinPhase, placementPhase, progressOf, readBiomes,
  readRoster, readSceneHooks, readSpec, restSpec, sceneKeyOf, seasonValue, unlockShare, visitorChip, weatherAmounts, type SceneView,
} from '../scene-rules.ts';

const PAGE = 'https://board.example/';

describe('url hooks', () => {
  it('reads the visitor from the query, the hash pair or the plain hash name', () => {
    expect(visitorFromUrl(PAGE + '?visitor=clownfish')).toBe('clownfish');
    expect(visitorFromUrl(PAGE + '#eco&visitor=sea-hare')).toBe('sea-hare');
    expect(visitorFromUrl(PAGE + '#visitor-moon_jelly')).toBe('moon_jelly');
    expect(visitorFromUrl(PAGE + '#labs-visitor-moon_jelly')).toBe('moon_jelly');
    expect(visitorFromUrl(PAGE + '#eco')).toBeNull();
  });
  it('reads a hook as name=value or name-value in the hash', () => {
    expect(hookFromUrl('phase', PAGE + '#phase-3')).toBe('3');
    expect(hookFromUrl('scene', PAGE + '?scene=kelp')).toBe('kelp');
    const hooks = readSceneHooks(PAGE + '?month=7&perch=1&inspect=sea_fan&inspect_src=out/sea_fan-glb.js#phase=2');
    expect(hooks).toMatchObject({ forcedPhase: 2, forcedMonth: 7, forcedPerch: true, inspectId: 'sea_fan', inspectSrc: 'out/sea_fan-glb.js', forcedScene: null, forcedVisitor: null });
  });
});

describe('weather and season', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  it('turns condition text into amounts', () => {
    expect(weatherAmounts({ condition: 'Light rain showers', at: now - 3600e3 }, null, now)).toEqual({ cloud: 0.65, rain: 0.65, fog: 0, snow: 0, storm: 0 });
    expect(weatherAmounts({ condition: 'Thunderstorm', at: now }, null, now)).toEqual({ cloud: 1, rain: 1, fog: 0, snow: 0, storm: 1 });
    expect(weatherAmounts(null, 'Mostly cloudy, mist', now)).toEqual({ cloud: 0.65, rain: 0, fog: 0.5, snow: 0, storm: 0 });
  });
  it('treats a reading older than 12 hours as clear', () => {
    expect(weatherAmounts({ condition: 'Snow', at: now - 13 * 3600e3 }, null, now)).toEqual({ cloud: 0, rain: 0, fog: 0, snow: 0, storm: 0 });
  });
  it('maps a forced month to its mid-month season', () => {
    expect(seasonValue(7, new Date(now))).toBeCloseTo(0.9059, 3);
    expect(seasonValue(1, new Date(now))).toBeCloseTo(-0.9052, 3);
  });
});

describe('manifests', () => {
  it('splits a v2 roster by kind and drops entries without an id', () => {
    const roster = readRoster({ models: [{ id: 'clownfish', js: 'assets/c.js', biome: 0 }, { id: 'fern', kind: 'plant', js: 'p.js' }, { id: 'kelp_stand', kind: 'scenery', js: 's.js' }, { js: 'x.js' }] });
    expect(roster.creatures.map((entry) => entry.id)).toEqual(['clownfish']);
    expect(roster.plants.map((entry) => entry.id)).toEqual(['fern']);
    expect(roster.scenery.map((entry) => entry.id)).toEqual(['kelp_stand']);
  });
  it('wraps a biome id round the list and falls back by medium for the scene key', () => {
    const biomes = readBiomes({ biomes: [{ id: 0, name: 'Coral shallows', medium: 'water' }, { id: 1, name: 'Meadow', medium: 'land' }] });
    expect(biomeFor(biomes, true, 3).name).toBe('Meadow');
    expect(biomeFor([], false, 4).name).toBe('Coral shallows');
    expect(biomeFor([], true, 4).name).toBe('Uncharted');
    expect(sceneKeyOf({ id: 1, name: 'Meadow', medium: 'land' }, null)).toBe('meadow');
    expect(sceneKeyOf({ id: 1, name: 'Meadow', medium: 'land' }, 'kelp')).toBe('kelp');
  });
  it('reads the shelter from the spec', () => {
    expect(readSpec({ name: 'Crab', ecosystem: { anchor: 'kelp' } })).toEqual({ name: 'Crab', shelter: 'kelp' });
  });
});

describe('growth', () => {
  const reef = { biome: 0, phase: 1, phases: 5, pts: 30, next: 40, prev: 20, bleached: false };
  it('measures progress against evenly spaced thresholds', () => {
    expect(progressOf({ reef })).toBeCloseTo(0.3, 9);
    expect(progressOf({ reef, pf: 0.5 })).toBe(0.5);
    expect(progressOf({ reef, pinnedPhase: true })).toBeCloseTo(0.39999, 9);
  });
  it('pins the phase from ?phase=', () => {
    const view: SceneView = { reef, cloudiness: 0, blight: 0, todayTide: null, overdue: 0, breaks: { sad: false, skipsToday: 0, lost: 0 }, lessons: { hide: false, daysSince: null } };
    expect(pinPhase(view, 4).reef.phase).toBe(3);
    expect(pinPhase(view, 9).reef.phase).toBe(4);
    expect(pinPhase(view, null)).toBe(view);
  });
  it('remembers the start of the day, carrying yesterday over in the same biome', () => {
    expect(nextDayRecord(null, '2026-11-21', 0, 0.3)).toEqual({ d: '2026-11-21', b: 0, f: 0.3, fEnd: 0.3 });
    expect(nextDayRecord({ d: '2026-11-21', b: 0, f: 0.2, fEnd: 0.25 }, '2026-11-21', 0, 0.3)).toEqual({ d: '2026-11-21', b: 0, f: 0.2, fEnd: 0.3 });
    expect(nextDayRecord({ d: '2026-11-20', b: 0, f: 0.1, fEnd: 0.25 }, '2026-11-21', 0, 0.3)).toEqual({ d: '2026-11-21', b: 0, f: 0.25, fEnd: 0.3 });
    expect(nextDayRecord({ d: '2026-11-20', b: 1, f: 0.1, fEnd: 0.25 }, '2026-11-21', 0, 0.3)).toEqual({ d: '2026-11-21', b: 0, f: 0.3, fEnd: 0.3 });
  });
  it('spreads copies over a phase range and unlocks a phase landmark last', () => {
    expect([0, 1, 2, 3].map((k) => placementPhase([1, 2], k, 4))).toEqual([1, 1, 2, 2]);
    expect(unlockShare(1, 0, 3)).toBeCloseTo(0.2, 9);
    expect(unlockShare(1, 1, 3)).toBeCloseTo(0.26667, 4);
    expect(unlockShare(1, 2, 3)).toBeCloseTo(0.3999, 9);
    expect(unlockShare(2, 0, 1)).toBeCloseTo(0.4, 9);
  });
  it('keeps the seeded layout sequence', () => {
    const random = createSeededRandom(7);
    const first = [random.next(), random.next()];
    random.reset();
    expect([random.next(), random.next()]).toEqual(first);
    expect(first).toEqual([0.011704753153026104, 0.06195825757458806]);
  });
});

describe('resting', () => {
  it('takes the roster rest first and fills the defaults', () => {
    expect(restSpec({ on: 'rock', pose: 'cling' }, { on: 'sand', pose: 'lie' }, null, 'swim')).toEqual({ on: 'rock', pose: 'cling', share: 0.35, bout: [10, 25], sessile: false });
  });
  it('is sessile at full share or when rooted, and never rests on a surface its pose cannot use', () => {
    expect(restSpec({ on: 'rock', pose: 'cling', share: 1 }, undefined, null, 'swim')?.sessile).toBe(true);
    expect(restSpec({ on: 'sand', pose: 'lie' }, undefined, null, 'rooted')?.sessile).toBe(true);
    expect(restSpec({ on: 'rock', pose: 'hang' }, undefined, null, 'fly')).toBeNull();
    expect(restSpec(undefined, undefined, null, 'swim')).toBeNull();
  });
  it('takes ?rest=<on>_<pose> over the spec', () => {
    expect(restSpec({ on: 'sand', pose: 'lie', share: 0.02 }, undefined, 'branch_hang', 'fly')).toEqual({ on: 'branch', pose: 'hang', share: 0.05, bout: [10, 25], sessile: false });
  });
});

describe('card text', () => {
  const view: SceneView = {
    reef: { biome: 0, phase: 1, phases: 5, pts: 30.4, next: 40, prev: 20, bleached: true }, cloudiness: 0, blight: 0, todayTide: { pct: 0.8, full: false }, overdue: 2,
    breaks: { sad: true, skipsToday: 2, lost: 3 }, lessons: { hide: true, daysSince: 4 },
  };
  it('labels the phase and fills the bar', () => {
    expect(phaseLabel(view.reef)).toBe('Phase 2 of 5 · bleached');
    expect(phaseFill(view.reef)).toBeCloseTo(0.52, 9);
  });
  it('writes the info line', () => {
    expect(infoLine(view, { medium: 'land', neglect: { murk_name: 'mold' } }, ['kelp'])).toBe(
      '30 / 40 life points · today 80% · new today: kelp · 2 overdue: mold clouding the air · skipped 2 breaks · the fish noticed (−3 growth) · no lessons in 4 days · the fish are hiding',
    );
  });
  it('names the visitor', () => {
    expect(visitorChip('crab', 'Crab', null)).toBe('Visitor: crab (test)');
    expect(visitorChip(null, 'Moon jelly', { count: 2, rarity: 'exotic' })).toBe('2 visitors · newest Moon jelly · exotic');
    expect(visitorChip(null, 'Crab', { count: 1, rarity: 'common' })).toBe('Visitor: Crab');
    expect(visitorChip(null, null, null)).toBeNull();
  });
  it('widens the field of view on portrait screens', () => {
    expect(fieldOfView(16 / 9)).toBe(45);
    expect(fieldOfView(0.5)).toBe(90);
    expect(fieldOfView(1)).toBeCloseTo(57.82, 1);
  });
});
