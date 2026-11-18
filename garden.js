/* lifeboard Labs: game-state derivation (pure) + Garden card (DOM, SVG).
   Loaded only when Labs is on. The derivation half has no DOM and runs in node:
     const { deriveGame } = require('./garden.js');   (needs game.js loaded as global LBG or passed in)

   deriveGame(input, G) -> game state. Input (plain data, dates 'YYYY-MM-DD'):
     today, ringGoal (tasks per day that close the ring),
     tasks:    [{ eff: due-or-deadline date | null, done: bool, doneDate: date | null }]
     habits:   [{ key, name, floor, target }]
     sessions: [{ h: habit key, date }]
   Choices where game.js leaves the mapping open (see the Labs report):
   - Tide day = the Today ring: dayTide(ringGoal, tasks completed that day). A day with nothing done
     and nothing due is neutral (null). Days run from the first task/session date (max 365 back) to today.
   - Overdue = open tasks whose effective date < today; cloudiness/algae use their ages. Rescheduled
     tasks only keep their current date, so history is approximate.
   - Visitor this week = weekVisitor(Mon..today tides) || 'common' (sim's assumption), none while bleached.
   - Garden: weeks are Mondays counted from the first habit-session week; seasons every
     RULES.garden.seasonWeeks from there; the current week is still open, so plantWeek runs on finished
     weeks only. "Thirsty" = this week below floor with <= need+2 days left (same rule as the habit rings).
   - endSeason's rng is seeded from the habit key, so reloads agree. */
