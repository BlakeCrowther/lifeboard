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
    const tasks = input.tasks || [], habits = input.habits || [], sessions = (input.sessions || []).filter((s) => s.date && s.date <= input.today);
    /* ---- reef ---- */
    const doneOn = {}, dueOn = {};
    let first = today;
    tasks.forEach((t) => {
      if (t.done && t.doneDate) { const d = dn(t.doneDate); doneOn[d] = (doneOn[d] || 0) + 1; first = Math.min(first, d); }
      if (t.eff) { const d = dn(t.eff); dueOn[d] = (dueOn[d] || 0) + 1; if (d <= today) first = Math.min(first, d); }
    });
    sessions.forEach((s) => { first = Math.min(first, dn(s.date)); });
    first = Math.max(first, today - 365);
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
    const firstWeek = sessions.length ? monday(Math.min(...sessions.map((s) => dn(s.date)))) : wk;
    const weeksDone = Math.max(0, Math.round((wk - firstWeek) / 7));
    const daysLeft = 7 - (today - wk);
    const plots = habits.map((h) => {
      const counts = {};
      sessions.forEach((s) => { if (s.h === h.key) { const m = monday(dn(s.date)); counts[m] = (counts[m] || 0) + 1; } });
      const rng = mulberry(hash(h.key));
      let p = LBG.newPlant({ rarity: 'common' }, false), seasons = 0;
      for (let w = 0; w < weeksDone; w++) {
        LBG.plantWeek(p, LBG.weekResult(counts[firstWeek + w * 7] || 0, h.floor, h.target), w);
        if ((w + 1) % sw === 0) { const r = LBG.endSeason([p], rng).plots[0]; p = LBG.newPlant(r.seed, r.compost); seasons++; }
      }
      const week = counts[wk] || 0, need = Math.max(1, h.floor) - week;
      return { key: h.key, name: h.name, stage: p.stage, stageName: LBG.RULES.garden.stages[p.stage], alive: p.alive, wilted: !!p.wilted,
        thirsty: p.alive && p.stage > 0 && need > 0 && daysLeft <= need + 2, week, floor: h.floor, target: h.target, seed: p.seed, seasons, plant: p };
    });
    return {
      day: today - first, today: input.today,
      reef: { biome: reef.biome, phase: reef.phase, phases: LBG.RULES.tide.phases, pts: reef.pts, next: reef.th[reef.phase] ?? null, prev: reef.phase ? reef.th[reef.phase - 1] : 0, bleached: reef.bleached, dioramas: reef.dioramas.slice() },
      todayTide, weekTides, events,
      overdue: overdueAges.length, cloudiness: LBG.cloudiness(overdueAges.length), algae: LBG.algae(overdueAges),
      visitor: reef.bleached ? null : wv || 'common', visitorWeek: ds(wk),
      season: { week: (weeksDone % sw) + 1, of: sw, index: Math.floor(weeksDone / sw) },
      plots,
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
<radialGradient id="${p}ctr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f6a466"/><stop offset="1" stop-color="#a8460f"/></radialGradient>
<radialGradient id="${p}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="${p}gl" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff6dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient></defs>`;
  const BED = (p) => `<ellipse cx="42" cy="58" rx="40" ry="9" fill="url(#${p}sh)"/><path d="M4 26 L40 44 L40 59 L4 41z" fill="url(#${p}wl)"/><path d="M40 44 L76 26 L76 41 L40 59z" fill="url(#${p}wr)"/>
<path d="M6 31 L38 47 M6 36 L38 52" stroke="#8f5e30" stroke-width=".6" stroke-opacity=".6" fill="none"/><path d="M42 47 L74 31 M42 52 L74 36" stroke="#4e2e12" stroke-width=".6" stroke-opacity=".55" fill="none"/>
<path d="M40 7 L77 26 L40 45 L3 26z" fill="url(#${p}rim)"/><path d="M40 12.5 L68 26.5 L40 40.5 L12 26.5z" fill="url(#${p}soil)"/><path d="M40 12.5 L68 26.5 L65 28 L40 15.5 L15 28 L12 26.5z" fill="#1e120a" opacity=".55"/>
<g fill="#8a6142" opacity=".8"><circle cx="27" cy="29" r=".9"/><circle cx="51" cy="31" r=".8"/><circle cx="45" cy="36" r="1"/><circle cx="56" cy="25" r=".9"/></g>`;
  /* Seam for the model pipeline: roster kind 'plant' entries will set window.LB_PLANTS[id] = "<base64 glb>";
     swap this for a glb-backed renderer then; same (stage, species) in, markup out.
     stage: seed|sprout|leafy|bud|bloom|wilt|dead. species: { rarity, mutated } (unused by the SVG yet). */
  function renderPlant(stage, species, p) {
    const S = {
      seed: `<ellipse cx="40" cy="28" rx="8" ry="3.8" fill="#3a2416"/><ellipse cx="40" cy="27" rx="7" ry="3" fill="#5e3d28"/><ellipse cx="40" cy="25.5" rx="2.8" ry="2.1" fill="#e8cb96"/><ellipse cx="39.1" cy="24.8" rx="1" ry=".7" fill="#fff8e6"/>`,
      sprout: `<ellipse cx="42" cy="28.5" rx="8" ry="2.8" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39.5 21 40 15" stroke="#4a7d3a" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M40 17 q-8 -6 -11 1 q5 3 11 -1z" fill="url(#${p}l1)"/><path d="M40 15 q8 -7 12 -1 q-6 4 -12 1z" fill="url(#${p}l2)"/>`,
      leafy: `<ellipse cx="43" cy="29" rx="11" ry="3.5" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39 15 40 2" stroke="#4a7d3a" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M40 22 q-12 -7 -16 2 q7 4 16 -2z" fill="url(#${p}l1)"/><path d="M40 17 q12 -8 17 0 q-7 5 -17 0z" fill="url(#${p}l2)"/><path d="M40 10 q-10 -7 -14 1 q6 4 14 -1z" fill="url(#${p}l1)"/><path d="M40 5 q9 -6 13 0 q-6 4 -13 0z" fill="url(#${p}l2)"/>`,
      bud: `<ellipse cx="43" cy="29" rx="11" ry="3.5" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39 12 40 -3" stroke="#4a7d3a" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M40 22 q-12 -7 -16 2 q7 4 16 -2z" fill="url(#${p}l1)"/><path d="M40 14 q12 -8 17 0 q-7 5 -17 0z" fill="url(#${p}l2)"/><ellipse cx="40" cy="-8" rx="5" ry="7.5" fill="url(#${p}bud)"/><path d="M36 -3 q4 -4 8 0" stroke="#4a7d3a" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
      bloom: `<ellipse cx="44" cy="29" rx="12" ry="4" fill="#1e120a" opacity=".45"/><path d="M40 28 Q39 12 40 -4" stroke="#4a7d3a" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M40 21 q-13 -7 -17 2 q8 4 17 -2z" fill="url(#${p}l1)"/><path d="M40 12 q13 -8 18 0 q-8 5 -18 0z" fill="url(#${p}l2)"/><circle cx="40" cy="-16" r="5.2" fill="url(#${p}pet)"/><circle cx="47.2" cy="-11" r="5.2" fill="url(#${p}pet)"/><circle cx="44.5" cy="-3" r="5.2" fill="url(#${p}pet)"/><circle cx="35.5" cy="-3" r="5.2" fill="url(#${p}pet)"/><circle cx="32.8" cy="-11" r="5.2" fill="url(#${p}pet)"/><circle cx="40" cy="-9" r="4.2" fill="url(#${p}ctr)"/><circle cx="40" cy="-9" r="16" fill="url(#${p}gl)"/>`,
      wilt: `<ellipse cx="42" cy="29" rx="9" ry="3" fill="#1e120a" opacity=".45"/><path d="M40 28 Q40 8 48 4 Q54 3 54 12" fill="none" stroke="#8f7f48" stroke-width="2.2" stroke-linecap="round"/><path d="M40 22 q-10 0 -13 8 q8 -1 13 -8z" fill="url(#${p}dry)"/><path d="M44 12 q7 2 8 10 q-6 -3 -8 -10z" fill="url(#${p}dry)"/><circle cx="54" cy="14" r="3.6" fill="#b78a7c"/>`,
      dead: `<ellipse cx="42" cy="29" rx="8" ry="2.6" fill="#1e120a" opacity=".45"/><path d="M40 28 Q41 18 46 14 Q50 12 51 17" fill="none" stroke="#7a6a50" stroke-width="2" stroke-linecap="round"/><path d="M41 22 q-7 1 -9 6 q6 -1 9 -6z" fill="#8c7a5a"/><path d="M30 31 l3 -1 M50 33 l3 -2" stroke="#7a6a50" stroke-width="1.2" stroke-linecap="round"/>`,
    };
    return S[stage] || S.seed;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const visual = (pl) => (!pl.alive ? 'dead' : pl.thirsty || pl.wilted ? 'wilt' : pl.stageName);
  const LABEL = { seed: 'Seed', sprout: 'Sprout', leafy: 'Leafy', bud: 'Bud', bloom: 'Bloom', wilt: 'Thirsty', dead: 'Withered' };
  function plotSVG(pl) {
    const p = 'gp' + uid++ + '-', st = visual(pl);
    return `<svg class="gplot" viewBox="0 -26 80 92" width="72" height="83" role="img" aria-label="${esc(pl.name)}: ${LABEL[st].toLowerCase()} plant">${DEFS(p)}${BED(p)}${renderPlant(st, pl.seed, p)}<path d="M40 7 L3 26 L40 45 L77 26z" fill="url(#${p}gl)" opacity=".5"/></svg>`;
  }
  function gardenCard(game) {
    if (!game || !game.plots.length) return '';
    const rows = game.plots.map((pl) => {
      const st = visual(pl), sub = !pl.alive ? `Withered this season · ${pl.week} of ${pl.target} this week` : `${pl.week} of ${pl.target} this week${pl.week < pl.floor ? ` · floor ${pl.floor}` : pl.week > pl.target ? ' · above target' : ''}`;
      const warn = st === 'wilt' || st === 'dead';
      return `<li class="grow-row">${plotSVG(pl)}<div class="gmeta"><p class="gname">${esc(pl.name)}</p><p class="gsub">${esc(sub)}</p></div><span class="chip${warn ? ' gwarn' : ' gok'}">${LABEL[st]}</span></li>`;
    }).join('');
    return `<section class="sec labs-garden" aria-label="Garden"><div class="sec-h"><h3 class="sec-t">Garden <span class="ct num">Labs</span></h3><span class="gseason">Season week ${game.season.week} of ${game.season.of}</span></div><div class="card"><ul class="glist">${rows}</ul></div></section>`;
  }
  API.renderPlant = renderPlant;
  API.gardenCard = gardenCard;
  G.LBGarden = API;
})(typeof window !== 'undefined' ? window : globalThis);
