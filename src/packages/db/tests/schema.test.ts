import { describe, expect, it } from 'vitest';
import { ruleError, validate } from '../schema.ts';

const task = { title: 'Pay rent', status: 'open', due_date: '2026-12-01' };

describe('validate: tasks with a recurrence rule', () => {
  it('accepts a monthly weekday rule, numbers stored as strings, and extra fields old docs carry', () => {
    expect(validate('tasks', { ...task, recurrence_rule: { kind: 'monthly_weekday', ordinal: '-1', weekday: 5, basis: 'schedule' }, icon_key: 'receipt', legacy_flag: 1 })).toBeNull();
  });

  it('accepts null in any optional field', () => {
    expect(validate('tasks', { ...task, recurrence_rule: null, deadline_date: null, committed_days: null })).toBeNull();
  });

  it('names the missing rule field for the rule kind', () => {
    expect(validate('tasks', { ...task, recurrence_rule: { kind: 'yearly_weekday', month: 2, weekday: 1 } })).toBe('recurrence yearly_weekday needs a valid ordinal');
  });

  it('rejects an unknown rule kind, an out-of-range interval and a bad basis', () => {
    expect(validate('tasks', { ...task, recurrence_rule: { kind: 'fortnightly' } })).toBe('unknown recurrence kind');
    expect(validate('tasks', { ...task, recurrence_rule: { kind: 'interval', every: 1000, unit: 'day' } })).toBe('recurrence interval needs a valid every');
    expect(validate('tasks', { ...task, recurrence_rule: { kind: 'monthly_last_day', basis: 'whenever' } })).toBe('bad basis');
    expect(ruleError([])).toBe('recurrence_rule is not an object');
  });

  it('reports a missing required field, then the first bad field in schema order', () => {
    expect(validate('tasks', { status: 'open' })).toBe('missing title');
    expect(validate('tasks', { ...task, status: 'closed', due_date: '12/01/2026' })).toBe('bad due_date');
    expect(validate('tasks', { ...task, committed_days: ['2026-11-20', 'today'] })).toBe('bad committed_days');
  });
});

describe('validate: habit_sessions', () => {
  it('accepts a late session carrying an exception (not checked by the schema)', () => {
    expect(validate('habit_sessions', { habit_id: 'run', date: '2026-11-16', created_at: 1763900000000, exception: { reason: 'Logged late after a trip without signal', evidence: 'strava' } })).toBeNull();
  });

  it('rejects a session without a date or with a non-number created_at', () => {
    expect(validate('habit_sessions', { habit_id: 'run' })).toBe('missing date');
    expect(validate('habit_sessions', { habit_id: 'run', date: '2026-11-16', created_at: '1763900000000' })).toBe('bad created_at');
  });
});

describe('validate: countdowns', () => {
  it('accepts a glance countdown and any free-text kind', () => {
    expect(validate('countdowns', { kind: 'glance', title: 'Half marathon', date: '2027-03-14' })).toBeNull();
    expect(validate('countdowns', { kind: 'family-wedding', title: 'Wedding', date: '2027-06-05', match: ['wedding'], gift: 'registry' })).toBeNull();
  });

  it('rejects a countdown without a title or with a non-array match', () => {
    expect(validate('countdowns', { kind: 'trip', date: '2027-01-01' })).toBe('missing title');
    expect(validate('countdowns', { kind: 'trip', title: 'Trip', date: '2027-01-01', match: 'trip' })).toBe('bad match');
  });
});

describe('validate: game_state', () => {
  it('accepts a start day', () => {
    expect(validate('game_state', { started: '2026-11-02', created_at: 1762000000000 })).toBeNull();
  });

  it('rejects a missing or malformed start day', () => {
    expect(validate('game_state', {})).toBe('missing started');
    expect(validate('game_state', { started: '2026-11-2' })).toBe('bad started');
  });
});

describe('validate: lessons and the edges', () => {
  it('needs an answer on a recall rung only', () => {
    const base = { source_id: 's1', level: 0, due: '2026-11-21', state: 'active' };
    expect(validate('lessons', { ...base, rungs: [{ format: 'tap', prompt: 'Which?' }, { format: 'recall', prompt: 'Say it', answer: 'it' }] })).toBeNull();
    expect(validate('lessons', { ...base, rungs: [{ format: 'recall', prompt: 'Say it' }] })).toBe('bad rungs');
  });

  it('rejects unknown collections, non-objects and non-finite numbers', () => {
    expect(validate('wishes', {})).toBe('unknown collection');
    expect(validate('tasks', [task])).toBe('not an object');
    expect(validate('habits', { name: 'Run', target_per_week: Infinity })).toBe('bad target_per_week');
  });
});
