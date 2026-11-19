/* Simulation: runs game.js against made-up personas for WEEKS weeks over SEEDS seeds and prints averages.
   node sim/run.js [seeds] [weeks]      No Claude in the loop: Claude's jobs never change numbers.
   node sim/run.js --visitors[=persona[:seed]]   also print one run's week-by-week visitor events as JSON
   (the weekly-visitor skill's --dry-run picks an event from this list). */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', 'game.js'));

const argv0 = process.argv.slice(2), visArg = argv0.find((a) => a.startsWith('--visitors'));
const args = argv0.filter((a) => !a.startsWith('--')), sets = args.filter((a) => a.includes('=')), nums = args.filter((a) => !a.includes('='));
const SEEDS = +nums[0] || 200, WEEKS = +nums[1] || 28;
/* overrides: garden.replant=true lessons.perFeeding=5 lessons.feedings=2 lessons.intervals=[3,7,21] */
for (const kv of sets) { const [k, v] = kv.split('='), ks = k.split('.'); let o = G.RULES; ks.slice(0, -1).forEach((x) => (o = o[x])); o[ks.at(-1)] = JSON.parse(v); }
if (sets.length) console.log('overrides:', sets.join(' '));

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, dist) => { let x = rng(); for (const [k, p] of Object.entries(dist)) { if ((x -= p) < 0) return k; } return Object.keys(dist)[0]; };
const poisson = (rng, l) => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= rng(); } while (p > L); return k - 1; };
const bin = (rng, n, p) => { let k = 0; for (let i = 0; i < n; i++) if (rng() < p) k++; return k; };
const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

const HABITS = [{ f: 2, t: 3 }, { f: 1, t: 2 }, { f: 3, t: 5 }, { f: 1, t: 1 }];
const STEADY_W = { great: 0.15, good: 0.6, meh: 0.2, gap: 0.05 };

/* Each persona: habits, weekMode(week, st, rng) -> great|good|meh|gap (shared mood for the week),
   per-habit mode drawn around it, tasks per day (lambda), finish prob by mode, overdue pulls, lesson habits. */
const PERSONAS = {
  steady: { habits: HABITS, mode: () => STEADY_W, lam: 3, q: { great: 0.95, good: 0.88, meh: 0.7, gap: 0.3 }, pull: 0.5, deck: 0.85, tidy: 0.08 },
  bursty: {
    habits: HABITS, lam: 3, q: { great: 0.95, good: 0.85, meh: 0.6, gap: 0.2 }, pull: 0.4, deck: 0.75, tidy: 0.05,
    mode: (w, st, rng) => {
      if (st.off > 0) { st.off--; return { gap: 0.8, meh: 0.2 }; }
      if (rng() < 0.2) { st.off = randInt(rng, 0, 1); return { gap: 0.8, meh: 0.2 }; }
      return { great: 0.35, good: 0.45, meh: 0.2 };
    },
  },
  slump: { habits: HABITS, lam: 3, q: { great: 0.95, good: 0.88, meh: 0.7, gap: 0.25 }, pull: 0.5, deck: 0.85, tidy: 0.08,
    mode: (w) => (w >= 9 && w <= 11 ? { gap: 0.7, meh: 0.3 } : STEADY_W) },
  over: { habits: HABITS, lam: 2.5, q: { great: 0.99, good: 0.97, meh: 0.9, gap: 0.6 }, pull: 0.8, deck: 0.95, tidy: 0.2,
    mode: () => ({ great: 0.7, good: 0.3 }) },
  light: { habits: [{ f: 1, t: 2 }, { f: 1, t: 1 }], lam: 1.2, q: { great: 0.8, good: 0.65, meh: 0.5, gap: 0.2 }, pull: 0.15, deck: 0.5, tidy: 0.03,
    mode: () => ({ good: 0.5, meh: 0.3, gap: 0.2 }) },
  gamer: { habits: HABITS, lam: 3, q: { great: 0.8, good: 0.7, meh: 0.5, gap: 0.3 }, pull: 0.3, deck: 0.8, tidy: 0.05, tiny: 3, mode: () => STEADY_W },
};

function habitCount(rng, mode, h) {
  if (mode === 'great') return h.t + bin(rng, 2, 0.5);
  if (mode === 'good') return randInt(rng, h.f, h.t);
  if (mode === 'meh') return rng() < 0.5 ? h.f : Math.max(0, h.f - 1);
  return bin(rng, h.f, 0.2);
}
/* per-habit mode: usually the week's mood, sometimes a step either way */
function habitMode(rng, weekMode) {
  const order = ['gap', 'meh', 'good', 'great'], i = order.indexOf(weekMode), r = rng();
  if (r < 0.15) return order[Math.max(0, i - 1)];
  if (r < 0.25) return order[Math.min(3, i + 1)];
  return weekMode;
}

