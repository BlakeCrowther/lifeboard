/* The Life tab: Health, Money, Home & Pets, Hobbies. */
import { textOf } from '../shared/format.ts';
import { daysBetween, longDate, padTwo, shortDate } from '../../dates/index.ts';
import { dateOfInstant, timeZone } from '../../dates/clock.ts';
import { LIFE_AREAS } from '../shared/areas.ts';
import type { BoardTask } from '../board-model.ts';
import { clock, mondayOf, relativeDay } from '../shared/clock.ts';
import { escapeHtml, plural, readingOrDash } from '../shared/format.ts';
import { statsOf } from '../shared/habit-weeks.ts';
import { icon } from '../shared/icons.ts';
import { areaHeader, goLink, sectionHeader } from '../shared/sections.ts';
import { model, profile, viewState } from '../shared/state.ts';
import { groupTasks } from '../shared/task-row.ts';
import { compareByDate, effectiveDateOf, stateOf } from '../shared/tasks.ts';

/** A stepwise checklist kept in checks/<key> (weekKey: ticks count only in that week). */
function checklist(title: string, intro: string, keys: readonly string[], steps: readonly string[], weekKey?: string): string {
  const on = (k: string): boolean => { const c = model.checks[k]; return !!(c?.value && (!weekKey || c.week === weekKey)); };
  const n = keys.filter(on).length;
  return `<div class="card pad"><h4 style="margin:0;font-size:17px">${title}</h4><p class="small muted" style="margin:4px 0 12px">${intro}</p>
    <div style="display:flex;align-items:center;gap:10px"><div class="bar-meter" style="flex:1" role="progressbar" aria-valuemin="0" aria-valuemax="${String(steps.length)}" aria-valuenow="${String(n)}" aria-label="${title} progress"><i style="width:${String((n / steps.length) * 100)}%"></i></div><span class="small num">${String(n)}/${String(steps.length)}</span></div>
    <ul class="list steps" style="margin-top:6px">${steps.map((s, i) => { const k = keys[i] ?? '', v = on(k); return `<li class="item${v ? ' done' : ''}" style="grid-template-columns:44px 1fr"><button class="tick" data-act="check" data-key="${k}" data-week="${weekKey || ''}" aria-pressed="${String(v)}" aria-label="Step ${String(i + 1)}: ${escapeHtml(s)}"><span class="ring">${icon('check', 16)}</span></button><span class="tmain"><span class="ttl" style="font-weight:400">${String(i + 1)}. ${escapeHtml(s)}</span></span></li>`; }).join('')}</ul></div>`;
}
const timeOfDay = (ms: number): string => new Intl.DateTimeFormat('en-US', { timeZone: timeZone(), hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
const text = textOf;
const fieldOf = (o: unknown, k: string): unknown => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined);

export const PARTS = ['The pusher', 'The worrier', 'The tired one', 'The critic', 'A calmer part'] as const;
export const BLEND_LEVELS: readonly (readonly [label: string, advice: string])[] = [['Blended', 'Name the part that has the wheel, and notice your feet on the floor.'], ['Noticing it', 'Noticing is the gap. That already counts.'], ['A bit of space', 'Hold onto that space, and take a short break while you have it.']];

function health(): string {
  const today = clock.today;
  const breaks = model.logs.filter((l) => l.kind === 'break' && l.date === today).length;
  const lastOf = (k: string): (typeof model.logs)[number] | undefined => model.logs.filter((l) => l.kind === k && l.date === today).slice(-1)[0];
  const lp = lastOf('parts'), lb = lastOf('blended');
  const t = viewState.breakTimer, left = t.endsAt ? Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)) : t.minutes * 60;
  const script = viewState.showCallScript;
  return `<section class="sec">${sectionHeader('Health tasks')}${groupTasks((x) => x.group === 'Health', 'No health tasks open.')}</section>
      <section class="sec">${checklist('Checkups, in small steps', "Annual physical, dentist cleaning, eye exam: not one big scary task. Step 1 alone counts as progress, and there's no calling yet.", ['appt-1', 'appt-2', 'appt-3', 'appt-4'], ['List what you need: the type of appointment and what it’s for.', 'Find the number or portal for each one.', 'Book just the first one.', 'Add it to your calendar and file the confirmation.'])}
        <button class="link" data-act="script" aria-expanded="${String(script)}" style="margin-top:4px">${icon(script ? 'chevD' : 'chevR', 16)} ${script ? 'Hide' : 'Show'} the call script</button>
        ${script ? `<div class="callout"><p style="margin:0">"Hi, I'd like to book an appointment with <b>[doctor type or name]</b>. It's for <b>[one-line reason]</b>. I'm usually free <b>[your availability]</b>. What's the earliest opening? Is there anything I should bring?"</p><p class="muted small" style="margin:8px 0 0">If something isn't handy: "Could you give me a direct number or the patient portal link so I can book that way?"</p></div>` : ''}</section>
      <section class="sec">${sectionHeader('Break timer', `<span class="small muted num">${plural(breaks, 'break')} today</span>`)}<div class="card pad">
        <div class="kinds" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Break length">${[2, 5, 10].map((n) => `<button data-act="timer-len" data-val="${String(n)}" aria-pressed="${String(t.minutes === n)}" ${t.endsAt ? 'disabled' : ''}>${String(n)} min</button>`).join('')}</div>
        <div class="timer" id="timerOut" aria-live="off" role="timer">${String(Math.floor(left / 60))}:${padTwo(left % 60)}</div>
        ${t.endsAt ? '<p class="small muted" style="text-align:center;margin:-6px 0 12px">Stretch, breathe, look out a window. No fixing required.</p>' : ''}
        <div class="row-btns" style="justify-content:center">${t.endsAt ? '<button class="btn" data-act="timer-end">End early</button>' : '<button class="btn primary" data-act="timer-start" style="min-width:140px">Start</button>'}<button class="btn ghost" data-act="timer-log">Already took one, log it</button></div>
        ${t.message ? `<p class="small muted" style="text-align:center;margin:10px 0 0" role="status">${escapeHtml(t.message)}</p>` : ''}
      </div></section>
      <section class="sec">${sectionHeader('Check in')}<div class="card pad">
        <h4 style="margin:0 0 8px;font-size:16px">Which part is loudest right now?</h4>
        <div class="row-btns">${PARTS.map((p) => `<button class="seg" data-act="part" data-val="${p}" aria-pressed="${String(!!lp && lp.label === p)}">${p}</button>`).join('')}</div>
        ${lp ? `<p class="small muted" style="margin:8px 0 0">Last check-in: <b>${escapeHtml(lp.label)}</b> ${lp.at ? 'at ' + timeOfDay(lp.at) : 'today'}. No fixing required.</p>` : ''}
        <h4 style="margin:18px 0 8px;font-size:16px">How blended with work?</h4>
        <div class="row-btns">${BLEND_LEVELS.map(([b]) => `<button class="seg" data-act="blend" data-val="${b}" aria-pressed="${String(!!lb && lb.label === b)}">${b}</button>`).join('')}</div>
        ${lb ? `<p class="small" style="margin:8px 0 0">${text(BLEND_LEVELS.find((x) => x[0] === lb.label)?.[1])}</p>` : ''}
        <p class="small muted" style="margin:16px 0 0">End of day: close the tabs, write tomorrow's one top thing, log off.</p>
      </div></section>`;
}

function money(): string {
  const week = mondayOf(clock.today);
  const bills = model.tasks.filter((t) => !t.done && t.group === 'Money' && t.rule).sort(compareByDate);
  const billRow = (b: BoardTask): string => {
    const e = effectiveDateOf(b), overdue = stateOf(b).overdue;
    return `<div class="kv"><span>${icon('repeat', 16)} ${escapeHtml(b.title)}</span><span class="num ${overdue ? 'tmeta' : 'muted'}" style="margin:0"><span class="${overdue || e === clock.today ? 'hot' : ''}">${e ? relativeDay(e) : ''}</span></span></div>`;
  };
  return `<section class="sec">${checklist('The 10-minute money check', 'Once a week, just these three. The point is knowing where you stand, not a budget lecture. Ticks clear each Monday.', ['fin-1', 'fin-2', 'fin-3'], ['Check balances.', 'List upcoming bills.', 'Pick one thing to sort.'], week)}</section>
      <section class="sec">${sectionHeader('Coming up', `<span class="small muted">${plural(bills.length, 'reminder')}</span>`)}<div class="card">${bills.length ? bills.map(billRow).join('') : '<p class="empty">No recurring money reminders.</p>'}</div></section>
      <section class="sec">${sectionHeader('Money tasks')}${groupTasks((x) => x.group === 'Money', 'No money tasks open.')}</section>`;
}

function homeAndPets(): string {
  const big = model.countdownsByKind.big;
  const terms = big.flatMap((w) => (w.match.length ? w.match : [w.title.split("'")[0] ?? '']).concat(w.kind)).map((x) => x.toLowerCase().trim()).filter(Boolean);
  const isBigDayTask = (t: BoardTask): boolean => t.group === 'Social' && terms.some((s) => t.title.toLowerCase().includes(s));
  const pf = profile.pets.some((p) => p.key === viewState.petFilter) ? viewState.petFilter : 'all';
  const petMatch = (t: BoardTask): boolean => pf === 'all' || t.title.toLowerCase().includes(pf) || (/\band\b/.test(t.title) && t.title.toLowerCase().includes(pf));
  const bigDays = big.length ? `<section class="sec" id="bigdays">${sectionHeader('Big days')}<div class="cards2">${big.map((w) => { const n = daysBetween(clock.today, w.date); return `<div class="card pad hcard"><div class="wcard"><span class="stat num">${n >= 0 ? String(n) : '✓'}</span><span class="small muted">${n === 0 ? 'Today!' : n > 0 ? 'days to go' : 'Celebrated'}</span><h4 style="margin:0;font-size:17px">${escapeHtml(w.title)}</h4></div>
        <p class="small" style="margin:10px 0 0">${longDate(w.date)}${w.where ? ' · ' + escapeHtml(w.where) : ''}</p>${w.gift ? `<p class="small muted" style="margin:4px 0 0">Gift: ${escapeHtml(w.gift)}</p>` : ''}</div>`; }).join('')}</div>
        <div class="group-l">Big day tasks</div>${groupTasks(isBigDayTask, 'No big day tasks open.')}</section>` : '';
  const petName = profile.pets.find((p) => p.key === pf)?.name ?? pf;
  return bigDays
    + `      <section class="sec">${sectionHeader('Home')}${groupTasks((t) => t.group === 'Home', 'No home tasks open.')}</section>
      <section class="sec">${sectionHeader('Pets')}${profile.pets.length > 1 ? `<div class="scroller" role="group" aria-label="Filter pets" style="margin-bottom:10px">${[{ key: 'all', name: 'All pets', icon: 'paw' }, ...profile.pets].map((p) => `<button class="seg" data-act="pet" data-val="${escapeHtml(p.key)}" aria-pressed="${String(pf === p.key)}">${icon(p.icon, 17)}${escapeHtml(p.name)}</button>`).join('')}</div>` : ''}
        ${groupTasks((t) => t.group === 'Pets' && petMatch(t), pf === 'all' ? 'No pet tasks open.' : 'Nothing open for ' + escapeHtml(petName) + '.')}</section>
      <section class="sec">${sectionHeader('Personal')}${groupTasks((t) => t.group === 'Personal', 'No personal tasks open.')}</section>
      <section class="sec">${sectionHeader('Work')}${groupTasks((t) => t.group === 'Work', 'No work tasks open.')}</section>`;
}

function hobbies(): string {
  const c = model.conditions, w = c?.weather ?? null, sf = c?.surf ?? null, today = clock.today;
  const outside = model.habits.filter((h) => ['surfing', 'running'].includes(h.key) || /surf|run/i.test(h.name));
  const climbs = model.goals.filter((g) => g.category === 'Climbing' && !g.done);
  const quarter = Math.ceil(Number(today.slice(5, 7)) / 3);
  const updated = c?.fetchedAt ? `<span class="tiny muted">Updated ${timeOfDay(c.fetchedAt)}${dateOfInstant(c.fetchedAt) !== today ? ' on ' + shortDate(dateOfInstant(c.fetchedAt)) : ''}</span>` : '';
  const weatherCard = w ? `<div class="card pad"><span class="group-l" style="margin:0 0 4px">Weather</span><div class="stat num">${readingOrDash(w['temp_f'], '°')}</div><p class="small" style="margin:4px 0 8px">${escapeHtml(w['condition'] || '')}<br><span class="muted">Feels ${readingOrDash(w['feels_like_f'], '°')} · H ${readingOrDash(w['high_f'], '°')} L ${readingOrDash(w['low_f'], '°')}</span></p>
          <div class="kv small"><span class="muted">Wind</span><span class="num">${readingOrDash(w['wind_mph'], ' mph')} ${escapeHtml(w['wind_dir'] || '')}${w['gust_mph'] != null ? `, gusts ${escapeHtml(w['gust_mph'])}` : ''}</span></div><div class="kv small"><span class="muted">Sun</span><span class="num">${readingOrDash(w['sunrise'])} – ${readingOrDash(w['sunset'])}</span></div><div class="kv small"><span class="muted">UV · Rain</span><span class="num">${readingOrDash(w['uv_max'])} · ${readingOrDash(w['rain_chance'], '%')}</span></div></div>` : '';
  const sessions = sf && Array.isArray(sf['sessions']) ? (sf['sessions'] as unknown[]) : [];
  const surfCard = sf ? `<div class="card pad"><span class="group-l" style="margin:0 0 4px">Surf</span><div class="stat num">${readingOrDash(sf['wave_ft'])}<small style="font-size:18px"> ft</small></div><p class="small" style="margin:4px 0 8px">${sf['period_s'] ? escapeHtml(sf['period_s']) + 's ' : ''}${escapeHtml(sf['direction'] || '')}<br><span class="muted">Water ${readingOrDash(sf['water_temp_f'], '°')}</span></p>
          <div class="kv small"><span class="muted">Swell</span><span class="num">${readingOrDash(sf['swell_ft'], ' ft')} @ ${readingOrDash(sf['swell_period_s'], 's')}</span></div><div class="kv small"><span class="muted">Wind</span><span>${readingOrDash(sf['wind'])}</span></div>${sessions.length ? `<div class="kv small"><span class="muted">Today</span><span class="num">${sessions.map((x) => escapeHtml(fieldOf(x, 'label') || '') + ' ' + readingOrDash(fieldOf(x, 'wave_ft'))).join(' · ')}</span></div>` : ''}</div>` : '';
  const forecast = w && Array.isArray(w['forecast']) ? (w['forecast'] as unknown[]).filter(Boolean) : [];
  const place = escapeHtml(profile.place);
  const conditions = c && (w || sf || c.tides.length) ? `<section class="sec">${sectionHeader(place, updated)}${weatherCard || surfCard ? `<div class="wx"${weatherCard && surfCard ? '' : ' style="grid-template-columns:1fr"'}>${weatherCard}${surfCard}</div>` : ''}
      ${c.tides.length ? `<div class="card" style="margin-top:8px">${c.tides.map((t) => `<div class="kv"><b>${escapeHtml(t.type)} tide</b><span class="num muted">${readingOrDash(t.heightFt, ' ft')}</span><span class="num">${escapeHtml(t.time)}</span></div>`).join('')}</div>` : ''}
      ${forecast.length ? `<div class="card" style="margin-top:8px">${forecast.map((f) => `<div class="kv"><b>${escapeHtml(fieldOf(f, 'day') || '')}</b><span class="muted">${escapeHtml(fieldOf(f, 'condition') || '')}</span><span class="num">${readingOrDash(fieldOf(f, 'high_f'), '°')} / ${readingOrDash(fieldOf(f, 'low_f'), '°')}</span></div>`).join('')}</div>` : ''}
      <p class="tiny muted" style="margin:8px 4px 0">Open-Meteo forecast and marine swell, NOAA tides.</p></section>`
    : `<section class="sec">${sectionHeader(place)}<div class="card"><p class="empty">No conditions report yet. Weather, surf and tides show here once a report is saved. Nothing is guessed.</p></div></section>`;
  return `${conditions}
      <section class="sec">${sectionHeader('Climbing & recovery', goLink('Goals', 'grow/goals'))}<div class="card">${climbs.length ? climbs.map((g) => `<div class="kv" style="align-items:flex-start;padding:10px 0"><span>${icon('mountain', 18)} <b>${escapeHtml(g.title)}</b><br><span class="small muted">Q${String(quarter)}: ${escapeHtml(g.quarterNotes[quarter - 1] || 'No note yet')}</span></span></div>`).join('') : '<p class="empty">No active climbing goals.</p>'}
        <p class="small muted" style="margin:0;padding:0 0 10px">Recovery work (massage, mobility) lives in Health as tasks.</p></div></section>
      <section class="sec">${sectionHeader('Time outside')}${outside.length ? `<div class="hgrid" style="grid-template-columns:1fr 1fr">${outside.map((h) => { const st = statsOf(h); return `<div class="htile"><span class="hn">${icon(h.icon, 17)}<span>${escapeHtml(h.name)}</span></span><button class="logbtn" data-act="log" data-id="${h.id}" aria-label="Log a ${escapeHtml(h.name)} session today">${icon('plus', 20)}</button><span class="hc num">${String(st.month)}<small> this month</small></span><span class="streak">${String(st.week)}/${String(h.target)} this week</span></div>`; }).join('')}</div>` : '<div class="card"><p class="empty">No surfing or running habit yet. Add one in Grow → Habits.</p></div>'}</section>`;
}

export function viewLife(): string {
  const area = viewState.lifeArea;
  const body = area === 'health' ? health() : area === 'money' ? money() : area === 'home' ? homeAndPets() : hobbies();
  const current = LIFE_AREAS.find((x) => x.id === area) ?? LIFE_AREAS[0];
  return `${areaHeader(area, current?.icon ?? '', 'Life', 'Health, money, home, pets and the fun stuff.')}
    <div class="lsplit"><div class="scroller" role="tablist" aria-label="Life areas">${LIFE_AREAS.map(({ id, label, icon: i }) => `<button class="seg sub k-${id}" role="tab" data-act="life" data-val="${id}" aria-selected="${String(area === id)}">${icon(i, 17)}${label}</button>`).join('')}</div>
    <div class="flow" style="margin-top:6px" role="tabpanel" aria-label="${current?.label ?? ''}">${body}</div></div>`;
}
