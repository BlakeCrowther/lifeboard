/* Habit review: a verdict on whether a habit's target needs adjusting. Pure.
   Verdicts use the closed weeks since the habit's first session (needs 4+). Raise: target hit in 80%+ of weeks while
   averaging 30%+ above it. Lower: floor met in under half. Slipping / needs work: target hit in under half. */
import type { HabitStats } from '../../habits/index.ts';

export type VerdictKind = 'new' | 'ok' | 'raise' | 'lower' | 'work';
export interface HabitVerdict {
  kind: VerdictKind;
  /** the chip text */
  title: string;
  /** closed weeks counted */
  weeks: number;
  /** share of those weeks the target / floor was met */
  hitRate: number | null;
  floorRate: number | null;
  average: number | null;
  /** last 4 weeks' average minus the 4 before (8+ weeks), else 0 */
  trend: number;
  why: string;
}
export function habitVerdict(h: { daily: boolean; target: number; floor: number }, st: Pick<HabitStats, 'weeks'>): HabitVerdict {
  const past = st.weeks.slice(0, -1), first = past.findIndex((w) => w.n > 0), weeks = first < 0 ? [] : past.slice(first);
  const n = weeks.length;
  if (n < 4) return { kind: 'new', title: 'Too early', weeks: n, hitRate: null, floorRate: null, average: null, trend: 0, why: '' };
  const target = h.daily ? 7 * h.target : h.target, floor = h.daily ? 7 * h.floor : h.floor;
  const hitRate = weeks.filter((w) => w.n >= target).length / n, floorRate = weeks.filter((w) => w.n >= floor).length / n;
  const average = weeks.reduce((a, w) => a + w.n, 0) / n;
  const sum = (xs: { n: number }[]): number => xs.reduce((a, w) => a + w.n, 0);
  const trend = n >= 8 ? sum(past.slice(-4)) / 4 - sum(past.slice(-8, -4)) / 4 : 0;
  const pct = (x: number): string => String(Math.round(x * 100)) + '%';
  let kind: VerdictKind = 'ok', title = 'On track', why = '';
  if (hitRate >= 0.8 && average >= target * 1.3) { kind = 'raise'; title = `Raise to ${String(Math.round(average))}/wk`; why = `Averaging ${average.toFixed(1)} a week against a target of ${String(h.target)}.`; }
  else if (floorRate < 0.5) { kind = 'lower'; title = `Lower to ${String(Math.max(1, Math.round(average + 0.5)))}/wk`; why = `Floor met in only ${pct(floorRate)} of weeks. ${String(h.target)} a week isn't realistic right now.`; }
  else if (hitRate < 0.5 && trend < -0.4) { kind = 'work'; title = 'Slipping'; why = `Down ${Math.abs(trend).toFixed(1)} a week from the month before. Target hit in ${pct(hitRate)} of weeks.`; }
  else if (hitRate < 0.5) { kind = 'work'; title = 'Needs work'; why = `Floor is holding, but the target was hit in only ${pct(hitRate)} of weeks.`; }
  return { kind, title, weeks: n, hitRate, floorRate, average, trend, why };
}
