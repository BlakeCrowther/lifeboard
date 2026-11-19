/* lifeboard: game rules for the garden (habits), reef (rings) and lessons. Pure, no DOM, no dates:
   days and weeks are plain integers so the same code runs in the page and in sim/run.js.
   Spec: "Lifeboard Game Spec" doc. Every tunable number lives in RULES. */
(function (G) {
  const RULES = {
    /* one plant at a time per plot (habit): it blooms or dies, shows that for bloomWeeks / restWeeks, is pressed, and a new seed goes in.
       seasons are the real calendar seasons (meteorological, by hemisphere): flavour and reviews only, they don't end plants.
       points: what each growing week adds to the plant's score (floor / target / above target); rarity: score needed for the next seed. */
    garden: { stages: ['seed', 'sprout', 'leafy', 'bud', 'bloom'], bloomWeeks: 1, restWeeks: 1, points: { floor: 1, target: 2, above: 3 }, rarity: { rare: 6, exotic: 10 }, mutation: 0.05, wilt: false, hemisphere: 'north' },
    tide: { perPct: 10, fullBonus: 5, phases: 5, targetWeeks: 4.5, defaultDaily: 9, trailingDays: 28, cloudyAt: 10, algaeAfter: 7, algaeAt: 10 },
    visitor: { fullDaysForRare: 6, rareOverdue: 7, exoticOverdue: 30, overdueDropsPerWeek: 1, exoticPerBiome: 1 },
    bleach: { days: 14, below: 0.25, recoverDays: 7, recoverAt: 0.5 },
    /* feedings: decks a day, perFeeding cards each; the waking day dayStart..dayEnd (hours) splits evenly between them.
       hideAfter: days without a lesson before creatures hide */
    lessons: { intervals: [3, 7, 21], feedings: 2, perFeeding: 5, dayStart: 6, dayEnd: 22, hideAfter: 3 },
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
    return { seed, stage: compost ? 1 : 0, alive: true, score: 0, flourishes: 0, targetWeeks: 0, diedWeek: null };
  }
  /* A seed waits (no loss) until its first floor week; once sprouted, a week below floor kills it. */
  function plantWeek(p, result, week) {
    if (!p.alive) return p;
    if (result === 'died') {
      if (p.stage === 0) return p;
      if (RULES.garden.wilt && !p.wilted) { p.wilted = true; return p; } /* first miss: wilts, no growth */
      p.alive = false; p.diedWeek = week; return p;
    }
    p.wilted = false;
    p.stage = Math.min(4, p.stage + 1);
    p.score += RULES.garden.points[result] || 0;
    if (result === 'target' || result === 'above') p.targetWeeks++;
    if (result === 'above') p.flourishes++;
    return p;
  }
  const rarityOf = (score) => (score >= RULES.garden.rarity.exotic ? 'exotic' : score >= RULES.garden.rarity.rare ? 'rare' : 'common');
  /* a finished plant (bloomed or dead): its score earns the plot's next seed. rng() in [0,1). */
  function finishPlant(p, rng) {
    const bloomed = p.alive && p.stage === 4, score = p.score;
    return { bloomed, died: !p.alive, score, compost: !p.alive, seed: { rarity: bloomed ? rarityOf(score) : 'common', mutated: rng() < RULES.garden.mutation } };
  }
  /* a plot: { plant, gen, rest }. One closed week. A plant that blooms (or dies) is shown for bloomWeeks (restWeeks) more
     weeks, during which the habit result is ignored; then it is pressed and the next seed (gen + 1) goes in.
     opts.rest overrides restWeeks (a daily habit's plant dies mid-week and has already shown withered that week).
     Returns the finished record, or null. */
  function newPlot(seed) { return { plant: newPlant(seed || { rarity: 'common' }, false), gen: 0, rest: -1 }; }
  function plotWeek(pl, result, week, rng, opts) {
    if (pl.rest > 0) pl.rest--;
    else if (pl.rest < 0) {
      plantWeek(pl.plant, result, week);
      if (!pl.plant.alive) pl.rest = opts && opts.rest != null ? opts.rest : RULES.garden.restWeeks;
      else if (pl.plant.stage === 4) pl.rest = RULES.garden.bloomWeeks;
    }
    if (pl.rest !== 0) return null;
    const done = finishPlant(pl.plant, rng);
    pl.plant = newPlant(done.seed, done.compost); pl.gen++; pl.rest = -1;
    return done;
  }

  /* ---------- ring: done ÷ committed (SPEC.md "Ring %") ----------
     tasks: [{ eff: 'YYYY-MM-DD' | null (current due/deadline), doneDate: 'YYYY-MM-DD' | null }]
     committed on day D = tasks due D not finished before D, plus anything finished on D (a task added and finished
     the same day adds 1 to both sides). Overdue tasks don't count until pulled into a day (rescheduled to it).
     Returns { [date]: { done, committed } }. */
  function ringTally(tasks) {
    const out = {}, at = (d) => out[d] || (out[d] = { done: 0, committed: 0 });
    tasks.forEach((t) => {
      if (t.doneDate) { const x = at(t.doneDate); x.done++; x.committed++; }
      if (t.eff && (!t.doneDate || t.doneDate > t.eff)) at(t.eff).committed++;
    });
    return out;
  }
  const ringPct = (x) => (x && x.committed ? Math.min(1, x.done / x.committed) : null);

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
    return { biome: 0, startDay: 0, pts: 0, phase: 0, th: phaseThresholds(RULES.tide.defaultDaily), log: [], bleached: false, dioramas: [], weekDrops: 0, exotics: 0 };
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
        Object.assign(r, { biome: r.biome + 1, startDay: day + 1, pts: 0, phase: 0, th: phaseThresholds(avg), exotics: 0 });
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
  const overdueDrop = (daysOverdue) => (daysOverdue >= RULES.visitor.exoticOverdue ? 'exotic' : daysOverdue >= RULES.visitor.rareOverdue ? 'rare' : null);
  /* reward for finishing an overdue task, capped per week (reset r.weekDrops on Monday) and exotic per biome */
  function overdueReward(r, daysOverdue) {
    const v = RULES.visitor;
    if (v.overdueDropsPerWeek != null && r.weekDrops >= v.overdueDropsPerWeek) return null;
    let d = overdueDrop(daysOverdue);
    if (d === 'exotic' && r.exotics >= v.exoticPerBiome) d = 'rare';
    if (d) { r.weekDrops++; if (d === 'exotic') r.exotics++; }
    return d;
  }
  /* water: each overdue task clouds it a little (0 clear .. 1 murky at cloudyAt tasks) */
  const cloudiness = (overdueCount) => Math.min(1, overdueCount / RULES.tide.cloudyAt);
  /* algae: grows from neglect, i.e. tasks overdue algaeAfter+ days (0 none .. 1 overgrown at algaeAt such tasks) */
  const algae = (overdueAges) => Math.min(1, overdueAges.filter((a) => a >= RULES.tide.algaeAfter).length / RULES.tide.algaeAt);

  /* ---------- lessons ---------- */
  function newLesson(id, sourceId, format, day) { return { id, sourceId, format, level: 0, due: day, state: 'active' }; }
  /* due reviews first (oldest due first), then new lessons; at most `n` */
  function buildDeck(lessons, day, n = RULES.lessons.perFeeding) {
    const act = lessons.filter((l) => l.state === 'active' && l.due <= day);
    const rev = act.filter((l) => l.level > 0).sort((a, b) => a.due - b.due);
    const fresh = act.filter((l) => l.level === 0);
    return rev.concat(fresh).slice(0, n);
  }
  /* action: advance | wrong | again | drop | skip. Graduates after the last interval. */
  /* which feeding an hour (0-23, may be fractional) falls in; before dayStart is the first, after dayEnd the last.
     r: RULES.lessons with any per-board override merged in */
  function feedingOf(hour, r = RULES.lessons) {
    const n = Math.max(1, r.feedings | 0), span = (r.dayEnd - r.dayStart) / n;
    return Math.min(n - 1, Math.max(0, Math.floor((hour - r.dayStart) / span)));
  }
  /* iv: the source's own intervals when it sets them (sources.intervals), else RULES.lessons.intervals */
  function answer(l, action, day, iv = RULES.lessons.intervals) {
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

  const API = { RULES, ringTally, ringPct, weekResult, newPlant, plantWeek, rarityOf, finishPlant, newPlot, plotWeek, dayTide, phaseThresholds, newReef, reefDay, weekVisitor, overdueDrop, overdueReward, cloudiness, algae, newLesson, buildDeck, answer, sourceDone, rungOf, feedingOf };
  G.LBG = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
