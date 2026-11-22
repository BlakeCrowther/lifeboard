/* Ecosystem growth from the daily ring: Growth points, adaptive phases, biomes, bleaching, visitors, murk and blight.
   Days are plain integers. SPEC.md (the Ecosystem growth section). */
import { RULES, type Rarity } from './rules.ts';

export interface DayTide {
  /** ring %, 0..1 */
  pct: number;
  full: boolean;
  /** Growth (life) points the day earns */
  pts: number;
}

export interface Diorama {
  biome: number;
  days: number;
  start: number;
  end: number;
  full: number;
  pts: number;
}

export interface Reef {
  biome: number;
  startDay: number;
  pts: number;
  phase: number;
  /** cumulative points to reach each phase */
  th: number[];
  log: (DayTide | null)[];
  bleached: boolean;
  dioramas: Diorama[];
  /** overdue drops this week (reset each week) */
  weekDrops: number;
  /** exotic overdue drops this biome */
  exotics: number;
}

export type ReefEvent = 'phase' | 'biome' | 'bleach' | 'recover';

/** null = nothing committed: a neutral day, no points, ignored by bleaching. */
export function dayTide(committed: number, done: number): DayTide | null {
  if (!committed) return null;
  const pct = Math.min(1, done / committed);
  const full = pct >= 1;
  return { pct, full, pts: pct * RULES.tide.perPct + (full ? RULES.tide.fullBonus : 0) };
}

/** Cumulative point thresholds per phase, sized so a biome takes targetWeeks at the trailing daily pace. */
export function phaseThresholds(dailyAverage: number): number[] {
  const tide = RULES.tide;
  const perPhase = (Math.max(1, dailyAverage || tide.defaultDaily) * 7 * tide.targetWeeks) / tide.phases;
  return Array.from({ length: tide.phases }, (_, index) => Math.round(perPhase * (index + 1)));
}

export const newReef = (): Reef => ({ biome: 0, startDay: 0, pts: 0, phase: 0, th: phaseThresholds(RULES.tide.defaultDaily), log: [], bleached: false, dioramas: [], weekDrops: 0, exotics: 0 });

const averagePct = (tides: DayTide[]): number => (tides.length ? tides.reduce((sum, tide) => sum + tide.pct, 0) / tides.length : 1);

/** One day (mutates the reef). Returns what happened: 'phase', 'biome', 'bleach', 'recover'. */
export function reefDay(reef: Reef, day: number, tide: DayTide | null): ReefEvent[] {
  const events: ReefEvent[] = [];
  reef.log.push(tide);
  if (tide) {
    reef.pts += tide.pts;
    while (reef.phase < reef.th.length && reef.pts >= (reef.th[reef.phase] ?? Infinity)) {
      reef.phase++;
      events.push('phase');
    }
    if (reef.phase >= reef.th.length) {
      const days = day + 1 - reef.startDay;
      const span = reef.log.slice(-days);
      reef.dioramas.push({ biome: reef.biome, days, start: reef.startDay, end: day, full: span.filter((entry) => entry?.full).length, pts: Math.round(reef.pts) });
      const recent = reef.log.slice(-RULES.tide.trailingDays);
      const average = recent.reduce((sum, entry) => sum + (entry ? entry.pts : 0), 0) / recent.length;
      Object.assign(reef, { biome: reef.biome + 1, startDay: day + 1, pts: 0, phase: 0, th: phaseThresholds(average), exotics: 0 });
      events.push('biome');
    }
  }
  const bleach = RULES.bleach;
  const scored = (days: number): DayTide[] => reef.log.slice(-days).filter((entry): entry is DayTide => entry !== null);
  if (!reef.bleached && reef.log.length >= bleach.days && averagePct(scored(bleach.days)) < bleach.below) {
    reef.bleached = true;
    events.push('bleach');
  } else if (reef.bleached && averagePct(scored(bleach.recoverDays)) >= bleach.recoverAt) {
    reef.bleached = false;
    events.push('recover');
  }
  return events;
}

/** A rare visitor when the week had fullDaysForRare full rings. */
export const weekVisitor = (tides: (DayTide | null)[]): Rarity | null => (tides.filter((tide) => tide?.full).length >= RULES.visitor.fullDaysForRare ? 'rare' : null);

/** Visitor earned by finishing a task `age` days after it was first committed. */
export const overdueDrop = (age: number): Rarity | null => (age >= RULES.visitor.exoticOverdue ? 'exotic' : age >= RULES.visitor.rareOverdue ? 'rare' : null);

/** overdueDrop, capped per week (caller resets counter.weekDrops each week) and exotic per biome. Mutates the counter. */
export function overdueReward(counter: { weekDrops: number; exotics: number }, age: number): Rarity | null {
  const visitor = RULES.visitor;
  if (visitor.overdueDropsPerWeek != null && counter.weekDrops >= visitor.overdueDropsPerWeek) return null;
  let drop = overdueDrop(age);
  if (drop === 'exotic' && counter.exotics >= visitor.exoticPerBiome) drop = 'rare';
  if (drop) {
    counter.weekDrops++;
    if (drop === 'exotic') counter.exotics++;
  }
  return drop;
}

/** Murk: 0 clear .. 1 at cloudyAt overdue tasks. */
export const cloudiness = (overdueCount: number): number => Math.min(1, overdueCount / RULES.tide.cloudyAt);

/** Blight: open tasks first committed blightAfter+ days ago, pushed or not; 1 at blightAt such tasks. */
export const blight = (ages: number[]): number => Math.min(1, ages.filter((age) => age >= RULES.tide.blightAfter).length / RULES.tide.blightAt);
