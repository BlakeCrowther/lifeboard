/* lifeboard: document shapes for every db collection. validate(col, doc) -> null when OK, else a short reason.
   Extra fields are allowed (older docs carry recurrence_series_id, icon_key and so on); known fields must have the right type. */
(function (G) {
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const T = {
    str: (v) => typeof v === 'string',
    num: (v) => typeof v === 'number' && isFinite(v),
    bool: (v) => typeof v === 'boolean',
    date: isDate,
    obj: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    arr: (v) => Array.isArray(v),
    any: () => true,
    strnum: (v) => typeof v === 'string' || (typeof v === 'number' && isFinite(v)),
  };
  const oneOf = (...xs) => (v) => xs.includes(v);
  const intIn = (a, b) => (v) => Number.isInteger(+v) && +v >= a && +v <= b && v !== '' && v !== null;

  const RULE_KINDS = ['interval', 'monthly_day', 'monthly_last_day', 'monthly_weekday', 'yearly_day', 'yearly_first_day', 'yearly_last_day', 'yearly_weekday'];
  const RULE_NEEDS = {
    interval: { every: intIn(1, 999), unit: oneOf('day', 'week', 'month', 'year') },
    monthly_day: { day: intIn(1, 31) },
    monthly_last_day: {},
    monthly_weekday: { ordinal: (v) => [1, 2, 3, 4, -1].includes(+v), weekday: intIn(0, 6) },
    yearly_day: { month: intIn(1, 12), day: intIn(1, 31) },
    yearly_first_day: { month: intIn(1, 12) },
    yearly_last_day: { month: intIn(1, 12) },
    yearly_weekday: { month: intIn(1, 12), ordinal: (v) => [1, 2, 3, 4, -1].includes(+v), weekday: intIn(0, 6) },
  };
  function ruleError(r) {
    if (!T.obj(r)) return 'recurrence_rule is not an object';
    if (!RULE_KINDS.includes(r.kind)) return 'unknown recurrence kind';
    for (const [k, ok] of Object.entries(RULE_NEEDS[r.kind])) if (!ok(r[k])) return `recurrence ${r.kind} needs a valid ${k}`;
    if (r.every_months != null && !intIn(1, 99)(r.every_months)) return 'bad every_months';
    if (r.basis != null && !oneOf('completion', 'schedule')(r.basis)) return 'bad basis';
    return null;
  }
  const rule = (v) => ruleError(v) === null;
  const FORMATS = ['tap', 'recall', 'apply'];
  const ladder = (v) => Array.isArray(v) && v.length > 0 && v.every((f) => FORMATS.includes(f));
  /* one rung per ladder step: { format, prompt, answer?, choices? }; recall needs an answer */
  const rungs = (v) => Array.isArray(v) && v.length > 0 && v.every((r) => T.obj(r) && FORMATS.includes(r.format) && T.str(r.prompt) && r.prompt.length > 0
    && (r.format !== 'recall' || (T.str(r.answer) && r.answer.length > 0)) && (r.choices == null || (Array.isArray(r.choices) && r.choices.every(T.str))));

  /* field: [check, required]. Optional fields may also be null. */
  const S = {
    tasks: {
      title: [T.str, 1], category: [T.str], notes: [T.str], due_date: [T.date], deadline_date: [T.date],
      status: [oneOf('open', 'done'), 1], completed_at: [T.num], recurrence_rule: [rule], sort_order: [T.num],
      urgent_sort_order: [T.num], created_at: [T.num], icon_key: [T.str], recurrence_spawned: [T.bool],
      recurrence_series_id: [T.str], recurrence_parent_task_id: [T.str], suggested: [T.bool], project: [T.str],
      committed_days: [(v) => Array.isArray(v) && v.every(isDate)], /* dates the task was committed to (SPEC.md Ring %) */
      committed_at: [T.num], /* when today's commitment landed (commit lock clock) */
    },
    habits: { name: [T.str, 1], key: [T.str], cadence: [oneOf('week', 'day')], target_per_week: [T.num, 1], streak_floor_per_week: [T.num], sort_order: [T.num], notes: [T.str], icon_key: [T.str], hidden: [T.bool], created_at: [T.num] },
    habit_sessions: { habit_id: [T.str, 1], date: [T.date, 1], created_at: [T.num] },
    groceries: { name: [T.str, 1], group_name: [T.str], checked: [T.bool], sort_order: [T.num], created_at: [T.num] },
    recipes: { name: [T.str, 1], mood: [T.str], url: [T.str], notes: [T.str], status: [oneOf('planned', 'archived')], cooked_at: [T.num], ingredients: [T.arr], time: [T.str], sort_order: [T.num], created_at: [T.num] },
    list_items: { list_key: [T.str, 1], title: [T.str, 1], author: [T.str], url: [T.str], notes: [T.str], status: [oneOf('want', 'done')], sort_order: [T.num], created_at: [T.num] },
    buy_list_items: { name: [T.str, 1], tag: [oneOf('need', 'love', 'like', 'one_day')], price: [T.strnum], url: [T.str], notes: [T.str], status: [oneOf('waiting', 'bought', 'dropped')], added_date: [T.date], sort_order: [T.num], created_at: [T.num] },
    gift_ideas: { person: [T.str, 1], idea: [T.str], url: [T.str], status: [oneOf('idea', 'given')], sort_order: [T.num], created_at: [T.num] },
    goals: { title: [T.str, 1], category: [T.str], year: [T.num, 1], status: [oneOf('active', 'completed')], notes: [T.str], icon_key: [T.str], progress_q1: [T.str], progress_q2: [T.str], progress_q3: [T.str], progress_q4: [T.str], sort_order: [T.num], created_at: [T.num] },
    logs: { kind: [T.str, 1], label: [T.str], value: [T.any], date: [T.date, 1], created_at: [T.num] },
    checks: { value: [T.any], updated_at: [T.num], week: [T.date] },
    snapshots: { fetched_at: [T.num], weather: [T.obj], surf: [T.obj], tides: [T.arr], events: [T.arr], quote: [T.obj] },
    countdowns: { kind: [T.str, 1], title: [T.str, 1], date: [T.date, 1], detail: [T.str], when: [T.str], gift: [T.str], links: [T.arr], match: [T.arr] },
    /* game (optional): one doc per creature per week when a reef visitor arrives. Written only with the Ecosystem on;
       not in COLLECTIONS, so store.js never listens to it. */
    game_state: { started: [T.date, 1], created_at: [T.num] }, /* store-tracked: the game's start day */
    keepsakes: { kind: [oneOf('plant', 'reef'), 1], title: [T.str], note: [T.str], updated_at: [T.num] },
    /* lessons (SPEC.md Lessons): written by the lesson-make skill; the deck writes level/due/state and answers */
    sources: { title: [T.str, 1], type: [oneOf('book', 'video', 'post', 'article', 'talk', 'podcast', 'course', 'note'), 1], author: [T.str], url: [T.str], size: [T.num], salience: [T.num], ladder: [ladder, 1], intervals: [(v) => Array.isArray(v) && v.length > 0 && v.every((n) => Number.isInteger(n) && n >= 1 && n <= 365)], summary: [T.str], status: [oneOf('active', 'paused', 'finished')], created_at: [T.num] },
    lessons: { source_id: [T.str, 1], level: [T.num, 1], due: [T.date, 1], state: [oneOf('active', 'graduated', 'dropped'), 1], rungs: [rungs, 1], order: [T.num], flagged: [T.bool], created_at: [T.num], updated_at: [T.num] },
    lesson_answers: { lesson_id: [T.str, 1], source_id: [T.str], action: [oneOf('advance', 'wrong', 'again', 'drop', 'skip', 'flag'), 1], format: [T.str], text: [T.str], date: [T.date, 1], created_at: [T.num] },
    visitors_met: { creature: [T.str, 1], met_at: [T.num, 1], biome: [T.num], week: [T.date], rarity: [oneOf('common', 'rare', 'exotic', 'legendary')] /* 'legendary' = old name for exotic */ },
  };
  const OPTIONAL = ['visitors_met', 'keepsakes', 'sources', 'lessons', 'lesson_answers'];

  function validate(col, doc) {
    const sch = S[col];
    if (!sch) return 'unknown collection';
    if (!T.obj(doc)) return 'not an object';
    for (const [k, [ok, req]] of Object.entries(sch)) {
      const v = doc[k];
      if (v === undefined || v === null) { if (req) return `missing ${k}`; continue; }
      if (!ok(v)) return k === 'recurrence_rule' ? ruleError(v) : `bad ${k}`;
    }
    return null;
  }
  G.LBS = { validate, ruleError, COLLECTIONS: Object.keys(S).filter((c) => !OPTIONAL.includes(c)), OPTIONAL, RULE_KINDS, FORMATS };
})(typeof window !== 'undefined' ? window : globalThis);
