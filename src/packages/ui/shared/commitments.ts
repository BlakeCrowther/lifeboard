/* Writes the board makes on its own once the db is ready: commitments, starter tasks and missing recurring successors.
   Commitments (SPEC.md "Ring %"): an open task is committed to its day when that day arrives (or it's put on today),
   recorded in tasks.committed_days so moving it later never erases the miss. Tasks already due when the day began land
   at midnight; ones put on today land when the board sees it. */
import { addDays } from '../../dates/index.ts';
import { dateOfInstant, minutesOfDay } from '../../dates/clock.ts';
import type { BoardTask } from '../board-model.ts';
import { clock } from './clock.ts';
import { commitLockMinutes } from './prefs.ts';
import { model, store } from './state.ts';
import { effectiveDateOf } from './tasks.ts';
import { newTaskBody, showSaveError, spawnSuccessor } from './writes.ts';

/** 'end of day', '45m', '1h 30m' */
export function lockLabel(minutes: number): string {
  if (minutes === Infinity) return 'end of day';
  const m = Math.max(1, Math.ceil(minutes));
  return m < 60 ? `${String(m)}m` : `${String(Math.floor(m / 60))}h${m % 60 ? ` ${String(m % 60)}m` : ''}`;
}
/** Epoch ms of a date's midnight in the board's zone. */
function midnightOf(date: string): number {
  const utc = Date.parse(date + 'T00:00:00Z');
  return utc + ((1440 - minutesOfDay(new Date(utc).toISOString())) % 1440) * 6e4;
}
/** Minutes left before today's commitment on a task locks, or 0. */
export function lockMinutesLeft(t: BoardTask): number {
  const lock = commitLockMinutes();
  if (!lock || t.done || !t.days.includes(clock.today)) return 0;
  return lock === Infinity ? Infinity : Math.max(0, lock - (Date.now() - (t.doc.committed_at || midnightOf(clock.today))) / 6e4);
}

/** the day this board last ran the pass: commitments it finds missing on its first pass of a day date from midnight */
let commitDay: string | null = null;
export function recordCommitments(): void {
  const first = commitDay !== clock.today;
  commitDay = clock.today;
  for (const t of model.tasks) {
    if (t.done || t.doc.suggested === true) continue;
    /* a task can't be committed to a day before it existed: back-dating its due date would fake age (SPEC.md Age) */
    const born = t.created ? dateOfInstant(t.created) : null, e0 = effectiveDateOf(t), e = e0 && born && e0 < born ? born : e0, has = new Set(t.days);
    if (e && e <= clock.today && !has.has(e)) {
      const patch: { committed_days: string[]; committed_at?: number } = { committed_days: [...t.days, e].sort() };
      if (e === clock.today) patch.committed_at = first ? midnightOf(clock.today) : Date.now();
      store.patch('tasks', t.id, patch).catch((err: unknown) => { console.warn('[commit]', err); });
    } else if (has.has(clock.today) && (!e || e > clock.today) && lockMinutesLeft(t) > 0) {
      store.patch('tasks', t.id, { committed_days: t.days.filter((d) => d !== clock.today), committed_at: null }).catch((err: unknown) => { console.warn('[commit]', err); });
    }
  }
}

/* Starter tasks: a brand-new board (no tasks, habits, sessions, goals or checks at all) gets a few tasks that teach how
   lifeboard works and what earns what (SPEC.md). Written once, with fixed ids so two open tabs can't double them;
   checks/starter marks it done, so deleting them never brings them back. An owner's existing board never qualifies. */
const STARTER_TASKS: readonly { title: string; inDays: number; notes: string }[] = [
  { title: 'Add the task you\'ve been putting off', inDays: 0, notes: 'Everyone has one. Old tasks matter here: once an open task is 7+ days past the day it was first due (pushing it doesn\'t reset that), it grows blight in your Ecosystem, and overdue tasks cloud the water. Finishing one that old brings a rare visitor (30+ days: an exotic one, once per biome; old-task visitors are capped at one a week). So clearing old stuff is worth more than it looks.' },
  { title: 'Finish this task to fill today\'s ring', inDays: 0, notes: 'Tap the circle to finish a task. Today\'s ring is done ÷ committed: every task due today counts, and finishing it fills the ring. Each day\'s ring earns Life points (up to 10, plus 5 for a full ring), which grow your Ecosystem through its phases and biomes. A day with nothing due is neutral.' },
  { title: 'Add your first habit', inDays: 0, notes: 'Grow → Habits → New habit. Each habit gets a plot in your garden. Pick a floor (the least that keeps it alive) and a target. Every week you reach the floor, its plant grows a stage; four floor weeks and it blooms. A week below the floor and it withers, and a new seed goes in. Beating the target earns rarer seeds.' },
  { title: 'Log a habit session', inDays: 1, notes: 'Tap a habit\'s plant to log a session, on the day you do it. Sessions count for the week they happen in; logging one late needs a reason and evidence. Habits only grow the garden: they never change your ring or Life points.' },
  { title: 'Add a task for tomorrow', inDays: 1, notes: 'Tap + to add a task with a date. A task counts toward a day\'s ring once that day arrives with it due, and moving it later doesn\'t erase that day. Adding a task for today makes today\'s ring harder until it\'s done, so plan the night before.' },
  { title: 'Do your first lesson', inDays: 2, notes: 'Ask Claude to "make lessons from" a book, video or article you liked (the lesson-make skill). Due lessons show above your Ecosystem. Answering them brings the scenes to life (creatures feeding); they never change growth or points.' },
  { title: 'Delete these starter tasks', inDays: 3, notes: 'They\'re ordinary tasks: finish them or delete them. They won\'t come back.' },
];
let starterChecked = false;
export function seedStarterTasks(): void {
  if (starterChecked) return;
  starterChecked = true;
  if ((['tasks', 'habits', 'habit_sessions', 'goals', 'checks'] as const).some((c) => store.all(c).length)) return;
  store.create('checks', { value: { seeded_at: Date.now() }, updated_at: Date.now() }, undefined, 'starter').then(() => Promise.all(STARTER_TASKS.map(({ title, inDays, notes }, i) =>
    store.create('tasks', { ...newTaskBody({ title, notes, category: 'Personal', due_date: addDays(clock.today, inDays) }), sort_order: i + 1, created_at: Date.now() }, undefined, 'starter-' + String(i + 1)))))
    .catch((e: unknown) => { console.warn('[lifeboard] starter tasks', e); });
}

let recurringChecked = false;
/** Done repeating tasks whose successor was never spawned (another device closed mid-write) get one now. */
export function spawnMissingSuccessors(): void {
  if (recurringChecked) return;
  recurringChecked = true;
  for (const d of store.all('tasks').filter((x) => x.status === 'done' && x.recurrence_rule && !x.recurrence_spawned)) {
    spawnSuccessor(d, d.completed_at ? dateOfInstant(d.completed_at) : clock.today).catch(showSaveError);
  }
}
