/* Garden derivation checks (deriveGame in garden.js) for rules the sim doesn't exercise. Exits 1 on failure. */
const LBG = require('../game.js');
const { deriveGame } = require('../garden.js');

const fails = [];
const plot = (habit, sessions, today) =>
  deriveGame({ today, start: '2026-11-02', tasks: [], habits: [habit], sessions }, LBG).plots[0];
const expect = (name, got, want) => { if (got !== want) fails.push(`${name}: got ${got}, want ${want}`); };

/* weekly habit created Wednesday 2026-11-04 (weeks start Monday) */
const weekly = { key: 'run', name: 'Run', floor: 2, target: 3, since: '2026-11-04' };
let p = plot(weekly, [{ h: 'run', date: '2026-11-05' }, { h: 'run', date: '2026-11-06' }], '2026-11-10');
expect('mid-week habit hitting floor in its first partial week sprouts', p.stageName, 'sprout');
p = plot(weekly, [{ h: 'run', date: '2026-11-05' }], '2026-11-10');
expect('mid-week habit missing floor in its first partial week: seed waits', p.stageName, 'seed');
expect('mid-week habit missing floor in its first partial week: still alive', p.alive, true);

/* daily habit created Wednesday: Mon and Tue (before it existed) are not misses */
const daily = { key: 'read', name: 'Read', floor: 1, target: 1, daily: true, since: '2026-11-04' };
const days = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((date) => ({ h: 'read', date }));
p = plot(daily, days, '2026-11-10');
expect('mid-week daily habit with every day since creation sprouts', p.stageName, 'sprout');

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log('garden checks ok');
