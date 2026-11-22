import { describe, expect, it } from 'vitest';
import { bucketTasks, firstCommittedDay, isCommittedOn, missedTaskStatus, ringPercent, ringTally, taskAge, taskState } from '../index.ts';
import { iconForTitle } from '../icons.ts';

const TODAY = '2026-11-21';

describe('ring tally (SPEC.md Ring %)', () => {
  it('adds a task added and finished the same day to both sides: 3/4 becomes 4/5', () => {
    const day = [
      { eff: TODAY, doneDate: TODAY },
      { eff: TODAY, doneDate: TODAY },
      { eff: TODAY, doneDate: TODAY },
      { eff: TODAY, doneDate: null },
    ];
    expect(ringPercent(ringTally(day)[TODAY])).toBe(0.75);
    expect(ringPercent(ringTally([...day, { eff: TODAY, doneDate: TODAY }])[TODAY])).toBe(0.8);
  });

  it('counts a task on every day it was committed to until it is done, not the days after', () => {
    const tally = ringTally([{ eff: '2026-11-25', doneDate: '2026-11-20', days: ['2026-11-17', '2026-11-19'] }]);
    expect(tally['2026-11-17']).toEqual({ done: 0, committed: 1 });
    expect(tally['2026-11-19']).toEqual({ done: 0, committed: 1 });
    expect(tally['2026-11-20']).toEqual({ done: 1, committed: 1 });
    expect(tally['2026-11-25']).toBeUndefined();
  });

  it('makes a day with nothing due but something finished a full ring, and a day with nothing committed neutral', () => {
    const tally = ringTally([{ eff: '2026-12-01', doneDate: TODAY }]);
    expect(ringPercent(tally[TODAY])).toBe(1);
    expect(ringPercent(tally['2026-11-22'])).toBeNull();
  });

  it('uses the current date for a task with no recorded commitments', () => {
    expect(isCommittedOn({ eff: '2026-11-18' }, '2026-11-18')).toBe(true);
    expect(isCommittedOn({ eff: '2026-11-18', days: ['2026-11-15'] }, '2026-11-18')).toBe(false);
  });
});

describe('age', () => {
  it('counts from the first committed day and never resets when pushed', () => {
    const pushedTwice = { eff: '2026-11-25', days: ['2026-11-15', '2026-11-10', '2026-11-18'] };
    expect(firstCommittedDay(pushedTwice)).toBe('2026-11-10');
    expect(taskAge(pushedTwice, TODAY)).toBe(11);
  });

  it('is zero for a task not yet committed', () => {
    expect(taskAge({ eff: '2026-11-30' }, TODAY)).toBe(0);
    expect(taskAge({ eff: null }, TODAY)).toBe(0);
  });
});

describe('task state and missed-day status (SPEC.md Day statuses)', () => {
  it('is slipped while the deadline is ahead, overdue once it passes', () => {
    expect(taskState({ due_date: '2026-11-19', deadline_date: '2026-11-24' }, TODAY)).toEqual({ effective: '2026-11-19', overdue: false, slipped: true });
    expect(taskState({ due_date: '2026-11-19', deadline_date: '2026-11-20' }, TODAY)).toEqual({ effective: '2026-11-19', overdue: true, slipped: false });
    expect(taskState({ due_date: '2026-11-19' }, TODAY)).toEqual({ effective: '2026-11-19', overdue: true, slipped: false });
  });

  it('classifies a task a past day missed', () => {
    const missed = '2026-11-18';
    expect(missedTaskStatus({ due_date: missed, done: true }, missed, TODAY)).toEqual({ kind: 'done_late' });
    expect(missedTaskStatus({ due_date: '2026-11-23', done: false }, missed, TODAY)).toEqual({ kind: 'moved', to: '2026-11-23' });
    expect(missedTaskStatus({ done: false }, missed, TODAY)).toEqual({ kind: 'moved', to: null });
    expect(missedTaskStatus({ due_date: missed, done: false }, missed, TODAY)).toEqual({ kind: 'overdue', movedTo: null });
    expect(missedTaskStatus({ due_date: '2026-11-19', done: false }, missed, TODAY)).toEqual({ kind: 'overdue', movedTo: '2026-11-19' });
    expect(missedTaskStatus({ due_date: missed, deadline_date: '2026-11-28', done: false }, missed, TODAY)).toEqual({ kind: 'slipped', movedTo: null });
  });
});

describe('bucketTasks', () => {
  it('puts overdue before today, then by date and order; done tasks drop out', () => {
    const buckets = bucketTasks(
      [
        { id: 'today-b', due_date: TODAY, sort_order: 2 },
        { id: 'overdue', due_date: '2026-11-02' },
        { id: 'today-a', due_date: TODAY, sort_order: 1 },
        { id: 'pinned', due_date: TODAY, urgent_sort_order: 0 },
        { id: 'week', due_date: '2026-11-28' },
        { id: 'later', due_date: '2026-11-29' },
        { id: 'undated' },
        { id: 'done', due_date: TODAY, status: 'done' },
      ],
      TODAY,
    );
    expect(buckets.urgent.map((task) => task.id)).toEqual(['pinned', 'overdue', 'today-a', 'today-b']);
    expect(buckets.week.map((task) => task.id)).toEqual(['week']);
    expect(buckets.later.map((task) => task.id)).toEqual(['later']);
    expect(buckets.none.map((task) => task.id)).toEqual(['undated']);
  });
});

describe('task icon from its title', () => {
  it("takes pet names from the profile, so no owner's pet is named in code", () => {
    const pets = [{ name: 'Waffles', icon: 'cat' }];
    expect(iconForTitle('Brush Waffles', pets)).toBe('cat');
    expect(iconForTitle('Walk the dog', pets)).toBe('dog');
    expect(iconForTitle('Brush Biscuit')).toBe('dog');
  });
});
