/* Calendar dates are 'YYYY-MM-DD' strings. All math here is zone-free: a date is read as UTC midnight,
   so adding days never crosses a daylight-saving or skipped-day gap in the browser's zone. */

export type DateString = string;

/** Weekday number: 0 Sunday .. 6 Saturday. */
export type Weekday = number;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const MONTH_SHORT_NAMES: readonly string[] = MONTH_NAMES.map((name) => name.slice(0, 3));
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAY_SHORT_NAMES: readonly string[] = WEEKDAY_NAMES.map((name) => name.slice(0, 3));

const MS_PER_DAY = 864e5;

export const padTwo = (value: number): string => String(value).padStart(2, '0');

/** month is 1-12. */
export const ymd = (year: number, month: number, day: number): DateString => `${String(year)}-${padTwo(month)}-${padTwo(day)}`;

export interface DateParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  weekday: Weekday;
}

const utcDateOf = (date: DateString): Date => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export function datePartsOf(date: DateString): DateParts {
  const utc = utcDateOf(date);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate(), weekday: utc.getUTCDay() };
}

/** The date as UTC midnight, for callers that still want a Date. Read it with getUTC* only. */
export const toUtcDate = utcDateOf;

export function addDays(date: DateString, days: number): DateString {
  const utc = utcDateOf(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export const daysBetween = (from: DateString, to: DateString): number => Math.round((utcDateOf(to).getTime() - utcDateOf(from).getTime()) / MS_PER_DAY);

export const weekdayOf = (date: DateString): Weekday => utcDateOf(date).getUTCDay();

/** month is 1-12. */
export const lastDayOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Moves (year, month 1-12) by `months`, wrapping years. */
export function shiftMonth(year: number, month: number, months: number): [number, number] {
  const total = month + months;
  return [year + Math.floor((total - 1) / 12), ((((total - 1) % 12) + 12) % 12) + 1];
}

/** Same day of month `months` later, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: DateString, months: number): DateString {
  const { year, month, day } = datePartsOf(date);
  const [nextYear, nextMonth] = shiftMonth(year, month, months);
  return ymd(nextYear, nextMonth, Math.min(day, lastDayOfMonth(nextYear, nextMonth)));
}

/** First day of the week holding `date`, weeks starting on `weekStart` (0 Sunday .. 6 Saturday, default Monday). */
export const weekStartOf = (date: DateString, weekStart: Weekday = 1): DateString => addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));

/** 'Monday, March 4' */
export function longDate(date: DateString): string {
  const { month, day, weekday } = datePartsOf(date);
  return `${WEEKDAY_NAMES[weekday] ?? ''}, ${MONTH_NAMES[month - 1] ?? ''} ${String(day)}`;
}

/** 'Mon Mar 4' */
export function shortDate(date: DateString): string {
  const { month, day, weekday } = datePartsOf(date);
  return `${WEEKDAY_SHORT_NAMES[weekday] ?? ''} ${MONTH_SHORT_NAMES[month - 1] ?? ''} ${String(day)}`;
}

/** 'today', 'tomorrow', 'yesterday', a weekday name within the coming week, else 'Mar 4' (', 2027' when another year). */
export function relativeDate(date: DateString, today: DateString): string {
  const offset = daysBetween(today, date);
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  if (offset === -1) return 'yesterday';
  const parts = datePartsOf(date);
  if (offset > 1 && offset < 7) return WEEKDAY_NAMES[parts.weekday] ?? '';
  const otherYear = parts.year !== datePartsOf(today).year ? `, ${String(parts.year)}` : '';
  return `${MONTH_SHORT_NAMES[parts.month - 1] ?? ''} ${String(parts.day)}${otherYear}`;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st ... */
export function ordinalNumber(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const lastTwo = value % 100;
  return `${String(value)}${suffixes[(lastTwo - 20) % 10] ?? suffixes[lastTwo] ?? 'th'}`;
}
