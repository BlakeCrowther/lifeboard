import { describe, expect, it } from 'vitest';
import { habitStats } from '../index.ts';

// 2026-11-21 is a Saturday; with Monday weeks this week started 2026-11-16.
const TODAY = '2026-11-21';
const sessionsOn = (...dates: string[]) => dates.map((date) => ({ h: 'run', date }));

describe('habitStats', () => {
  it('counts floor-met weeks in a row, and keeps the streak pending while this week is open', () => {
    const stats = habitStats({ key: 'run', floor: 2 }, sessionsOn('2026-11-02', '2026-11-04', '2026-11-09', '2026-11-12', '2026-11-17'), TODAY);
    expect(stats.week).toBe(1);
    expect(stats.streak).toBe(2);
    expect(stats.pending).toBe(true);
    expect(stats.best).toBe(2);
  });

  it('breaks the streak on a week below floor', () => {
    const stats = habitStats({ key: 'run', floor: 1 }, sessionsOn('2026-10-26', '2026-11-09', '2026-11-16'), TODAY);
    expect(stats.streak).toBe(2);
    expect(stats.best).toBe(2);
  });

  it('starts weeks on the board week start', () => {
    // Sunday weeks: 2026-11-15 .. 2026-11-21 is this week
    const stats = habitStats({ key: 'run', floor: 1 }, sessionsOn('2026-11-15'), TODAY, 0);
    expect(stats.week).toBe(1);
    expect(stats.days[0]?.d).toBe('2026-11-15');
  });

  it('marks a daily habit missed once a past day this week is below floor', () => {
    const stats = habitStats({ key: 'run', floor: 1, daily: true }, sessionsOn('2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'), TODAY);
    expect(stats.missed).toBe(true);
    expect(stats.streak).toBe(0);
    expect(stats.pending).toBe(false);
  });

  it('ignores sessions after today and other habits', () => {
    const stats = habitStats({ key: 'run', floor: 1 }, [...sessionsOn('2026-11-22'), { h: 'read', date: TODAY }], TODAY);
    expect(stats.total).toBe(0);
  });
});
