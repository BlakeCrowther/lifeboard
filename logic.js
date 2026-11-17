/* lifeboard: pure date, task, habit and recurrence logic. No DOM. */
(function (G) {
  const TZ = 'America/Los_Angeles';
  const fmtYMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const todayStr = () => fmtYMD.format(new Date());
  const laDateOf = (ms) => fmtYMD.format(new Date(ms));
  const toD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fromD = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); };
  const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
  const dow = (s) => toD(s).getUTCDay();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shiftYM = (y, m, n) => { m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return [y, m]; };
  const addMonths = (s, n) => { const [y0, m0, d] = s.split('-').map(Number); const [y, m] = shiftYM(y0, m0, n); return ymd(y, m, Math.min(d, lastDayOfMonth(y, m))); };
  const mondayOf = (s) => addDays(s, -((dow(s) + 6) % 7));

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON3 = MONTHS.map((m) => m.slice(0, 3));
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WD3 = WD.map((w) => w.slice(0, 3));
  const longDate = (s) => { const d = toD(s); return `${WD[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const shortDate = (s) => { const d = toD(s); return `${WD3[d.getUTCDay()]} ${MON3[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const relDate = (s, t) => {
    const n = diffDays(t, s);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 1 && n < 7) return WD[dow(s)];
    const d = toD(s);
    const yr = d.getUTCFullYear() !== toD(t).getUTCFullYear() ? `, ${d.getUTCFullYear()}` : '';
    return `${MON3[d.getUTCMonth()]} ${d.getUTCDate()}${yr}`;
  };
  const nth = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  /* ---------- Tasks ---------- */
  const GROUPS = ['Social', 'Health', 'Money', 'Home', 'Pets', 'Personal', 'Goals'];
  const eff = (t) => { const a = t.due_date, b = t.deadline_date; return a && b ? (a < b ? a : b) : (a || b || null); };
  function taskState(t, today) {
    const due = t.due_date, dl = t.deadline_date;
    let overdue = false, slipped = false;
    if (dl) { overdue = dl < today; slipped = !overdue && !!due && due < today; }
    else if (due) overdue = due < today;
    return { eff: eff(t), overdue, slipped };
  }
  const byOrder = (a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || (a.created_at || 0) - (b.created_at || 0);
  const byDateThenOrder = (a, b) => { const ea = eff(a) || '9999', eb = eff(b) || '9999'; return ea < eb ? -1 : ea > eb ? 1 : byOrder(a, b); };
  function sortUrgent(list, today) {
    return list.slice().sort((a, b) => {
      const ua = a.urgent_sort_order, ub = b.urgent_sort_order;
      if (ua != null && ub != null) return ua - ub;
      if (ua != null) return -1;
      if (ub != null) return 1;
      const oa = taskState(a, today).overdue, ob = taskState(b, today).overdue;
      if (oa !== ob) return oa ? -1 : 1;
      return byDateThenOrder(a, b);
    });
  }
  const groupKey = (t, today) => { const e = eff(t); return !e ? 'none' : e <= today ? 'urgent' : e; };
  function buckets(tasks, today) {
    const wk = addDays(today, 7);
    const B = { urgent: [], week: [], later: [], none: [] };
    tasks.filter((t) => t.status !== 'done').forEach((t) => {
      const e = eff(t);
      if (!e) B.none.push(t); else if (e <= today) B.urgent.push(t); else if (e <= wk) B.week.push(t); else B.later.push(t);
    });
    B.urgent = sortUrgent(B.urgent, today);
    B.week.sort(byDateThenOrder); B.later.sort(byDateThenOrder); B.none.sort(byOrder);
    return B;
  }
  function sortGroupList(tasks, today) {
    const open = tasks.filter((t) => t.status !== 'done');
    const urgent = sortUrgent(open.filter((t) => groupKey(t, today) === 'urgent'), today);
    const dated = open.filter((t) => { const g = groupKey(t, today); return g !== 'urgent' && g !== 'none'; }).sort(byDateThenOrder);
    const none = open.filter((t) => groupKey(t, today) === 'none').sort(byOrder);
    return [...urgent, ...dated, ...none];
  }

  /* ---------- Recurrence ---------- */
  const ORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };
  function nthWeekday(y, m, ordinal, wd) {
    if (+ordinal === -1) { const last = lastDayOfMonth(y, m); const ld = dow(ymd(y, m, last)); return ymd(y, m, last - ((ld - wd + 7) % 7)); }
    const fd = dow(ymd(y, m, 1));
    const day = 1 + ((wd - fd + 7) % 7) + (ordinal - 1) * 7;
    return day > lastDayOfMonth(y, m) ? null : ymd(y, m, day);
  }
  // Next due date after completing an occurrence. completedOn is the LA date of completion.
  function nextDue(r, task, completedOn) {
    const base = task.due_date || task.deadline_date || completedOn;
    const [by, bm] = base.split('-').map(Number);
    switch (r.kind) {
      case 'interval': {
        const from = r.basis === 'schedule' ? base : completedOn;
        const n = Math.max(1, +r.every || 1);
        if (r.unit === 'day') return addDays(from, n);
        if (r.unit === 'week') return addDays(from, 7 * n);
        if (r.unit === 'month') return addMonths(from, n);
        return addMonths(from, 12 * n);
      }
      case 'monthly_day': { const [y, m] = shiftYM(by, bm, +r.every_months || 1); return ymd(y, m, Math.min(+r.day, lastDayOfMonth(y, m))); }
      case 'monthly_last_day': { const [y, m] = shiftYM(by, bm, +r.every_months || 1); return ymd(y, m, lastDayOfMonth(y, m)); }
      case 'monthly_weekday': { let [y, m] = shiftYM(by, bm, +r.every_months || 1); let d = nthWeekday(y, m, +r.ordinal, +r.weekday); while (!d) { [y, m] = shiftYM(y, m, 1); d = nthWeekday(y, m, +r.ordinal, +r.weekday); } return d; }
      case 'yearly_day': { const y = by + 1; return ymd(y, +r.month, Math.min(+r.day, lastDayOfMonth(y, +r.month))); }
      case 'yearly_first_day': return ymd(by + 1, +r.month, 1);
      case 'yearly_last_day': return ymd(by + 1, +r.month, lastDayOfMonth(by + 1, +r.month));
      case 'yearly_weekday': return nthWeekday(by + 1, +r.month, +r.ordinal, +r.weekday) || ymd(by + 1, +r.month, 1);
    }
    return addDays(completedOn, 1);
  }
  const everyM = (n) => (+n || 1) === 1 ? 'every month' : `every ${n} months`;
  function describeRule(r) {
    if (!r) return 'Does not repeat.';
    switch (r.kind) {
      case 'interval': {
        const n = +r.every || 1; const span = n === 1 ? `1 ${r.unit}` : `${n} ${r.unit}s`;
        return r.basis === 'schedule'
          ? `Repeats on a schedule: the next one is due ${span} after this one's do date, even if you finish late.`
          : `The next one is due ${span} after the day you complete this one.`;
      }
      case 'monthly_day': return `Repeats on the ${nth(+r.day)} of ${everyM(r.every_months)}${+r.day > 28 ? ' (the last day in shorter months)' : ''}.`;
      case 'monthly_last_day': return `Repeats on the last day of ${everyM(r.every_months)}.`;
      case 'monthly_weekday': return `Repeats on the ${ORD[r.ordinal]} ${WD[r.weekday]} of ${everyM(r.every_months)}.`;
      case 'yearly_day': return `Repeats every year on ${MONTHS[r.month - 1]} ${r.day}.`;
      case 'yearly_first_day': return `Repeats every year on ${MONTHS[r.month - 1]} 1.`;
      case 'yearly_last_day': return `Repeats every year on the last day of ${MONTHS[r.month - 1]}.`;
      case 'yearly_weekday': return `Repeats every year on the ${ORD[r.ordinal]} ${WD[r.weekday]} of ${MONTHS[r.month - 1]}.`;
    }
    return '';
  }
  function shortRule(r) {
    if (!r) return '';
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    const pre = (+r.every_months || 1) > 1 ? `Every ${r.every_months} mo` : 'Monthly';
    switch (r.kind) {
      case 'interval': { const n = +r.every || 1; if (n === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[r.unit]; return `Every ${n} ${r.unit}s`; }
      case 'monthly_day': return `${pre} on the ${nth(+r.day)}`;
      case 'monthly_last_day': return `${pre}, last day`;
      case 'monthly_weekday': return `${pre}, ${ORD[r.ordinal]} ${WD3[r.weekday]}`;
      case 'yearly_day': return `Yearly, ${MON3[r.month - 1]} ${r.day}`;
      case 'yearly_first_day': return `Yearly, ${MON3[r.month - 1]} 1`;
      case 'yearly_last_day': return `Yearly, end of ${MON3[r.month - 1]}`;
      case 'yearly_weekday': return `Yearly, ${cap(ORD[r.ordinal])} ${WD3[r.weekday]} of ${MON3[r.month - 1]}`;
    }
    return 'Repeats';
  }

  /* ---------- Habits (Monday-start weeks) ---------- */
  function habitStats(h, sessions, today) {
    const ss = sessions.filter((s) => s.habit_id === h.id || s.habit_id === h.key).map((s) => s.date).filter((d) => d && d <= today);
    const wk = mondayOf(today), mon = today.slice(0, 7), yr = today.slice(0, 4);
    const counts = {};
    ss.forEach((d) => { const m = mondayOf(d); counts[m] = (counts[m] || 0) + 1; });
    const floor = +h.streak_floor_per_week || 1, target = +h.target_per_week || 1;
    const c = (m) => counts[m] || 0;
    const weeks = [];
    for (let i = 0, m = wk; i < 12; i++, m = addDays(m, -7)) weeks.push({ label: m, count: c(m), met_target: c(m) >= target, met_floor: c(m) >= floor, is_current: i === 0 });
    const curMet = c(wk) >= floor;
    let streak = curMet ? 1 : 0;
    for (let m = addDays(wk, -7); c(m) >= floor; m = addDays(m, -7)) streak++;
    return {
      week: c(wk), month: ss.filter((d) => d.startsWith(mon)).length, year: ss.filter((d) => d.startsWith(yr)).length,
      today: ss.filter((d) => d === today).length, total: ss.length,
      streak, streak_pending: !curMet && streak > 0, weeks, target, floor,
    };
  }

  /* ---------- Wish list timers ---------- */
  const TAGS = { need: { label: 'Need', days: 0 }, love: { label: 'Love', days: 7 }, like: { label: 'Like', days: 30 }, one_day: { label: 'One day', days: null } };
  function buyCalc(item, today) {
    const tag = TAGS[item.tag] ? item.tag : 'one_day';
    const days = TAGS[tag].days;
    const added = item.added_date || (item.created_at ? laDateOf(item.created_at) : today);
    const ready = days == null ? null : addDays(added, days);
    const remaining = ready ? Math.max(0, diffDays(today, ready)) : null;
    return { tag, timer_days: days, ready_date: ready, days_remaining: remaining, is_ready: days === 0 || (!!ready && ready <= today) };
  }

  /* ---------- Calendar ---------- */
  const laTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const laHM = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const tLabel = (iso) => laTimeFmt.format(new Date(iso)).replace(':00', '');
  const minsOfDay = (iso) => { const p = laHM.formatToParts(new Date(iso)); return (+p.find((x) => x.type === 'hour').value % 24) * 60 + +p.find((x) => x.type === 'minute').value; };
  const durLabel = (m) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  const evMins = (e) => Math.max(0, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000));
  const minLabel = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${(h % 12) || 12}${mm ? ':' + pad(mm) : ''} ${h < 12 || h === 24 ? 'AM' : 'PM'}`; };
  function eventsOn(evs, d) {
    const ad = evs.filter((e) => {
      if (!e.all_day) return false;
      const s = e.start.slice(0, 10), en = e.end ? e.end.slice(0, 10) : null;
      return en && en > s ? s <= d && d < en : d === s;
    });
    const tm = evs.filter((e) => !e.all_day && laDateOf(Date.parse(e.start)) === d).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return { ad, tm };
  }
  function freeGaps(tm, d) {
    const iv = tm.map((e) => {
      const s = minsOfDay(e.start); const sameDay = laDateOf(Date.parse(e.end)) === d;
      return [Math.max(480, s), Math.min(1080, sameDay ? minsOfDay(e.end) : 1440)];
    }).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const gaps = []; let cur = 480;
    iv.forEach(([a, b]) => { if (a - cur >= 60) gaps.push([cur, a]); cur = Math.max(cur, b); });
    if (1080 - cur >= 60) gaps.push([cur, 1080]);
    return gaps;
  }

  /* ---------- Icon auto-assignment ---------- */
  const ICON_RULES = [
    [/water|plant|garden/, 'plant'], [/dentist|teeth|floss/, 'tooth'], [/doctor|appoint|dr\.? |therap|physio|checkup|check-up|derm|eye exam/, 'medical'],
    [/massage|stretch|yoga|mobility/, 'lotus'], [/pill|meds|medication|vitamin|flea|prescription/, 'pill'], [/call|phone|text /, 'phone'],
    [/email|mail|letter|thank.?you|card/, 'mail'], [/car\b|oil change|smog|registration|dmv|tire/, 'car'], [/clean|vacuum|sweep|mop|tidy|declutter/, 'broom'],
    [/laundry|wash|bath|shower/, 'droplet'], [/gym|workout|lift/, 'dumbbell'], [/trip|flight|travel|hotel|airport|pack/, 'plane'],
    [/birthday|cake|party/, 'cake'], [/wedding|ring|registry|elope/, 'rings'], [/music|song|playlist|league|drum/, 'music'],
    [/climb|boulder|hike|el cap/, 'mountain'], [/dog|vet|leash/, 'dog'], [/\bcat\b|litter/, 'cat'],
    [/fix|repair|install|assemble|replace/, 'wrench'], [/bill|pay|rent|tax|invoice|spending|budget|refund|insurance/, 'receipt'],
    [/gift|present/, 'gift'], [/grocer|shop|buy|order|return/, 'bag'], [/book|read/, 'books'], [/cook|recipe|meal|dinner|lunch/, 'pot'],
    [/\brun\b|running|jog/, 'shoe'], [/surf/, 'surf'], [/trash|recycl|garbage|compost/, 'trash'], [/key|lock/, 'key'],
    [/goal|retro|quarter|review|plan/, 'chart'], [/computer|laptop|backup|update|password|app\b/, 'laptop'], [/hair|barber/, 'scissors'],
    [/meditat/, 'lotus'], [/journal|write|draft/, 'journal'], [/spanish/, 'hola'], [/beach|ocean/, 'wave'], [/movie|film/, 'film'],
    [/coffee|tea|drink/, 'cup'], [/friend|hang|dinner with|catch up|date/, 'social'], [/home|house|apartment|lease/, 'house'],
  ];
  const FALLBACK_ICONS = ['spark', 'star', 'diamond', 'flag', 'dot', 'check'];
  function autoIcon(title) {
    const t = ' ' + (title || '').toLowerCase() + ' ';
    for (const [re, k] of ICON_RULES) if (re.test(t)) return k;
    let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0;
    return FALLBACK_ICONS[Math.abs(h) % FALLBACK_ICONS.length];
  }

  G.LB = {
    TZ, todayStr, laDateOf, toD, addDays, diffDays, dow, ymd, pad, lastDayOfMonth, addMonths, mondayOf, MONTHS, MON3, WD, WD3, longDate, shortDate, relDate, nth,
    GROUPS, eff, taskState, byOrder, byDateThenOrder, sortUrgent, groupKey, buckets, sortGroupList,
    ORD, nthWeekday, nextDue, describeRule, shortRule, habitStats, TAGS, buyCalc,
    tLabel, minsOfDay, durLabel, evMins, minLabel, eventsOn, freeGaps, autoIcon,
  };
})(typeof window !== 'undefined' ? window : globalThis);
