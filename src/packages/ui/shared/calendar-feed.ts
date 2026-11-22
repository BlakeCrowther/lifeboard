/* Calendar events: live from the Google Calendar connector when the page may use it, else the saved snapshot
   (snapshots/calendar). liveCalendar holds the live side; refreshBoard prefers it. */
import { addDays, type DateString } from '../../dates/index.ts';
import type { AllDayEvent, BoardEvent, TimedEvent } from '../board-model.ts';
import type { McpCapability } from './artifact-runtime.ts';

export const liveCalendar = {
  /** null until the connector delivers (or after it refuses) */
  events: null as BoardEvent[] | null,
  fetchedAt: null as number | null,
  /** a refusal the Up next card explains (needs_reauth, approval_required…) */
  error: null as string | null,
  /** the day the watch was started for */
  day: null as DateString | null,
  stopWatching: null as (() => void) | null,
  mcp: null as McpCapability | null,
};

/** Google Calendar's list_events reply as a calendar snapshot: cancelled, declined and working-location events dropped. */
export function snapshotFromGoogle(payload: unknown): { events: object[] } {
  const p = payload && typeof payload === 'object' ? (payload as { events?: unknown; items?: unknown }) : null;
  const items: unknown[] = Array.isArray(p?.events) ? p.events : Array.isArray(p?.items) ? p.items : [];
  type GoogleEvent = { id?: unknown; summary?: unknown; status?: unknown; eventType?: unknown; colorId?: unknown; location?: unknown; attendees?: unknown; start?: { dateTime?: unknown; date?: unknown }; end?: { dateTime?: unknown; date?: unknown } };
  return {
    events: (items as (GoogleEvent | null)[])
      .filter((e): e is GoogleEvent => !!e && e.status !== 'cancelled'
        && !(Array.isArray(e.attendees) && (e.attendees as ({ self?: unknown; responseStatus?: unknown } | null)[]).some((a) => a?.self && a.responseStatus === 'declined'))
        && e.eventType !== 'WORKING_LOCATION')
      .map((e) => {
        const start = e.start || {}, end = e.end || {};
        return { id: e.id, title: e.summary, start: start.dateTime || start.date, end: end.dateTime || end.date, all_day: !start.dateTime && !!start.date, calendar: e.colorId || '', location: e.location };
      }),
  };
}

/** A day's events: all-day ones covering it, and timed ones starting that day by start time. */
export function eventsOn(events: BoardEvent[], day: DateString): { allDay: AllDayEvent[]; timed: TimedEvent[] } {
  const allDay = events.filter((e): e is AllDayEvent => !!e.allDay && day >= e.date && day < addDays(e.date, e.days || 1));
  const timed = events.filter((e): e is TimedEvent => !e.allDay && e.date === day).sort((a, b) => a.startMinute - b.startMinute);
  return { allDay, timed };
}

const CALENDAR_COLORS = ['var(--cal-a)', 'var(--cal-b)', 'var(--cal-c)'];
/** An event's color: its own, else one of three picked by calendar name. */
export function eventColor(e: BoardEvent): string {
  if (e.color) return e.color;
  let h = 0;
  for (const ch of e.calendar) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return CALENDAR_COLORS[Math.abs(h) % 3] ?? '';
}
