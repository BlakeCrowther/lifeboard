/* Quick-add parser: "dentist fri 3pm", "water plants every 3 days", "gym every mon 7am". Pure: today comes in. */
import { addDays, addMonths, weekStartOf, weekdayOf, ymd, type DateString } from '../dates/index.ts';
import type { RecurrenceRule } from '../db/schema.ts';
import { capitalize } from './shared/format.ts';

type RepeatUnit = 'day' | 'week' | 'month';
/** A repeat the text named: every `n` `unit`s; `onWeekday` = "every mon" (keeps to its weekday). */
export interface ParsedRepeat {
  n: number;
  unit: RepeatUnit;
  onWeekday?: boolean;
}
export interface QuickAdd {
  title: string;
  date: DateString | null;
  /** minutes after midnight */
  time: number | null;
  repeat: ParsedRepeat | null;
}

const WEEKDAY_NUMBERS: Readonly<Record<string, number>> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const WEEKDAY_PATTERN = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const MONTH_PATTERN = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const UNITS: Readonly<Record<string, RepeatUnit>> = { day: 'day', days: 'day', week: 'week', weeks: 'week', month: 'month', months: 'month' };
const WORD_REPEATS: Readonly<Record<string, ParsedRepeat>> = { daily: { n: 1, unit: 'day' }, weekly: { n: 1, unit: 'week' }, monthly: { n: 1, unit: 'month' }, yearly: { n: 12, unit: 'month' } };
const unitOf = (word: string | undefined): RepeatUnit => UNITS[(word ?? '').toLowerCase()] ?? 'day';
const weekdayNumberOf = (word: string | undefined): number => WEEKDAY_NUMBERS[(word ?? '').slice(0, 3).toLowerCase()] ?? 0;
/** A local calendar date (the Date constructor rolls over, so Feb 30 becomes Mar 2). */
const localDate = (year: number, monthIndex: number, day: number): DateString => { const d = new Date(year, monthIndex, day); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

export function parseQuickAdd(raw: string, today: DateString): QuickAdd {
  let s = ' ' + raw.trim() + ' ';
  let date: DateString | null = null, time: number | null = null, repeat: ParsedRepeat | null = null, m: RegExpMatchArray | null;
  const cut = (match: RegExpMatchArray): void => { s = s.replace(match[0], ' '); };
  const nextWeekday = (k: number): DateString => { let n = (k - weekdayOf(today) + 7) % 7; if (n === 0) n = 7; return addDays(today, n); };
  if ((m = s.match(/\s(?:every|each)\s+(\d+)\s*(days?|weeks?|months?)\b/i))) { repeat = { n: Math.max(1, Number(m[1])), unit: unitOf(m[2]) }; cut(m); }
  else if ((m = s.match(new RegExp('\\s(?:every|each)\\s+' + WEEKDAY_PATTERN + '\\b', 'i')))) { repeat = { n: 1, unit: 'week', onWeekday: true }; date = nextWeekday(weekdayNumberOf(m[1])); cut(m); }
  else if ((m = s.match(/\s(?:every|each)\s+(day|week|month|year|weekday)\b/i))) { const u = (m[1] ?? '').toLowerCase(); repeat = u === 'year' ? { n: 12, unit: 'month' } : { n: 1, unit: u === 'weekday' ? 'day' : unitOf(u) }; cut(m); }
  else if ((m = s.match(/\s(daily|weekly|monthly|yearly)\b/i))) { repeat = WORD_REPEATS[(m[1] ?? '').toLowerCase()] ?? null; cut(m); }
  if ((m = s.match(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)\b/i)) && Number(m[1]) >= 1 && Number(m[1]) <= 12) { let h = Number(m[1]) % 12; if (/^p/i.test(m[3] ?? '')) h += 12; time = h * 60 + (Number(m[2]) || 0); cut(m); }
  else if ((m = s.match(/\s(\d{1,2}):(\d{2})\b/)) && Number(m[1]) < 24 && Number(m[2]) < 60) { time = Number(m[1]) * 60 + Number(m[2]); cut(m); }
  else if ((m = s.match(/\sat\s+(\d{1,2})\b/i)) && Number(m[1]) >= 1 && Number(m[1]) <= 12) { let h = Number(m[1]); if (h <= 6) h += 12; time = h * 60; cut(m); }
  else if ((m = s.match(/\s(noon|midday)\b/i))) { time = 720; cut(m); }
  if (!date) {
    const year = Number(today.slice(0, 4));
    const nextOccurrence = (monthIndex: number, day: number): DateString => { const c = localDate(year, monthIndex, day); return c < today ? localDate(year + 1, monthIndex, day) : c; };
    if ((m = s.match(/\s(?:on\s+)?(today|tonight)\b/i))) { date = today; cut(m); }
    else if ((m = s.match(/\s(?:on\s+)?(tomorrow|tmrw|tmr)\b/i))) { date = addDays(today, 1); cut(m); }
    else if ((m = s.match(/\sin\s+(\d+)\s*(days?|weeks?|months?)\b/i))) { const u = unitOf(m[2]), n = Number(m[1]); date = u === 'day' ? addDays(today, n) : u === 'week' ? addDays(today, 7 * n) : addMonths(today, n); cut(m); }
    else if ((m = s.match(/\snext\s+week\b/i))) { date = addDays(weekStartOf(today, 1), 7); cut(m); }
    else if ((m = s.match(/\s(?:this\s+)?weekend\b/i))) { date = nextWeekday(6); cut(m); }
    else if ((m = s.match(new RegExp('\\s(?:on\\s+|next\\s+|this\\s+)?' + WEEKDAY_PATTERN + '\\b', 'i')))) { date = nextWeekday(weekdayNumberOf(m[1])); cut(m); }
    else if ((m = s.match(new RegExp('\\s(?:on\\s+)?' + MONTH_PATTERN + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'i')))) {
      date = nextOccurrence(MONTH_KEYS.indexOf((m[1] ?? '').slice(0, 3).toLowerCase()), Number(m[2])); cut(m);
    } else if ((m = s.match(/\s(\d{1,2})\/(\d{1,2})\b/)) && Number(m[1]) <= 12 && Number(m[2]) <= 31) {
      date = nextOccurrence(Number(m[1]) - 1, Number(m[2])); cut(m);
    }
  }
  let title = s.replace(/^\s*(remind me to|remember to|todo:?)\s+/i, ' ').replace(/\s+(at|on|by|for|every)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
  title = title.replace(/^(at|on|by)\s+/i, '');
  return { title: capitalize(title), date, time, repeat };
}

/** A parsed repeat as an interval rule; "every mon" keeps to its weekday (schedule basis), 12 months = a year. */
export function ruleOfRepeat(r: ParsedRepeat | null): RecurrenceRule | null {
  if (!r) return null;
  const basis = r.onWeekday ? 'schedule' : 'completion';
  if (r.unit === 'month' && r.n % 12 === 0) return { kind: 'interval', every: r.n / 12, unit: 'year', basis };
  return { kind: 'interval', every: r.n, unit: r.unit, basis };
}
