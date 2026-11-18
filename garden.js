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
    const history = [];
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
          history.push({ id: `plant-${h.key}-s${seasons}`, kind: 'plant', key: h.key, name: h.name, season: seasons, from: ds(s0), to: ds(s0 + sw * 7 - 1),
            stage: p.stage, stageName: LBG.RULES.garden.stages[p.stage], bloomed: r.bloomed, died: r.died, score: r.score, sessions: n, seed: p.seed, earned: r.seed });
          p = LBG.newPlant(r.seed, r.compost); seasons++;
        }
      }
      const week = counts[wk] || 0, need = Math.max(1, h.floor) - week;
      return { key: h.key, name: h.name, stage: p.stage, stageName: LBG.RULES.garden.stages[p.stage], alive: p.alive, wilted: !!p.wilted,
        thirsty: !waiting && p.alive && p.stage > 0 && need > 0 && daysLeft <= need + 2, week, floor: h.floor, target: h.target, seed: p.seed, seasons, plant: p,
        /* this week's floor met: the plant grows a stage when the week closes */
        grows: !waiting && p.alive && need <= 0, next: LBG.RULES.garden.stages[Math.min(4, p.stage + 1)], need: Math.max(0, need), waiting };
    });
    history.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
    const gardenStats = { seasons: Math.floor(weeksDone / sw), blooms: history.filter((x) => x.bloomed).length, withered: history.filter((x) => x.died).length,
      heirloom: history.filter((x) => x.earned.rarity === 'heirloom').length, exotic: history.filter((x) => x.earned.rarity === 'exotic').length,
      mutated: history.filter((x) => x.earned.mutated).length, sessions: gSessions.length, weeks: weeksDone };
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

  const API = { deriveGame, _dn: dn, _ds: ds };
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
<radialGradient id="${p}ctr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f6a466"/><stop offset="1" stop-color="#a8460f"/></radialGradient>
<radialGradient id="${p}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="${p}gl" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff6dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient></defs>`;
  const BED = (p) => `<ellipse cx="42" cy="58" rx="40" ry="9" fill="url(#${p}sh)"/><path d="M4 26 L40 44 L40 59 L4 41z" fill="url(#${p}wl)"/><path d="M40 44 L76 26 L76 41 L40 59z" fill="url(#${p}wr)"/>
<path d="M6 31 L38 47 M6 36 L38 52" stroke="#8f5e30" stroke-width=".6" stroke-opacity=".6" fill="none"/><path d="M42 47 L74 31 M42 52 L74 36" stroke="#4e2e12" stroke-width=".6" stroke-opacity=".55" fill="none"/>
<path d="M40 7 L77 26 L40 45 L3 26z" fill="url(#${p}rim)"/><path d="M40 12.5 L68 26.5 L40 40.5 L12 26.5z" fill="url(#${p}soil)"/><path d="M40 12.5 L68 26.5 L65 28 L40 15.5 L15 28 L12 26.5z" fill="#1e120a" opacity=".55"/>
<g fill="#8a6142" opacity=".8"><circle cx="27" cy="29" r=".9"/><circle cx="51" cy="31" r=".8"/><circle cx="45" cy="36" r="1"/><circle cx="56" cy="25" r=".9"/></g>`;
  /* Seam for the model pipeline: roster kind 'plant' entries will set window.LB_PLANTS[id] = "<base64 glb>";
     swap this for a glb-backed renderer then; same (stage, species) in, markup out.
     stage: seed|sprout|leafy|bud|bloom|wilt|dead. species: { rarity: common|heirloom|exotic, mutated } tints the seed,
     bud and petals: heirloom = coral double bloom, exotic = violet with sparkles, mutated = every other petal teal. */
  const PET = { common: 'pet', heirloom: 'peh', exotic: 'pex' };
  function renderPlant(stage, species, p) {
    const sp = species || {}, rar = PET[sp.rarity] ? sp.rarity : 'common', mut = !!sp.mutated;
    const pf = (i) => `url(#${p}${mut && i % 2 ? 'pmu' : PET[rar]})`, bud = `url(#${p}${rar === 'common' ? 'bud' : PET[rar]})`;
    const petals = [[40, -16], [47.2, -11], [44.5, -3], [35.5, -3], [32.8, -11]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5.2" fill="${pf(i)}"/>`).join('');
    const inner = rar === 'heirloom' ? [[40, -13.2], [43.2, -10.6], [42, -6.8], [38, -6.8], [36.8, -10.6]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="url(#${p}${mut && !(i % 2) ? 'pmu' : 'pet'})"/>`).join('') : '';
    const spark = rar === 'exotic' ? `<g fill="#fff6c8"><path d="M54 -24 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1z"/><path d="M25 -19 l.7 1.8 l1.8 .7 l-1.8 .7 l-.7 1.8 l-.7 -1.8 l-1.8 -.7 l1.8 -.7z"/><circle cx="52" cy="-3" r=".9"/><circle cx="28" cy="-5" r=".7"/></g>` : '';
    const seedC = mut ? ['#1f5f5a', '#2f8f86'] : rar === 'exotic' ? ['#3a2460', '#6b48b0'] : rar === 'heirloom' ? ['#5a2a1e', '#9a4a32'] : ['#3a2416', '#5e3d28'];
    const S = {
      seed: `<ellipse cx="40" cy="28" rx="8" ry="3.8" fill="#3a2416"/><ellipse cx="40" cy="27" rx="7" ry="3" fill="${seedC[1]}"/><ellipse cx="40" cy="25.5" rx="2.8" ry="2.1" fill="#e8cb96"/><ellipse cx="39.1" cy="24.8" rx="1" ry=".7" fill="#fff8e6"/>${rar === 'heirloom' ? '<path d="M38.4 24.4 v2.4 M40 24 v3 M41.6 24.4 v2.4" stroke="#9a4a32" stroke-width=".55"/>' : ''}${rar === 'exotic' ? '<circle cx="42.6" cy="23.6" r=".8" fill="#fff6c8"/>' : ''}`,
      sprout: `<ellipse cx="42" cy="28.5" rx="8" ry="2.8" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39.5 21 40 15" stroke="#4a7d3a" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M40 17 q-8 -6 -11 1 q5 3 11 -1z" fill="url(#${p}l1)"/><path d="M40 15 q8 -7 12 -1 q-6 4 -12 1z" fill="url(#${p}${mut ? 'pmu' : 'l2'})"/>`,
      leafy: `<ellipse cx="43" cy="29" rx="11" ry="3.5" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39 15 40 2" stroke="#4a7d3a" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M40 22 q-12 -7 -16 2 q7 4 16 -2z" fill="url(#${p}l1)"/><path d="M40 17 q12 -8 17 0 q-7 5 -17 0z" fill="url(#${p}l2)"/><path d="M40 10 q-10 -7 -14 1 q6 4 14 -1z" fill="url(#${p}l1)"/><path d="M40 5 q9 -6 13 0 q-6 4 -13 0z" fill="url(#${p}${mut ? 'pmu' : 'l2'})"/>`,
      bud: `<ellipse cx="43" cy="29" rx="11" ry="3.5" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39 12 40 -3" stroke="#4a7d3a" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M40 22 q-12 -7 -16 2 q7 4 16 -2z" fill="url(#${p}l1)"/><path d="M40 14 q12 -8 17 0 q-7 5 -17 0z" fill="url(#${p}l2)"/><ellipse cx="40" cy="-8" rx="5" ry="7.5" fill="${bud}"/><path d="M36 -3 q4 -4 8 0" stroke="#4a7d3a" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
      bloom: `<ellipse cx="44" cy="29" rx="12" ry="4" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39 12 40 -4" stroke="#4a7d3a" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M40 21 q-13 -7 -17 2 q8 4 17 -2z" fill="url(#${p}l1)"/><path d="M40 12 q13 -8 18 0 q-8 5 -18 0z" fill="url(#${p}l2)"/>${petals}${inner}<circle cx="40" cy="-9" r="${rar === 'heirloom' ? 2.6 : 4.2}" fill="url(#${p}ctr)"/><circle cx="40" cy="-9" r="16" fill="url(#${p}gl)"/>${spark}`,
      wilt: `<ellipse cx="42" cy="29" rx="9" ry="3" fill="#1e120a" opacity=".45"/><path d="M40 28 Q40 8 48 4 Q54 3 54 12" fill="none" stroke="#8f7f48" stroke-width="2.2" stroke-linecap="round"/><path d="M40 22 q-10 0 -13 8 q8 -1 13 -8z" fill="url(#${p}dry)"/><path d="M44 12 q7 2 8 10 q-6 -3 -8 -10z" fill="url(#${p}dry)"/><circle cx="54" cy="14" r="3.6" fill="#b78a7c"/>`,
      dead: `<ellipse cx="42" cy="29" rx="8" ry="2.6" fill="#1e120a" opacity=".45"/><path d="M40 28 Q41 18 46 14 Q50 12 51 17" fill="none" stroke="#7a6a50" stroke-width="2" stroke-linecap="round"/><path d="M41 22 q-7 1 -9 6 q6 -1 9 -6z" fill="#8c7a5a"/><path d="M30 31 l3 -1 M50 33 l3 -2" stroke="#7a6a50" stroke-width="1.2" stroke-linecap="round"/>`,
    };
    return S[stage] || S.seed;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGES = ['seed', 'sprout', 'leafy', 'bud', 'bloom'];
  const visual = (pl) => (!pl.alive ? 'dead' : pl.thirsty || pl.wilted ? 'wilt' : pl.stageName);
  const LABEL = { seed: 'Seed', sprout: 'Sprout', leafy: 'Leafy', bud: 'Bud', bloom: 'Bloom', wilt: 'Thirsty', dead: 'Withered' };
  const RAR = { common: 'Common', heirloom: 'Heirloom', exotic: 'Exotic' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => (d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : '');
  function specimen(stage, species, w = 72, label = '') {
    const p = 'gp' + uid++ + '-';
    return `<svg class="gplot" viewBox="0 -26 80 92" width="${w}" height="${Math.round((w * 92) / 80)}" role="img" aria-label="${esc(label || LABEL[stage] + ' plant')}">${DEFS(p)}${BED(p)}${renderPlant(stage, species, p)}<path d="M40 7 L3 26 L40 45 L77 26z" fill="url(#${p}gl)" opacity=".5"/></svg>`;
  }
  const plotSVG = (pl, w) => { const st = visual(pl); return specimen(st, pl.seed, w, `${pl.name}: ${LABEL[st].toLowerCase()} plant`); };

  /* ---- preview (#labs-preview or ?preview): restyle every plot, try seed rarities, fill the shelf with samples. View-only, never saved. ---- */
  const PV = { on: false, stage: null, rarity: null, mutated: false, sample: false };
  try { const u = new URL(G.LB_LABS_HREF || G.location.href); PV.on = u.hash === '#labs-preview' || u.searchParams.has('preview'); } catch (e) { /* off */ }
  function view(pl) {
    if (!PV.on || (!PV.stage && !PV.rarity && !PV.mutated)) return pl;
    const o = { ...pl };
    if (PV.rarity || PV.mutated) o.seed = { rarity: PV.rarity || (pl.seed && pl.seed.rarity) || 'common', mutated: PV.mutated };
    if (PV.stage) {
      o.alive = PV.stage !== 'dead'; o.thirsty = PV.stage === 'wilt'; o.wilted = false; o.waiting = false;
      if (STAGES.includes(PV.stage)) { o.stageName = PV.stage; o.stage = STAGES.indexOf(PV.stage); o.next = STAGES[Math.min(4, o.stage + 1)]; }
    }
    return o;
  }
  function plantLab() {
    if (!PV.on) return '';
    const b = (k, v, l, on) => `<button type="button" class="chip${on ? ' on' : ''}" data-gpv="${k}:${v}" aria-pressed="${!!on}">${l}</button>`;
    const sp = { rarity: PV.rarity || 'common', mutated: PV.mutated };
    const fig = (svg, cap) => `<figure>${svg}<figcaption>${cap}</figcaption></figure>`;
    return `<div class="plab"><p class="plab-t">Plant lab <small>preview only · nothing is saved</small></p>
      <div class="hab-pv"><span>Stage</span>${b('stage', '', 'Live', !PV.stage)}${[...STAGES, 'wilt', 'dead'].map((s) => b('stage', s, LABEL[s], PV.stage === s)).join('')}</div>
      <div class="hab-pv"><span>Seed</span>${b('rarity', '', 'Live', !PV.rarity)}${Object.keys(RAR).map((r) => b('rarity', r, RAR[r], PV.rarity === r)).join('')}${b('mutated', PV.mutated ? '0' : '1', 'Mutated', PV.mutated)}</div>
      <div class="hab-pv"><span>Shelf</span>${b('sample', PV.sample ? '0' : '1', 'Sample keepsakes', PV.sample)}</div>
      <div class="plab-strip" aria-label="Every stage">${[...STAGES, 'wilt', 'dead'].map((s) => fig(specimen(s, sp, 76), LABEL[s])).join('')}</div>
      <div class="plab-strip" aria-label="Every bloom">${Object.keys(RAR).flatMap((r) => [false, true].map((m) => fig(specimen('bloom', { rarity: r, mutated: m }, 76), RAR[r] + (m ? ' mutant' : '')))).join('')}</div></div>`;
  }
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gpv]'); if (!b) return;
    const [k, v] = b.dataset.gpv.split(':');
    if (k === 'stage') PV.stage = v || null; else if (k === 'rarity') PV.rarity = v || null; else if (k === 'mutated') PV.mutated = v === '1'; else if (k === 'sample') PV.sample = v === '1';
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
    const [a, b] = land ? ['#cfeaf7', '#8cc8a0'] : ['#7fd3e6', '#1f6f9a'];
    const life = land
      ? `<path d="M18 61 q22 -8 44 0z" fill="#6fae4f"/><circle cx="30" cy="52" r="5" fill="#4f8f3a"/><circle cx="48" cy="50" r="6.5" fill="#3f7f34"/><circle cx="27" cy="57" r="1.6" fill="#f5c73e"/><circle cx="52" cy="58" r="1.6" fill="#e57e9d"/><circle cx="40" cy="58" r="1.4" fill="#fff"/>`
      : `<path d="M18 61 q22 -6 44 0z" fill="#e9d3a6"/><path d="M28 61 q-3 -9 1 -14 M28 55 q4 -4 6 -9" stroke="#ff7f6b" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="47" cy="57" r="4.5" fill="#c9a0e8"/><path d="M53 61 q0 -8 3 -12 M56 61 q1 -6 4 -9" stroke="#5fb86b" stroke-width="1.6" fill="none"/><path d="M36 44 q3 -2 6 0 q-3 2 -6 0z M42 44 l2 -1.5 v3z" fill="#ff9a3c"/><circle cx="33" cy="37" r="1" fill="#fff" opacity=".7"/><circle cx="36" cy="33" r=".7" fill="#fff" opacity=".7"/>`;
    return `<svg class="gdio" viewBox="0 0 80 80" width="${w}" height="${w}" role="img" aria-label="${esc(biome.name)} diorama"><defs><linearGradient id="${p}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="${p}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8723f"/><stop offset="1" stop-color="#6a401c"/></linearGradient></defs>
      <ellipse cx="40" cy="73" rx="31" ry="4" fill="#000" opacity=".18"/><path d="M14 61 A26 26 0 0 1 66 61z" fill="url(#${p}w)" opacity=".9"/>${life}<path d="M14 61 A26 26 0 0 1 66 61" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><path d="M22 47 A19 19 0 0 1 33 37" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/><rect x="10" y="60" width="60" height="11" rx="3" fill="url(#${p}b)"/><rect x="10" y="60" width="60" height="2.5" rx="1.2" fill="#f0c48e" opacity=".7"/></svg>`;
  }
  function samples(game) {
    const out = [];
    game.plots.forEach((pl, i) => {
      out.push({ id: `sample-${pl.key}-a`, kind: 'plant', key: pl.key, name: pl.name, season: 1, from: '2026-10-26', to: '2026-11-22', stageName: 'bloom', bloomed: true, died: false, score: 5 + i, sessions: 4 * pl.target, seed: { rarity: Object.keys(RAR)[i % 3], mutated: i === 2 }, earned: { rarity: i % 2 ? 'exotic' : 'heirloom', mutated: false } });
      if (i % 2) out.push({ id: `sample-${pl.key}-b`, kind: 'plant', key: pl.key, name: pl.name, season: 0, from: '2026-09-28', to: '2026-10-25', stageName: 'leafy', bloomed: false, died: true, score: 1, sessions: 3, seed: { rarity: 'common' }, earned: { rarity: 'common', mutated: false } });
    });
    out.push({ id: 'sample-reef-0', kind: 'reef', biome: 0, days: 41 }, { id: 'sample-reef-1', kind: 'reef', biome: 3, days: 36 });
    return out;
  }
  function keepsakes(game) {
    const real = [...game.reef.dioramas.map((d, i) => ({ id: `reef-${i}`, kind: 'reef', biome: d.biome, days: d.days })).reverse(), ...game.history.filter((h) => h.bloomed || h.died || h.stage > 0).slice().reverse()];
    return PV.on && PV.sample ? [...samples(game), ...real] : real;
  }
  function keepTitle(k) {
    if (k.kind === 'reef') return `${biomeOf(k.biome).name} diorama`;
    return k.bloomed ? `${k.name} in bloom` : k.died ? `${k.name}, withered` : `${k.name}, ${LABEL[k.stageName].toLowerCase()}`;
  }
  function keepCard(k, notes, editing) {
    const n = notes[k.id] || {}, title = n.title || keepTitle(k);
    const art = k.kind === 'reef' ? dioramaSVG(biomeOf(k.biome)) : specimen(k.died ? 'dead' : k.stageName, k.seed, 84, title);
    const sub = k.kind === 'reef' ? `Reef biome finished in ${k.days} days`
      : `Season ${k.season + 1} · ${fmt(k.from)}–${fmt(k.to)} · ${k.sessions} session${k.sessions === 1 ? '' : 's'}`;
    const tag = k.kind === 'reef' ? '<span class="chip gok">Diorama</span>'
      : k.bloomed ? `<span class="chip gok">Bloomed</span><span class="chip r-${k.earned.rarity}">${RAR[k.earned.rarity]} seed${k.earned.mutated ? ' · mutant' : ''}</span>`
      : k.died ? '<span class="chip gwarn">Withered</span><span class="chip">Next seed starts sprouted</span>' : `<span class="chip">Reached ${LABEL[k.stageName].toLowerCase()}</span>`;
    const body = editing === k.id
      ? `<form class="gal-f" data-form="keep" data-id="${esc(k.id)}" data-kind="${k.kind}"><label class="sr" for="kt-${esc(k.id)}">Title</label><input id="kt-${esc(k.id)}" name="title" maxlength="60" value="${esc(n.title || '')}" placeholder="${esc(keepTitle(k))}" autocomplete="off"><label class="sr" for="kn-${esc(k.id)}">Note</label><textarea id="kn-${esc(k.id)}" name="note" maxlength="600" placeholder="What was going on this season?">${esc(n.note || '')}</textarea><span class="row-btns"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-act="keep-cancel">Cancel</button></span></form>`
      : `<p class="gal-t">${esc(title)}</p><p class="gal-s">${esc(sub)}</p><p class="gal-c">${tag}</p>${n.note ? `<p class="gal-n">${esc(n.note)}</p>` : ''}<button class="link gal-e" data-act="keep-edit" data-id="${esc(k.id)}">${n.title || n.note ? 'Edit' : 'Name it'}</button>`;
    return `<li class="gal-i${k.died ? ' gone' : ''}"><div class="gal-a">${art}</div><div class="gal-b">${body}</div></li>`;
  }
  const EVL = { phase: 'Reef reached a new phase', biome: 'Reef biome finished: a diorama joined the shelf', bleach: 'Reef bleached: too few full days', recover: 'Reef recovered' };
  function growHTML(game, notes = {}, editing = null) {
    if (!game) return '';
    const ks = keepsakes(game), s = game.gardenStats;
    const shelf = ks.length ? `<ul class="gal">${ks.map((k) => keepCard(k, notes, editing)).join('')}</ul>`
      : `<div class="card pad"><p class="empty" style="padding:0 4px">Nothing on the shelf yet. ${game.season.opens ? `Seeds plant ${fmt(game.season.opens)}; ` : ''}each season runs ${game.season.of} weeks, and when season ${game.season.index + 1} ends ${fmt(game.season.ends)}, every plant lands here, bloomed or withered, for you to name and caption. Finished reef biomes join as dioramas.</p></div>`;
    const t = (n, l, sub) => `<div class="gst"><b class="num">${n}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const stats = `<div class="gsts">${t(s.blooms, 'Blooms')}${t(s.withered, 'Withered')}${t(s.heirloom + s.exotic, 'Rare seeds', `${s.heirloom} heirloom · ${s.exotic} exotic`)}${t(game.reef.dioramas.length, 'Dioramas')}${t(s.sessions, 'Sessions', game.start ? `since ${fmt(game.start)}` : '')}${t(game.season.opens ? 0 : game.season.index + 1, 'Season', game.season.opens ? `opens ${fmt(game.season.opens)}` : `week ${game.season.week} of ${game.season.of}`)}</div>`;
    const log = [];
    game.history.forEach((h) => log.push({ d: h.to, t: h.bloomed ? `${h.name} bloomed · ${RAR[h.earned.rarity].toLowerCase()} seed${h.earned.mutated ? ', mutant' : ''}` : h.died ? `${h.name} withered` : `${h.name} ended at ${LABEL[h.stageName].toLowerCase()}`, c: h.bloomed ? 'good' : h.died ? 'bad' : '' }));
    game.events.forEach((e) => e.ev.forEach((x) => log.push({ d: e.date, t: EVL[x] || x, c: x === 'bleach' ? 'bad' : x === 'phase' || x === 'biome' ? 'good' : '' })));
    if (game.season.opens) log.push({ d: game.season.opens, t: 'Garden opens: seeds go in', c: '' });
    if (game.start) log.push({ d: game.start, t: 'Labs started: everything at zero', c: '' });
    log.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    const book = `<ol class="lbk">${log.slice(0, 20).map((x) => `<li class="${x.c}"><span class="num">${fmt(x.d)}</span><span>${esc(x.t)}</span></li>`).join('')}</ol>`;
    return `${PV.on ? `<div class="card pad" style="margin-top:14px">${plantLab()}</div>` : ''}<section class="sec labs-shelf"><div class="sec-h"><h3 class="sec-t">Shelf <span class="ct num">${ks.length}</span></h3><span class="gseason">Plants &amp; dioramas you finished</span></div>${shelf}</section>
      <section class="sec"><div class="sec-h"><h3 class="sec-t">Garden stats <span class="ct">Labs</span></h3></div><div class="card pad">${stats}</div></section>
      <section class="sec"><div class="sec-h"><h3 class="sec-t">Logbook</h3></div><div class="card pad">${book}</div></section>`;
  }
  Object.assign(API, { renderPlant, specimen, plotSVG, view, visual, plantLab, growHTML, LABEL, preview: PV, fmt });
  G.LBGarden = API;
})(typeof window !== 'undefined' ? window : globalThis);
