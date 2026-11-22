/* The Today tab: day strip, Up next, the week of rings with today's task lists, suggestions, and (right column) the
   Ecosystem with its lessons, habits (garden or rings) and At a glance. */
import { textOf } from '../shared/format.ts';
import { addDays, daysBetween, longDate } from '../../dates/index.ts';
import { dateOfInstant } from '../../dates/clock.ts';
import { lessonCard } from '../game/lessons.ts';
import type { BoardTask } from '../board-model.ts';
import { eventsOn } from '../shared/calendar-feed.ts';
import { clock, dayLabel, habitWeekOf, minutesNow, relativeDay } from '../shared/clock.ts';
import { clockLabel, escapeHtml, plural, readingOrDash } from '../shared/format.ts';
import { statsOf } from '../shared/habit-weeks.ts';
import { icon } from '../shared/icons.ts';
import { ecosystemOn } from '../shared/prefs.ts';
import { upNextCard } from '../shared/schedule.ts';
import { fold } from '../shared/sections.ts';
import { model, profile, viewState } from '../shared/state.ts';
import { taskRow, type TaskRowOptions } from '../shared/task-row.ts';
import { bucketsOf, effectiveDateOf, stateOf } from '../shared/tasks.ts';
import { ruleShortLabel } from '../shared/writes.ts';
import { gardenHabits, habitRings, type HabitTile } from './habit-cards.ts';
import { weekRings } from './week-rings.ts';

