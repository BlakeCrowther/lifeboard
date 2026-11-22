/* Commitment, the ring tally and task age (SPEC.md "Ring %").
   A task is committed to each date in tasks.committed_days; without any, its current effective date stands in. */
import { daysBetween, type DateString } from '../../dates/index.ts';
import { taskState, type TaskDates } from './task-dates.ts';

export interface CommittedTask {
  /** current effective date (due or deadline), or null */
  eff: DateString | null;
  /** the board date it was finished, or null while open */
  doneDate: DateString | null;
  /** tasks.committed_days */
  days?: DateString[] | undefined;
}

export interface RingDay {
  done: number;
  committed: number;
}

/** Per date: tasks committed to it not finished before it, plus everything finished on it
    (a task added and finished the same day adds 1 to both sides). */
export function ringTally(tasks: CommittedTask[]): Record<DateString, RingDay> {
  const tally: Record<DateString, RingDay> = {};
  const dayOf = (date: DateString): RingDay => (tally[date] ??= { done: 0, committed: 0 });
  for (const task of tasks) {
    if (task.doneDate) {
      const day = dayOf(task.doneDate);
      day.done++;
      day.committed++;
    }
    const committedDays = task.days?.length ? task.days : task.eff ? [task.eff] : [];
    for (const date of committedDays) if (!task.doneDate || task.doneDate > date) dayOf(date).committed++;
  }
  return tally;
}

/** done ÷ committed, capped at 1; null when nothing was committed. */
export const ringPercent = (day: RingDay | null | undefined): number | null => (day?.committed ? Math.min(1, day.done / day.committed) : null);

/** The first day a task was committed to: its age counts from here, and rescheduling never resets it. */
export function firstCommittedDay(task: Pick<CommittedTask, 'eff' | 'days'>): DateString | null {
  if (task.days?.length) return task.days.reduce((earliest, date) => (earliest < date ? earliest : date));
  return task.eff ?? null;
}

/** Days since the task was first committed (0 when not yet committed or committed in the future). */
export function taskAge(task: Pick<CommittedTask, 'eff' | 'days'>, today: DateString): number {
  const first = firstCommittedDay(task);
  return first && first < today ? daysBetween(first, today) : 0;
}

/** Was the task committed to `date`? */
export const isCommittedOn = (task: Pick<CommittedTask, 'eff' | 'days'>, date: DateString): boolean =>
  task.days?.length ? task.days.includes(date) : task.eff === date;

/** What became of a task a past day missed (SPEC.md "Day statuses"). */
export type MissedTaskStatus =
  | { kind: 'done_late' }
  | { kind: 'moved'; to: DateString | null }
  | { kind: 'overdue' | 'slipped'; movedTo: DateString | null };

export function missedTaskStatus(task: TaskDates & { done: boolean }, missedDay: DateString, today: DateString): MissedTaskStatus {
  if (task.done) return { kind: 'done_late' };
  const state = taskState(task, today);
  if (!state.effective) return { kind: 'moved', to: null };
  if (state.effective !== missedDay && state.effective >= today) return { kind: 'moved', to: state.effective };
  return { kind: state.overdue ? 'overdue' : 'slipped', movedTo: state.effective !== missedDay ? state.effective : null };
}
