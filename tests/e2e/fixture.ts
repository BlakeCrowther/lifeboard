/* Synthetic board for the UI smoke check. Made-up data only; never copy mockdata.js here. */
import type { FakeData } from '../../src/packages/db/fake.ts';

export const board: FakeData = {
  tasks: {
    t1: { title: 'Water the plants', status: 'open', category: 'home', sort_order: 1, created_at: 1 },
    t3: { title: 'Back-dated on purpose', status: 'open', category: 'home', due_date: '2020-01-01', sort_order: 3, created_at: Date.now() },
    t2: { title: 'Call the dentist', status: 'done', completed_at: 2, sort_order: 2, created_at: 1 },
  },
  habits: { h1: { name: 'Read', cadence: 'week', target_per_week: 3, sort_order: 1 } },
  habit_sessions: {},
  groceries: { g1: { name: 'Apples', checked: false, sort_order: 1 } },
  goals: { o1: { title: 'Run a 10k', year: 2026, status: 'active' } },
  checks: { profile: { value: { name: 'Sam', place: 'Harbor Point', pets: [{ name: 'Biscuit', kind: 'dog' }] } } },
};
