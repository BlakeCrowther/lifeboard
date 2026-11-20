/* Synthetic board for the UI smoke check. Made-up data only; never copy mockdata.js here. */
window.MOCK = {
  tasks: {
    t1: { title: 'Water the plants', status: 'open', category: 'home', sort_order: 1, created_at: 1 },
    t2: { title: 'Call the dentist', status: 'done', completed_at: 2, sort_order: 2, created_at: 1 },
  },
  habits: { h1: { name: 'Read', cadence: 'week', target_per_week: 3, sort_order: 1 } },
  habit_sessions: {},
  groceries: { g1: { name: 'Apples', checked: false, sort_order: 1 } },
  goals: { o1: { title: 'Run a 10k', year: 2026, status: 'active' } },
};
