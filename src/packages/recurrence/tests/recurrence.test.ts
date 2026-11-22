import { describe, expect, it } from 'vitest';
import { describeRule, nextDueDate, shortRuleLabel, type RecurrenceRule } from '../index.ts';

const due = (rule: RecurrenceRule, dueDate: string, completedOn: string): string => nextDueDate(rule, { due_date: dueDate }, completedOn);

describe('nextDueDate', () => {
  it('counts an interval from completion, or from the schedule', () => {
    expect(due({ kind: 'interval', every: 3, unit: 'day' }, '2026-11-10', '2026-11-12')).toBe('2026-11-15');
    expect(due({ kind: 'interval', every: 3, unit: 'day', basis: 'schedule' }, '2026-11-10', '2026-11-12')).toBe('2026-11-13');
    expect(due({ kind: 'interval', every: 2, unit: 'week' }, '2026-11-10', '2026-11-10')).toBe('2026-11-24');
    expect(due({ kind: 'interval', every: 1, unit: 'year' }, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
  });

  it('reads numbers stored as strings', () => {
    expect(due({ kind: 'interval', every: '2', unit: 'day' }, '2026-11-10', '2026-11-10')).toBe('2026-11-12');
  });

  it('keeps a monthly day, clamped to short months and landing on Feb 29 in a leap year', () => {
    expect(due({ kind: 'monthly_day', day: 31 }, '2027-01-31', '2027-01-31')).toBe('2027-02-28');
    expect(due({ kind: 'monthly_day', day: 31 }, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
    expect(due({ kind: 'monthly_day', day: 31 }, '2028-02-29', '2028-02-29')).toBe('2028-03-31');
    expect(due({ kind: 'monthly_day', day: 15, every_months: 3 }, '2026-11-15', '2026-11-20')).toBe('2027-02-15');
  });

  it('lands on the last day of the month', () => {
    expect(due({ kind: 'monthly_last_day' }, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
    expect(due({ kind: 'monthly_last_day', every_months: 2 }, '2026-11-30', '2026-11-30')).toBe('2027-01-31');
  });

  it('skips months without a 5th weekday', () => {
    // 5th Friday: Jan 30 2026, then none in Feb, Mar, Apr; May 29
    expect(due({ kind: 'monthly_weekday', ordinal: 5, weekday: 5 }, '2026-01-30', '2026-01-30')).toBe('2026-05-29');
  });

  it('finds the last and nth weekday of a month', () => {
    expect(due({ kind: 'monthly_weekday', ordinal: -1, weekday: 1 }, '2027-04-26', '2027-04-26')).toBe('2027-05-31');
    expect(due({ kind: 'yearly_weekday', month: 11, ordinal: 4, weekday: 4 }, '2025-11-27', '2025-11-27')).toBe('2026-11-26');
  });

  it('handles yearly dates, including Feb 29 in a non-leap year', () => {
    expect(due({ kind: 'yearly_day', month: 2, day: 29 }, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
    expect(due({ kind: 'yearly_first_day', month: 1 }, '2026-01-01', '2026-01-03')).toBe('2027-01-01');
    expect(due({ kind: 'yearly_last_day', month: 2 }, '2027-02-28', '2027-02-28')).toBe('2028-02-29');
  });

  it('falls back to the deadline, then the completion day, as the base date', () => {
    expect(nextDueDate({ kind: 'monthly_day', day: 1 }, { deadline_date: '2026-11-20' }, '2026-11-21')).toBe('2026-12-01');
    expect(nextDueDate({ kind: 'monthly_day', day: 1 }, {}, '2026-12-05')).toBe('2027-01-01');
  });
});

describe('rule labels', () => {
  it('describes and shortens each kind', () => {
    expect(shortRuleLabel({ kind: 'interval', every: 1, unit: 'week' })).toBe('Weekly');
    expect(shortRuleLabel({ kind: 'interval', every: 2, unit: 'week' })).toBe('Every 2 weeks');
    expect(shortRuleLabel({ kind: 'monthly_day', day: 3, every_months: 2 })).toBe('Every 2 mo on the 3rd');
    expect(shortRuleLabel({ kind: 'yearly_weekday', month: 11, ordinal: 4, weekday: 4 })).toBe('Yearly, Fourth Thu of Nov');
    expect(describeRule({ kind: 'monthly_day', day: 31 })).toBe('Repeats on the 31st of every month (the last day in shorter months).');
    expect(describeRule({ kind: 'monthly_weekday', ordinal: -1, weekday: 5 })).toBe('Repeats on the last Friday of every month.');
    expect(describeRule(null)).toBe('Does not repeat.');
  });
});
