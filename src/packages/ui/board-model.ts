/* The board model: what the views read, rebuilt from the store's docs on every change. Views read it; actions write
   through the store and never touch it. Pure: no DOM, no clock (today and the week start come in). */
import { textOf } from './shared/format.ts';
import { daysBetween, weekStartOf, type DateString, type Weekday } from '../dates/index.ts';
import { dateOfInstant, minutesOfDay } from '../dates/clock.ts';
import type { StoredDoc } from '../db/index.ts';
import type { RecurrenceRule, StoreCollection } from '../db/schema.ts';
import { BUY_LIST_TAGS, iconForTitle, type Pet } from '../tasks/icons.ts';
import { hasLineIcon } from './shared/icons.ts';
import { isDateString, safeColor } from './shared/format.ts';

/* ---------- profile (checks/profile): the owner's own labels live in their board, never in the repo ---------- */
export interface ProfilePet extends Pet {
  /** lowercased name, the Pets filter value */
  readonly key: string;
}
export interface Profile {
  name: string;
  /** conditions heading: the place, or 'Local conditions' */
  place: string;
  /** the place as set ('' when unset) */
  placeName: string;
  pets: ProfilePet[];
  /** Duet's trigger id; '' hides Send to Duet */
  duetTrigger: string;
}
export const DEFAULT_PROFILE: Profile = { name: '', place: 'Local conditions', placeName: '', pets: [], duetTrigger: '' };

const trimmed = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const fieldOf = (value: unknown, key: string): unknown => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined);

/** checks/profile.value as a Profile; `timeZone` is the profile's tz ('' when unset). */
export function readProfile(value: unknown): Profile & { timeZone: string } {
  const v = value && typeof value === 'object' ? value : {};
  const pets = fieldOf(v, 'pets');
  return {
    name: trimmed(fieldOf(v, 'name')),
    place: trimmed(fieldOf(v, 'place')) || 'Local conditions',
    placeName: trimmed(fieldOf(v, 'place')),
    duetTrigger: trimmed(fieldOf(v, 'duet_trigger')),
    timeZone: trimmed(fieldOf(v, 'tz')),
    pets: (Array.isArray(pets) ? (pets as unknown[]) : [])
      .filter((x) => typeof fieldOf(x, 'name') === 'string' && trimmed(fieldOf(x, 'name')))
      .map((x) => {
        const name = trimmed(fieldOf(x, 'name')), kind = fieldOf(x, 'kind');
        return { key: name.toLowerCase(), name, icon: kind === 'dog' || kind === 'cat' ? kind : 'paw' };
      }),
  };
}

