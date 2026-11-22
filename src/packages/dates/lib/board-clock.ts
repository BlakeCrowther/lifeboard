/* The board's day boundary: which calendar date and clock time an instant falls on.
   Uses the browser's zone until setTimeZone() (checks/profile.tz) overrides it. */
import { padTwo, type DateString } from './calendar-dates.ts';

const FALLBACK_TIME_ZONE = 'America/Los_Angeles';

interface ZoneFormatters {
  zone: string;
  date: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  hourMinute: Intl.DateTimeFormat;
}

function formattersFor(zone: string): ZoneFormatters | null {
  try {
    return {
      zone,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }),
      hourMinute: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
  } catch {
    return null;
  }
}

let current: ZoneFormatters = formattersFor(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? (formattersFor(FALLBACK_TIME_ZONE) as ZoneFormatters);

/** Switches the board's zone (IANA name). Returns false and keeps the old zone when the name is unknown. */
export function setTimeZone(zone: string): boolean {
  const next = formattersFor(zone);
  if (!next) return false;
  current = next;
  return true;
}

export const timeZone = (): string => current.zone;

/** The board date of an instant (epoch ms). */
export const dateOfInstant = (epochMs: number): DateString => current.date.format(new Date(epochMs));

/** The board's today. `now` is epoch ms, default the current time. */
export const todayDate = (now: number = Date.now()): DateString => dateOfInstant(now);

/** '9 AM', '9:30 PM' for an ISO instant, in the board's zone. */
export const timeLabel = (isoInstant: string): string => current.time.format(new Date(isoInstant)).replace(':00', '');

/** Minutes since the board's midnight (0-1439) for an ISO instant. */
export function minutesOfDay(isoInstant: string): number {
  const parts = current.hourMinute.formatToParts(new Date(isoInstant));
  const field = (type: 'hour' | 'minute'): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return (field('hour') % 24) * 60 + field('minute');
}

/** '45m', '1h', '1h 30m' */
export const durationLabel = (minutes: number): string => (minutes < 60 ? `${String(minutes)}m` : `${String(Math.floor(minutes / 60))}h${minutes % 60 ? ` ${String(minutes % 60)}m` : ''}`);

/** '9 AM', '12:30 PM' for minutes since midnight (1440 reads as 12 AM). */
export function minuteLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour % 12 || 12)}${minute ? ':' + padTwo(minute) : ''} ${hour < 12 || hour === 24 ? 'AM' : 'PM'}`;
}
