/* lifeboard: game rules for the garden (habits), reef (rings) and lessons. Pure, no DOM, no dates:
   days and weeks are plain integers so the same code runs in the page and in sim/run.js.
   Spec: "Lifeboard Game Spec" doc. Every tunable number lives in RULES. */
(function (G) {
  const RULES = {
    garden: { stages: ['seed', 'sprout', 'leafy', 'bud', 'bloom'], seasonWeeks: 4, rarity: { heirloom: 4, exotic: 7 }, mutation: 0.05, replant: false, wilt: false },
    tide: { perPct: 10, fullBonus: 5, phases: 5, targetWeeks: 4.5, defaultDaily: 9, trailingDays: 28, cloudyAt: 10, algaeAfter: 7, algaeAt: 10 },
    visitor: { fullDaysForRare: 6, rareOverdue: 7, legendaryOverdue: 30, overdueDropsPerWeek: 1, legendaryPerBiome: 1 },
    bleach: { days: 14, below: 0.25, recoverDays: 7, recoverAt: 0.5 },
    lessons: { intervals: [3, 7, 21], deck: 5, hideAfter: 3 }, /* hideAfter: days without a lesson before creatures hide */
    /* break overlay: each skipped break costs this much growth (never below the current phase); the fish sulk that day */
    breaks: { skipCost: 5 },
  };

  /* ---------- garden ---------- */
  function weekResult(count, floor, target) {
    floor = Math.max(1, +floor || 1); target = Math.max(floor, +target || floor);
    if (count < floor) return 'died';
    if (count > target) return 'above';
    if (count === target) return 'target';
    return 'floor';
  }
  /* compost: the plot's last plant died, so the new seed starts one stage ahead (already sprouted). */
  function newPlant(seed, compost) {
    return { seed, stage: compost ? 1 : 0, alive: true, flourishes: 0, targetWeeks: 0, diedWeek: null };
  }
  /* A seed waits (no loss) until its first floor week; once sprouted, a week below floor kills it for the season. */
  function plantWeek(p, result, week) {
    if (!p.alive) {
      if (!RULES.garden.replant) return p;
      Object.assign(p, newPlant({ rarity: 'common' }, false), { replanted: true }); /* fresh seed, still needs a floor week */
    }
    if (result === 'died') {
      if (p.stage === 0) return p;
      if (RULES.garden.wilt && !p.wilted) { p.wilted = true; return p; } /* first miss: wilts, no growth */
      p.alive = false; p.diedWeek = week; return p;
    }
    p.wilted = false;
    p.stage = Math.min(4, p.stage + 1);
    if (result === 'target' || result === 'above') p.targetWeeks++;
    if (result === 'above') p.flourishes++;
    return p;
  }
  const rarityOf = (score) => (score >= RULES.garden.rarity.exotic ? 'exotic' : score >= RULES.garden.rarity.heirloom ? 'heirloom' : 'common');
  /* plants in plot order; neighbours that both bloom cross into a hybrid. rng() in [0,1). */
  function endSeason(plants, rng) {
    const out = plants.map((p) => {
      const bloomed = p.alive && p.stage === 4, score = p.flourishes + p.targetWeeks;
      return { bloomed, died: !p.alive, score, compost: !p.alive,
        seed: { rarity: bloomed ? rarityOf(score) : 'common', mutated: rng() < RULES.garden.mutation } };
    });
    const hybrids = [];
    for (let i = 0; i + 1 < out.length; i++) if (out[i].bloomed && out[i + 1].bloomed) hybrids.push([i, i + 1]);
    return { plots: out, hybrids };
  }

  /* ---------- reef ---------- */
  /* null = nothing committed: a neutral day, no points, ignored by bleaching. */
  function dayTide(committed, done) {
    if (!committed) return null;
    const pct = Math.min(1, done / committed), full = pct >= 1;
    return { pct, full, pts: pct * RULES.tide.perPct + (full ? RULES.tide.fullBonus : 0) };
  }
  /* cumulative point thresholds for each phase, sized so a biome takes targetWeeks at the trailing pace */
  function phaseThresholds(dailyAvg) {
    const t = RULES.tide, per = (Math.max(1, dailyAvg || t.defaultDaily) * 7 * t.targetWeeks) / t.phases;
    return Array.from({ length: t.phases }, (_, i) => Math.round(per * (i + 1)));
  }
  function newReef() {
    return { biome: 0, startDay: 0, pts: 0, phase: 0, th: phaseThresholds(RULES.tide.defaultDaily), log: [], bleached: false, dioramas: [], weekDrops: 0, legendaries: 0 };
  }
  /* one day; tide from dayTide(). Returns events: 'phase', 'biome', 'bleach', 'recover'. */
  function reefDay(r, day, tide) {
    const ev = [];
    r.log.push(tide);
    if (tide) {
      r.pts += tide.pts;
      while (r.phase < r.th.length && r.pts >= r.th[r.phase]) { r.phase++; ev.push('phase'); }
      if (r.phase >= r.th.length) {
        { const days = day + 1 - r.startDay, span = r.log.slice(-days); r.dioramas.push({ biome: r.biome, days, start: r.startDay, end: day, full: span.filter((x) => x && x.full).length, pts: Math.round(r.pts) }); }
        const recent = r.log.slice(-RULES.tide.trailingDays);
        const avg = recent.reduce((s, x) => s + (x ? x.pts : 0), 0) / recent.length;
        Object.assign(r, { biome: r.biome + 1, startDay: day + 1, pts: 0, phase: 0, th: phaseThresholds(avg), legendaries: 0 });
        ev.push('biome');
      }
    }
    const b = RULES.bleach, scored = (n) => r.log.slice(-n).filter(Boolean);
    const avgPct = (xs) => (xs.length ? xs.reduce((s, x) => s + x.pct, 0) / xs.length : 1);
    if (!r.bleached && r.log.length >= b.days && avgPct(scored(b.days)) < b.below) { r.bleached = true; ev.push('bleach'); }
    else if (r.bleached && avgPct(scored(b.recoverDays)) >= b.recoverAt) { r.bleached = false; ev.push('recover'); }
    return ev;
  }
  const weekVisitor = (tides) => (tides.filter((t) => t && t.full).length >= RULES.visitor.fullDaysForRare ? 'rare' : null);
  const overdueDrop = (daysOverdue) => (daysOverdue >= RULES.visitor.legendaryOverdue ? 'legendary' : daysOverdue >= RULES.visitor.rareOverdue ? 'rare' : null);
  /* reward for finishing an overdue task, capped per week (reset r.weekDrops on Monday) and legendary per biome */
  function overdueReward(r, daysOverdue) {
    const v = RULES.visitor;
    if (v.overdueDropsPerWeek != null && r.weekDrops >= v.overdueDropsPerWeek) return null;
    let d = overdueDrop(daysOverdue);
    if (d === 'legendary' && r.legendaries >= v.legendaryPerBiome) d = 'rare';
    if (d) { r.weekDrops++; if (d === 'legendary') r.legendaries++; }
    return d;
  }
  /* water: each overdue task clouds it a little (0 clear .. 1 murky at cloudyAt tasks) */
  const cloudiness = (overdueCount) => Math.min(1, overdueCount / RULES.tide.cloudyAt);
  /* algae: grows from neglect, i.e. tasks overdue algaeAfter+ days (0 none .. 1 overgrown at algaeAt such tasks) */
  const algae = (overdueAges) => Math.min(1, overdueAges.filter((a) => a >= RULES.tide.algaeAfter).length / RULES.tide.algaeAt);

  /* ---------- lessons ---------- */
  function newLesson(id, sourceId, format, day) { return { id, sourceId, format, level: 0, due: day, state: 'active' }; }
  /* due reviews first (oldest due first), then new lessons; at most `n` */
  function buildDeck(lessons, day, n = RULES.lessons.deck) {
    const act = lessons.filter((l) => l.state === 'active' && l.due <= day);
    const rev = act.filter((l) => l.level > 0).sort((a, b) => a.due - b.due);
    const fresh = act.filter((l) => l.level === 0);
    return rev.concat(fresh).slice(0, n);
  }
  /* action: advance | wrong | again | drop | skip */
  function answer(l, action, day) {
    const iv = RULES.lessons.intervals;
    if (action === 'drop') l.state = 'dropped';
    else if (action === 'skip') l.due = day + 1;
    else if (action === 'again') l.due = day + iv[Math.max(0, l.level - 1)];
    else if (action === 'wrong') { l.level = Math.max(0, l.level - 1); l.due = day + (l.level ? iv[l.level - 1] : 1); }
    else if (l.level >= iv.length) l.state = 'graduated';
    else { l.level++; l.due = day + iv[l.level - 1]; }
    return l;
  }
  const sourceDone = (lessons) => lessons.every((l) => l.state !== 'active');
  /* which rung of the source's ladder a lesson is on: its level, capped at the last rung */
  const rungOf = (level, rungs) => Math.min(level || 0, rungs - 1);

  const API = { RULES, weekResult, newPlant, plantWeek, rarityOf, endSeason, dayTide, phaseThresholds, newReef, reefDay, weekVisitor, overdueDrop, overdueReward, cloudiness, algae, newLesson, buildDeck, answer, sourceDone, rungOf };
  G.LBG = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
