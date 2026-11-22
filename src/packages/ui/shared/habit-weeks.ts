/* Habit stats on the board's today and week start, and the check of the week that just closed. */
import { addDays, type DateString } from '../../dates/index.ts';
import { habitStats, type HabitStats } from '../../habits/index.ts';
import type { BoardHabit } from '../board-model.ts';
import { clock, habitWeekOf } from './clock.ts';
import { model } from './state.ts';

export const statsOf = (h: BoardHabit): HabitStats => habitStats(h, model.habitSessions, clock.today, clock.weekStart);

export interface WeekCheckRow {
  habit: BoardHabit;
  /** sessions last week */
  got: number;
  /** floor met last week */
  kept: boolean;
  /** floor-met weeks in a row before last week */
  before: number;
  after: number;
  /** late sessions with an exception, last week */
  exceptions: number;
  status: 'hit' | 'kept' | 'reset' | 'miss';
}
/* Weekly check: the week that just closed, habit by habit. Streaks are computed from on-time sessions, so a miss resets on its own. */
export function lastWeekCheck(): { lastWeek: DateString; rows: WeekCheckRow[]; kept: number; reset: number; late: number } {
  const lastWeek = addDays(habitWeekOf(clock.today), -7), weekBefore = addDays(lastWeek, -7);
  const rows = model.habits.map((h): WeekCheckRow => {
    const sessions = model.habitSessions.filter((x) => x.h === h.key || x.h === h.id);
    const inWeek = (m: DateString): number => sessions.filter((x) => habitWeekOf(x.date) === m).length;
    const onDay = (d: DateString): number => sessions.filter((x) => x.date === d).length;
    const met = (m: DateString, level: number): boolean => (h.daily ? [0, 1, 2, 3, 4, 5, 6].every((i) => onDay(addDays(m, i)) >= level) : inWeek(m) >= level);
    let before = 0;
    for (let m = weekBefore; met(m, h.floor) && before < 520; m = addDays(m, -7)) before++;
    const got = inWeek(lastWeek), kept = met(lastWeek, h.floor);
    const exceptions = sessions.filter((x) => x.exception && habitWeekOf(x.date) === lastWeek).length;
    return { habit: h, got, kept, before, after: kept ? before + 1 : 0, exceptions, status: kept ? (met(lastWeek, h.target) ? 'hit' : 'kept') : before ? 'reset' : 'miss' };
  });
  return { lastWeek, rows, kept: rows.filter((r) => r.kept).length, reset: rows.filter((r) => r.status === 'reset').length, late: model.voidHabitSessions.length };
}
