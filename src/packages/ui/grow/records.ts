/* Grow → Habits: one stats band, one Records card (habits | rings), and with the game on the logbook.
   Rings: done ÷ committed per day (tasks package ringTally; a rescheduled task only keeps its latest date, so older weeks
   are approximate). */
import { addDays, datePartsOf, type DateString } from '../../dates/index.ts';
import type { GameState } from '../../game/derive.ts';
import { loadedGarden } from '../game/game-modules.ts';
import type { BoardHabit } from '../board-model.ts';
import { clock, habitWeekOf, lastDayOfHabitWeek, monthShortName } from '../shared/clock.ts';
import { escapeHtml } from '../shared/format.ts';
import { statsOf } from '../shared/habit-weeks.ts';
import { fold } from '../shared/sections.ts';
import { model, viewState } from '../shared/state.ts';
import { effectiveDateOf } from '../shared/tasks.ts';
import { boardRingTally } from '../today/week-rings.ts';
import { habitVerdict, type VerdictKind } from './habit-review.ts';

interface RingHistoryDay { d: DateString; n: number; due: number; future: boolean; today: boolean }
interface RingHistoryWeek { m: DateString; cur: boolean; days: RingHistoryDay[]; closed: number; done: number; due: number }
function ringHistory(weeks: number): RingHistoryWeek[] {
  const tally = boardRingTally(), thisWeek = habitWeekOf(clock.today), rows: RingHistoryWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const m = addDays(thisWeek, -7 * i), days: RingHistoryDay[] = [];
    for (let k = 0; k < 7; k++) { const d = addDays(m, k), x = tally[d]; days.push({ d, n: x?.done || 0, due: x?.committed || 0, future: d > clock.today, today: d === clock.today }); }
    const past = days.filter((x) => !x.future);
    rows.push({ m, cur: i === 0, days, closed: past.filter((x) => x.due && x.n >= x.due).length, done: past.reduce((n, x) => n + x.n, 0), due: past.reduce((n, x) => n + x.due, 0) });
  }
  return rows;
}
const weekLabel = (m: DateString): string => { const p = datePartsOf(m); return `${monthShortName(p.month)} ${String(p.day)}`; };

export function growBand(g: GameState | null): string {
  const hs = model.habits.map((h) => ({ h, st: statsOf(h) }));
  const habitsDone = hs.reduce((n, x) => n + Math.min(x.st.week, x.h.target), 0), habitsTotal = hs.reduce((n, x) => n + x.h.target, 0), safe = hs.filter((x) => x.st.week >= x.h.floor).length;
  const rows = ringHistory(12), cur = rows[rows.length - 1], past = rows.slice(0, -1), firstWeek = rows[0]?.m ?? clock.today;
  const avg = (f: (r: RingHistoryWeek) => number): string => (past.reduce((n, r) => n + f(r), 0) / past.length).toFixed(1);
  const dueTasks = model.tasks.filter((t) => { const e = effectiveDateOf(t); return e && e >= firstWeek && e <= clock.today; }), met = dueTasks.filter((t) => t.done).length;
  const garden = g ? loadedGarden() : undefined;
  const tiles: { n: string | number; l: string; s: string }[] = [
    { n: `${String(habitsDone)}<small>/${String(habitsTotal)}</small>`, l: 'Habit sessions', s: `${String(safe)} of ${String(hs.length)} streaks safe` },
    { n: cur?.closed ?? 0, l: 'Rings closed', s: `this week · avg ${avg((r) => r.closed)}` },
    { n: `${String(cur?.done ?? 0)}<small>/${String(cur?.due ?? 0)}</small>`, l: 'Done / committed', s: `this week · avg ${avg((r) => r.done)} done` },
    { n: dueTasks.length ? String(Math.round((met / dueTasks.length) * 100)) + '<small>%</small>' : '–', l: 'Due tasks done', s: `${String(met)} of ${String(dueTasks.length)}, 12 weeks` },
    ...(g && garden ? garden.gardenTiles(g).map((t) => ({ ...t, s: escapeHtml(t.s) })) : []),
  ];
  return `<section class="sec"><div class="card pad"><div class="gsts">${tiles.map((t) => `<div class="gst"><b class="num">${String(t.n)}</b><span>${t.l}</span><small>${t.s}</small></div>`).join('')}</div></div></section>`;
}