/* ---------- icons ---------- */
/* icon keys written by the original app, drawn with the nearest icon in this set */
const LEGACY_ICON_KEYS: Readonly<Record<string, string>> = { plant: 'leaf', tooth: 'med', medical: 'med', mail: 'chat', broom: 'house', droplet: 'drop', dumbbell: 'flame', plane: 'pin', cake: 'gift', music: 'drum', bag: 'cart', books: 'book', 'book-open': 'book', surf: 'wave', key: 'house', chart: 'target', scissors: 'person', journal: 'book', hola: 'chat', cup: 'drop', diamond: 'star', flag: 'target', dot: 'spark', clipboard: 'list', pumpkin: 'spark', 'bubble-heart': 'heart', sunset: 'sun', stopwatch: 'clock', news: 'list', bulb: 'spark' };
/** A stored icon key as one this icon set draws ('spark' when unknown). */
export const iconKeyOf = (key: string | null | undefined): string => (key && hasLineIcon(key) ? key : (key && LEGACY_ICON_KEYS[key]) || 'spark');
/* a habit without its own icon_key gets one guessed from its name */
const HABIT_ICON_HINTS: readonly (readonly [RegExp, string])[] = [
  [/drum|guitar|piano|music|sing/, 'drum'], [/speak|language|talk|call|chat/, 'chat'], [/surf|swim|paddle/, 'wave'],
  [/run|jog|walk|hike/, 'shoe'], [/meditat|breath|yoga/, 'lotus'], [/journal|read|book|writ|study/, 'book'],
];
const habitIconOf = (name: string): string | undefined => HABIT_ICON_HINTS.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1];
export const GOAL_CATEGORIES = ['Climbing', 'Work', 'School', 'Self Care', 'Personal'] as const;
export const GOAL_CATEGORY_ICONS: Readonly<Record<string, string>> = { Climbing: 'mountain', Work: 'laptop', School: 'book', 'Self Care': 'lotus', Personal: 'star' };
export const GROCERY_AISLES = ['Produce', 'Dairy', 'Meat & seafood', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'] as const;
export type GroceryAisle = (typeof GROCERY_AISLES)[number];
export type BuyListTag = keyof typeof BUY_LIST_TAGS;
export const isBuyListTag = (tag: unknown): tag is BuyListTag => typeof tag === 'string' && Object.hasOwn(BUY_LIST_TAGS, tag);

/* ---------- model types ---------- */
type Doc<C extends StoreCollection> = StoredDoc<C>;

export interface BoardTask {
  id: string;
  title: string;
  /** the task group (tasks.category), 'Personal' when unset */
  group: string;
  icon: string;
  project: string;
  notes: string;
  due: DateString | null;
  deadline: DateString | null;
  rule: RecurrenceRule | null;
  done: boolean;
  doneAt: number | null;
  created: number;
  /** tasks.committed_days, dates only */
  days: DateString[];
  /** Duet request status, null when never sent */
  duet: string | null;
  doc: Doc<'tasks'>;
}
export interface BoardHabit {
  id: string;
  key: string;
  /** habits.plot_id: the garden plot id its roster plants carry (GameHabit.plot) */
  plot?: string;
  name: string;
  icon: string;
  target: number;
  floor: number;
  daily: boolean;
  notes: string;
  doc: Doc<'habits'>;
}
/** A late log's reason and evidence (habit_sessions.exception). */
export interface SessionException {
  reason: string;
  evidence: string;
  at?: number;
}
export interface BoardSession {
  id: string;
  /** habit key or id (habit_sessions.habit_id) */
  h: string;
  date: DateString;
  created: number;
  exception: SessionException | null;
}
interface EventBase {
  id: string;
  title: string;
  /** calendar name */
  calendar: string;
  color: string;
  location: string;
  date: DateString;
}
export interface AllDayEvent extends EventBase {
  allDay: true;
  /** days it spans from `date` */
  days: number;
}
export interface TimedEvent extends EventBase {
  allDay?: false;
  /** minutes after midnight */
  startMinute: number;
  endMinute: number;
}
export type BoardEvent = AllDayEvent | TimedEvent;
export interface Tide {
  type: string;
  heightFt: unknown;
  time: string;
  upcoming: boolean;
}
/** snapshots/conditions: weather and surf are the fetched objects as saved. */
export interface Conditions {
  weather: Record<string, unknown> | null;
  surf: Record<string, unknown> | null;
  tides: Tide[];
  fetchedAt: number | null;
  quote: Record<string, unknown> | null;
}
export interface Grocery {
  id: string;
  name: string;
  aisle: string;
  done: boolean;
  created: number;
}
export interface BuyListItem {
  id: string;
  name: string;
  tag: BuyListTag;
  /** the day its wait started */
  added: DateString;
  price: string;
  url: string | null | undefined;
  notes: string;
  status: NonNullable<Doc<'buy_list_items'>['status']>;
}
export interface Recipe {
  id: string;
  name: string;
  time: string;
  mood: string;
  url: string | null | undefined;
  notes: string;
  ingredients: string[];
  cooked: boolean;
  cookedAt: number | null;
}
export interface GiftIdea {
  id: string;
  person: string;
  idea: string;
  url: string | null | undefined;
  done: boolean;
}
export interface ListItem {
  id: string;
  name: string;
  /** author (books) */
  by: string;
  url: string | null | undefined;
  notes: string;
  done: boolean;
}
export interface Goal {
  id: string;
  title: string;
  category: string;
  icon: string;
  year: number;
  done: boolean;
  notes: string;
  /** progress notes, Q1..Q4 */
  quarterNotes: [string, string, string, string];
}
export interface BigDay {
  id: string;
  /** countdowns.kind, dashes as spaces */
  kind: string;
  title: string;
  date: DateString;
  where: string;
  gift: string;
  /** task title words that make a Social task a big day task */
  match: string[];
}
export interface GlanceCountdown {
  id: string;
  title: string;
  date: DateString;
  detail: string;
}
export interface BoardLog {
  kind: string;
  label: string;
  date: DateString;
  at: number | null;
}
export interface BoardModel {
  tasks: BoardTask[];
  /** suggestions from Claude, kept out of every list until kept; newest first */
  suggested: BoardTask[];
  habits: BoardHabit[];
  hiddenHabits: { id: string; name: string }[];
  /** sessions that count: logged in their own week, or late with an exception */
  habitSessions: BoardSession[];
  /** late sessions without an exception: kept, never counted */
  voidHabitSessions: BoardSession[];
  events: BoardEvent[];
  calendarSynced: boolean;
  calendarFetchedAt: number | null;
  conditions: Conditions | null;
  groceries: Grocery[];
  buyListItems: BuyListItem[];
  recipes: Recipe[];
  giftIdeas: GiftIdea[];
  listItemsByKey: Record<string, ListItem[]>;
  goals: Goal[];
  countdownsByKind: { big: BigDay[]; glance: GlanceCountdown[] };
  checks: Record<string, Doc<'checks'>>;
  logs: BoardLog[];
}
export const emptyBoardModel = (): BoardModel => ({
  tasks: [], suggested: [], habits: [], hiddenHabits: [], habitSessions: [], voidHabitSessions: [], events: [], calendarSynced: false, calendarFetchedAt: null,
  conditions: null, groceries: [], buyListItems: [], recipes: [], giftIdeas: [], listItemsByKey: {}, goals: [], countdownsByKind: { big: [], glance: [] }, checks: {}, logs: [],
});

/* ---------- building it ---------- */
const bySortOrder = (a: { sort_order?: number | null | undefined; created_at?: number | null | undefined }, b: { sort_order?: number | null | undefined; created_at?: number | null | undefined }): number =>
  (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || (a.created_at || 0) - (b.created_at || 0);
const byCreated = (a: { created_at?: number | null | undefined }, b: { created_at?: number | null | undefined }): number => (a.created_at || 0) - (b.created_at || 0);

export const isValidException = (e: unknown): e is SessionException =>
  !!e && typeof e === 'object' && typeof fieldOf(e, 'reason') === 'string' && trimmed(fieldOf(e, 'reason')).length >= 20 && typeof fieldOf(e, 'evidence') === 'string' && trimmed(fieldOf(e, 'evidence')).length >= 3;

export function boardTaskOf(d: Doc<'tasks'>, pets: readonly Pet[]): BoardTask {
  const duet = (d as Record<string, unknown>)['duet_request'];
  return {
    id: d.id, title: d.title, group: d.category || 'Personal', icon: iconKeyOf(d.icon_key || iconForTitle(d.title, pets)),
    project: typeof d.project === 'string' ? d.project.trim() : '', notes: d.notes || '', due: d.due_date || null, deadline: d.deadline_date || null, rule: d.recurrence_rule || null,
    done: d.status === 'done', doneAt: d.completed_at || null, created: d.created_at || 0, days: Array.isArray(d.committed_days) ? d.committed_days.filter(isDateString) : [],
    duet: duet && typeof duet === 'object' ? textOf(fieldOf(duet, 'status')) || 'queued' : null, doc: d,
  };
}

/** Calendar events from a snapshot's `events` (saved or live), in the board's zone; unreadable ones are dropped. */
export function eventsFromSnapshot(snapshot: { events?: unknown } | null | undefined): BoardEvent[] {
  const events: unknown[] = snapshot && Array.isArray(snapshot.events) ? (snapshot.events as unknown[]) : [];
  return events.flatMap((e, i): BoardEvent[] => {
    const start = fieldOf(e, 'start'), end = fieldOf(e, 'end');
    if (!e || typeof start !== 'string' || !isDateString(start.slice(0, 10))) return [];
    const base = { id: textOf(fieldOf(e, 'id') || 'e' + String(i)), title: textOf(fieldOf(e, 'title')) || '(No title)', calendar: textOf(fieldOf(e, 'calendar')), color: safeColor(fieldOf(e, 'color') || fieldOf(e, 'calendar_color')), location: textOf(fieldOf(e, 'location')) };
    if (fieldOf(e, 'all_day')) {
      const first = start.slice(0, 10), last = typeof end === 'string' && isDateString(end.slice(0, 10)) ? end.slice(0, 10) : null;
      return [{ ...base, allDay: true, date: first, days: last && last > first ? daysBetween(first, last) : 1 }];
    }
    const startMs = Date.parse(start), endMs = Date.parse(typeof end === 'string' ? end : '');
    if (isNaN(startMs)) return [];
    const date = dateOfInstant(startMs), startMinute = minutesOfDay(start);
    const endMinute = isNaN(endMs) ? startMinute + 60 : dateOfInstant(endMs) === date ? minutesOfDay(end as string) : 1440;
    return [{ ...base, date, startMinute, endMinute: Math.max(endMinute, startMinute) }];
  });
}

/** What buildBoardModel reads: valid docs per store collection (the store's `all`). */
export type BoardReader = <C extends StoreCollection>(collection: C) => Doc<C>[];
export interface BoardContext {
  today: DateString;
  weekStart: Weekday;
  pets: readonly Pet[];
  /** live Google Calendar events; they replace the saved snapshot's */
  liveCalendar: { events: BoardEvent[]; fetchedAt: number | null } | null;
}

export function buildBoardModel(read: BoardReader, { today, weekStart, pets, liveCalendar }: BoardContext): BoardModel {
  const m = emptyBoardModel();
  const weekOf = (date: DateString): DateString => weekStartOf(date, weekStart);
  const allTasks = read('tasks').map((d) => boardTaskOf(d, pets)), isSuggested = (t: BoardTask): boolean => t.doc.suggested === true && !t.done;
  m.suggested = allTasks.filter(isSuggested).sort((a, b) => b.created - a.created);
  m.tasks = allTasks.filter((t) => !isSuggested(t));
  m.hiddenHabits = read('habits').filter((d) => d.hidden).sort(bySortOrder).map((d) => ({ id: d.id, name: d.name }));
  m.habits = read('habits').filter((d) => !d.hidden).sort(bySortOrder).map((d) => ({
    id: d.id, key: d.key || d.id, ...(d.plot_id ? { plot: d.plot_id } : {}), name: d.name, icon: iconKeyOf(d.icon_key || habitIconOf(d.name)), target: Math.max(1, d.target_per_week || 1),
    floor: Math.max(1, Number(d.streak_floor_per_week) || 1), daily: d.cadence === 'day', notes: d.notes || '', doc: d,
  }));
  /* a session counts when it was logged during its own week. Later logs count only with an exception (reason + evidence). Older docs without created_at count. */
  const sessions = read('habit_sessions').map((d): BoardSession => {
    const exception = (d as Record<string, unknown>)['exception'];
    return { id: d.id, h: d.habit_id, date: d.date, created: d.created_at || 0, exception: isValidException(exception) ? exception : null };
  });
  const onTime = (x: BoardSession): boolean => !x.created || weekOf(dateOfInstant(x.created)) <= weekOf(x.date);
  m.habitSessions = sessions.filter((x) => onTime(x) || x.exception);
  m.voidHabitSessions = sessions.filter((x) => !onTime(x) && !x.exception);
  const snapshots = Object.fromEntries(read('snapshots').map((d) => [d.id, d]));
  const calendar = snapshots['calendar'];
  m.calendarSynced = !!(calendar?.fetched_at && Array.isArray(calendar.events));
  m.calendarFetchedAt = m.calendarSynced ? (calendar?.fetched_at ?? null) : null;
  m.events = m.calendarSynced ? eventsFromSnapshot(calendar) : [];
  if (liveCalendar) { m.calendarSynced = true; m.calendarFetchedAt = liveCalendar.fetchedAt; m.events = liveCalendar.events; }
  const c = snapshots['conditions'];
  const quote = c?.quote && c.quote['text'] ? c.quote : null;
  if (c && (c.weather || c.surf || (c.tides || []).length)) {
    const tides = (Array.isArray(c.tides) ? c.tides : []).filter((t) => t && fieldOf(t, 'type') && fieldOf(t, 'time'))
      .map((t) => ({ type: textOf(fieldOf(t, 'type')), heightFt: fieldOf(t, 'height_ft'), time: textOf(fieldOf(t, 'time')), upcoming: !!fieldOf(t, 'upcoming') }));
    m.conditions = { weather: c.weather && typeof c.weather === 'object' ? c.weather : null, surf: c.surf && typeof c.surf === 'object' ? c.surf : null, tides, fetchedAt: c.fetched_at || null, quote };
  } else if (c && quote) m.conditions = { weather: null, surf: null, tides: [], fetchedAt: c.fetched_at || null, quote };
  m.groceries = read('groceries').sort(bySortOrder).map((d) => ({ id: d.id, name: d.name, aisle: (GROCERY_AISLES as readonly string[]).includes(d.group_name ?? '') ? (d.group_name ?? '') : 'Other', done: !!d.checked, created: d.created_at || 0 }));
  m.buyListItems = read('buy_list_items').sort(bySortOrder).map((d) => ({
    id: d.id, name: d.name, tag: isBuyListTag(d.tag) ? d.tag : 'one_day', added: d.added_date || (d.created_at ? dateOfInstant(d.created_at) : today),
    price: textOf(d.price), url: d.url, notes: d.notes || '', status: d.status || 'waiting',
  }));
  m.recipes = read('recipes').sort(bySortOrder).map((d) => ({
    id: d.id, name: d.name, time: d.time || '', mood: d.mood || '', url: d.url, notes: d.notes || '',
    ingredients: (d.ingredients || []).filter((x): x is string => typeof x === 'string' && !!x.trim()), cooked: d.status === 'archived', cookedAt: d.cooked_at || null,
  }));
  m.giftIdeas = read('gift_ideas').sort(bySortOrder).map((d) => ({ id: d.id, person: d.person.trim() || 'Someone', idea: d.idea || '', url: d.url, done: d.status === 'given' }));
  for (const d of read('list_items').sort(bySortOrder)) {
    (m.listItemsByKey[d.list_key] ??= []).push({ id: d.id, name: d.title, by: d.author || '', url: d.url, notes: d.notes || '', done: d.status === 'done' });
  }
  m.goals = read('goals').sort(bySortOrder).map((d) => ({
    id: d.id, title: d.title, category: d.category || '', icon: iconKeyOf(d.icon_key || GOAL_CATEGORY_ICONS[d.category ?? ''] || 'star'), year: d.year, done: d.status === 'completed', notes: d.notes || '',
    quarterNotes: [d.progress_q1 || '', d.progress_q2 || '', d.progress_q3 || '', d.progress_q4 || ''],
  }));
  /* countdowns by kind: big days are every countdown except the small 'glance' ones (weddings, trips, birthdays…); kind is free text */
  const byDate = (a: { date: string }, b: { date: string }): number => (a.date < b.date ? -1 : 1);
  m.countdownsByKind.big = read('countdowns').filter((d) => d.kind !== 'glance').sort(byDate).map((d) => ({
    id: d.id, kind: d.kind.replace(/[-_]/g, ' '), title: d.title, date: d.date, where: d.detail || d.when || '', gift: d.gift || '',
    match: Array.isArray(d.match) ? d.match.filter((x): x is string => typeof x === 'string') : [],
  }));
  m.countdownsByKind.glance = read('countdowns').filter((d) => d.kind === 'glance').sort(byDate).map((d) => ({ id: d.id, title: d.title, date: d.date, detail: d.detail || '' }));
  for (const d of read('checks')) m.checks[d.id] = d;
  m.logs = read('logs').sort(byCreated).map((d) => ({ kind: d.kind, label: d.label || '', date: d.date, at: d.created_at || null }));
  return m;
}
