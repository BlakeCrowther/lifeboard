/* Recurrence rules (tasks.recurrence): when a repeating task is next due, and how to describe the rule.
   Numeric fields may arrive as strings from the db, so every read goes through Number(). */
import {
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  addDays,
  addMonths,
  datePartsOf,
  lastDayOfMonth,
  ordinalNumber,
  shiftMonth,
  weekdayOf,
  ymd,
  type DateString,
} from '../../dates/index.ts';

type NumberLike = number | string;

/** 1..4 = first..fourth, -1 = last. */
export type WeekOrdinal = NumberLike;

export type RecurrenceRule =
  | { kind: 'interval'; every?: NumberLike; unit: 'day' | 'week' | 'month' | 'year'; basis?: 'schedule' | 'completion' }
  | { kind: 'monthly_day'; day: NumberLike; every_months?: NumberLike }
  | { kind: 'monthly_last_day'; every_months?: NumberLike }
  | { kind: 'monthly_weekday'; ordinal: WeekOrdinal; weekday: NumberLike; every_months?: NumberLike }
  | { kind: 'yearly_day'; month: NumberLike; day: NumberLike }
  | { kind: 'yearly_first_day'; month: NumberLike }
  | { kind: 'yearly_last_day'; month: NumberLike }
  | { kind: 'yearly_weekday'; month: NumberLike; ordinal: WeekOrdinal; weekday: NumberLike };

export const ORDINAL_WORDS: Readonly<Record<string, string>> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };

const atLeastOne = (value: NumberLike | undefined): number => Number(value) || 1;

/** The `ordinal` (1..4, or -1 = last) `weekday` (0 Sun..6 Sat) of a month (1-12), or null when that month has no such day. */
export function nthWeekdayOfMonth(year: number, month: number, ordinal: number, weekday: number): DateString | null {
  const lastDay = lastDayOfMonth(year, month);
  if (ordinal === -1) return ymd(year, month, lastDay - ((weekdayOf(ymd(year, month, lastDay)) - weekday + 7) % 7));
  const day = 1 + ((weekday - weekdayOf(ymd(year, month, 1)) + 7) % 7) + (ordinal - 1) * 7;
  return day > lastDay ? null : ymd(year, month, day);
}

/** The next due date after completing an occurrence on `completedOn` (board date).
    Calendar rules count from the task's own date (due, else deadline, else completedOn). */
export function nextDueDate(rule: RecurrenceRule, task: { due_date?: DateString | null; deadline_date?: DateString | null }, completedOn: DateString): DateString {
  const scheduled = task.due_date || task.deadline_date || completedOn;
  const { year, month } = datePartsOf(scheduled);
  switch (rule.kind) {
    case 'interval': {
      const from = rule.basis === 'schedule' ? scheduled : completedOn;
      const every = Math.max(1, atLeastOne(rule.every));
      if (rule.unit === 'day') return addDays(from, every);
      if (rule.unit === 'week') return addDays(from, 7 * every);
      if (rule.unit === 'month') return addMonths(from, every);
      return addMonths(from, 12 * every);
    }
    case 'monthly_day': {
      const [nextYear, nextMonth] = shiftMonth(year, month, atLeastOne(rule.every_months));
      return ymd(nextYear, nextMonth, Math.min(Number(rule.day), lastDayOfMonth(nextYear, nextMonth)));
    }
    case 'monthly_last_day': {
      const [nextYear, nextMonth] = shiftMonth(year, month, atLeastOne(rule.every_months));
      return ymd(nextYear, nextMonth, lastDayOfMonth(nextYear, nextMonth));
    }
    case 'monthly_weekday': {
      let [nextYear, nextMonth] = shiftMonth(year, month, atLeastOne(rule.every_months));
      let found = nthWeekdayOfMonth(nextYear, nextMonth, Number(rule.ordinal), Number(rule.weekday));
      // a 5th-weekday style miss: roll to the next month that has it
      while (!found) {
        [nextYear, nextMonth] = shiftMonth(nextYear, nextMonth, 1);
        found = nthWeekdayOfMonth(nextYear, nextMonth, Number(rule.ordinal), Number(rule.weekday));
      }
      return found;
    }
    case 'yearly_day': {
      const nextYear = year + 1;
      return ymd(nextYear, Number(rule.month), Math.min(Number(rule.day), lastDayOfMonth(nextYear, Number(rule.month))));
    }
    case 'yearly_first_day':
      return ymd(year + 1, Number(rule.month), 1);
    case 'yearly_last_day':
      return ymd(year + 1, Number(rule.month), lastDayOfMonth(year + 1, Number(rule.month)));
    case 'yearly_weekday':
      return nthWeekdayOfMonth(year + 1, Number(rule.month), Number(rule.ordinal), Number(rule.weekday)) ?? ymd(year + 1, Number(rule.month), 1);
  }
  return addDays(completedOn, 1);
}

