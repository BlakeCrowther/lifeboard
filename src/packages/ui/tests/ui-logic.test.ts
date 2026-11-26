import { describe, expect, it } from 'vitest';
import { DAILY_LAST_CALL_HOUR, habitRisk } from '../habit-risk.ts';
import { buildBoardModel, readProfile, type BoardReader } from '../board-model.ts';
import { guessAisle } from '../list-kinds.ts';
import { parseQuickAdd, ruleOfRepeat } from '../quick-add.ts';
import { presetOf, ruleForPreset } from '../repeat-presets.ts';

/** Saturday. */
const TODAY = '2026-11-21';

const fixture: Record<string, unknown[]> = {
  tasks: [
    { id: 't1', title: 'Call the dentist', status: 'open', due_date: '2026-11-23', category: 'Health', created_at: 0 },
    { id: 't2', title: 'Try a new recipe', status: 'open', suggested: true, created_at: 0 },
    { id: 't3', title: 'Water plants', status: 'done', recurrence_rule: { kind: 'interval', every: 3, unit: 'day', basis: 'completion' }, created_at: 0 },
  ],
  habits: [
    { id: 'h2', key: 'read', name: 'Read', target_per_week: 5, sort_order: 2 },
    { id: 'h1', key: 'gym', name: 'Gym', target_per_week: 3, streak_floor_per_week: 2, sort_order: 1 },
    { id: 'h3', name: 'Old habit', target_per_week: 1, hidden: true },
  ],
  habit_sessions: [{ id: 's1', habit_id: 'h1', date: '2026-11-20' }],
  groceries: [
    { id: 'g1', name: 'Milk', group_name: 'Dairy', sort_order: 2 },
    { id: 'g2', name: 'Mystery', group_name: 'Nowhere', checked: true, sort_order: 1 },
  ],
  list_items: [{ id: 'l1', list_key: 'books', title: 'Dune', author: 'Herbert', status: 'done' }],
  countdowns: [
    { id: 'c1', kind: 'big_trip', title: 'Trip', date: '2026-12-20' },
    { id: 'c2', kind: 'glance', title: 'Rent', date: '2026-12-01', detail: 'transfer' },
  ],
};
/* the fixture is loose on purpose (only the fields under test); `never` lets it stand in for any collection's docs */
const read: BoardReader = (collection) => (fixture[collection] ?? []) as never;

