/* A task's dates: its effective date, whether it's overdue or slipped, and how lists order it.
   Works on the db shape (tasks collection: due_date, deadline_date, sort_order ...). */
import { addDays, type DateString } from '../../dates/index.ts';

export const TASK_GROUPS = ['Social', 'Health', 'Money', 'Home', 'Pets', 'Personal', 'Work', 'Goals'] as const;

export interface TaskDates {
  due_date?: DateString | null;
  deadline_date?: DateString | null;
}

export interface OrderedTask extends TaskDates {
  status?: string;
  sort_order?: number | null;
  urgent_sort_order?: number | null;
  created_at?: number | null;
}

export interface TaskState {
  /** the effective date: the earlier of due and deadline */
  effective: DateString | null;
  /** deadline passed, or due date passed with no deadline */
  overdue: boolean;
  /** due date passed, deadline still ahead */
  slipped: boolean;
}

/** The earlier of the do date and the deadline, or whichever exists. */
export function effectiveDate(task: TaskDates): DateString | null {
  const due = task.due_date;
  const deadline = task.deadline_date;
  if (due && deadline) return due < deadline ? due : deadline;
  return due || deadline || null;
}

export function taskState(task: TaskDates, today: DateString): TaskState {
  const due = task.due_date;
  const deadline = task.deadline_date;
  let overdue = false;
  let slipped = false;
  if (deadline) {
    overdue = deadline < today;
    slipped = !overdue && !!due && due < today;
  } else if (due) overdue = due < today;
  return { effective: effectiveDate(task), overdue, slipped };
}

const UNORDERED = 1e9;
const NO_DATE = '9999';

/** Manual order, then creation time. */
export const compareByOrder = (a: OrderedTask, b: OrderedTask): number =>
  (a.sort_order ?? UNORDERED) - (b.sort_order ?? UNORDERED) || (a.created_at ?? 0) - (b.created_at ?? 0);

/** Effective date (undated last), then manual order. */
export function compareByDateThenOrder(a: OrderedTask, b: OrderedTask): number {
  const dateA = effectiveDate(a) ?? NO_DATE;
  const dateB = effectiveDate(b) ?? NO_DATE;
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return compareByOrder(a, b);
}

/** Urgent list order: hand-ordered tasks first, then overdue, then by date. */
export function sortUrgent<Task extends OrderedTask>(tasks: Task[], today: DateString): Task[] {
  return tasks.slice().sort((a, b) => {
    const handA = a.urgent_sort_order;
    const handB = b.urgent_sort_order;
    if (handA != null && handB != null) return handA - handB;
    if (handA != null) return -1;
    if (handB != null) return 1;
    const overdueA = taskState(a, today).overdue;
    const overdueB = taskState(b, today).overdue;
    if (overdueA !== overdueB) return overdueA ? -1 : 1;
    return compareByDateThenOrder(a, b);
  });
}

export interface TaskBuckets<Task> {
  urgent: Task[];
  week: Task[];
  later: Task[];
  none: Task[];
}

/** Open tasks split into due by today, within 7 days, later, and undated, each in list order. */
export function bucketTasks<Task extends OrderedTask>(tasks: Task[], today: DateString): TaskBuckets<Task> {
  const weekEnd = addDays(today, 7);
  const buckets: TaskBuckets<Task> = { urgent: [], week: [], later: [], none: [] };
  for (const task of tasks) {
    if (task.status === 'done') continue;
    const effective = effectiveDate(task);
    if (!effective) buckets.none.push(task);
    else if (effective <= today) buckets.urgent.push(task);
    else if (effective <= weekEnd) buckets.week.push(task);
    else buckets.later.push(task);
  }
  buckets.urgent = sortUrgent(buckets.urgent, today);
  buckets.week.sort(compareByDateThenOrder);
  buckets.later.sort(compareByDateThenOrder);
  buckets.none.sort(compareByOrder);
  return buckets;
}
