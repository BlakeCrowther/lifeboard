import { afterEach, describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, longDate, relativeDate, weekStartOf } from '../index.ts';
import { dateOfInstant, minutesOfDay, setTimeZone, timeZone, todayDate } from '../clock.ts';

const originalProcessZone = process.env['TZ'];
const originalBoardZone = timeZone();
afterEach(() => {
  if (originalProcessZone === undefined) delete process.env['TZ'];
  else process.env['TZ'] = originalProcessZone;
  setTimeZone(originalBoardZone);
});

describe('date math is independent of the browser zone', () => {
  // Samoa skipped 2011-12-30 entirely. The old app.js helpers did local-Date math, so in that zone
  // the day after Dec 29 came out as Dec 31 and Dec 29 -> Dec 31 counted as 1 day.
  it('adds and counts days across a skipped local day', () => {
    process.env['TZ'] = 'Pacific/Apia';
    expect(addDays('2011-12-29', 1)).toBe('2011-12-30');
    expect(daysBetween('2011-12-29', '2011-12-31')).toBe(2);
  });

  it('counts a daylight-saving day as one day', () => {
    process.env['TZ'] = 'America/Los_Angeles';
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-01', '2026-10-31')).toBe(-1);
  });

  it('clamps month steps to the month end, including Feb 29', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('finds the week start for any start day', () => {
    // 2026-11-21 is a Saturday
    expect(weekStartOf('2026-11-21')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-21', 0)).toBe('2026-11-15');
    expect(weekStartOf('2026-11-21', 6)).toBe('2026-11-21');
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
  });

  it('labels dates', () => {
    expect(longDate('2026-11-21')).toBe('Saturday, November 21');
    expect(relativeDate('2026-11-22', '2026-11-21')).toBe('tomorrow');
    expect(relativeDate('2026-11-25', '2026-11-21')).toBe('Wednesday');
    expect(relativeDate('2027-01-04', '2026-11-21')).toBe('Jan 4, 2027');
  });
});

describe('the board day boundary', () => {
  it('turns over at midnight in the board zone', () => {
    setTimeZone('America/Los_Angeles');
    expect(todayDate(Date.parse('2026-11-21T07:59:59Z'))).toBe('2026-11-20');
    expect(todayDate(Date.parse('2026-11-21T08:00:00Z'))).toBe('2026-11-21');
  });

  it('follows the clock change on a daylight-saving day', () => {
    setTimeZone('America/Los_Angeles');
    // 2026-03-08: clocks jump 2 AM -> 3 AM PDT (UTC-7)
    expect(minutesOfDay('2026-03-08T10:30:00Z')).toBe(3 * 60 + 30);
    expect(dateOfInstant(Date.parse('2026-03-09T06:59:00Z'))).toBe('2026-03-08');
    expect(dateOfInstant(Date.parse('2026-03-09T07:00:00Z'))).toBe('2026-03-09');
  });

  it('uses the profile zone once set, and ignores an unknown one', () => {
    const instant = Date.parse('2026-11-21T20:00:00Z');
    expect(setTimeZone('America/Los_Angeles')).toBe(true);
    expect(dateOfInstant(instant)).toBe('2026-11-21');
    expect(setTimeZone('Asia/Tokyo')).toBe(true);
    expect(dateOfInstant(instant)).toBe('2026-11-22');
    expect(setTimeZone('Not/AZone')).toBe(false);
    expect(timeZone()).toBe('Asia/Tokyo');
  });
});