(function (G) {
  const DAY = 864e5;
  const dn = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
  const ds = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const monday = (n) => n - ((new Date(n * DAY).getUTCDay() + 6) % 7);
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /* one species per habit (spread by key hash, no repeats until all are used); shapes live in DRAW below */
  const SPECIES = ['daisy', 'tulip', 'sunflower', 'mushroom', 'cactus', 'fern', 'bonsai', 'lavender'];
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };

  function deriveGame(input, LBG) {
    LBG = LBG || G.LBG;
    const today = dn(input.today), goal = Math.max(1, input.ringGoal || 3);
    /* input.start ('YYYY-MM-DD', optional): the game begins that day at 0; history before it is ignored and
       tasks already overdue then count as overdue from the start date. */
    const start = input.start ? dn(input.start) : null, from = (d) => (start != null ? Math.max(d, start) : d);
    const tasks = (input.tasks || []).filter((t) => start == null || !(t.done && t.doneDate && dn(t.doneDate) < start)).map((t) => (t.eff && start != null && !t.done && dn(t.eff) < start ? { ...t, eff: ds(start) } : t));
    const habits = input.habits || [], sessions = (input.sessions || []).filter((s) => s.date && s.date <= input.today && (start == null || dn(s.date) >= start));
    /* ---- reef ---- */
    const doneOn = {}, dueOn = {};
    let first = today;
    tasks.forEach((t) => {
      if (t.done && t.doneDate) { const d = dn(t.doneDate); doneOn[d] = (doneOn[d] || 0) + 1; first = Math.min(first, d); }
      if (t.eff) { const d = dn(t.eff); dueOn[d] = (dueOn[d] || 0) + 1; if (d <= today) first = Math.min(first, d); }
    });
    sessions.forEach((s) => { first = Math.min(first, dn(s.date)); });
    first = Math.max(from(first), today - 365);
    const reef = LBG.newReef(), events = [], tides = [];
    for (let d = first; d <= today; d++) {
      const done = doneOn[d] || 0, tide = done || dueOn[d] ? LBG.dayTide(goal, done) : null;
      tides.push(tide);
      const ev = LBG.reefDay(reef, d - first, tide);
      if (ev.length) events.push({ date: ds(d), ev });
    }
    const wk = monday(today), weekTides = tides.slice(Math.max(0, tides.length - (today - wk + 1)));
    const overdueAges = tasks.filter((t) => !t.done && t.eff && dn(t.eff) < today).map((t) => today - dn(t.eff));
    const wv = LBG.weekVisitor(weekTides);
    const todayTide = tides[tides.length - 1];
    /* ---- garden ---- */
    const sw = LBG.RULES.garden.seasonWeeks;
    /* garden weeks run Mon..Sun: with a start date the garden opens the first Monday on/after it; until then every plot is a seed */
    const gStart = start == null ? null : monday(start) === start ? start : monday(start) + 7, waiting = gStart != null && today < gStart;
    const gSessions = gStart == null ? sessions : sessions.filter((s) => dn(s.date) >= gStart);
    const firstWeek = gStart != null ? gStart : gSessions.length ? monday(Math.min(...gSessions.map((s) => dn(s.date)))) : wk;
    const weeksDone = waiting ? 0 : Math.max(0, Math.round((wk - firstWeek) / 7));
    const daysLeft = 7 - (today - wk);
    /* history: one entry per plot per finished season (the gallery's keepsakes), oldest first */
    const history = [], N = SPECIES.length, used = new Set(), speciesOf = {};
    habits.forEach((h) => { if (used.size >= N) used.clear(); let i = ((hash(h.key) % N) + N) % N; while (used.has(SPECIES[i])) i = (i + 1) % N; used.add(SPECIES[i]); speciesOf[h.key] = SPECIES[i]; });
    const plots = habits.map((h) => {
      const counts = {};
      gSessions.forEach((s) => { if (s.h === h.key) { const m = monday(dn(s.date)); counts[m] = (counts[m] || 0) + 1; } });
      const rng = mulberry(hash(h.key));
      let p = LBG.newPlant({ rarity: 'common' }, false), seasons = 0;
      for (let w = 0; w < weeksDone; w++) {
        LBG.plantWeek(p, LBG.weekResult(counts[firstWeek + w * 7] || 0, h.floor, h.target), w);
        if ((w + 1) % sw === 0) {
          const r = LBG.endSeason([p], rng).plots[0], s0 = firstWeek + (w + 1 - sw) * 7;
          let n = 0; for (let k = 0; k < sw; k++) n += counts[s0 + k * 7] || 0;
          history.push({ id: `plant-${h.key}-s${seasons}`, kind: 'plant', key: h.key, name: h.name, species: speciesOf[h.key], hi: habits.indexOf(h), season: seasons, from: ds(s0), to: ds(s0 + sw * 7 - 1),
            stage: p.stage, stageName: LBG.RULES.garden.stages[p.stage], bloomed: r.bloomed, died: r.died, score: r.score, sessions: n, seed: p.seed, earned: r.seed });
          p = LBG.newPlant(r.seed, r.compost); seasons++;
        }
      }
      const week = counts[wk] || 0, need = Math.max(1, h.floor) - week;
      return { key: h.key, name: h.name, species: speciesOf[h.key], stage: p.stage, stageName: LBG.RULES.garden.stages[p.stage], alive: p.alive, wilted: !!p.wilted,
        thirsty: !waiting && p.alive && p.stage > 0 && need > 0 && daysLeft <= need + 2, week, floor: h.floor, target: h.target, seed: p.seed, seasons, plant: p,
        /* this week's floor met: the plant grows a stage when the week closes */
        grows: !waiting && p.alive && need <= 0, next: LBG.RULES.garden.stages[Math.min(4, p.stage + 1)], need: Math.max(0, need), waiting };
    });
    /* hybrids: neighbouring plots (habit order) that both bloom in a season cross; the seed each earns carries the other's species
       (earned is the next season's seed object, so the new plant shows it too) */
    const bySeason = {};
    history.forEach((e) => { (bySeason[e.season] = bySeason[e.season] || {})[e.hi] = e; });
    Object.values(bySeason).forEach((row) => Object.keys(row).forEach((k) => { const a = row[k], b = row[+k + 1]; if (b && a.bloomed && b.bloomed) { a.earned.hybrid = a.earned.hybrid || b.species; b.earned.hybrid = b.earned.hybrid || a.species; } }));
    history.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
    const gardenStats = { seasons: Math.floor(weeksDone / sw), blooms: history.filter((x) => x.bloomed).length, withered: history.filter((x) => x.died).length,
      heirloom: history.filter((x) => x.earned.rarity === 'heirloom').length, exotic: history.filter((x) => x.earned.rarity === 'exotic').length,
      mutated: history.filter((x) => x.earned.mutated).length, hybrids: history.filter((x) => x.earned.hybrid).length, sessions: gSessions.length, weeks: weeksDone };
    const si = Math.floor(weeksDone / sw);
    return {
      day: today - first, today: input.today,
      reef: { biome: reef.biome, phase: reef.phase, phases: LBG.RULES.tide.phases, pts: reef.pts, next: reef.th[reef.phase] ?? null, prev: reef.phase ? reef.th[reef.phase - 1] : 0, bleached: reef.bleached, dioramas: reef.dioramas.slice() },
      todayTide, weekTides, events,
      overdue: overdueAges.length, cloudiness: LBG.cloudiness(overdueAges.length), algae: LBG.algae(overdueAges),
      visitor: reef.bleached ? null : wv || 'common', visitorWeek: ds(wk),
      season: { week: (weeksDone % sw) + 1, of: sw, index: si, opens: waiting ? ds(gStart) : null, from: ds(firstWeek + si * sw * 7), ends: ds(firstWeek + (si + 1) * sw * 7 - 1) },
      start: start != null ? ds(start) : null,
      plots, history, gardenStats,
    };
  }

  const API = { deriveGame, SPECIES, _dn: dn, _ds: ds };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof document === 'undefined') return;

  /* ================= Garden card (SVG; look from the "Lifeboard Garden & Reef Styles" canvas) ================= */
  let uid = 0;
  const DEFS = (p) => `<defs>
<linearGradient id="${p}wl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c88f5c"/><stop offset="1" stop-color="#a8723f"/></linearGradient>
<linearGradient id="${p}wr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#875628"/><stop offset="1" stop-color="#6a401c"/></linearGradient>
<linearGradient id="${p}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0c48e"/><stop offset=".5" stop-color="#dba46a"/><stop offset="1" stop-color="#b98048"/></linearGradient>
<radialGradient id="${p}soil" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#7a5236"/><stop offset=".7" stop-color="#5a3a26"/><stop offset="1" stop-color="#3a2416"/></radialGradient>
<linearGradient id="${p}l1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3ec98"/><stop offset=".5" stop-color="#7cc25a"/><stop offset="1" stop-color="#3f7f34"/></linearGradient>
<linearGradient id="${p}l2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd877"/><stop offset=".6" stop-color="#5f9e45"/><stop offset="1" stop-color="#346b2b"/></linearGradient>
<linearGradient id="${p}dry" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8c890"/><stop offset="1" stop-color="#8f7f48"/></linearGradient>
<radialGradient id="${p}pet" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff4c2"/><stop offset=".55" stop-color="#f5c73e"/><stop offset="1" stop-color="#cf931a"/></radialGradient>
<radialGradient id="${p}bud" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd3df"/><stop offset=".6" stop-color="#e57e9d"/><stop offset="1" stop-color="#b24d6d"/></radialGradient>
<radialGradient id="${p}peh" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe6dc"/><stop offset=".55" stop-color="#ff8a6b"/><stop offset="1" stop-color="#c9452e"/></radialGradient>
<radialGradient id="${p}pex" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f1e6ff"/><stop offset=".55" stop-color="#a77bf0"/><stop offset="1" stop-color="#5b34b8"/></radialGradient>
<radialGradient id="${p}pmu" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6fffa"/><stop offset=".55" stop-color="#5fd3c4"/><stop offset="1" stop-color="#1f8f86"/></radialGradient>
<radialGradient id="${p}ptu" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd0c4"/><stop offset=".55" stop-color="#e8413a"/><stop offset="1" stop-color="#9e1f24"/></radialGradient>
<radialGradient id="${p}pmr" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#ff9a8a"/><stop offset=".6" stop-color="#d63a2c"/><stop offset="1" stop-color="#8a1c14"/></radialGradient>
<radialGradient id="${p}pbl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ffc6d8"/><stop offset="1" stop-color="#e88aa8"/></radialGradient>
<radialGradient id="${p}plv" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e8dcff"/><stop offset=".6" stop-color="#9a7fd6"/><stop offset="1" stop-color="#5e479e"/></radialGradient>
<linearGradient id="${p}cac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fcf7a"/><stop offset=".55" stop-color="#4f9a4a"/><stop offset="1" stop-color="#2f6b3a"/></linearGradient>
<linearGradient id="${p}bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a42"/><stop offset="1" stop-color="#5a3a22"/></linearGradient>
<linearGradient id="${p}sage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8cfa4"/><stop offset="1" stop-color="#6f8f5a"/></linearGradient>
<filter id="${p}fdry"><feColorMatrix type="matrix" values=".5 .42 .14 0 .06  .42 .4 .12 0 .04  .3 .3 .1 0 0  0 0 0 1 0"/></filter>
<filter id="${p}fdead"><feColorMatrix type="matrix" values=".34 .3 .1 0 .06  .3 .28 .1 0 .04  .22 .2 .08 0 .02  0 0 0 1 0"/></filter>
<radialGradient id="${p}ctr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f6a466"/><stop offset="1" stop-color="#a8460f"/></radialGradient>
<radialGradient id="${p}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="${p}gl" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff6dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient></defs>`;
  const BED = (p) => `<ellipse cx="42" cy="58" rx="40" ry="9" fill="url(#${p}sh)"/><path d="M4 26 L40 44 L40 59 L4 41z" fill="url(#${p}wl)"/><path d="M40 44 L76 26 L76 41 L40 59z" fill="url(#${p}wr)"/>
<path d="M6 31 L38 47 M6 36 L38 52" stroke="#8f5e30" stroke-width=".6" stroke-opacity=".6" fill="none"/><path d="M42 47 L74 31 M42 52 L74 36" stroke="#4e2e12" stroke-width=".6" stroke-opacity=".55" fill="none"/>
<path d="M40 7 L77 26 L40 45 L3 26z" fill="url(#${p}rim)"/><path d="M40 12.5 L68 26.5 L40 40.5 L12 26.5z" fill="url(#${p}soil)"/><path d="M40 12.5 L68 26.5 L65 28 L40 15.5 L15 28 L12 26.5z" fill="#1e120a" opacity=".55"/>
<g fill="#8a6142" opacity=".8"><circle cx="27" cy="29" r=".9"/><circle cx="51" cy="31" r=".8"/><circle cx="45" cy="36" r="1"/><circle cx="56" cy="25" r=".9"/></g>`;
  /* Seam for the model pipeline: roster kind 'plant' entries will set window.LB_PLANTS[id] = "<base64 glb>";
     swap this for a glb-backed renderer then; same (stage, look) in, markup out.
     stage: seed|sprout|leafy|bud|bloom|wilt|dead.
     look: { kind: species id (SPECIES), rarity: common|heirloom|exotic, mutated, hybrid: neighbour species id, base: stage under wilt/dead }.
     Each species has its own shape per stage; the look only recolours its "accent" (petals, cap, blossoms, tips):
     common = the species' own colour, heirloom = coral, exotic = violet with sparkles, mutated = every other accent teal,
     hybrid = every other accent in the neighbour species' colour. Thirsty and withered reuse the species' own shape, drooped and dried. */
  const PET = { heirloom: 'peh', exotic: 'pex' };
  const SP_ACC = { daisy: 'pet', tulip: 'ptu', sunflower: 'pet', mushroom: 'pmr', cactus: 'bud', fern: 'pet', bonsai: 'pbl', lavender: 'plv' };
  const sh = (rx) => `<ellipse cx="${40 + rx * 0.25}" cy="29" rx="${rx}" ry="${Math.max(2.6, rx * 0.32)}" fill="#1e120a" opacity=".45"/>`;
  const stem = (y2, w = 2.2, bend = -1) => `<path d="M40 28 Q${40 + bend} ${(28 + y2) / 2} 40 ${y2}" stroke="#4a7d3a" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
  const leafL = (y, s, f) => `<path d="M40 ${y} q${-12 * s} ${-7 * s} ${-16 * s} ${2 * s} q${7 * s} ${4 * s} ${16 * s} ${-2 * s}z" fill="${f}"/>`;
  const leafR = (y, s, f) => `<path d="M40 ${y} q${12 * s} ${-8 * s} ${17 * s} 0 q${-7 * s} ${5 * s} ${-17 * s} 0z" fill="${f}"/>`;
  const ring = (cx, cy, n, r, pr, A, rot = 0) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + rot; return `<ellipse cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" rx="${pr}" ry="${(pr * 0.55).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)})" fill="${A(i)}"/>`; }).join('');
  const DRAW = {
    daisy: (st, A, L1, L2) => ({
      sprout: sh(8) + stem(15, 2, -0.5) + `<path d="M40 17 q-8 -6 -11 1 q5 3 11 -1z" fill="${L1}"/><path d="M40 15 q8 -7 12 -1 q-6 4 -12 1z" fill="${L2}"/>`,
      leafy: sh(11) + stem(2) + leafL(22, 1, L1) + leafR(17, 1, L2) + leafL(10, 0.85, L1) + leafR(5, 0.75, L2),
      bud: sh(11) + stem(-3) + leafL(22, 1, L1) + leafR(14, 1, L2) + `<ellipse cx="40" cy="-8" rx="5" ry="7.5" fill="${A(0)}"/><path d="M36 -3 q4 -4 8 0" stroke="#4a7d3a" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
      bloom: sh(12) + stem(-4, 2.4) + leafL(21, 1.05, L1) + leafR(12, 1.05, L2) + [[40, -16], [47.2, -11], [44.5, -3], [35.5, -3], [32.8, -11]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5.2" fill="${A(i)}"/>`).join('') + `<circle cx="40" cy="-9" r="4.2" fill="url(#P-ctr)"/>`,
    })[st],
    tulip: (st, A, L1, L2) => ({
      sprout: sh(8) + `<path d="M40 28 q-8 -6 -3 -15 q4 7 3 15z" fill="${L1}"/><path d="M40 28 q7 -5 4 -12 q-5 5 -4 12z" fill="${L2}"/>`,
      leafy: sh(11) + `<path d="M40 28 q-14 -10 -6 -26 q6 12 6 26z" fill="${L1}"/><path d="M40 28 q12 -8 8 -22 q-8 10 -8 22z" fill="${L2}"/>`,
      bud: sh(11) + stem(-2, 2.2, 0) + `<path d="M40 28 q-14 -10 -6 -24 q6 12 6 24z" fill="${L1}"/><path d="M40 28 q12 -8 8 -20 q-8 10 -8 20z" fill="${L2}"/><path d="M36 -4 q-1 -10 4 -13 q5 3 4 13 q-4 2 -8 0z" fill="${A(0)}"/>`,
      bloom: sh(12) + stem(-4, 2.4, 0) + `<path d="M40 28 q-15 -10 -7 -25 q7 12 7 25z" fill="${L1}"/><path d="M40 28 q13 -8 9 -21 q-9 10 -9 21z" fill="${L2}"/><path d="M31 -18 q0 14 9 14 q9 0 9 -14 q-3 4 -5 0 q-2 -5 -4 -5 q-2 0 -4 5 q-2 4 -5 0z" fill="${A(0)}"/><path d="M36 -19 q4 -4 8 0 q-1 9 -4 11 q-3 -2 -4 -11z" fill="${A(1)}" opacity=".9"/>`,
    })[st],
    sunflower: (st, A, L1, L2) => ({
      sprout: sh(8) + stem(16, 2.2, 0) + `<ellipse cx="35.5" cy="16" rx="5" ry="2.6" fill="${L1}"/><ellipse cx="44.5" cy="16" rx="5" ry="2.6" fill="${L2}"/>`,
      leafy: sh(11) + stem(-2, 2.8, 0) + leafL(20, 1.15, L1) + leafR(12, 1.1, L2) + leafL(3, 0.9, L1),
      bud: sh(12) + stem(-10, 3, 0) + leafL(20, 1.2, L1) + leafR(10, 1.15, L2) + leafL(0, 0.95, L1) + ring(40, -15, 10, 5.2, 2.4, A) + `<circle cx="40" cy="-15" r="5.2" fill="url(#P-l2)"/>`,
      bloom: sh(13) + stem(-8, 3.2, 0) + leafL(20, 1.2, L1) + leafR(10, 1.15, L2) + leafL(1, 1, L1) + ring(40, -16, 14, 8.4, 4, A) + `<circle cx="40" cy="-16" r="6.4" fill="#5a3416"/><g fill="#8a5a2a">${[[-2, -2], [2, -2], [0, 1], [-3, 2], [3, 2], [0, -4]].map(([x, y]) => `<circle cx="${40 + x}" cy="${-16 + y}" r=".8"/>`).join('')}</g>`,
    })[st],
    mushroom: (st, A) => {
      const cap = (cx, cy, rx, ry, f, dots) => `<path d="M${cx - rx} ${cy} q0 ${-ry * 1.4} ${rx} ${-ry * 1.4} q${rx} 0 ${rx} ${ry * 1.4}z" fill="${f}"/>${dots ? dots.map(([x, y, r]) => `<ellipse cx="${cx + x * rx}" cy="${cy - y * ry}" rx="${r}" ry="${r * 0.7}" fill="#fff8ec" opacity=".92"/>`).join('') : ''}`;
      const foot = (cx, top, w) => `<path d="M${cx - w / 2} 28 q-1 ${(top - 28) / 2} ${w * 0.15} ${top - 28} h${w * 0.7} q1.2 ${(28 - top) / 2} ${w * 0.15} ${28 - top}z" fill="#f2e6cf"/>`;
      return ({
        sprout: sh(6) + foot(40, 22, 2.4) + cap(40, 22.5, 2.6, 2, A(0)),
        leafy: sh(9) + foot(40, 16, 5) + cap(40, 17, 7, 4.5, A(0), [[-0.4, 0.8, 1], [0.35, 0.95, 0.8]]),
        bud: sh(12) + foot(39, 8, 6) + cap(39, 9, 10, 6.5, A(0), [[-0.5, 0.7, 1.4], [0.2, 1.1, 1.1], [0.55, 0.6, 0.9]]) + foot(50, 22, 3) + cap(50, 22.5, 4, 3, A(1)),
        bloom: sh(15) + foot(40, -2, 7) + cap(40, -1, 15, 9, A(0), [[-0.55, 0.6, 1.8], [-0.1, 1.15, 1.5], [0.4, 0.75, 1.6], [0.75, 0.35, 1], [-0.85, 0.25, 0.9]]) + foot(26, 20, 3.5) + cap(26, 20.5, 5, 3.5, A(1), [[0, 1, 0.8]]) + foot(54, 18, 4) + cap(54, 18.5, 6, 4, A(2), [[-0.3, 0.9, 0.9]]),
      })[st];
    },
    cactus: (st, A) => {
      const col = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="url(#P-cac)"/><path d="M${x + w / 2} ${y + 2} v${h - 3}" stroke="#2f6b3a" stroke-width=".7" opacity=".7"/>`;
      const sp = (pts) => `<g fill="#f6f1d8">${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".55"/>`).join('')}</g>`;
      return ({
        sprout: sh(6) + `<ellipse cx="40" cy="24" rx="4.5" ry="5" fill="url(#P-cac)"/>` + sp([[38, 22], [42, 23], [40, 20]]),
        leafy: sh(9) + col(35, 4, 10, 25) + sp([[37, 9], [43, 12], [37, 17], [43, 21], [38, 25]]),
        bud: sh(12) + col(35, -4, 10, 33) + `<path d="M35 14 h-5 q-2 0 -2 -2 v-8" stroke="url(#P-cac)" stroke-width="5" stroke-linecap="round" fill="none"/>` + sp([[37, 2], [43, 6], [37, 12], [43, 18], [29, 4]]) + `<ellipse cx="40" cy="-6" rx="2.6" ry="3.4" fill="${A(0)}"/>`,
        bloom: sh(14) + col(35, -8, 10, 37) + `<path d="M35 12 h-5 q-2 0 -2 -2 v-10" stroke="url(#P-cac)" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M45 6 h5 q2 0 2 -2 v-7" stroke="url(#P-cac)" stroke-width="5" stroke-linecap="round" fill="none"/>` + sp([[37, -2], [43, 2], [37, 8], [43, 14], [29, 2], [51, -2]]) + ring(40, -11, 6, 3.4, 2.8, A, -Math.PI / 2) + `<circle cx="40" cy="-11" r="1.8" fill="#f5c73e"/>` + `<circle cx="28" cy="-2" r="1.8" fill="${A(1)}"/>`,
      })[st];
    },
    fern: (st, A, L1, L2) => {
      const frond = (ang, len, f, tip) => {
        const a = (ang * Math.PI) / 180, ex = 40 + Math.sin(a) * len, ey = 28 - Math.cos(a) * len, mx = 40 + Math.sin(a) * len * 0.5 + Math.cos(a) * 3, my = 28 - Math.cos(a) * len * 0.5 + Math.sin(a) * 3;
        let leaves = '';
        for (let k = 1; k < 6; k++) { const t = k / 6, x = 40 + (ex - 40) * t, y = 28 + (ey - 28) * t, s = 4.5 * (1 - t * 0.7); leaves += `<ellipse cx="${(x - Math.cos(a) * s * 0.7).toFixed(1)}" cy="${(y - Math.sin(a) * s * 0.7).toFixed(1)}" rx="${s.toFixed(1)}" ry="1.4" transform="rotate(${ang - 60} ${(x - Math.cos(a) * s * 0.7).toFixed(1)} ${(y - Math.sin(a) * s * 0.7).toFixed(1)})" fill="${f}"/><ellipse cx="${(x + Math.cos(a) * s * 0.7).toFixed(1)}" cy="${(y + Math.sin(a) * s * 0.7).toFixed(1)}" rx="${s.toFixed(1)}" ry="1.4" transform="rotate(${ang + 60} ${(x + Math.cos(a) * s * 0.7).toFixed(1)} ${(y + Math.sin(a) * s * 0.7).toFixed(1)})" fill="${f}"/>`; }
        return `<path d="M40 28 Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="#3f7a35" stroke-width="1.3" fill="none"/>${leaves}${tip ? `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="1.9" fill="${tip}"/>` : ''}`;
      };
      const fid = (x, y, f) => `<path d="M40 28 Q${x - 2} ${(28 + y) / 2} ${x} ${y}" stroke="#4a7d3a" stroke-width="1.6" fill="none"/><circle cx="${x + 1.6}" cy="${y}" r="2.2" fill="none" stroke="${f}" stroke-width="1.5"/>`;
      return ({
        sprout: sh(7) + fid(40, 16, '#5f9e45'),
        leafy: sh(11) + frond(-35, 20, L1) + frond(0, 24, L2) + frond(35, 20, L1),
        bud: sh(13) + frond(-55, 22, L1) + frond(-20, 28, L2) + frond(20, 28, L1) + frond(55, 22, L2) + fid(36, 6, A(0)) + fid(45, 4, A(1)),
        bloom: sh(15) + [[-65, 24], [-35, 32], [-8, 36], [18, 35], [45, 31], [70, 23]].map(([g, l], i) => frond(g, l, i % 2 ? L2 : L1, A(i))).join(''),
      })[st];
    },
    bonsai: (st, A, L1, L2) => {
      const pad = (cx, cy, rx, ry, f) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"/><ellipse cx="${cx - rx * 0.3}" cy="${cy - ry * 0.35}" rx="${rx * 0.55}" ry="${ry * 0.45}" fill="#c3ec98" opacity=".35"/>`;
      const bl = (pts) => pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${A(i)}"/>`).join('');
      const trunk = (h) => `<path d="M38 28 q-2 ${-h * 0.3} 3 ${-h * 0.5} q5 ${-h * 0.2} 0 ${-h * 0.5}" stroke="url(#P-bark)" stroke-width="${2.5 + h * 0.08}" stroke-linecap="round" fill="none"/>`;
      return ({
        sprout: sh(6) + `<path d="M40 28 q1 -6 0 -10" stroke="#7a5236" stroke-width="1.6" fill="none"/>` + pad(37, 17, 3.5, 2, L1) + pad(43, 16, 3, 1.8, L2),
        leafy: sh(10) + trunk(18) + pad(40, 9, 9, 5, L2) + pad(33, 14, 5, 3, L1),
        bud: sh(13) + trunk(30) + `<path d="M42 12 q6 -2 9 -6" stroke="url(#P-bark)" stroke-width="2" fill="none"/>` + pad(40, -3, 11, 6, L2) + pad(52, -6, 7, 4, L1) + pad(30, 8, 7, 4, L1) + bl([[38, -6], [44, -2], [53, -8], [30, 6]]),
        bloom: sh(15) + trunk(34) + `<path d="M42 10 q7 -2 11 -8 M39 16 q-6 -1 -10 -5" stroke="url(#P-bark)" stroke-width="2.2" fill="none"/>` + pad(40, -7, 13, 7, L2) + pad(55, -7, 8, 5, L1) + pad(27, 7, 8, 4.5, L1) + bl([[33, -9], [38, -12], [44, -10], [48, -5], [36, -4], [42, -3], [53, -9], [58, -6], [24, 6], [29, 4], [31, 8], [46, -13]]),
      })[st];
    },
    lavender: (st, A, L1, L2) => {
      const blade = (dx, h, f) => `<path d="M40 28 q${dx * 0.3} ${-h * 0.6} ${dx} ${-h}" stroke="${f}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
      const spike = (dx, h, n, Af) => { let s = `<path d="M40 28 q${dx * 0.4} ${-h * 0.5} ${dx} ${-h}" stroke="#6f8f5a" stroke-width="1.2" fill="none"/>`; for (let k = 0; k < n; k++) { const y = 28 - h + k * 2.6, x = 40 + dx * (1 - (k * 2.6) / h * 0.6); s += `<ellipse cx="${(x - 1.1).toFixed(1)}" cy="${y.toFixed(1)}" rx="1.5" ry="1.9" fill="${Af(k)}"/><ellipse cx="${(x + 1.1).toFixed(1)}" cy="${(y + 1.2).toFixed(1)}" rx="1.5" ry="1.9" fill="${Af(k + 1)}"/>`; } return s; };
      const tuft = (n, h) => Array.from({ length: n }, (_, i) => blade((i - (n - 1) / 2) * 3.2, h - Math.abs(i - (n - 1) / 2) * 2, i % 2 ? 'url(#P-sage)' : '#7fa86a')).join('');
      return ({
        sprout: sh(7) + tuft(4, 10),
        leafy: sh(11) + tuft(7, 18),
        bud: sh(12) + tuft(7, 16) + [[-6, 34], [0, 40], [6, 35]].map(([d, h]) => spike(d, h, 4, () => 'url(#P-l2)')).join(''),
        bloom: sh(14) + tuft(7, 16) + [[-12, 34], [-6, 42], [0, 48], [6, 43], [12, 35]].map(([d, h], j) => spike(d, h, 6, (k) => A(k + j))).join(''),
      })[st];
    },
  };
  const SP_DEF = Object.keys(DRAW);
  function renderPlant(stage, look, p) {
    const lk = look || {}, kind = DRAW[lk.kind] ? lk.kind : 'daisy', rar = PET[lk.rarity] ? lk.rarity : 'common', mut = !!lk.mutated;
    const base = rar === 'common' ? SP_ACC[kind] : PET[rar], alt = mut ? 'pmu' : lk.hybrid && SP_ACC[lk.hybrid] && SP_ACC[lk.hybrid] !== base ? SP_ACC[lk.hybrid] : lk.hybrid ? 'pmu' : null;
    const A = (i) => `url(#${p}${alt && i % 2 ? alt : base})`, L1 = `url(#${p}l1)`, L2 = `url(#${p}${mut ? 'pmu' : 'l2'})`;
    const spark = rar === 'exotic' ? `<g fill="#fff6c8"><path d="M56 -22 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1z"/><path d="M23 -14 l.7 1.8 l1.8 .7 l-1.8 .7 l-.7 1.8 l-.7 -1.8 l-1.8 -.7 l1.8 -.7z"/><circle cx="54" cy="0" r=".9"/><circle cx="26" cy="-2" r=".7"/></g>` : '';
    const art = (st) => (DRAW[kind](st, A, L1, L2) || '').replace(/url\(#P-/g, `url(#${p}`);
    if (stage === 'seed' || !stage) {
      const seedC = mut ? '#2f8f86' : rar === 'exotic' ? '#6b48b0' : rar === 'heirloom' ? '#9a4a32' : '#5e3d28';
      return `<ellipse cx="40" cy="28" rx="8" ry="3.8" fill="#3a2416"/><ellipse cx="40" cy="27" rx="7" ry="3" fill="${seedC}"/><ellipse cx="40" cy="25.5" rx="2.8" ry="2.1" fill="${kind === 'mushroom' ? '#d9cfc0' : '#e8cb96'}"/><ellipse cx="39.1" cy="24.8" rx="1" ry=".7" fill="#fff8e6"/>${rar === 'heirloom' ? '<path d="M38.4 24.4 v2.4 M40 24 v3 M41.6 24.4 v2.4" stroke="#9a4a32" stroke-width=".55"/>' : ''}${rar === 'exotic' ? '<circle cx="42.6" cy="23.6" r=".8" fill="#fff6c8"/>' : ''}`;
    }
    if (stage === 'wilt' || stage === 'dead') {
      const b = STAGES.includes(lk.base) && lk.base !== 'seed' ? lk.base : 'leafy', dead = stage === 'dead';
      return `<g filter="url(#${p}${dead ? 'fdead' : 'fdry'})" transform="translate(40 28) rotate(${dead ? 16 : 9}) scale(${dead ? '1 .78' : '1 .92'}) translate(-40 -28)"${dead ? ' opacity=".85"' : ''}>${art(b)}</g>`;
    }
    return art(stage) + (stage === 'bloom' ? spark : '');
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = ['seed', 'sprout', 'leafy', 'bud', 'bloom'];
  const visual = (pl) => (!pl.alive ? 'dead' : pl.thirsty || pl.wilted ? 'wilt' : pl.stageName);
  const LABEL = { seed: 'Seed', sprout: 'Sprout', leafy: 'Leafy', bud: 'Bud', bloom: 'Bloom', wilt: 'Thirsty', dead: 'Withered' };
  const RAR = { common: 'Common', heirloom: 'Heirloom', exotic: 'Exotic' };
  const SPN = { daisy: 'Daisy', tulip: 'Tulip', sunflower: 'Sunflower', mushroom: 'Toadstool', cactus: 'Cactus', fern: 'Fern', bonsai: 'Bonsai', lavender: 'Lavender' };
  const lookOf = (x) => ({ ...(x.seed || {}), kind: x.species, base: x.stageName });
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => (d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : '');
  function specimen(stage, look, w = 72, label = '') {
    const p = 'gp' + uid++ + '-';
    return `<svg class="gplot" viewBox="0 -26 80 92" width="${w}" height="${Math.round((w * 92) / 80)}" role="img" aria-label="${esc(label || LABEL[stage] + ' plant')}">${DEFS(p)}${BED(p)}${renderPlant(stage, look, p)}<path d="M40 7 L3 26 L40 45 L77 26z" fill="url(#${p}gl)" opacity=".5"/></svg>`;
  }
  const plotSVG = (pl, w) => { const st = visual(pl); return specimen(st, lookOf(pl), w, `${pl.name}: ${LABEL[st].toLowerCase()} ${(SPN[pl.species] || 'plant').toLowerCase()}`); };

  /* ---- preview (#labs-preview or ?preview): restyle every plot, try seed rarities, fill the shelf with samples. View-only, never saved. ---- */
  /* the local mock board (test.html) has no history, so it shows sample keepsakes by default */
  const PV = { on: false, stage: null, rarity: null, mutated: false, hybrid: false, kind: null, sample: !!G.MOCK, all: false };
  try { const u = new URL(G.LB_LABS_HREF || G.location.href); PV.on = u.hash === '#labs-preview' || u.searchParams.has('preview'); } catch (e) { /* off */ }
  function view(pl) {
    if (!PV.on || (!PV.stage && !PV.rarity && !PV.mutated && !PV.hybrid && !PV.kind)) return pl;
    const o = { ...pl };
    if (PV.kind) o.species = PV.kind;
    const nb = (k) => SPECIES[(SPECIES.indexOf(k) + 3) % SPECIES.length];
    if (PV.rarity || PV.mutated || PV.hybrid) o.seed = { rarity: PV.rarity || (pl.seed && pl.seed.rarity) || 'common', mutated: PV.mutated, hybrid: PV.hybrid ? nb(o.species) : null };
    if (PV.stage) {
      o.alive = PV.stage !== 'dead'; o.thirsty = PV.stage === 'wilt'; o.wilted = false; o.waiting = false;
      if (STAGES.includes(PV.stage)) { o.stageName = PV.stage; o.stage = STAGES.indexOf(PV.stage); o.next = STAGES[Math.min(4, o.stage + 1)]; }
    }
    return o;
  }
  function plantLab() {
    if (!PV.on) return '';
    const b = (k, v, l, on) => `<button type="button" class="chip${on ? ' on' : ''}" data-gpv="${k}:${v}" aria-pressed="${!!on}">${l}</button>`;
    const kind = PV.kind || 'daisy', nb = SPECIES[(SPECIES.indexOf(kind) + 3) % SPECIES.length];
    const sp = { kind, rarity: PV.rarity || 'common', mutated: PV.mutated, hybrid: PV.hybrid ? nb : null, base: 'bud' };
    const fig = (svg, cap) => `<figure>${svg}<figcaption>${cap}</figcaption></figure>`;
    return `<div class="plab"><p class="plab-t">Plant lab <small>preview only · nothing is saved</small></p>
      <div class="hab-pv"><span>Species</span>${b('kind', '', 'Live', !PV.kind)}${SPECIES.map((k) => b('kind', k, SPN[k], PV.kind === k)).join('')}</div>
      <div class="hab-pv"><span>Stage</span>${b('stage', '', 'Live', !PV.stage)}${[...STAGES, 'wilt', 'dead'].map((s) => b('stage', s, LABEL[s], PV.stage === s)).join('')}</div>
      <div class="hab-pv"><span>Seed</span>${b('rarity', '', 'Live', !PV.rarity)}${Object.keys(RAR).map((r) => b('rarity', r, RAR[r], PV.rarity === r)).join('')}${b('mutated', PV.mutated ? '0' : '1', 'Mutated', PV.mutated)}${b('hybrid', PV.hybrid ? '0' : '1', 'Hybrid', PV.hybrid)}</div>
      <div class="hab-pv"><span>Shelf</span>${b('sample', PV.sample ? '0' : '1', 'Sample keepsakes', PV.sample)}</div>
      <p class="plab-l">Every species${PV.stage ? '' : ' in bloom'}</p><div class="plab-strip">${SPECIES.map((k) => fig(specimen(PV.stage || 'bloom', { ...sp, kind: k, hybrid: PV.hybrid ? SPECIES[(SPECIES.indexOf(k) + 3) % SPECIES.length] : null }, 76), SPN[k])).join('')}</div>
      <p class="plab-l">${SPN[kind]}, every stage</p><div class="plab-strip">${[...STAGES, 'wilt', 'dead'].map((s) => fig(specimen(s, sp, 76), LABEL[s])).join('')}</div>
      <p class="plab-l">${SPN[kind]} blooms</p><div class="plab-strip">${Object.keys(RAR).flatMap((r) => [false, true].map((m) => fig(specimen('bloom', { kind, rarity: r, mutated: m }, 76), RAR[r] + (m ? ' mutant' : '')))).join('')}${fig(specimen('bloom', { kind, hybrid: nb }, 76), `× ${SPN[nb]}`)}</div></div>`;
  }
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gpv]'); if (!b) return;
    const [k, v] = b.dataset.gpv.split(':');
    if (k === 'stage') PV.stage = v || null; else if (k === 'rarity') PV.rarity = v || null; else if (k === 'mutated') PV.mutated = v === '1'; else if (k === 'sample') PV.sample = v === '1'; else if (k === 'all') PV.all = v === '1'; else if (k === 'hybrid') PV.hybrid = v === '1'; else if (k === 'kind') PV.kind = v || null;
    if (G.LBLabs && G.LBLabs.render) G.LBLabs.render();
  });

  /* ---- Grow: the shelf (finished plants + reef dioramas, each with a title and note), stats, logbook ---- */
  let biomeNames = null;
  function biomeOf(id) {
    if (!biomeNames) { biomeNames = []; fetch('models/biomes.json').then((r) => r.json()).then((j) => { biomeNames = j.biomes || []; if (G.LBLabs && G.LBLabs.render) G.LBLabs.render(); }).catch(() => {}); }
    const L = biomeNames.length ? biomeNames : [{ id: 0, name: 'Coral shallows', medium: 'water' }];
    return L.find((x) => x.id === id) || L[((id % L.length) + L.length) % L.length];
  }
  function dioramaSVG(biome, w = 96) {
    const p = 'gd' + uid++ + '-', land = biome.medium === 'air' || biome.medium === 'land';
    const TINT = { 0: ['#7fd3e6', '#1f6f9a'], 1: ['#6fc0b0', '#14505a'], 2: ['#a6e4ec', '#3a8fb0'], 3: ['#a8d4b4', '#3d6b5a'], 4: ['#3a4a8a', '#0d1530'], 5: ['#cfeaf7', '#8cc8a0'], 6: ['#eef7ff', '#9fc4ea'] };
    const [a, b] = TINT[biome.id] || (land ? TINT[5] : TINT[0]);
    const extra = biome.id === 1 ? '<path d="M24 61 q-4 -12 1 -24 M31 61 q4 -14 -1 -27 M58 61 q-3 -10 1 -20" stroke="#3f8f4a" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
      : biome.id === 4 ? '<circle cx="30" cy="40" r="1.4" fill="#9ff3ff"/><circle cx="50" cy="36" r="1.1" fill="#9ff3ff"/><circle cx="44" cy="46" r=".9" fill="#ffd36b"/>'
      : biome.id === 6 ? '<ellipse cx="30" cy="42" rx="7" ry="3.5" fill="#fff" opacity=".9"/><ellipse cx="50" cy="38" rx="6" ry="3" fill="#fff" opacity=".85"/>' : '';
    const life = land
      ? `<path d="M18 61 q22 -8 44 0z" fill="#6fae4f"/><circle cx="30" cy="52" r="5" fill="#4f8f3a"/><circle cx="48" cy="50" r="6.5" fill="#3f7f34"/><circle cx="27" cy="57" r="1.6" fill="#f5c73e"/><circle cx="52" cy="58" r="1.6" fill="#e57e9d"/><circle cx="40" cy="58" r="1.4" fill="#fff"/>`
      : `<path d="M18 61 q22 -6 44 0z" fill="#e9d3a6"/><path d="M28 61 q-3 -9 1 -14 M28 55 q4 -4 6 -9" stroke="#ff7f6b" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="47" cy="57" r="4.5" fill="#c9a0e8"/><path d="M53 61 q0 -8 3 -12 M56 61 q1 -6 4 -9" stroke="#5fb86b" stroke-width="1.6" fill="none"/><path d="M36 44 q3 -2 6 0 q-3 2 -6 0z M42 44 l2 -1.5 v3z" fill="#ff9a3c"/><circle cx="33" cy="37" r="1" fill="#fff" opacity=".7"/><circle cx="36" cy="33" r=".7" fill="#fff" opacity=".7"/>`;
    const lifeX = life + extra;
    return `<svg class="gdio" viewBox="0 0 80 80" width="${w}" height="${w}" role="img" aria-label="${esc(biome.name)} diorama"><defs><linearGradient id="${p}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="${p}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8723f"/><stop offset="1" stop-color="#6a401c"/></linearGradient></defs>
      <ellipse cx="40" cy="73" rx="31" ry="4" fill="#000" opacity=".18"/><path d="M14 61 A26 26 0 0 1 66 61z" fill="url(#${p}w)" opacity=".9"/>${lifeX}<path d="M14 61 A26 26 0 0 1 66 61" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><path d="M22 47 A19 19 0 0 1 33 37" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/><rect x="10" y="60" width="60" height="11" rx="3" fill="url(#${p}b)"/><rect x="10" y="60" width="60" height="2.5" rx="1.2" fill="#f0c48e" opacity=".7"/></svg>`;
  }
  function samples(game) {
    const out = [];
    game.plots.forEach((pl, i) => {
      out.push({ id: `sample-${pl.key}-a`, kind: 'plant', key: pl.key, name: pl.name, species: pl.species, season: 1, from: '2026-10-26', to: '2026-11-22', stageName: 'bloom', bloomed: true, died: false, score: 5 + i, sessions: 4 * pl.target, seed: { rarity: Object.keys(RAR)[i % 3], mutated: i === 2, hybrid: i === 4 && game.plots[3] ? game.plots[3].species : null }, earned: { rarity: i % 2 ? 'exotic' : 'heirloom', mutated: false, hybrid: i === 1 && game.plots[0] ? game.plots[0].species : null } });
      if (i % 2) out.push({ id: `sample-${pl.key}-b`, kind: 'plant', key: pl.key, name: pl.name, species: pl.species, season: 0, from: '2026-09-28', to: '2026-10-25', stageName: 'leafy', bloomed: false, died: true, score: 1, sessions: 3, seed: { rarity: 'common' }, earned: { rarity: 'common', mutated: false } });
    });
    [[0, 41], [1, 33], [4, 52], [5, 29], [6, 38]].forEach(([b, d], i) => out.push({ id: `sample-reef-${i}`, kind: 'reef', biome: b, days: d }));
    return out;
  }
  function keepsakes(game) {
    const real = [...game.reef.dioramas.map((d, i) => ({ id: `reef-${i}`, kind: 'reef', biome: d.biome, days: d.days })).reverse(), ...game.history.filter((h) => h.bloomed || h.died || h.stage > 0).slice().reverse()];
    return PV.sample && (PV.on || G.MOCK) ? [...samples(game), ...real] : real;
  }
  function keepTitle(k) {
    if (k.kind === 'reef') return `${biomeOf(k.biome).name} diorama`;
    const sp = (SPN[k.species] || 'plant').toLowerCase(), hy = k.seed && k.seed.hybrid ? ` × ${SPN[k.seed.hybrid].toLowerCase()}` : '';
    return `${k.name} ${sp}${hy}, ${k.bloomed ? 'in bloom' : k.died ? 'withered' : LABEL[k.stageName].toLowerCase()}`;
  }
  function keepCard(k, notes, editing) {
    const n = notes[k.id] || {}, title = n.title || keepTitle(k);
    const art = k.kind === 'reef' ? dioramaSVG(biomeOf(k.biome)) : specimen(k.died ? 'dead' : k.stageName, lookOf(k), 84, title);
    const sub = k.kind === 'reef' ? `Biome finished in ${k.days} days`
      : `Season ${k.season + 1} · ${fmt(k.from)}–${fmt(k.to)} · ${k.sessions} session${k.sessions === 1 ? '' : 's'}`;
    const tag = k.kind === 'reef' ? '<span class="chip gok">Diorama</span>'
      : k.bloomed ? `<span class="chip gok">Bloomed</span><span class="chip r-${k.earned.rarity}">${RAR[k.earned.rarity]} seed${k.earned.mutated ? ' · mutant' : ''}</span>${k.earned.hybrid ? `<span class="chip r-hybrid">Hybrid × ${SPN[k.earned.hybrid]}</span>` : ''}`
      : k.died ? '<span class="chip gwarn">Withered</span><span class="chip">Next seed starts sprouted</span>' : `<span class="chip">Reached ${LABEL[k.stageName].toLowerCase()}</span>`;
    const body = editing === k.id
      ? `<form class="gal-f" data-form="keep" data-id="${esc(k.id)}" data-kind="${k.kind}"><label class="sr" for="kt-${esc(k.id)}">Title</label><input id="kt-${esc(k.id)}" name="title" maxlength="60" value="${esc(n.title || '')}" placeholder="${esc(keepTitle(k))}" autocomplete="off"><label class="sr" for="kn-${esc(k.id)}">Note</label><textarea id="kn-${esc(k.id)}" name="note" maxlength="600" placeholder="What was going on this season?">${esc(n.note || '')}</textarea><span class="row-btns"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-act="keep-cancel">Cancel</button></span></form>`
      : `<p class="gal-t">${esc(title)}</p><p class="gal-s">${esc(sub)}</p><p class="gal-c">${tag}</p>${n.note ? `<p class="gal-n">${esc(n.note)}</p>` : ''}<button class="link gal-e" data-act="keep-edit" data-id="${esc(k.id)}">${n.title || n.note ? 'Edit' : 'Name it'}</button>`;
    return `<li class="gal-i${k.died ? ' gone' : ''}"><div class="gal-a">${art}</div><div class="gal-b">${body}</div></li>`;
  }
  const EVL = { phase: 'Habitat reached a new phase', biome: 'Habitat biome finished: a diorama joined the shelf', bleach: 'Habitat bleached: too few full days', recover: 'Habitat recovered' };
  /* Grow → Garden pieces; app.js lays them out next to its own habit and ring records */
  function shelfHTML(game, notes = {}, editing = null) {
    if (!game) return '';
    const ks = keepsakes(game), sea = game.season;
    const head = sea.opens ? `Seeds plant ${fmt(sea.opens)}` : `Season ${sea.index + 1} · week ${sea.week} of ${sea.of} · ends ${fmt(sea.ends)}`;
    const cap = PV.all || ks.length <= 6 ? ks.length : 6;
    const shelf = ks.length ? `<ul class="gal">${ks.slice(0, cap).map((k) => keepCard(k, notes, editing)).join('')}</ul>${ks.length > 6 ? `<button class="link gal-more" data-gpv="all:${PV.all ? '0' : '1'}">${PV.all ? 'Show fewer' : `Show all ${ks.length}`}</button>` : ''}`
      : `<div class="card pad"><p class="empty" style="padding:0 4px">Nothing on the shelf yet. Each season runs ${sea.of} weeks; when season ${sea.index + 1} ends ${fmt(sea.ends)}, every plant lands here, bloomed or withered, for you to name and caption. Finished habitat biomes join as dioramas.</p></div>`;
    return `${PV.on ? `<div class="card pad" style="margin-top:14px">${plantLab()}</div>` : ''}<section class="sec labs-shelf"><div class="sec-h"><h3 class="sec-t">Shelf <span class="ct num">${ks.length}</span></h3><span class="gseason">${esc(head)}</span></div>${shelf}</section>`;
  }
  /* stat tiles for the band: counted from what the shelf shows, so samples and stats agree */
  function gardenTiles(game) {
    if (!game) return [];
    const ks = keepsakes(game), pl = ks.filter((k) => k.kind === 'plant'), rare = pl.filter((k) => k.bloomed && k.earned.rarity !== 'common');
    return [
      { n: pl.filter((k) => k.bloomed).length, l: 'Blooms', s: `${pl.filter((k) => k.died).length} withered` },
      { n: rare.length, l: 'Rare seeds', s: `${rare.filter((k) => k.earned.rarity === 'heirloom').length} heirloom · ${rare.filter((k) => k.earned.rarity === 'exotic').length} exotic` },
      { n: ks.filter((k) => k.kind === 'reef').length, l: 'Dioramas', s: `habitat phase ${game.reef.phase + 1} of ${game.reef.phases}` },
      game.season.opens ? { n: '–', l: 'Season', s: `opens ${fmt(game.season.opens)}` } : { n: game.season.index + 1, l: 'Season', s: `week ${game.season.week} of ${game.season.of}` },
    ];
  }
  function logbookItems(game) {
    const log = [];
    game.history.forEach((h) => log.push({ d: h.to, t: h.bloomed ? `${h.name} bloomed · ${RAR[h.earned.rarity].toLowerCase()} seed${h.earned.mutated ? ', mutant' : ''}` : h.died ? `${h.name} withered` : `${h.name} ended at ${LABEL[h.stageName].toLowerCase()}`, c: h.bloomed ? 'good' : h.died ? 'bad' : '' }));
    game.events.forEach((e) => e.ev.forEach((x) => log.push({ d: e.date, t: EVL[x] || x, c: x === 'bleach' ? 'bad' : x === 'phase' || x === 'biome' ? 'good' : '' })));
    if (game.season.opens) log.push({ d: game.season.opens, t: 'Garden opens: seeds go in', c: '' });
    if (game.start) log.push({ d: game.start, t: 'Labs started: everything at zero', c: '' });
    return log.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  }
  const logbookHTML = (items) => `<ol class="lbk">${items.map((x) => `<li class="${x.c}"><span class="num">${fmt(x.d)}</span><span>${esc(x.t)}</span></li>`).join('')}</ol>`;
  Object.assign(API, { SPN, renderPlant, specimen, plotSVG, view, visual, plantLab, shelfHTML, gardenTiles, logbookItems, logbookHTML, LABEL, preview: PV, fmt });
  G.LBGarden = API;
})(typeof window !== 'undefined' ? window : globalThis);
