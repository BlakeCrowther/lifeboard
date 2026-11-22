/* Live Google Calendar through the mcp connector: watched for today and tomorrow, refetched every 10 minutes.
   Falls back to the saved snapshot when unavailable. */
import { addDays, type DateString } from '../../dates/index.ts';
import { timeZone } from '../../dates/clock.ts';
import { useMcp, type McpWatchEvent } from './artifact-runtime.ts';
import { eventsFromSnapshot } from '../board-model.ts';
import { liveCalendar, snapshotFromGoogle } from './calendar-feed.ts';
import { clock } from './clock.ts';
import { render } from './redraw.ts';
import { refreshBoard } from './refresh.ts';

const GOOGLE_CALENDAR = 'Google Calendar';
const listEventsInput = (d: DateString): object => ({ startTime: d + 'T00:00:00', endTime: addDays(d, 2) + 'T00:00:00', orderBy: 'startTime', pageSize: 100, timeZone: timeZone() });
/** Refusals the person can fix: the Up next card says how (not_in_manifest just falls back quietly). */
const FIXABLE_REFUSALS = ['needs_reauth', 'server_not_connected', 'selection_required', 'blocked_by_policy', 'approval_required', 'not_in_manifest', 'server_not_found'];
/** Refusals that won't change this session: stop watching, keep the snapshot. */
const FINAL_REFUSALS = ['not_granted', 'capability_disabled', 'capability_removed', 'bad_request', 'transform_error'];

function onCalendarEvent(ev: McpWatchEvent): void {
  if (ev.type === 'data') {
    liveCalendar.events = eventsFromSnapshot(snapshotFromGoogle(ev.result?.payload));
    liveCalendar.fetchedAt = ev.result?.cache ? (ev.result.cache.storedAt ?? null) : Date.now();
    liveCalendar.error = null;
  } else {
    const code = ev.error?.code ?? '';
    if (FIXABLE_REFUSALS.includes(code)) { liveCalendar.events = null; liveCalendar.error = code === 'not_in_manifest' ? null : code; }
    else if (FINAL_REFUSALS.includes(code)) { liveCalendar.error = null; if (liveCalendar.stopWatching) { liveCalendar.stopWatching(); liveCalendar.stopWatching = null; } }
    /* transient errors keep the last good events */
  }
  refreshBoard();
  render();
}
/** (Re)starts the watch when the day turned. */
export function watchCalendar(): void {
  const mcp = liveCalendar.mcp;
  if (!mcp || liveCalendar.day === clock.today) return;
  if (liveCalendar.stopWatching) liveCalendar.stopWatching();
  liveCalendar.day = clock.today;
  liveCalendar.stopWatching = mcp.watchTool(GOOGLE_CALENDAR, 'list_events', listEventsInput(clock.today), onCalendarEvent, { refetchInterval: 10 * 60e3 });
}
export async function startCalendar(): Promise<void> {
  try { liveCalendar.mcp = await useMcp(); } catch { liveCalendar.mcp = null; }
  watchCalendar();
}
/** "Show my calendar": one call, which asks the person for approval. */
export async function allowCalendar(): Promise<void> {
  const mcp = liveCalendar.mcp;
  if (!mcp) return;
  try { onCalendarEvent({ type: 'data', result: await mcp.callTool(GOOGLE_CALENDAR, 'list_events', listEventsInput(clock.today)) }); }
  catch (e) { onCalendarEvent({ type: 'error', error: e as { code?: string } }); }
}
