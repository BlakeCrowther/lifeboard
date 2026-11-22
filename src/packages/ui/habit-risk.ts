/** Hour (local, 24h) from which a daily habit with today's floor still open counts as on its last chance. */
export const DAILY_LAST_CALL_HOUR = 18;

/** How urgent a habit's floor is right now. `low`: the floor is still open within the warning window (weekly: needs N
 *  more with N+2 or fewer days left; daily: today's floor open). `last`: this is the final chance (weekly: the week's
 *  last day; daily: from DAILY_LAST_CALL_HOUR). `last` implies `low`. */
export interface HabitRisk { low: boolean; last: boolean }

export function habitRisk(
  habit: { daily?: boolean; floor: number },
  stats: { week: number; today: number; missed?: boolean },
  daysLeft: number,
  minuteOfDay: number,
): HabitRisk {
  if (habit.daily) {
    const low = !stats.missed && stats.today < habit.floor;
    return { low, last: low && minuteOfDay >= DAILY_LAST_CALL_HOUR * 60 };
  }
  const need = habit.floor - stats.week;
  return { low: need > 0 && daysLeft <= need + 2, last: need > 0 && daysLeft <= 1 };
}
