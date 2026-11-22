/* The task sheet's Repeats select: preset names, a stored rule's preset, and a preset's starting rule. Pure. */
import { weekdayOf, type DateString } from '../dates/index.ts';
import type { RecurrenceRule } from '../db/schema.ts';
import { isDateString } from './shared/format.ts';

export const REPEAT_PRESETS = [
  ['none', "Doesn't repeat"], ['daily', 'Every day'], ['weekly', 'Every week'], ['biweekly', 'Every two weeks'], ['monthly', 'Every month'],
  ['interval', 'Every N days / weeks / months / years'], ['monthly_day', 'On a day of the month'], ['monthly_first', 'First day of the month'],
  ['monthly_last_day', 'Last day of the month'], ['monthly_weekday', 'On a weekday of the month'], ['yearly_day', 'On a date each year'],
  ['yearly_first_day', 'First day of a month each year'], ['yearly_last_day', 'Last day of a month each year'], ['yearly_weekday', 'On a weekday of a month each year'],
] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number][0];

/** The preset a rule shows as; plain interval rules counted from completion get the named ones. */
export function presetOf(r: RecurrenceRule | null | undefined): RepeatPreset {
  if (!r) return 'none';
  if (r.kind === 'interval') {
    if (r.basis !== 'schedule') {
      const every = Number(r.every);
      if (every === 1 && r.unit === 'day') return 'daily';
      if (every === 1 && r.unit === 'week') return 'weekly';
      if (every === 2 && r.unit === 'week') return 'biweekly';
      if (every === 1 && r.unit === 'month') return 'monthly';
    }
    return 'interval';
  }
  if (r.kind === 'monthly_day' && Number(r.day) === 1) return 'monthly_first';
  return r.kind;
}

/** A preset's rule anchored on the do date (today when it has none): its day, weekday and nth-weekday. */
export function ruleForPreset(preset: string, due: string | null | undefined, today: DateString): RecurrenceRule | null {
  const d = isDateString(due) ? due : today;
  const [, m = 1, dd = 1] = d.split('-').map(Number);
  const wd = weekdayOf(d), ord = Math.min(4, Math.ceil(dd / 7));
  const interval = (every: number, unit: 'day' | 'week' | 'month'): RecurrenceRule => ({ kind: 'interval', every, unit, basis: 'completion' });
  switch (preset) {
    case 'daily': return interval(1, 'day');
    case 'weekly': return interval(1, 'week');
    case 'biweekly': return interval(2, 'week');
    case 'monthly': return interval(1, 'month');
    case 'interval': return interval(3, 'day');
    case 'monthly_day': return { kind: 'monthly_day', day: dd, every_months: 1 };
    case 'monthly_first': return { kind: 'monthly_day', day: 1, every_months: 1 };
    case 'monthly_last_day': return { kind: 'monthly_last_day', every_months: 1 };
    case 'monthly_weekday': return { kind: 'monthly_weekday', ordinal: ord, weekday: wd, every_months: 1 };
    case 'yearly_day': return { kind: 'yearly_day', month: m, day: dd };
    case 'yearly_first_day': return { kind: 'yearly_first_day', month: m };
    case 'yearly_last_day': return { kind: 'yearly_last_day', month: m };
    case 'yearly_weekday': return { kind: 'yearly_weekday', month: m, ordinal: ord, weekday: wd };
    default: return null;
  }
}
