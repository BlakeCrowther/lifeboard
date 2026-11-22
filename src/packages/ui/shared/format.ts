/* Text helpers for HTML built as strings. Anything from the db or the user goes through escapeHtml. */
import { padTwo } from '../../dates/index.ts';

const HTML_ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text for a value read from the db: strings and numbers as they are, anything else (null, objects) as ''. */
export const textOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
export const escapeHtml = (value: unknown): string => textOf(value).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);

export const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;
export const capitalize = (s: string): string => (s ? (s[0] ?? '').toUpperCase() + s.slice(1) : s);

export const isDateString = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
/** An http(s) URL, trimmed, or ''. */
export const safeUrl = (url: unknown): string => (typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : '');
/** labelHtml wrapped in a new-tab link when url is a safe URL, else labelHtml alone. */
export function externalLink(url: unknown, labelHtml: string): string {
  const href = safeUrl(url);
  return href ? `<a class="xl" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>` : labelHtml;
}
/** A CSS color from outside data (hex, name, rgb/hsl), or '' when it isn't one. */
export const safeColor = (color: unknown): string =>
  typeof color === 'string' && /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(color.trim()) ? color.trim() : '';
/** An outside reading, escaped, with its unit; '–' when missing. */
export const readingOrDash = (value: unknown, unit = ''): string => (value == null || value === '' ? '–' : escapeHtml(value) + unit);

/** Minutes after midnight as '9:30 AM' (or '9:30' without the meridiem). */
export function clockLabel(minutes: number, withMeridiem = true): string {
  const hour = Math.floor(minutes / 60) % 24, minute = minutes % 60;
  return `${String(hour % 12 || 12)}${minute ? ':' + padTwo(minute) : ''}${withMeridiem ? (hour < 12 ? ' AM' : ' PM') : ''}`;
}
/** Minutes as '45m', '2h' or '1h 30m'. */
export const durationText = (minutes: number): string =>
  minutes < 60 ? `${String(minutes)}m` : `${String(Math.floor(minutes / 60))}h${minutes % 60 ? ` ${String(minutes % 60)}m` : ''}`;
