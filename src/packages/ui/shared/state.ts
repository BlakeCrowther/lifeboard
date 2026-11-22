/* The page's state: the store (the artifact db), the board model and profile rebuilt from it, and what the person is
   looking at (viewState). Model and profile are replaced in place by refreshBoard, so importers always see the latest. */
import { createStore } from '../../db/index.ts';
import { daysBetween, type DateString } from '../../dates/index.ts';
import { DEFAULT_PROFILE, emptyBoardModel, type BoardModel, type Profile } from '../board-model.ts';
import { useDb } from './artifact-runtime.ts';
import { clock } from './clock.ts';

export const store = createStore({ connect: useDb });

export const model: BoardModel = emptyBoardModel();
export const profile: Profile = { ...DEFAULT_PROFILE };
/** Counts model rebuilds, so derived values (the game state) know when to recompute. */
export const modelRevision = { count: 0 };

export type SheetKind = 'task' | 'item' | 'goal' | 'habit' | 'log' | 'chat';
export interface ChatMessage {
  role: 'user' | 'assistant';
  /** what is sent to Claude (the first one carries the task context) */
  content: string;
  /** what the log shows instead of content, when set */
  shown?: string | undefined;
}
/** The open add/edit sheet. Which fields apply depends on kind. */
export interface Sheet {
  kind: SheetKind;
  /** the task or habit being edited */
  id?: string | undefined;
  /** text carried over when switching kinds */
  name?: string | undefined;
  /** item: the list key */
  list?: string | undefined;
  /** new task: starting group and do date */
  defaults?: { group?: string; due?: DateString } | undefined;
  /** new task: the do date it opened with, used when the quick text has none */
  baseDue?: string | undefined;
  /** new task: full-form fields the person changed by hand; quick text no longer overwrites them */
  touched?: { title?: boolean; due?: boolean; rec?: boolean } | undefined;
  /** new task: a time of day the quick text named (minutes), kept for notes */
  time?: number | null | undefined;
  /** chat: the task asked about, the messages, and progress */
  taskId?: string | undefined;
  messages?: ChatMessage[] | undefined;
  busy?: boolean | undefined;
  error?: string | undefined;
}

export type Tab = 'today' | 'plan' | 'lists' | 'life' | 'grow';
/** What the person is looking at and has open; not saved anywhere. */
export const viewState = {
  tab: 'today' as Tab,
  lifeArea: 'health',
  growView: 'habits',
  listKey: 'groceries',
  /** the expanded task or wish list row */
  expandedId: null as string | null,
  /** the day whose tasks the ring card shows */
  ringDay: clock.today,
  /** the suggestion whose Adjust box is open, and the one Claude is rewriting */
  adjustingId: null as string | null,
  adjustBusyId: null as string | null,
  /** "show more" toggles by key */
  expanded: {} as Record<string, boolean>,
  showTomorrow: false,
  wishFilter: 'all',
  petFilter: 'all',
  showCallScript: false,
  calendarDay: clock.today,
  calendarMonth: clock.today.slice(0, 7) + '-01',
  /** goal quarter being edited: '<goal id>:<quarter>' */
  editingQuarter: null as string | null,
  editingKeepsake: null as string | null,
  inspectedKeepsake: null as string | null,
  /** the inspect modal animates in only on the render that opens it */
  animateInspect: false,
  collectionView: 'dioramas',
  recordsView: 'habits',
  breakTimer: { minutes: 2, endsAt: null as number | null, message: '' },
  quoteIndex: ((daysBetween('2026-01-01', clock.today) % 7) + 7) % 7,
  sheet: null as Sheet | null,
  duetBusy: false,
  /** the habit just logged or unlogged, so its garden tile animates once: d = +1/-1, week = its new count */
  habitPulse: null as { id: string; d: number; week: number; used?: boolean } | null,
};