const everyMonths = (months: NumberLike | undefined): string => (atLeastOne(months) === 1 ? 'every month' : `every ${String(months)} months`);
const ordinalWord = (ordinal: WeekOrdinal): string => ORDINAL_WORDS[String(ordinal)] ?? '';
const weekdayName = (weekday: NumberLike): string => WEEKDAY_NAMES[Number(weekday)] ?? '';
const weekdayShort = (weekday: NumberLike): string => WEEKDAY_SHORT_NAMES[Number(weekday)] ?? '';
const monthName = (month: NumberLike): string => MONTH_NAMES[Number(month) - 1] ?? '';
const monthShort = (month: NumberLike): string => MONTH_SHORT_NAMES[Number(month) - 1] ?? '';

/** A full sentence for the task editor. */
export function describeRule(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return 'Does not repeat.';
  switch (rule.kind) {
    case 'interval': {
      const every = atLeastOne(rule.every);
      const span = every === 1 ? `1 ${rule.unit}` : `${String(every)} ${rule.unit}s`;
      return rule.basis === 'schedule'
        ? `Repeats on a schedule: the next one is due ${span} after this one's do date, even if you finish late.`
        : `The next one is due ${span} after the day you complete this one.`;
    }
    case 'monthly_day':
      return `Repeats on the ${ordinalNumber(Number(rule.day))} of ${everyMonths(rule.every_months)}${Number(rule.day) > 28 ? ' (the last day in shorter months)' : ''}.`;
    case 'monthly_last_day':
      return `Repeats on the last day of ${everyMonths(rule.every_months)}.`;
    case 'monthly_weekday':
      return `Repeats on the ${ordinalWord(rule.ordinal)} ${weekdayName(rule.weekday)} of ${everyMonths(rule.every_months)}.`;
    case 'yearly_day':
      return `Repeats every year on ${monthName(rule.month)} ${String(rule.day)}.`;
    case 'yearly_first_day':
      return `Repeats every year on ${monthName(rule.month)} 1.`;
    case 'yearly_last_day':
      return `Repeats every year on the last day of ${monthName(rule.month)}.`;
    case 'yearly_weekday':
      return `Repeats every year on the ${ordinalWord(rule.ordinal)} ${weekdayName(rule.weekday)} of ${monthName(rule.month)}.`;
  }
  return '';
}

const INTERVAL_WORDS = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' } as const;

/** A chip label: 'Weekly', 'Every 2 weeks', 'Monthly on the 3rd', 'Yearly, Mar 4'. */
export function shortRuleLabel(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return '';
  const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
  const monthlyPrefix = 'every_months' in rule && atLeastOne(rule.every_months) > 1 ? `Every ${String(rule.every_months)} mo` : 'Monthly';
  switch (rule.kind) {
    case 'interval': {
      const every = atLeastOne(rule.every);
      return every === 1 ? INTERVAL_WORDS[rule.unit] : `Every ${String(every)} ${rule.unit}s`;
    }
    case 'monthly_day':
      return `${monthlyPrefix} on the ${ordinalNumber(Number(rule.day))}`;
    case 'monthly_last_day':
      return `${monthlyPrefix}, last day`;
    case 'monthly_weekday':
      return `${monthlyPrefix}, ${ordinalWord(rule.ordinal)} ${weekdayShort(rule.weekday)}`;
    case 'yearly_day':
      return `Yearly, ${monthShort(rule.month)} ${String(rule.day)}`;
    case 'yearly_first_day':
      return `Yearly, ${monthShort(rule.month)} 1`;
    case 'yearly_last_day':
      return `Yearly, end of ${monthShort(rule.month)}`;
    case 'yearly_weekday':
      return `Yearly, ${capitalize(ordinalWord(rule.ordinal))} ${weekdayShort(rule.weekday)} of ${monthShort(rule.month)}`;
  }
  return 'Repeats';
}