describe('buildBoardModel', () => {
  const model = buildBoardModel(read, { today: TODAY, weekStart: 1, pets: [], liveCalendar: null });

  it('keeps suggestions out of the task list', () => {
    expect(model.tasks.map((t) => [t.id, t.group, t.due, t.done])).toEqual([['t1', 'Health', '2026-11-23', false], ['t3', 'Personal', null, true]]);
    expect(model.suggested.map((t) => t.id)).toEqual(['t2']);
  });

  it('orders visible habits and sets aside hidden ones', () => {
    expect(model.habits.map((h) => [h.id, h.target, h.floor])).toEqual([['h1', 3, 2], ['h2', 5, 1]]);
    expect(model.hiddenHabits).toEqual([{ id: 'h3', name: 'Old habit' }]);
    expect(model.habitSessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('files groceries, list items and countdowns', () => {
    expect(model.groceries.map((g) => [g.name, g.aisle, g.done])).toEqual([['Mystery', 'Other', true], ['Milk', 'Dairy', false]]);
    expect(model.listItemsByKey['books']).toEqual([{ id: 'l1', name: 'Dune', by: 'Herbert', url: undefined, notes: '', done: true }]);
    expect(model.countdownsByKind.big.map((c) => [c.kind, c.title])).toEqual([['big trip', 'Trip']]);
    expect(model.countdownsByKind.glance).toEqual([{ id: 'c2', title: 'Rent', date: '2026-12-01', detail: 'transfer' }]);
    expect(model.calendarSynced).toBe(false);
  });
});

describe('readProfile demo flag', () => {
  it('is a demo only when demo is exactly true', () => {
    expect(readProfile({ name: 'Sam', demo: true }).demo).toBe(true);
    for (const value of [{ demo: 'true' }, { demo: 1 }, { demo: false }, {}, undefined, null]) expect(readProfile(value).demo).toBe(false);
  });
});

describe('guessAisle', () => {
  it('guesses from the name, else Other', () => {
    expect(guessAisle('Baby spinach')).toBe('Produce');
    expect(guessAisle('Oat milk')).toBe('Dairy');
    expect(guessAisle('Salmon fillets')).toBe('Meat & seafood');
    expect(guessAisle('Dish soap')).toBe('Household');
    expect(guessAisle('Birthday candles')).toBe('Other');
  });
});

describe('ruleForPreset and presetOf', () => {
  it('anchors a preset on the do date', () => {
    expect(ruleForPreset('biweekly', '2026-11-23', TODAY)).toEqual({ kind: 'interval', every: 2, unit: 'week', basis: 'completion' });
    expect(ruleForPreset('monthly_weekday', '2026-11-23', TODAY)).toEqual({ kind: 'monthly_weekday', ordinal: 4, weekday: 1, every_months: 1 });
    expect(ruleForPreset('yearly_day', null, TODAY)).toEqual({ kind: 'yearly_day', month: 11, day: 21 });
    expect(ruleForPreset('none', null, TODAY)).toBeNull();
  });

  it('round-trips each preset through its rule', () => {
    for (const preset of ['daily', 'weekly', 'biweekly', 'monthly', 'interval', 'monthly_first', 'monthly_last_day', 'yearly_weekday']) {
      expect(presetOf(ruleForPreset(preset, '2026-11-23', TODAY))).toBe(preset);
    }
  });
});

describe('parseQuickAdd', () => {
  it('pulls out a weekday and a time', () => {
    expect(parseQuickAdd('dentist fri 3pm', TODAY)).toEqual({ title: 'Dentist', date: '2026-11-27', time: 900, repeat: null });
  });

  it('reads an interval repeat', () => {
    const parsed = parseQuickAdd('water plants every 3 days', TODAY);
    expect(parsed).toEqual({ title: 'Water plants', date: null, time: null, repeat: { n: 3, unit: 'day' } });
    expect(ruleOfRepeat(parsed.repeat)).toEqual({ kind: 'interval', every: 3, unit: 'day', basis: 'completion' });
  });

  it('keeps "every mon" on its weekday', () => {
    const parsed = parseQuickAdd('gym every mon 7am', TODAY);
    expect(parsed).toEqual({ title: 'Gym', date: '2026-11-23', time: 420, repeat: { n: 1, unit: 'week', onWeekday: true } });
    expect(ruleOfRepeat(parsed.repeat)).toEqual({ kind: 'interval', every: 1, unit: 'week', basis: 'schedule' });
  });

  it('rolls a past month-day into next year and turns yearly into 12 months', () => {
    expect(parseQuickAdd('renew passport mar 3', TODAY).date).toBe('2027-03-03');
    expect(ruleOfRepeat(parseQuickAdd('taxes yearly', TODAY).repeat)).toEqual({ kind: 'interval', every: 1, unit: 'year', basis: 'completion' });
  });
});

describe('habitRisk (at-risk habit tiles)', () => {
  const weekly = { floor: 3 }, daily = { daily: true, floor: 1 };
  it('warns a weekly habit inside the window and flags the last day', () => {
    expect(habitRisk(weekly, { week: 1, today: 0 }, 5, 600)).toEqual({ low: false, last: false });
    expect(habitRisk(weekly, { week: 1, today: 0 }, 4, 600)).toEqual({ low: true, last: false });
    expect(habitRisk(weekly, { week: 2, today: 0 }, 1, 600)).toEqual({ low: true, last: true });
    expect(habitRisk(weekly, { week: 3, today: 0 }, 1, 600)).toEqual({ low: false, last: false });
  });
  it('flags a daily habit as last chance only from the evening cutoff', () => {
    expect(habitRisk(daily, { week: 0, today: 0 }, 3, DAILY_LAST_CALL_HOUR * 60 - 1)).toEqual({ low: true, last: false });
    expect(habitRisk(daily, { week: 0, today: 0 }, 3, DAILY_LAST_CALL_HOUR * 60)).toEqual({ low: true, last: true });
    expect(habitRisk(daily, { week: 0, today: 1 }, 3, 23 * 60)).toEqual({ low: false, last: false });
    expect(habitRisk(daily, { week: 0, today: 0, missed: true }, 3, 23 * 60)).toEqual({ low: false, last: false });
  });
});
