/* The Plan tab: a month grid (events and task-due dots) and the chosen day's schedule and tasks. */
import { MONTH_NAMES, addDays, datePartsOf, longDate, shortDate, weekdayOf } from '../../dates/index.ts';
import { eventColor, eventsOn } from '../shared/calendar-feed.ts';
import { clock, relativeDay, weekdayName } from '../shared/clock.ts';
import { escapeHtml, plural } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { scheduleCard } from '../shared/schedule.ts';
import { areaHeader, sectionHeader } from '../shared/sections.ts';
import { model, viewState } from '../shared/state.ts';
import { taskRow } from '../shared/task-row.ts';
import { effectiveDateOf } from '../shared/tasks.ts';

export function viewPlan(): string {
  const first = datePartsOf(viewState.calendarMonth), year = first.year, month = first.month - 1;
  const start = addDays(viewState.calendarMonth, -((first.weekday + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const sixth = cells[35];
  const weeks = sixth && datePartsOf(sixth).month - 1 !== month ? 35 : 42;
  const sel = viewState.calendarDay;
  const dueOn = (d: string): boolean => model.tasks.some((t) => !t.done && effectiveDateOf(t) === d);
  const dayTasks = model.tasks.filter((t) => !t.done && effectiveDateOf(t) === sel);
  const monthName = `${MONTH_NAMES[month] ?? ''} ${String(year)}`;
  const dayCell = (d: string): string => {
    const x = eventsOn(model.events, d), n = x.allDay.length + x.timed.length, hasTask = dueOn(d);
    const dots = [...x.allDay, ...x.timed].slice(0, 3).map((e) => `<i style="--c:${eventColor(e)}"></i>`).join('') + (hasTask ? '<i style="--c:var(--accent)"></i>' : '');
    return `<button class="day${datePartsOf(d).month - 1 !== month ? ' out' : ''}${d === clock.today ? ' today' : ''}" data-act="day" data-d="${d}" aria-pressed="${String(d === sel)}" aria-label="${longDate(d)}${n ? ', ' + plural(n, 'event') : ''}${hasTask ? ', tasks due' : ''}"><span class="num">${String(datePartsOf(d).day)}</span><span class="dd">${dots}</span></button>`;
  };
  const legend = [...new Map(model.events.map((e) => [e.calendar || 'Calendar', eventColor(e)])).entries()].slice(0, 6).map(([k, c]) => `<span><i style="background:${c};border-radius:50%"></i>${escapeHtml(k)}</span>`).join('');
  const rel = relativeDay(sel);
  const dayTitle = sel === clock.today ? 'Today' : rel === weekdayName(weekdayOf(sel)) || /^(Tomorrow|Yesterday)$/.test(rel) ? rel : shortDate(sel);
  return `${areaHeader('plan', 'calendar', 'Plan', 'Your month, and what lands on each day.')}
    <div class="split"><div class="col"><section class="sec" style="margin-top:6px"><div class="card pad">
      <div class="cal-h"><button class="iconbtn" data-act="cal" data-dir="-1" aria-label="Previous month">${icon('chevL')}</button><h3 aria-live="polite">${monthName}</h3><button class="iconbtn" data-act="cal" data-dir="1" aria-label="Next month">${icon('chevR')}</button></div>
      <div class="grid7" role="grid" aria-label="${monthName}">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="wdh" aria-hidden="true">${d}</span>`).join('')}
      ${cells.slice(0, weeks).map(dayCell).join('')}</div>
      <div class="legend" style="margin-top:12px">${legend}<span><i style="background:var(--accent);border-radius:50%"></i>Task due</span></div>
    </div></section></div>
    <div class="col"><section class="sec">${sectionHeader(dayTitle, `<span class="small muted">${longDate(sel)}</span>`)}
      ${scheduleCard(sel, sel === clock.today)}
      <div class="group-l" style="margin-top:14px">Tasks on this day <span class="ct num">${String(dayTasks.length)}</span></div>
      ${dayTasks.length ? `<div class="card"><ul class="list">${dayTasks.map((t) => taskRow(t)).join('')}</ul></div>` : `<p class="empty tiny" style="padding:2px 4px">No tasks land here. The + button adds one on ${shortDate(sel)}.</p>`}
    </section></div></div>`;
}
