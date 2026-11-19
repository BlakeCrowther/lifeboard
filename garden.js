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

  /* lessons: creatures hide after RULES.lessons.hideAfter days with no lesson. Dormant until the first lesson is logged. */
  function lessonState(dates, today, dn, LBG) {
    const last = (dates || []).filter(Boolean).map(dn).filter((d) => d <= today).reduce((a, b) => Math.max(a, b), -Infinity);
    if (!isFinite(last)) return { daysSince: null, hide: false };
    const n = today - last; return { daysSince: n, hide: n >= ((LBG.RULES.lessons && LBG.RULES.lessons.hideAfter) || 3) };
  }
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
    /* skipped breaks (dates) cost growth on their day; cost from input or RULES */
    const skipCost = input.skipCost != null ? +input.skipCost : (LBG.RULES.breaks ? LBG.RULES.breaks.skipCost : 0), skipOn = {};
    (input.breakSkips || []).forEach((s) => { if (s && (start == null || dn(s) >= start)) { const d = dn(s); skipOn[d] = (skipOn[d] || 0) + 1; } });
    let lost = 0;
    const reef = LBG.newReef(), events = [], tides = [];
    for (let d = first; d <= today; d++) {
      const done = doneOn[d] || 0, tide = done || dueOn[d] ? LBG.dayTide(goal, done) : null;
      tides.push(tide);
      const ev = LBG.reefDay(reef, d - first, tide);
      if (skipOn[d] && skipCost > 0) { const floor = reef.phase ? reef.th[reef.phase - 1] : 0, before = reef.pts; reef.pts = Math.max(floor, reef.pts - skipOn[d] * skipCost); if (d === today) lost += before - reef.pts; }
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
      reef: { biome: reef.biome, phase: reef.phase, phases: LBG.RULES.tide.phases, pts: reef.pts, next: reef.th[reef.phase] ?? null, prev: reef.phase ? reef.th[reef.phase - 1] : 0, bleached: reef.bleached, from: ds(first + reef.startDay), dioramas: reef.dioramas.map((d) => ({ ...d, from: d.start != null ? ds(first + d.start) : null, to: d.end != null ? ds(first + d.end) : null })) },
      todayTide, weekTides, events,
      lessons: lessonState(input.lessonDates, today, dn, LBG),
      breaks: { skipsToday: skipOn[today] || 0, skipCost, lost: Math.round(lost), sad: (skipOn[today] || 0) > 0 },
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

  /* ---- Grow → Collection (dioramas + pressed plants, each with a title and note), stats, logbook ---- */
  let biomeNames = null;
  function biomeOf(id) {
    if (!biomeNames) { biomeNames = []; fetch('models/biomes.json').then((r) => r.json()).then((j) => { biomeNames = j.biomes || []; if (G.LBLabs && G.LBLabs.render) G.LBLabs.render(); }).catch(() => {}); }
    const L = biomeNames.length ? biomeNames : [{ id: 0, name: 'Coral shallows', medium: 'water' }];
    return L.find((x) => x.id === id) || L[((id % L.length) + L.length) % L.length];
  }
  /* a finished biome as a glass-dome diorama, drawn from its biomes.json look (palette + scene motif) */
  const MOTIF = {
    reef: (ac) => `<path d="M28 61 q-3 -9 1 -14 M28 55 q4 -4 6 -9" stroke="${ac}" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="47" cy="58" rx="5" ry="3.5" fill="#d9a35a"/><path d="M53 61 q0 -8 3 -12 M56 61 q1 -6 4 -9" stroke="#b07ae0" stroke-width="1.8" fill="none"/><path d="M36 44 q3 -2 6 0 q-3 2 -6 0z M42 44 l2 -1.5 v3z" fill="#ff9a3c"/>`,
    kelp: (ac) => `<path d="M24 61 q-4 -12 1 -24 q3 -6 0 -9 M31 61 q4 -14 -1 -27 M50 61 q-3 -10 2 -22 q2 -5 -1 -8 M57 61 q3 -9 0 -18" stroke="#8a7a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="40" cy="58" r="2.4" fill="#3a1f5a"/><path d="M38 44 q3 -2 6 0 q-3 2 -6 0z" fill="${ac}"/>`,
    tidepool: (ac) => `<ellipse cx="26" cy="59" rx="7" ry="4" fill="#5f5a55"/><ellipse cx="55" cy="58" rx="8" ry="5" fill="#4f4a45"/><path d="M40 52 l1.6 3.4 3.7 .4 -2.8 2.4 .9 3.6 -3.4 -1.9 -3.3 1.9 .8 -3.6 -2.8 -2.4 3.7 -.4z" fill="${ac}"/><circle cx="30" cy="55" r="2.6" fill="#3ac06a"/><circle cx="52" cy="52" r="2" fill="#8a2ad0"/>`,
    mangrove: (ac) => `<path d="M40 30 v18 M40 46 q-8 2 -12 15 M40 46 q-3 5 -5 15 M40 46 q4 4 6 15 M40 46 q9 3 13 15" stroke="#5a4632" stroke-width="2" fill="none"/><ellipse cx="40" cy="33" rx="13" ry="6" fill="#4a6a2a"/><path d="M26 61 v-3 M30 61 v-4 M50 61 v-3 M55 61 v-4" stroke="#6a5a42" stroke-width="1"/><path d="M46 52 q2 -1.5 4 0 q-2 1.5 -4 0z" fill="${ac}"/>`,
    deep: (ac) => `<path d="M30 40 a4 3 0 0 1 8 0z M48 34 a3.5 2.6 0 0 1 7 0z" fill="${ac}" opacity=".85"/><path d="M31 40 v7 M34 40 v9 M37 40 v6 M49 34 v6 M52 34 v8" stroke="${ac}" stroke-width=".6" opacity=".8"/><path d="M27 61 v-12 M29 61 v-8 M55 61 v-10" stroke="#cfe8ff" stroke-width="1.6" opacity=".7"/><circle cx="42" cy="50" r="1" fill="#ffd36b"/><circle cx="24" cy="44" r=".8" fill="${ac}"/><circle cx="58" cy="46" r=".8" fill="${ac}"/>`,
    meadow: (ac) => `<circle cx="30" cy="52" r="5" fill="#4f8f3a"/><circle cx="48" cy="50" r="6.5" fill="#3f7f34"/><path d="M27 61 v-6 M36 61 v-8 M44 61 v-5 M53 61 v-7" stroke="#4f8a3a" stroke-width="1"/><circle cx="27" cy="54" r="1.8" fill="${ac}"/><circle cx="36" cy="52" r="1.8" fill="#e57e9d"/><circle cx="44" cy="55" r="1.6" fill="#fff"/><circle cx="53" cy="53" r="1.8" fill="#b98cff"/>`,
    canopy: (ac) => `<ellipse cx="32" cy="58" rx="10" ry="3.5" fill="#fff" opacity=".9"/><ellipse cx="51" cy="57" rx="9" ry="3" fill="#fff" opacity=".85"/><path d="M16 46 q14 -5 26 -2 q12 2 22 -3" stroke="#4f6a3a" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M24 46 v4 M30 45 v5 M46 44 v4 M54 43 v5" stroke="#5f8a3f" stroke-width=".8"/><circle cx="36" cy="42" r="2" fill="${ac}"/><circle cx="50" cy="40" r="1.6" fill="#f0e0ff"/>`,
    jungle: (ac) => `<path d="M30 30 v31" stroke="#6a5d4c" stroke-width="4"/><path d="M26 61 l4 -7 4 7z" fill="#6a5d4c"/><path d="M48 36 q1 10 -1 18 M54 34 q-1 8 1 14" stroke="#3a5a22" stroke-width="1" fill="none"/><path d="M40 60 q-12 -4 -14 -12 q8 -1 14 12z M42 60 q10 -6 18 -8 q-4 9 -18 8z M38 60 q2 -12 8 -16 q2 9 -8 16z" fill="#2f7a2a"/><path d="M52 61 l-3 -5 M52 61 l0 -6 M52 61 l3 -5" stroke="${ac}" stroke-width="1.6" stroke-linecap="round"/><circle cx="36" cy="40" r=".9" fill="#fff06a"/><circle cx="44" cy="46" r=".8" fill="#fff06a"/>`,
  };
  function dioramaSVG(biome, w = 96) {
    const p = 'gd' + uid++ + '-', L = biome.look || {}, [a, b, gr, ac] = L.palette || ['#7fd3e6', '#1f6f9a', '#e9d3a6', '#ff7f6b'];
    const sc = biome.scene || ({ water: 'reef', land: 'meadow', air: 'canopy' })[biome.medium] || 'reef', life = (MOTIF[sc] || MOTIF.reef)(ac);
    return `<svg class="gdio" viewBox="0 0 80 80" width="${w}" height="${w}" role="img" aria-label="${esc(biome.name)} diorama"><defs><linearGradient id="${p}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="${p}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8723f"/><stop offset="1" stop-color="#6a401c"/></linearGradient><clipPath id="${p}c"><path d="M14 61 A26 26 0 0 1 66 61z"/></clipPath></defs>
      <ellipse cx="40" cy="73" rx="31" ry="4" fill="#000" opacity=".18"/><path d="M14 61 A26 26 0 0 1 66 61z" fill="url(#${p}w)" opacity=".92"/><g clip-path="url(#${p}c)"><path d="M14 61 q26 -9 52 0z" fill="${gr}"/>${life}</g><path d="M14 61 A26 26 0 0 1 66 61" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><path d="M22 47 A19 19 0 0 1 33 37" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/><rect x="10" y="60" width="60" height="11" rx="3" fill="url(#${p}b)"/><rect x="10" y="60" width="60" height="2.5" rx="1.2" fill="#f0c48e" opacity=".7"/></svg>`;
  }
  function keepsakes(game) {
    return [...game.reef.dioramas.map((d, i) => ({ id: `reef-${i}`, kind: 'reef', ...d })).reverse(), ...game.history.filter((h) => h.bloomed || h.died || h.stage > 0).slice().reverse()];
  }
  function keepTitle(k) {
    if (k.kind === 'reef') return `${biomeOf(k.biome).name} diorama`;
    const sp = (SPN[k.species] || 'plant').toLowerCase(), hy = k.seed && k.seed.hybrid ? ` × ${SPN[k.seed.hybrid].toLowerCase()}` : '';
    return `${k.name} ${sp}${hy}, ${k.bloomed ? 'in bloom' : k.died ? 'withered' : LABEL[k.stageName].toLowerCase()}`;
  }
  /* naming + notes, shared by plants and dioramas: pencil renames inline; the note is a one-line box whose Save shows while editing */
  const PEN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const keepF = (k, kind, inner) => `<form class="dio-f" data-form="keep" data-id="${esc(k.id)}" data-kind="${kind}">${inner}</form>`;
  function nameRow(k, n, kind, fallback, editing, cls) {
    const nm = n.title || fallback;
    return editing === k.id
      ? keepF(k, kind, `<label class="sr" for="kt-${esc(k.id)}">Name</label><input id="kt-${esc(k.id)}" name="title" maxlength="60" value="${esc(n.title || '')}" placeholder="${esc(fallback)}" autocomplete="off" enterkeyhint="done"><input type="hidden" name="note" value="${esc(n.note || '')}"><span class="dio-fb"><button class="btn sm primary" type="submit">Save</button><button class="btn sm ghost" type="button" data-act="keep-cancel">Cancel</button></span>`)
      : `<p class="${cls}">${esc(nm)}<button class="dio-pen" data-act="keep-edit" data-id="${esc(k.id)}" aria-label="Rename ${esc(nm)}">${PEN}</button></p>`;
  }
  const noteRow = (k, n, kind) => keepF(k, kind, `<input type="hidden" name="title" value="${esc(n.title || '')}"><label class="sr" for="kn-${esc(k.id)}">Note</label><textarea id="kn-${esc(k.id)}" name="note" rows="1" maxlength="600" placeholder="Add a note…" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'">${esc(n.note || '')}</textarea><button class="btn sm primary dio-save" type="submit">Save</button>`);
  function plantParts(k) {
    const sub = `Season ${k.season + 1} · ${fmt(k.from)}–${fmt(k.to)} · ${k.sessions} session${k.sessions === 1 ? '' : 's'}`;
    const tag = k.bloomed ? `<span class="chip gok">Bloomed</span><span class="chip r-${k.earned.rarity}">${RAR[k.earned.rarity]} seed${k.earned.mutated ? ' · mutant' : ''}</span>${k.earned.hybrid ? `<span class="chip r-hybrid">Hybrid × ${SPN[k.earned.hybrid]}</span>` : ''}`
      : k.died ? '<span class="chip gwarn">Withered</span><span class="chip">Next seed starts sprouted</span>' : `<span class="chip">Reached ${LABEL[k.stageName].toLowerCase()}</span>`;
    return { sub, tag };
  }
  const EVL = { phase: 'Habitat reached a new phase', biome: 'Habitat biome finished: a diorama joined the shelf', bleach: 'Habitat bleached: too few full days', recover: 'Habitat recovered' };
  /* Grow → Garden pieces; app.js lays them out next to its own habit and ring records */

  /* Grow → Collection: dioramas (tap to inspect) + pressed plants. The habitat in progress leads the dioramas. */
  let roster = null;
  function visitorsOf(biomeId) {
    if (!roster) { roster = []; fetch('models/roster.json').then((r) => r.json()).then((j) => { roster = (j.models || []).filter((m) => (m.kind || 'creature') === 'creature'); if (G.LBLabs && G.LBLabs.render) G.LBLabs.render(); }).catch(() => {}); }
    return roster.filter((m) => m.biome === biomeId).map((m) => ({ name: m.name || m.id.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()), rarity: m.rarity || 'common' }));
  }
  const span = (k) => (k.from && k.to ? `${fmt(k.from)} – ${fmt(k.to)}` : k.from ? `Since ${fmt(k.from)}` : '');
  /* tiles are read-only; tapping one opens a near-full-screen look (kmodal) with rename + note */
  function dioTile(k, notes) {
    const b = biomeOf(k.biome), n = notes[k.id] || {}, now = k.id === 'now';
    return `<li><button class="dio-t${now ? ' now' : ''}" data-act="inspect" data-id="${esc(k.id)}"><span class="dio-a">${dioramaSVG(b, 104)}</span><span class="dio-n">${esc(n.title || b.name)}</span><span class="dio-s">${now ? `Growing · phase ${k.phase + 1} of ${k.phases}` : esc(span(k))}</span></button></li>`;
  }
  function plantTile(k, notes) {
    const n = notes[k.id] || {}, title = n.title || keepTitle(k);
    return `<li><button class="dio-t pl${k.died ? ' gone' : ''}" data-act="inspect" data-id="${esc(k.id)}"><span class="dio-a">${specimen(k.died ? 'dead' : k.stageName, lookOf(k), 76, title)}</span><span class="dio-n">${esc(title)}</span><span class="dio-s">Season ${k.season + 1} · ${k.bloomed ? 'bloomed' : k.died ? 'withered' : LABEL[k.stageName].toLowerCase()}</span>${n.note ? `<span class="dio-note">${esc(n.note)}</span>` : ''}</button></li>`;
  }
  function inspectModal(k, notes, editing, anim) {
    const n = notes[k.id] || {}, reef = k.kind === 'reef', now = k.id === 'now';
    let art, kicker, head, sub, body = '';
    if (reef) {
      const b = biomeOf(k.biome), L = b.look || {}, vis = visitorsOf(k.biome);
      const stats = now ? [['Phase', `${k.phase + 1} / ${k.phases}`], ['Started', k.from ? fmt(k.from) : '—'], ['Growth', Math.round(k.pts)]] : [['Days', k.days], ['Full days', k.full ?? '—'], ['Growth', k.pts ?? '—']];
      art = dioramaSVG(b, 240); kicker = `${now ? 'In progress' : 'Diorama'} · ${b.medium || 'water'}`;
      head = now ? `<p class="dio-h">${esc(b.name)}</p>` : nameRow(k, n, 'reef', b.name, editing, 'dio-h');
      sub = `${n.title ? `${esc(b.name)} · ` : ''}${esc(span(k))}`;
      body = `<dl class="dio-st">${stats.map(([t, v]) => `<div><dt>${t}</dt><dd class="num">${esc(String(v))}</dd></div>`).join('')}</dl>${L.owns ? `<p class="dio-l"><b>Signature</b> ${esc(L.owns.join(', '))}</p>` : ''}<p class="dio-l"><b>Visitors</b> ${vis.length ? vis.map((v) => `${esc(v.name)}${v.rarity !== 'common' ? ` <span class="chip r-${v.rarity === 'legendary' ? 'exotic' : 'heirloom'}">${v.rarity}</span>` : ''}`).join(', ') : 'none yet'}</p>`;
    } else {
      const P = plantParts(k);
      art = specimen(k.died ? 'dead' : k.stageName, lookOf(k), 200, keepTitle(k)); kicker = `Pressed plant · season ${k.season + 1}`;
      head = nameRow(k, n, k.kind, keepTitle(k), editing, 'dio-h'); sub = esc(P.sub); body = `<p class="gal-c">${P.tag}</p>`;
    }
    return `<div class="kmodal${anim ? ' in' : ''}" role="dialog" aria-modal="true" aria-label="Closer look"><button class="km-bg" data-act="inspect" data-id="" aria-label="Close" tabindex="-1"></button>
      <article class="km-card"><button class="km-x" data-act="inspect" data-id="" aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <div class="km-art">${art}</div><div class="dio-info"><p class="dio-k">${esc(kicker)}</p>${head}<p class="gal-s">${sub}</p>${body}${now ? '' : noteRow(k, n, reef ? 'reef' : k.kind)}</div></article></div>`;
  }
  function collectionHTML(game, notes = {}, editing = null, inspect = null, anim = false, view = 'dioramas') {
    if (!game) return '';
    const ks = keepsakes(game), r = game.reef;
    const dios = [{ id: 'now', kind: 'reef', biome: r.biome, phase: r.phase, phases: r.phases, pts: r.pts, from: r.from }, ...ks.filter((k) => k.kind === 'reef')];
    const plants = ks.filter((k) => k.kind !== 'reef'), sea = game.season, open = [...dios, ...plants].find((k) => k.id === inspect);
    const pl = plants.length ? `<ul class="dio">${plants.map((k) => plantTile(k, notes)).join('')}</ul>`
      : `<div class="card pad"><p class="empty" style="padding:0 4px">No pressed plants yet. When season ${sea.index + 1} ends ${fmt(sea.ends)}, every habit plant lands here, bloomed or withered, for you to name and caption.</p></div>`;
    const seg = [['dioramas', 'Dioramas', dios.length - 1], ['plants', 'Plants', plants.length]];
    const tabs = `<div class="seg" role="tablist" aria-label="Collection">${seg.map(([v, l, c]) => `<button role="tab" data-act="coll" data-val="${v}" aria-selected="${view === v}">${l} <span class="num">${c}</span></button>`).join('')}</div>`;
    const sub = view === 'plants' ? esc(sea.opens ? `Seeds plant ${fmt(sea.opens)}` : `Season ${sea.index + 1} · ends ${fmt(sea.ends)}`) : 'Tap one for a closer look';
    const list = view === 'plants' ? pl : `<ul class="dio">${dios.map((k) => dioTile(k, notes)).join('')}</ul>`;
    return `<section class="sec labs-shelf"><div class="seg-row">${tabs}<span class="gseason">${sub}</span></div>${list}</section>${open ? inspectModal(open, notes, editing, anim) : ''}`;
  }
  /* stat tiles for the band: counted from the same keepsakes the Collection shows */
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
  Object.assign(API, { SPN, renderPlant, specimen, plotSVG, visual, collectionHTML, gardenTiles, logbookItems, logbookHTML, LABEL, fmt });
  G.LBGarden = API;
})(typeof window !== 'undefined' ? window : globalThis);
