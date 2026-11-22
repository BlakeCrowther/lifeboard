/* Week of rings: each day's ring = tasks done ÷ tasks committed (tasks package ringTally, SPEC.md "Ring %"); today
   fills live. Tapping a day opens its tasks below the rings. */
import { addDays, daysBetween, type DateString } from '../../dates/index.ts';
import { dateOfInstant } from '../../dates/clock.ts';
import { missedTaskStatus, ringPercent, ringTally, type RingDay } from '../../tasks/index.ts';
import type { BoardTask } from '../board-model.ts';
import { clock, relativeDay, weekdayName, weekdayShortName } from '../shared/clock.ts';
import { escapeHtml } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { ringTasksOpenByDefault } from '../shared/media.ts';
import { isFoldOpen, setFoldOpen } from '../shared/prefs.ts';
import { render } from '../shared/redraw.ts';
import { sectionHeader } from '../shared/sections.ts';
import { model, viewState } from '../shared/state.ts';
import { taskRow, type TaskRowOptions } from '../shared/task-row.ts';
import { effectiveDateOf } from '../shared/tasks.ts';
import { weekdayOf } from '../../dates/index.ts';

/** today's done count at the last render: the ring sweeps only when it grows */
let lastDoneToday: number | null = null;
/* completion step for ring color: p1 under a third, p2 under two thirds, p3 almost there, p4 done */
const ringStep = (f: number): string => (f >= 1 ? 'p4' : f >= 2 / 3 ? 'p3' : f >= 1 / 3 ? 'p2' : 'p1');
const doneDateOf = (t: BoardTask): DateString | null => (t.done && t.doneAt ? dateOfInstant(t.doneAt) : null);
export const boardRingTally = (): Record<DateString, RingDay> => ringTally(model.tasks.map((t) => ({ eff: effectiveDateOf(t), doneDate: doneDateOf(t), days: t.days })));
/* tasks a past day committed to (committed_days, else its current date for tasks never tracked) */
const committedOn = (t: BoardTask, d: DateString): boolean => (t.days.length ? t.days.includes(d) : effectiveDateOf(t) === d);
/* a missed task's status now: done late, moved to another date, or still sitting on a past date (overdue/slipped) */
function missedStatus(t: BoardTask, d: DateString): string {
  if (t.done) return `<span class="m">${icon('check', 15)}Done late · ${t.doneAt ? relativeDay(dateOfInstant(t.doneAt)) : ''}</span>`;
  const st = missedTaskStatus({ due_date: t.due, deadline_date: t.deadline, done: false }, d, clock.today);
  if (st.kind === 'moved') return st.to ? `<span class="m hot">Moved ${icon('arrow', 13)} ${relativeDay(st.to)}</span>` : '<span class="m hot">Moved · no date</span>';
  if (st.kind === 'done_late') return '';
  return `<span class="m bad">${st.movedTo ? `Moved ${icon('arrow', 13)} ${relativeDay(st.movedTo)} · ` : ''}${st.kind === 'overdue' ? 'Overdue' : 'Slipped'}</span>`;
}
/* a past day's tasks: what got done that day, then what it committed to and missed */
function pastDayTasks(d: DateString): string {
  const doneOn = (t: BoardTask): boolean => doneDateOf(t) === d;
  const done = model.tasks.filter(doneOn).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
  const missed = model.tasks.filter((t) => { const dd = doneDateOf(t); return !doneOn(t) && committedOn(t, d) && !(dd && dd < d); });
  const list = (title: string, a: BoardTask[], opts: (t: BoardTask) => TaskRowOptions, empty: string): string => `<section class="sec t1">${sectionHeader(title, '', 1, a.length)}<div class="card">${a.length ? `<ul class="list">${a.map((t) => taskRow(t, opts(t))).join('')}</ul>` : `<p class="empty">${empty}</p>`}</div></section>`;
  return list('Done', done, () => ({}), 'Nothing finished that day.') + list('Missed', missed, (t) => ({ status: missedStatus(t, d) }), 'Nothing missed.');
}
export const ringTasksOpen = (): boolean => isFoldOpen('rtasks', ringTasksOpenByDefault());
/** Folds the ring card's task panel and brings the card back into view (the panel can run several screens long). */
export function collapseRingTasks(): void {
  setFoldOpen('rtasks', false);
  render();
  setTimeout(() => {
    const c = document.querySelector('.card.rings'), y = c?.getBoundingClientRect().top;
    if (y != null && y < 60) scrollTo(0, Math.max(0, scrollY + y - 60));
  }, 0);
}