const RANK = { none: 0, common: 1, rare: 2, legendary: 3 };
function runOne(P, seed, opts = {}) {
  const rng = mulberry32(seed), st = { off: 0 };
  const M = { deaths: 0, blooms: 0, plantSeasons: 0, deadPlotWeeks: 0, plotWeeks: 0, rarity: { common: 0, heirloom: 0, exotic: 0 }, hybrids: 0,
    visitors: [], biomeDays: [], rare: 0, rareOd: 0, pileEnd: 0, algaeDays: 0, pileSum: 0, legendary: 0, bleach: 0, bleachDays: 0, cloudyDays: 0, ringSum: 0, ringDays: 0, fullDays: 0, neutral: 0,
    lessonsShown: 0, backlogEnd: 0, backlogMax: 0, bookDays: [], booksStarted: 0, booksDone: 0 };

  /* garden */
  let plants = P.habits.map(() => G.newPlant({ rarity: 'common' }, false));
  /* reef */
  const reef = G.newReef();
  let pile = []; /* overdue tasks: { since } */
  const resched = {}; /* day -> tasks rescheduled to come due that day */
  /* lessons */
  const lessons = [], sources = [];
  let lid = 0;
  const booksPerMonth = opts.booksPerMonth ?? 1, postsPerMonth = opts.postsPerMonth ?? 2;
  const ingest = (day, kind) => {
    const n = kind === 'book' ? randInt(rng, 10, 25) : randInt(rng, 3, 5), sid = sources.length;
    sources.push({ kind, day, done: null });
    for (let i = 0; i < n; i++) lessons.push(G.newLesson(lid++, sid, pick(rng, { tap: 0.4, recall: 0.35, apply: 0.25 }), day));
    if (kind === 'book') M.booksStarted++;
  };

  for (let w = 0; w < WEEKS; w++) {
    reef.weekDrops = 0; let weekDrop = null; const weekDist = P.mode(w, st, rng), weekMode = pick(rng, weekDist), tides = [];
    /* ingest spread over the month */
    if (w % 4 === 0) for (let b = 0; b < booksPerMonth; b++) ingest(w * 7 + Math.floor(b * 28 / Math.max(1, booksPerMonth)) % 28, 'book');
    for (let d = 0; d < 7; d++) {
      const day = w * 7 + d, dayMode = rng() < 0.7 ? weekMode : pick(rng, weekDist), q = P.q[dayMode];
      /* tasks */
      /* cleanup: each overdue task may get rescheduled (60%, due again in 2-7 days) or deleted (40%); less on gap days */
      pile = pile.filter(() => {
        if (rng() >= P.tidy * (dayMode === 'gap' ? 0.3 : 1)) return true;
        if (rng() < 0.6) { const d2 = day + randInt(rng, 2, 7); resched[d2] = (resched[d2] || 0) + 1; }
        return false;
      });
      const due = poisson(rng, P.lam) + (resched[day] || 0);
      let committed = due, done = bin(rng, due, q);
      for (let i = 0; i < due - done; i++) pile.push({ since: day });
      if (pile.length && rng() < P.pull) {
        const k = randInt(rng, 0, pile.length - 1), t = pile[k];
        committed++;
        if (rng() < q) { done++; pile.splice(k, 1); const drop = G.overdueReward(reef, day - t.since); if (drop === 'rare') M.rareOd++; if (drop === 'legendary') M.legendary++; if (drop && RANK[drop] > RANK[weekDrop || 'none']) weekDrop = drop; }
      }
      if (P.tiny) { committed += P.tiny; done += P.tiny; }
      const tide = G.dayTide(committed, done);
      tides.push(tide);
      if (!tide) M.neutral++; else { M.ringSum += tide.pct; M.ringDays++; if (tide.full) M.fullDays++; }
      const ev = G.reefDay(reef, day, tide);
      if (ev.includes('bleach')) M.bleach++;
      if (reef.bleached) M.bleachDays++;
      if (G.cloudiness(pile.length) >= 0.5) M.cloudyDays++;
      if (G.algae(pile.map((t) => day - t.since)) >= 0.5) M.algaeDays++;
      M.pileSum += pile.length;
      /* lessons */
      for (let fd = 0; fd < G.RULES.lessons.feedings; fd++) if (rng() < P.deck * (dayMode === 'gap' ? 0.4 : 1)) {
        for (const l of G.buildDeck(lessons, day)) {
          M.lessonsShown++;
          const r = rng();
          let a = 'advance';
          if (r < 0.02) a = 'drop'; else if (r < 0.07) a = 'again'; else if (l.format === 'recall' && r < 0.27) a = 'wrong';
          G.answer(l, a, day);
          const s = sources[l.sourceId];
          if (s.done == null && G.sourceDone(lessons.filter((x) => x.sourceId === l.sourceId))) { s.done = day; if (s.kind === 'book') { M.booksDone++; M.bookDays.push(day - s.day); } }
        }
      }
      if (day % 14 === 7) for (let p = 0; p < postsPerMonth / 2; p++) ingest(day, 'post');
      const backlog = lessons.filter((l) => l.state === 'active' && l.due <= day).length;
      M.backlogMax = Math.max(M.backlogMax, backlog); M.backlogEnd = backlog;
    }
    if (G.weekVisitor(tides) === 'rare') M.rare++;
    /* visitor event for this week: best of tide streak (rare) and overdue drop (rare/legendary); common otherwise; none while bleached.
       ASSUMPTION: a common visitor arrives every non-bleached week. game.js only defines rare/legendary triggers. */
    { const wv = G.weekVisitor(tides), cand = [wv, weekDrop].filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0];
      const rarity = reef.bleached ? null : cand || 'common';
      M.visitors.push({ week: w, biome: reef.biome, rarity, reason: reef.bleached ? 'bleached' : cand === weekDrop && weekDrop ? 'overdue task finished' : wv ? 'full-tide streak' : 'weekly' }); }
    /* habits */
    P.habits.forEach((h, i) => {
      const r = G.weekResult(habitCount(rng, habitMode(rng, weekMode), h), h.f, h.t);
      const p = plants[i], wasAlive = p.alive;
      G.plantWeek(p, r, w);
      if (wasAlive && !p.alive) M.deaths++;
      M.plotWeeks++; if (!p.alive) M.deadPlotWeeks++;
    });
    if ((w + 1) % G.RULES.garden.seasonWeeks === 0) {
      const res = G.endSeason(plants, rng);
      res.plots.forEach((x) => { M.plantSeasons++; if (x.bloomed) { M.blooms++; M.rarity[x.seed.rarity]++; } });
      M.hybrids += res.hybrids.length;
      plants = res.plots.map((x) => G.newPlant(x.seed, x.compost));
    }
  }
  M.biomeDays = reef.dioramas.map((d) => d.days); M.pileEnd = pile.length;
  return M;
}