const text = textOf;
function greeting(): string {
  const h = Math.floor(minutesNow() / 60);
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
interface DaySummary { due: number; late: number; events: number; next: string | null }
function daySummary(): DaySummary {
  const b = bucketsOf(model.tasks), ev = eventsOn(model.events, clock.today), now = minutesNow();
  const late = b.urgent.filter((t) => stateOf(t).overdue).length;
  const next = ev.timed.find((e) => e.startMinute > now);
  return { due: b.urgent.length, late, events: ev.timed.length + ev.allDay.length, next: next ? clockLabel(next.startMinute) : null };
}
/** '3 due · 2 events · next 4 PM' (the day strip and the scrolled header bar). */
export function daySummaryHtml(): string {
  const x = daySummary();
  return `<span class="hotc${x.late ? ' late' : ''}">${String(x.due)} due</span>${model.calendarSynced ? ` <span class="sep">·</span> <span>${plural(x.events, 'event')}</span> <span class="sep">·</span> <span>${x.next ? 'next ' + x.next : 'nothing later'}</span>` : ''}`;
}

const CAP = 5;
export function viewToday(): string {
  const today = clock.today;
  const big = model.countdownsByKind.big.find((w) => w.date >= today);
  const cond = model.conditions, w = cond?.weather ?? null, sf = cond?.surf ?? null;
  const nextTide = cond?.tides.length ? cond.tides.find((t) => t.upcoming) ?? cond.tides[0] : null;
  const b = bucketsOf(model.tasks);
  const doneToday = model.tasks.filter((t) => t.done && t.doneAt && dateOfInstant(t.doneAt) === today).sort((x, y) => (x.doneAt ?? 0) - (y.doneAt ?? 0));
  const rows = (l: BoardTask[], o: TaskRowOptions = { grip: true }): string => l.map((t) => taskRow(t, o)).join('');
  const none = !model.tasks.length;
  const eff = (t: BoardTask): string => effectiveDateOf(t) ?? '';
  /* tier 1: needs me now. Past their day: Overdue (deadline, or due date with no deadline, passed) and Slipped (due date
     passed, deadline still ahead); then Today. Neither past list counts against today's ring until pulled into today. */
  const carried = b.urgent.filter((t) => eff(t) < today), dueToday = b.urgent.filter((t) => eff(t) >= today);
  const late = carried.filter((t) => stateOf(t).overdue), slipped = carried.filter((t) => !stateOf(t).overdue);
  const moveAll = carried.length ? `<button class="link" data-act="carry-all">Move all ${icon('arrow', 16)} Tomorrow</button>` : '';
  /* every list in the ring card folds; closed, its header shows the first task */
  const firstOf = (a: BoardTask[]): string => (a[0] ? `<b>${escapeHtml(a[0].title)}</b>${a.length > 1 ? ` +${String(a.length - 1)}` : ''}` : 'nothing here');
  const pastSection = (key: string, title: string, a: BoardTask[], link: string): string => a.length ? fold(key, title, { tier: 1, zone: 'z-due carried', id: 'sec-' + key, count: a.length, summary: firstOf(a), link,
    body: `<div class="card"><ul class="list" data-bucket="urgent">${rows(a)}</ul></div>` }) : '';
  const carriedSections = pastSection('overdue', 'Overdue', late, moveAll) + pastSection('slipped', 'Slipped', slipped, late.length ? '' : moveAll);
  const due = carriedSections + fold('today', 'Today', { tier: 1, zone: 'z-due', id: 'tasks', count: dueToday.length, summary: firstOf(dueToday),
    body: `<div class="card">${dueToday.length ? `<ul class="list" data-bucket="urgent">${rows(dueToday)}</ul>` : `<p class="empty">${none ? 'No tasks yet. The + button adds your first one, with a date if it has one.' : carried.length ? 'Nothing else due today.' : 'Nothing overdue or due today. Nice.'}</p>`}</div>` });
  /* suggestions from Claude: kept out of every list until the owner keeps one. Soonest first; one shows, the rest sit
     behind a toggle (the one being adjusted always shows) */
  const sortKey = (t: BoardTask): string => effectiveDateOf(t) || '9999';
  const suggested = model.suggested.slice().sort((x, y) => (sortKey(x) < sortKey(y) ? -1 : sortKey(x) > sortKey(y) ? 1 : y.created - x.created));
  const showAll = !!viewState.expanded['sug'];
  const shown = showAll ? suggested : suggested.filter((t, i) => i === 0 || t.id === viewState.adjustingId);
  const when = (t: BoardTask): string => [t.due ? (t.due < today ? `<b class="bad">${escapeHtml(relativeDay(t.due))}</b>` : escapeHtml(relativeDay(t.due))) : '', t.deadline && t.deadline !== t.due ? `by ${escapeHtml(relativeDay(t.deadline))}` : '', t.rule ? `${icon('repeat', 13)}${escapeHtml(ruleShortLabel(t.rule))}` : ''].filter(Boolean).join(' · ');
  const suggestionRow = (t: BoardTask): string => {
    const adjusting = viewState.adjustingId === t.id, busy = viewState.adjustBusyId === t.id;
    return `<li class="sg"><div class="sgt">${icon(t.icon || 'spark', 22)} <span>${escapeHtml(t.title)}</span>${when(t) ? ` <span class="sgd">${when(t)}</span>` : ''}</div>${t.notes ? `<p class="sgw">${escapeHtml(t.notes)}</p>` : ''}
      ${t.doc.adjust_request && !adjusting ? `<p class="sgw sgq">${icon('spark', 14)} Waiting on Claude: “${escapeHtml(t.doc.adjust_request)}”</p>` : ''}
      ${adjusting ? `<form class="sgf" data-form="adj" data-id="${t.id}"><label for="adj-${t.id}">Change it, or dismiss it and say why</label><span class="sgfr"><input id="adj-${t.id}" name="v" autocomplete="off" placeholder="e.g. make it Saturday · or: dismiss, I don't need recruiter follow-ups"${busy ? 'disabled' : ''}><button class="btn primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Adjusting…' : 'Adjust'}</button></span></form>` : ''}
      <div class="sga"><button class="btn sm" data-act="sug-keep" data-id="${t.id}">${icon('arrow', 18)}Keep</button><button class="btn sm" data-act="sug-done" data-id="${t.id}" title="Already did this: marks it done and logs it">${icon('check', 18)}Done</button><button class="btn sm${adjusting ? ' on' : ''}" data-act="sug-adjust" data-id="${t.id}" aria-expanded="${String(adjusting)}">${icon('edit', 18)}${adjusting ? 'Cancel' : 'Adjust'}</button><button class="btn sm ghost" data-act="sug-drop" data-id="${t.id}">Dismiss</button></div></li>`;
  };
  const suggestions = suggested.length ? fold('sug', 'Suggested', { tier: 1, zone: 'z-sug', id: 'suggested', count: suggested.length, summary: firstOf(suggested),
    body: `<div class="card"><ul class="list sugl">${shown.map(suggestionRow).join('')}</ul>${suggested.length > 1 ? `<button class="disc" data-act="exp" data-val="sug" aria-expanded="${String(showAll)}">${icon(showAll ? 'chevD' : 'chevR', 16)}${showAll ? 'Show less' : `${String(suggested.length - 1)} more suggestion${suggested.length > 2 ? 's' : ''}`}</button>` : ''}</div>` }) : '';
  /* tier 2: working through. Today and Tomorrow show every task; This week and Later show CAP, the rest behind "Show N more" */
  const tomorrowDate = addDays(today, 1);
  const tomorrowTasks = b.week.filter((t) => eff(t) === tomorrowDate), weekTasks = b.week.filter((t) => eff(t) !== tomorrowDate);
  const nextOf = (a: BoardTask[]): string => { const first = a[0], e = first ? effectiveDateOf(first) : null; return first ? `next <b>${escapeHtml(first.title)}</b>${e ? ', ' + relativeDay(e) : ''}` : 'nothing here'; };
  const capped = (key: string, bucket: string, a: BoardTask[], empty: string): string => {
    const open = !!viewState.expanded[key], show = open ? a : a.slice(0, CAP);
    return `<div class="card">${a.length ? `<ul class="list" data-bucket="${bucket}">${rows(show)}</ul>${a.length > CAP ? `<button class="disc" data-act="exp" data-val="${key}" aria-expanded="${String(open)}">${icon(open ? 'chevD' : 'chevR', 16)}${open ? 'Show fewer' : 'Show ' + String(a.length - CAP) + ' more'}</button>` : ''}` : `<p class="empty">${empty}</p>`}</div>`;
  };
  const tomorrow = fold('tomorrow', 'Tomorrow', { zone: 'z-week', id: 'tomorrow', count: tomorrowTasks.length, summary: firstOf(tomorrowTasks), body: `<div class="card">${tomorrowTasks.length ? `<ul class="list" data-bucket="week">${rows(tomorrowTasks)}</ul>` : '<p class="empty">Nothing due tomorrow.</p>'}</div>` });
  const week = fold('week', 'This week', { zone: 'z-week', count: weekTasks.length, summary: nextOf(weekTasks), body: capped('week', 'week', weekTasks, 'Nothing else this week.') });
  const plainList = (key: string, a: BoardTask[], o?: TaskRowOptions): string => `<div class="card">${a.length ? `<ul class="list" data-bucket="${key}">${rows(a, o)}</ul>` : '<p class="empty">Nothing here.</p>'}</div>`;
  const lastDone = doneToday[doneToday.length - 1];
  const more = fold('later', 'Later', { zone: 'z-more', count: b.later.length, summary: nextOf(b.later), body: capped('later', 'later', b.later, 'Nothing later.') })
    + fold('none', 'No date yet', { zone: 'z-more', openByDefault: false, count: b.none.length, summary: b.none[0] ? `<b>${escapeHtml(b.none[0].title)}</b>${b.none.length > 1 ? ` +${String(b.none.length - 1)}` : ''}` : 'nothing here', body: plainList('none', b.none) })
    + fold('done', 'Done today', { zone: 'z-more', openByDefault: false, count: doneToday.length, summary: lastDone ? `last <b>${escapeHtml(lastDone.title)}</b>` : 'nothing finished yet', body: plainList('done', doneToday, {}) });
  const upNext = upNextCard();
  /* tier 3: at a glance. Each part shows only when its data exists; with none, the row is gone */
  const daysLeft = 7 - daysBetween(habitWeekOf(today), today);
  /* daily habits: met = today's target hit; low = today's floor still open (and the week not already broken) */
  const hs = model.habits.map((h): HabitTile => {
    const st = statsOf(h);
    if (h.daily) return { h, st, met: !st.missed && st.today >= h.target, low: !st.missed && st.today < h.floor };
    const need = h.floor - st.week;
    return { h, st, met: st.week >= h.target, low: need > 0 && daysLeft <= need + 2 };
  });
  const habitsDone = hs.reduce((n, x) => n + Math.min(x.st.week, x.h.target), 0), habitsTotal = model.habits.reduce((n, h) => n + h.target, 0);
  const bigDays = big ? daysBetween(today, big.date) : 0;
  const cells: string[] = [];
  if (w) cells.push(`<span><span class="k">Air</span><span class="v num">${readingOrDash(w['temp_f'], '°')}</span><span class="s">${escapeHtml(text(w['condition'] || '').split(',')[0])}</span></span>`);
  if (sf) cells.push(`<span><span class="k">Surf</span><span class="v num">${readingOrDash(sf['wave_ft'])}<small style="font-size:12px"> ft</small></span><span class="s">${sf['period_s'] ? escapeHtml(sf['period_s']) + 's ' : ''}${escapeHtml(sf['direction'] || '')}</span></span>`);
  if (sf && sf['water_temp_f'] != null) cells.push(`<span><span class="k">Water</span><span class="v num">${readingOrDash(sf['water_temp_f'], '°')}</span><span class="s">${escapeHtml(profile.placeName || 'Local')}</span></span>`);
  if (nextTide) cells.push(`<span><span class="k">Tide</span><span class="v num">${escapeHtml(nextTide.type)}</span><span class="s">${escapeHtml(nextTide.time)}</span></span>`);
  const conditionsGrid = cells.length ? `<button class="card cond" style="grid-template-columns:repeat(${String(cells.length)},1fr)" data-act="go" data-to="life/hobbies" aria-label="${escapeHtml(profile.place)} conditions. Open Hobbies for details.">${cells.join('')}</button>` : '';
  const bigRow = big ? `<button class="countrow" data-act="go" data-to="life/home" data-anchor="bigdays"><b class="num">${String(bigDays)}</b><span>days to ${escapeHtml(big.title)}</span>${icon('chevR', 16)}</button>` : '';
  const glanceUp = model.countdownsByKind.glance.filter((g) => g.date >= today);
  const glanceRows = glanceUp.map((g) => `<div class="countrow" title="${escapeHtml(g.detail)}"><b class="num">${String(daysBetween(today, g.date))}</b><span>days to ${escapeHtml(g.title)}</span></div>`).join('');
  const summaryBits: string[] = [];
  if (w && w['temp_f'] != null) summaryBits.push(readingOrDash(w['temp_f'], '°'));
  if (sf && sf['wave_ft'] != null) summaryBits.push(`surf <b>${readingOrDash(sf['wave_ft'])} ft</b>`);
  if (nextTide) summaryBits.push(`${escapeHtml(nextTide.type.toLowerCase())} tide ${escapeHtml(nextTide.time)}`);
  if (big) summaryBits.push(`${escapeHtml(big.kind)} ${String(bigDays)}d`);
  for (const g of glanceUp) summaryBits.push(`${escapeHtml(g.title.toLowerCase())} ${String(daysBetween(today, g.date))}d`);
  const garden = gardenHabits(hs, habitsDone, habitsTotal, daysLeft);
  const hiName = profile.name ? ', ' + escapeHtml(profile.name) : '';
  const glance = summaryBits.length || conditionsGrid ? fold('glance', 'At a glance', { tier: 3, openByDefault: false, zone: 'z-amb', summary: summaryBits.join(' · '), body: conditionsGrid + bigRow + glanceRows }) : '';
  const tiles = [
    { key: 'overdue', count: late.length, label: 'overdue', tone: 'bad', target: 'sec-overdue' },
    { key: 'slipped', count: slipped.length, label: 'slipped', tone: 'hot', target: 'sec-slipped' },
    { key: 'today', count: dueToday.length, label: 'today', target: 'tasks', always: true },
    { key: 'tomorrow', count: tomorrowTasks.length, label: 'tomorrow', target: 'tomorrow', always: true },
    { key: 'sug', count: suggested.length, label: 'suggested', target: 'suggested' },
  ];
  return `<div class="daystrip"><h2 class="sr" id="ltitle">${greeting()}${hiName}. ${longDate(today)}</h2><span class="greet" aria-hidden="true">${greeting()}${hiName}.</span><span class="d">${dayLabel(today)}</span><span class="sep">·</span>${daySummaryHtml()}</div>
    <div class="today"><div class="col a">${upNext}${weekRings(due + suggestions + tomorrow + week + more, tiles)}</div><div class="col b">${ecosystemOn() ? `<div class="les-wrap">${lessonCard()}<div class="eco-slot"></div></div>` : ''}${garden || habitRings(hs, habitsDone, habitsTotal, daysLeft)}${glance}</div></div>`;
}

