/* Calendar cards: Up next (Today's compact card) and a day's schedule (live Now line, proportional free gaps, past
   fades and shrinks). */
import { addDays, type DateString } from '../../dates/index.ts';
import type { BoardEvent } from '../board-model.ts';
import { eventColor, eventsOn, liveCalendar } from './calendar-feed.ts';
import { clock, minutesNow } from './clock.ts';
import { clockLabel, durationText, escapeHtml } from './format.ts';
import { icon } from './icons.ts';
import { goLink } from './sections.ts';
import { model } from './state.ts';

const CALENDAR_REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  needs_reauth: 'Google Calendar needs reconnecting. Reconnect it in claude.ai Settings → Connectors.',
  server_not_connected: 'Add Google Calendar in claude.ai Settings → Connectors to see your day here.',
  selection_required: 'Pick which Google Calendar to use when claude.ai asks.',
  blocked_by_policy: 'Your organization blocks Google Calendar here.',
  server_not_found: 'Google Calendar isn\'t available right now. Reconnect it in Settings → Connectors.',
  approval_required: 'Lifeboard needs your OK to read Google Calendar.',
};
/** Crosses noon: label the start with AM/PM too. */
const crossesNoon = (a: number, b: number): boolean => (a < 720) !== (b < 720);

export function upNextCard(): string {
  const head = (right = ''): string => `<div class="un-h"><h3 class="un-t">${icon('calendar', 15)} Up next</h3>${right}</div>`;
  if (liveCalendar.error) {
    const msg = CALENDAR_REFUSAL_MESSAGES[liveCalendar.error] ?? '';
    return `<section class="sec z-now un" aria-label="Up next">${head()}<div class="card un-c"><p class="un-msg">${escapeHtml(msg)}</p>${liveCalendar.error === 'approval_required' ? '<button class="btn sm" data-act="cal-allow">Show my calendar</button>' : ''}</div></section>`;
  }
  if (!model.calendarSynced) return '';
  const now = minutesNow(), ev = eventsOn(model.events, clock.today), tm = eventsOn(model.events, addDays(clock.today, 1));
  const current = ev.timed.filter((e) => e.startMinute <= now && e.endMinute > now), next = ev.timed.filter((e) => e.startMinute > now);
  const lead = current[0] ?? next[0], rest = (current[0] ? current.slice(1).concat(next) : next.slice(1)).slice(0, 2);
  const more = (current[0] ? current.length - 1 + next.length : next.length - 1) - rest.length;
  const dot = (e: BoardEvent): string => `<i class="un-dot" style="--c:${eventColor(e)}"></i>`;
  const allDay = ev.allDay.length ? `<p class="un-ad">${ev.allDay.map((e) => `<span>${dot(e)}${escapeHtml(e.title)}</span>`).join('')}</p>` : '';
  let body: string;
  if (lead) {
    const when = current[0] ? `now · until ${clockLabel(lead.endMinute)}` : `${lead.endMinute > lead.startMinute ? clockLabel(lead.startMinute, crossesNoon(lead.startMinute, lead.endMinute % 1440)) + '–' + clockLabel(lead.endMinute) : clockLabel(lead.startMinute)} · <b>in ${durationText(lead.startMinute - now)}</b>`;
    body = `<div class="un-lead" style="--c:${eventColor(lead)}"><p class="un-n">${escapeHtml(lead.title)}</p><p class="un-w num">${when}</p></div>
      ${rest.map((e) => `<div class="un-r">${dot(e)}<span class="un-rt">${escapeHtml(e.title)}</span><span class="num">${clockLabel(e.startMinute)}</span></div>`).join('')}${more > 0 ? `<p class="un-more">+${String(more)} more today</p>` : ''}`;
  } else body = `<p class="un-msg">Nothing else on the calendar today.</p>`;
  const first = tm.timed[0] ?? tm.allDay[0], tomorrowCount = tm.timed.length + tm.allDay.length;
  const peek = `<p class="un-tm">Tomorrow: ${first ? `${first.allDay ? '' : clockLabel(first.startMinute) + ' '}<b>${escapeHtml(first.title)}</b>${tomorrowCount > 1 ? ` +${String(tomorrowCount - 1)}` : ''}` : 'nothing yet'}</p>`;
  return `<section class="sec z-now un" aria-label="Up next">${head(goLink('Month', 'plan'))}<div class="card un-c">${allDay}${body}${peek}</div></section>`;
}

export function scheduleCard(day: DateString, isToday: boolean): string {
  const { allDay, timed } = eventsOn(model.events, day), now = isToday ? minutesNow() : -1;
  if (!model.calendarSynced) return `<div class="card"><p class="empty">Your calendar hasn't synced yet. Events show here once a calendar copy is saved.</p></div>`;
  if (!allDay.length && !timed.length) return `<div class="card"><p class="empty">Nothing on the calendar. ${isToday ? 'Wide open.' : ''}</p></div>`;
  const rows: string[] = [];
  let placed = !isToday;
  const nowRow = (): string => { placed = true; return `<div class="nowline" role="note" aria-label="Now, ${clockLabel(now)}"><span class="t num">${clockLabel(now)}</span><span class="dot"></span><span class="ln"></span></div>`; };
  const gapRow = (a: number, b: number, past: boolean): string => `<div class="gap${past ? ' past' : ''}" style="--h:${String(past ? 12 : Math.round(Math.min(84, Math.max(32, (b - a) * 0.35))))}px"><span></span><span class="bar-c"></span><span class="gl">${past ? `<span class="sr">Free ${clockLabel(a)} to ${clockLabel(b)}, passed</span>` : `<b class="num">${durationText(b - a)}</b> free, ${clockLabel(a, crossesNoon(a, b))}–${clockLabel(b)}`}</span></div>`;
  const pushGap = (a: number, b: number): void => {
    if (b - a < 45) return;
    if (!placed && now >= a && now < b) { rows.push(gapRow(a, now, true)); rows.push(nowRow()); if (b - now >= 30) rows.push(gapRow(now, b, false)); return; }
    rows.push(gapRow(a, b, isToday && b <= now));
  };
  let cur = Math.min(480, timed[0] ? timed[0].startMinute : 480);
  if (!placed && now < cur) rows.push(nowRow());
  for (const e of timed) {
    pushGap(cur, e.startMinute);
    if (!placed && now < e.startMinute) rows.push(nowRow());
    const isNow = isToday && now >= e.startMinute && now < e.endMinute, past = isToday && now >= e.endMinute;
    if (isNow) placed = true;
    rows.push(`<div class="ev${isNow ? ' now' : past ? ' past' : ''}" style="--c:${eventColor(e)}"><span class="t num">${clockLabel(e.startMinute)}<span>${clockLabel(e.endMinute)}</span></span><span class="bar-c"></span>
      <span><span class="et">${escapeHtml(e.title)} ${isNow ? '<span class="chip hot">Now</span>' : past ? '<span class="sr">(finished)</span>' : ''}</span><span class="es" style="display:block">${durationText(e.endMinute - e.startMinute)}${e.location ? ' · ' + escapeHtml(e.location) : ''}${e.calendar ? ' · ' + escapeHtml(e.calendar) : ''}</span></span></div>`);
    cur = Math.max(cur, e.endMinute);
  }
  if (cur < 1080) pushGap(cur, 1080);
  if (!placed) rows.push(nowRow());
  return `<div class="card">${allDay.length ? `<div class="allday">${allDay.map((e) => `<span class="adchip" style="--c:${eventColor(e)}">${escapeHtml(e.title)}</span>`).join('')}</div>` : ''}${rows.join('')}</div>`;
}