function summarize(name, P, opts) {
  const runs = Array.from({ length: SEEDS }, (_, i) => runOne(P, 1000 + i, opts));
  const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const seasons = Math.floor(WEEKS / G.RULES.garden.seasonWeeks), months = WEEKS / 4, n = P.habits.length;
  const allBiome = runs.flatMap((r) => r.biomeDays.slice(1)); /* skip the cold-start biome */
  const firstBiome = runs.flatMap((r) => r.biomeDays.slice(0, 1));
  const book = runs.flatMap((r) => r.bookDays);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const blooms = avg((r) => r.blooms);
  const rar = { c: avg((r) => r.rarity.common), h: avg((r) => r.rarity.heirloom), e: avg((r) => r.rarity.exotic) };
  return {
    persona: name,
    'ring%': (100 * avg((r) => r.ringSum / Math.max(1, r.ringDays))).toFixed(0),
    'deaths/season': (avg((r) => r.deaths) / seasons).toFixed(2),
    'blooms/season': (blooms / seasons).toFixed(2) + `/${n}`,
    'dead plot %': (100 * avg((r) => r.deadPlotWeeks / r.plotWeeks)).toFixed(0),
    'seed c/h/e %': [rar.c, rar.h, rar.e].map((x) => ((100 * x) / Math.max(1e-9, blooms)).toFixed(0)).join('/'),
    'hybrids/season': (avg((r) => r.hybrids) / seasons).toFixed(2),
    'biome1 wks': (mean(firstBiome) / 7).toFixed(1),
    'biome wks': (mean(allBiome) / 7).toFixed(1),
    'rare wk/mo': (avg((r) => r.rare) / months).toFixed(2),
    'rare od/mo': (avg((r) => r.rareOd) / months).toFixed(2),
    'pile end': avg((r) => r.pileEnd).toFixed(0),
    'legend/mo': (avg((r) => r.legendary) / months).toFixed(2),
    'visitors c/r/l per mo': ['common', 'rare', 'legendary'].map((k) => (avg((r) => r.visitors.filter((v) => v.rarity === k).length) / months).toFixed(1)).join('/'),
    'bleach': avg((r) => r.bleach).toFixed(2),
    'murk50 %': (100 * avg((r) => r.cloudyDays) / (WEEKS * 7)).toFixed(0),
    'algae50 %': (100 * avg((r) => r.algaeDays) / (WEEKS * 7)).toFixed(0),
    'pile avg': avg((r) => r.pileSum / (WEEKS * 7)).toFixed(1),
    'backlog end': avg((r) => r.backlogEnd).toFixed(0),
    'book days': mean(book).toFixed(0),
    'books done %': (100 * avg((r) => r.booksDone) / Math.max(1e-9, avg((r) => r.booksStarted))).toFixed(0),
  };
}

console.log(`\n${SEEDS} seeds x ${WEEKS} weeks, 1 book + 2 posts a month\n`);
console.table(Object.entries(PERSONAS).map(([k, P]) => summarize(k, P)));
console.log('\nLesson load (steady persona), books per month:\n');
console.table([1, 2, 4].map((b) => { const s = summarize('steady', PERSONAS.steady, { booksPerMonth: b }); return { 'books/mo': b, 'backlog end': s['backlog end'], 'book days': s['book days'], 'books done %': s['books done %'] }; }));

if (visArg) {
  const [pn, sd] = (visArg.split('=')[1] || 'steady').split(':');
  const r = runOne(PERSONAS[pn], +sd || 1000);
  console.log('\nVisitor events (' + pn + ', seed ' + (+sd || 1000) + '):');
  console.log(JSON.stringify(r.visitors));
}