const ATTENTION_ORDER: Partial<Record<VerdictKind, number>> = { work: 0, lower: 1, raise: 2 };
function habitRecords(): string {
  const rows = model.habits.map((h) => { const st = statsOf(h); return { h, st, verdict: habitVerdict(h, st) }; });
  const attention = rows.filter((r) => ATTENTION_ORDER[r.verdict.kind] != null).sort((a, b) => (ATTENTION_ORDER[a.verdict.kind] ?? 0) - (ATTENTION_ORDER[b.verdict.kind] ?? 0));
  const level = (h: BoardHabit, n: number): number => { const f = h.daily ? 7 * h.floor : h.floor, t = h.daily ? 7 * h.target : h.target; return n <= 0 ? 0 : n < f ? 1 : n < t ? 2 : n === t ? 3 : 4; };
  const arrow = (weeks: number, trend: number): string => (weeks < 8 ? '<span class="trf">–</span>' : trend > 0.4 ? '<span class="tru" title="Trending up">↑</span>' : trend < -0.4 ? '<span class="trd" title="Trending down">↓</span>' : '<span class="trf" title="Steady">→</span>');
  const pct = (x: number | null): string => (x == null ? '–' : String(Math.round(x * 100)) + '%');
  const firstWeeks = rows[0]?.st.weeks ?? [];
  return `<div class="tg" role="table" aria-label="Sessions per week, last 12 weeks">
      <span></span>${firstWeeks.map((w, i) => `<span class="h">${w.cur ? 'now' : (11 - i) % 4 === 0 ? weekLabel(w.m) : ''}</span>`).join('')}<span class="h">hit</span><span class="h">trend</span>
      ${rows.map(({ h, st, verdict: v }) => `<button type="button" class="nm" data-act="edit-habit" data-id="${h.id}" title="${escapeHtml(h.name)}: target ${String(h.target)}, floor ${String(h.floor)}${st.streak ? `, ${String(st.streak)}-week streak (best ${String(st.best)})` : ''}. Tap to edit.">${escapeHtml(h.name)}</button>${st.weeks.map((w) => `<span class="c l${String(level(h, w.n))}${w.cur ? ' cur' : ''}" title="Week of ${weekLabel(w.m)}: ${String(w.n)} of ${String(h.target)}">${w.n ? String(w.n) : ''}</span>`).join('')}<span class="s${v.hitRate == null ? '' : v.hitRate >= 0.7 ? ' good' : v.hitRate < 0.4 ? ' bad' : ''}">${pct(v.hitRate)}</span><span class="tr">${arrow(v.weeks, v.trend)}</span>`).join('')}
    </div>
    <div class="legend" style="margin-top:10px"><span><i></i>None</span><span><i class="l1"></i>Below floor</span><span><i class="floor"></i>Floor</span><span><i class="hit"></i>Target</span><span><i class="l4"></i>Above target</span></div>
    ${attention.length ? `<ul class="recn">${attention.map(({ h, verdict: v }) => `<li><span class="vchip ${v.kind}">${escapeHtml(v.title)}</span><span><b>${escapeHtml(h.name)}</b> ${escapeHtml(v.why)} <button type="button" class="link" data-act="edit-habit" data-id="${h.id}">Adjust</button></span></li>`).join('')}</ul>` : ''}
    <p class="wcnote">Hit % and suggestions use closed weeks since each habit's first session. Weeks close ${lastDayOfHabitWeek()} night.</p>`;
}
function ringRecords(): string {
  const rows = ringHistory(12), level = (x: RingHistoryDay): string => (x.future ? ' fut' : !x.due ? '' : x.n <= 0 ? ' l0' : x.n < x.due ? ' l1' : ' l3');
  return `<div class="tg rg" role="table" aria-label="Tasks finished per day, last 12 weeks">
      <span></span>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="h">${d}</span>`).join('')}<span class="h">rings</span><span class="h">done/due</span>
      ${rows.map((r) => `<span class="nm">${r.cur ? 'This week' : weekLabel(r.m)}</span>${r.days.map((x) => `<span class="c${level(x)}${x.today ? ' cur' : ''}" title="${x.d}: ${String(x.n)} of ${String(x.due)} done">${x.future || !x.n ? '' : String(x.n)}</span>`).join('')}<span class="s">${String(r.closed)}</span><span class="s${r.done >= r.due ? ' good' : ''}">${String(r.done)}/${String(r.due)}</span>`).join('')}
    </div>
    <div class="legend" style="margin-top:10px"><span><i></i>None</span><span><i class="l1"></i>Part done</span><span><i class="hit"></i>Ring closed</span></div>
    <p class="wcnote">A ring closes when everything committed that day is done: tasks due that day, plus anything you finish. Overdue tasks count once you move them to a day. Older weeks are approximate (a rescheduled task only keeps its latest date).</p>`;
}
export function recordsCard(): string {
  const mode = viewState.recordsView === 'rings' ? 'rings' : 'habits';
  const seg = `<div class="seg" role="tablist" aria-label="Records">${[['habits', 'Habits'], ['rings', 'Rings']].map(([k, l]) => `<button role="tab" data-act="rec" data-val="${k ?? ''}" aria-selected="${String(mode === k)}">${l ?? ''}</button>`).join('')}</div>`;
  return `<section class="sec"><div class="sec-h"><h3 class="sec-t">Records <span class="ct">12 weeks</span></h3>${seg}</div><div class="card tgc">${mode === 'habits' ? habitRecords() : ringRecords()}</div></section>`;
}
export function gameLogbook(g: GameState): string {
  const garden = loadedGarden();
  if (!garden) return '';
  const items = garden.logbookItems(g), first = items[0];
  return fold('logbook', 'Logbook', { openByDefault: false, count: items.length, summary: first ? `${garden.formatShortDate(first.d)} · ${escapeHtml(first.t)}` : '', body: `<div class="card pad">${garden.logbookHTML(items.slice(0, 40))}</div>` });
}
