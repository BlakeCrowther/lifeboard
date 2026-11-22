/* A habit's counts and streak. Weeks start on `weekStart` (checks/week_start, 0 Sunday .. 6 Saturday).
   Floor met: weekly habits by the week's count; daily habits need every day (so far) at the floor. */
import { addDays, weekStartOf, type DateString, type Weekday } from '../../dates/index.ts';

export interface Habit {
  key: string;
  id?: string;
  floor: number;
  daily?: boolean;
}

export interface HabitSession {
  /** habit key or id */
  h: string;
  date: DateString;
}

export interface HabitWeek {
  /** the week's first day */
  m: DateString;
  /** sessions that week */
  n: number;
  cur: boolean;
}

export interface HabitDay {
  d: DateString;
  n: number;
  future: boolean;
  today: boolean;
}

export interface HabitStats {
  /** longest run of floor-met weeks, at least the current streak */
  best: number;
  week: number;
  month: number;
  year: number;
  total: number;
  today: number;
  /** the last 12 weeks, oldest first */
  weeks: HabitWeek[];
  /** floor-met weeks in a row, ending this week (or last week while this one is still open) */
  streak: number;
  /** this week's floor isn't met yet but the streak can still continue */
  pending: boolean;
  /** a daily habit already missed a day this week */
  missed: boolean;
  /** this week's 7 days */
  days: HabitDay[];
}

export function habitStats(habit: Habit, sessions: HabitSession[], today: DateString, weekStart: Weekday = 1): HabitStats {
  const weekOf = (date: DateString): DateString => weekStartOf(date, weekStart);
  const dates = sessions.filter((session) => (session.h === habit.key || session.h === habit.id) && session.date <= today).map((session) => session.date);
  const thisWeek = weekOf(today);
  const perWeek: Record<DateString, number> = {};
  const perDay: Record<DateString, number> = {};
  for (const date of dates) {
    const week = weekOf(date);
    perWeek[week] = (perWeek[week] ?? 0) + 1;
    perDay[date] = (perDay[date] ?? 0) + 1;
  }
  const countIn = (week: DateString): number => perWeek[week] ?? 0;
  const countOn = (date: DateString): number => perDay[date] ?? 0;
  const missedIn = (week: DateString): boolean => {
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(week, offset);
      if (date >= today) break;
      if (countOn(date) < habit.floor) return true;
    }
    return false;
  };
  const floorMet = (week: DateString): boolean => {
    if (!habit.daily) return countIn(week) >= habit.floor;
    if (missedIn(week)) return false;
    return countOn(week < thisWeek ? addDays(week, 6) : today) >= habit.floor;
  };

  const weeks: HabitWeek[] = [];
  for (let index = 0, week = thisWeek; index < 12; index++, week = addDays(week, -7)) weeks.unshift({ m: week, n: countIn(week), cur: index === 0 });
  const currentMet = floorMet(thisWeek);
  let streak = currentMet ? 1 : 0;
  for (let week = addDays(thisWeek, -7); floorMet(week); week = addDays(week, -7)) streak++;

  let best = 0;
  let run = 0;
  const firstWeek = dates.length ? weekOf(dates.reduce((earliest, date) => (earliest < date ? earliest : date))) : thisWeek;
  for (let week = firstWeek; week <= thisWeek; week = addDays(week, 7)) {
    run = floorMet(week) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  return {
    best: Math.max(best, streak),
    week: countIn(thisWeek),
    month: dates.filter((date) => date.startsWith(month)).length,
    year: dates.filter((date) => date.startsWith(year)).length,
    total: dates.length,
    today: dates.filter((date) => date === today).length,
    weeks,
    streak,
    pending: !currentMet && streak > 0 && !(habit.daily && missedIn(thisWeek)),
    missed: !!habit.daily && missedIn(thisWeek),
    days: Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(thisWeek, offset);
      return { d: date, n: countOn(date), future: date > today, today: date === today };
    }),
  };
}
