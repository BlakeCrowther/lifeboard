/* The board's today and habit week start, as the page sees them. Both change only in refreshBoard (profile time zone,
   checks/week_start) and when the render loop notices the day has turned. */
import { MONTH_SHORT_NAMES, WEEKDAY_NAMES, WEEKDAY_SHORT_NAMES, datePartsOf, daysBetween, weekStartOf, weekdayOf, type DateString, type Weekday } from '../../dates/index.ts';
import { minutesOfDay, todayDate } from '../../dates/clock.ts';

export const clock: { today: DateString; weekStart: Weekday } = {
  today: todayDate(),
  /** checks/week_start: 0 Sunday .. 6 Saturday, default 1 Monday (lifeboard-setup asks) */
  weekStart: 1,
};

export const weekdayName = (weekday: number): string => WEEKDAY_NAMES[weekday] ?? '';
export const weekdayShortName = (weekday: number): string => WEEKDAY_SHORT_NAMES[weekday] ?? '';
export const monthShortName = (month: number): string => MONTH_SHORT_NAMES[month - 1] ?? '';

/** The habit week (streaks, garden) a date falls in: its first day. */
export const habitWeekOf = (date: DateString): DateString => weekStartOf(date, clock.weekStart);
export const mondayOf = (date: DateString): DateString => weekStartOf(date, 1);
export const firstDayOfHabitWeek = (): string => weekdayName(clock.weekStart);
export const lastDayOfHabitWeek = (): string => weekdayName((clock.weekStart + 6) % 7);

export const minutesNow = (): number => minutesOfDay(new Date().toISOString());

/** 'Today', 'Tomorrow', 'Yesterday', a weekday name within the week ahead, else 'Mar 4' (with the year when not this year). */
export function relativeDay(date: DateString): string {
  const n = daysBetween(clock.today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return weekdayName(weekdayOf(date));
  const d = datePartsOf(date);
  return `${monthShortName(d.month)} ${String(d.day)}${d.year !== datePartsOf(clock.today).year ? ', ' + String(d.year) : ''}`;
}
/** 'Sat, Nov 21' */
export function dayLabel(date: DateString): string {
  const d = datePartsOf(date);
  return `${weekdayShortName(d.weekday)}, ${monthShortName(d.month)} ${String(d.day)}`;
}