/** A count tile above the panel: tapping one opens the panel at that list. */
export interface RingTile {
  key: string;
  count: number;
  label: string;
  /** tone class: bad, hot */
  tone?: string;
  /** the section to scroll to */
  target: string;
  /** shown at zero too */
  always?: boolean;
}
export function weekRings(panelHtml: string, ringTiles: RingTile[]): string {
  const tally = boardRingTally(), C = 100.5, days: DateString[] = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(clock.today, -i));
  const sel = days.includes(viewState.ringDay) ? viewState.ringDay : clock.today, open = ringTasksOpen();
  const lastFull = days.slice(0, 6).reverse().find((d) => (ringPercent(tally[d]) ?? 0) >= 1);
  const t0 = tally[clock.today] ?? { done: 0, committed: 0 }, n0 = t0.done, left = t0.committed - t0.done;
  const grew = lastDoneToday != null && n0 > lastDoneToday;
  lastDoneToday = n0;
  const msg = !t0.committed ? `Nothing due today. Anything you finish fills the ring.${lastFull ? ` Last full one: ${daysBetween(lastFull, clock.today) === 1 ? 'yesterday' : weekdayName(weekdayOf(lastFull))}.` : ''}`
    : left <= 0 ? `Today's ring is closed: ${String(n0)} of ${String(t0.committed)} done.`
    : `${String(n0)} of ${String(t0.committed)} done. ${String(left)} more to close today's ring.`;
  const cells = days.map((d) => {
    const x = tally[d] ?? { done: 0, committed: 0 }, n = x.done, f = ringPercent(x) || 0, today = d === clock.today, full = f >= 1;
    const committed = x.committed ? String(x.committed) : '';
    return `<li class="wr ${ringStep(f)}${today ? ' now' : ''}${today && grew ? ' grew' : ''}${full ? ' full' : ''}${open && d === sel ? ' sel' : ''}"><button class="wb" data-act="ring-day" data-val="${d}" aria-pressed="${String(open && d === sel)}" aria-label="${today ? 'Today' : weekdayName(weekdayOf(d))}: ${String(n)} of ${String(x.committed)} done${full ? ', ring closed' : ''}. Show tasks"><span class="wl">${today ? 'Today' : weekdayShortName(weekdayOf(d))}</span>
      <span class="wc"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="wt" cx="20" cy="20" r="16"/><circle class="wa" cx="20" cy="20" r="16" stroke-dasharray="${String(C)}" stroke-dashoffset="${(C - C * f).toFixed(1)}" transform="rotate(-90 20 20)"/></svg><b class="num${(String(n) + committed).length > 3 ? ' sm' : ''}"><span>${String(n)}${x.committed ? `<small>/${committed}</small>` : ''}</span></b></span></button></li>`;
  }).join('');
  const tiles = ringTiles.filter((x) => x.count || x.always).map((x) => `<button class="rt-tile${x.tone ? ' ' + x.tone : ''}${x.count ? '' : ' zero'}" data-act="ring-tile" data-val="${x.key}" data-id="${x.target}" aria-label="${String(x.count)} ${x.label}. Show them"><b class="num">${String(x.count)}</b><span>${x.label}</span></button>`).join('');
  const what = sel === clock.today ? 'Today' : relativeDay(sel) === 'yesterday' ? 'Yesterday' : weekdayName(weekdayOf(sel));
  const toggle = `<div class="rt-tiles">${tiles}</div><button class="rt-b" data-act="ring-tasks" aria-expanded="${String(open)}" aria-controls="rtasks"><span class="rt-t">${open ? (sel === clock.today ? 'Hide tasks' : `Hide ${what}'s tasks`) : 'All tasks'}</span>${icon(open ? 'up' : 'chevD', 16)}${open ? '<kbd class="rt-k">Esc</kbd>' : ''}</button>`;
  const body = open ? `<div class="rt-body" id="rtasks">${sel === clock.today ? panelHtml : pastDayTasks(sel)}</div>` : '';
  return `<section class="sec z-now" aria-label="Tasks done of tasks committed, last seven days"><div class="card rings${open ? ' open' : ''}"><ol class="wrow">${cells}</ol><p class="wmsg">${escapeHtml(msg)}</p>${toggle}${body}</div></section>`;
}
