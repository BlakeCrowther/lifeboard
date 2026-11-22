/* Board tasks through the tasks package, on the board's today: effective date, state, list order and buckets. */
import { addDays, type DateString } from '../../dates/index.ts';
import { bucketTasks, compareByDateThenOrder, effectiveDate, sortUrgent, taskState, type OrderedTask, type TaskBuckets, type TaskState } from '../../tasks/index.ts';
import type { BoardTask } from '../board-model.ts';
import { clock } from './clock.ts';

const datesOf = (t: Pick<BoardTask, 'due' | 'deadline'>): { due_date: DateString | null; deadline_date: DateString | null } => ({ due_date: t.due, deadline_date: t.deadline });
/** The earlier of the do date and the deadline, or whichever exists. */
export const effectiveDateOf = (t: Pick<BoardTask, 'due' | 'deadline'>): DateString | null => effectiveDate(datesOf(t));
export const stateOf = (t: Pick<BoardTask, 'due' | 'deadline'>): TaskState => taskState(datesOf(t), clock.today);

export type Bucket = keyof TaskBuckets<BoardTask>;
/** urgent = due by today, week = within 7 days, later, none = undated. */
export function bucketOf(t: BoardTask): Bucket {
  const e = effectiveDateOf(t);
  return !e ? 'none' : e <= clock.today ? 'urgent' : e <= addDays(clock.today, 7) ? 'week' : 'later';
}

type Ordered = OrderedTask & { task: BoardTask };
const orderedOf = (t: BoardTask): Ordered => ({
  ...datesOf(t), status: t.doc.status, sort_order: t.doc.sort_order ?? null, urgent_sort_order: t.doc.urgent_sort_order ?? null, created_at: t.doc.created_at ?? null, task: t,
});
export const compareByDate = (a: BoardTask, b: BoardTask): number => compareByDateThenOrder(orderedOf(a), orderedOf(b));
export const sortUrgentTasks = (tasks: BoardTask[]): BoardTask[] => sortUrgent(tasks.map(orderedOf), clock.today).map((x) => x.task);
export function bucketsOf(tasks: BoardTask[]): TaskBuckets<BoardTask> {
  const b = bucketTasks(tasks.map(orderedOf), clock.today);
  const unwrap = (xs: Ordered[]): BoardTask[] => xs.map((x) => x.task);
  return { urgent: unwrap(b.urgent), week: unwrap(b.week), later: unwrap(b.later), none: unwrap(b.none) };
}
