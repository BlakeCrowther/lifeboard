/* Writes: every action goes through runWrite; the toast's Undo puts the touched docs back. Plus the task bodies and
   repeat rules the actions share. */
import { addDays, daysBetween, type DateString } from '../../dates/index.ts';
import type { UndoRecord } from '../../db/index.ts';
import type { CollectionDoc, RecurrenceRule as StoredRule } from '../../db/schema.ts';
import { describeRule, nextDueDate, shortRuleLabel, type RecurrenceRule } from '../../recurrence/index.ts';
import { iconForTitle } from '../../tasks/icons.ts';
import { errorCode } from './artifact-runtime.ts';
import { profile, store } from './state.ts';
import { toast } from './toast.ts';

/* Stored rules carry nullable extras (basis: null) the recurrence package reads as absent; numbers go through Number() there. */
const asRule = (rule: StoredRule): RecurrenceRule => rule as unknown as RecurrenceRule;
export const ruleShortLabel = (rule: StoredRule | null): string => (rule ? shortRuleLabel(asRule(rule)) : '');
export const ruleDescription = (rule: StoredRule): string => describeRule(asRule(rule));
export const nextDueAfter = (rule: StoredRule, task: { due_date?: DateString | null | undefined; deadline_date?: DateString | null | undefined }, completedOn: DateString): DateString =>
  nextDueDate(asRule(rule), { due_date: task.due_date ?? null, deadline_date: task.deadline_date ?? null }, completedOn);

export function showSaveError(e: unknown): void {
  console.error('[lifeboard] write failed', e);
  const code = errorCode(e);
  toast(code === 'quota_exceeded' ? 'Storage is full, so that change did not save. Delete some old items and try again.'
    : code === 'invalid_doc' ? "That change didn't save because it didn't match the data shape."
    : "That change didn't save. Check your connection and try again.");
}

/** Runs a write that records what it touched in `rec`; toasts `message` (with Undo when undoable). */
export function runWrite(write: (rec: UndoRecord) => unknown, message?: string | (() => string | null) | null, undoable = true): Promise<unknown> | undefined {
  if (!store.ready) { toast("Your data isn't connected in this view, so nothing was saved."); return undefined; }
  const rec: UndoRecord = [];
  let p: Promise<unknown>;
  try { p = Promise.resolve(write(rec)); } catch (e) { p = Promise.reject(e instanceof Error ? e : new Error('write failed')); }
  p.catch(showSaveError);
  const text = typeof message === 'function' ? message() : message;
  if (text) toast(text, undoable ? () => { store.undo(rec).then(() => { toast('Undone'); }, showSaveError); } : null);
  return p;
}
export const deleteDoc = (collection: Parameters<typeof store.remove>[0], id: string, message: string): Promise<unknown> | undefined =>
  runWrite((rec) => store.remove(collection, id, rec), message);

type TaskBody = CollectionDoc<'tasks'>;
export interface NewTaskFields {
  title: string;
  category?: string | null | undefined;
  notes?: string | null | undefined;
  due_date?: DateString | null | undefined;
  deadline_date?: DateString | null | undefined;
  rule?: StoredRule | null | undefined;
  icon_key?: string | null | undefined;
  project?: string | null | undefined;
}
export function newTaskBody(f: NewTaskFields): TaskBody {
  return {
    title: f.title, category: f.category || 'Personal', notes: f.notes || '', due_date: f.due_date || null, deadline_date: f.deadline_date || null,
    status: 'open', completed_at: null, recurrence_rule: f.rule || null, recurrence_series_id: null, recurrence_parent_task_id: null, recurrence_spawned: false,
    icon_key: f.icon_key || iconForTitle(f.title, profile.pets), sort_order: 9999, urgent_sort_order: null, project: f.project || null,
  };
}
/* Complete-and-reschedule, as in the original app: the done task stays, a successor is spawned once. */
export function spawnSuccessor(d: CollectionDoc<'tasks'> & { id: string }, completedOn: DateString, rec?: UndoRecord): Promise<unknown> {
  const rule = d.recurrence_rule;
  if (!rule) return Promise.resolve();
  const due = nextDueAfter(rule, d, completedOn);
  let deadline: DateString | null = null;
  if (d.deadline_date) deadline = addDays(due, d.due_date ? daysBetween(d.due_date, d.deadline_date) : 0);
  return Promise.all([
    store.create('tasks', {
      ...newTaskBody({ title: d.title, category: d.category, notes: d.notes, rule, icon_key: d.icon_key, project: d.project }),
      due_date: d.due_date || !d.deadline_date ? due : null, deadline_date: deadline,
      recurrence_series_id: d.recurrence_series_id || d.id, recurrence_parent_task_id: d.id,
    }, rec),
    store.patch('tasks', d.id, { recurrence_spawned: true }, rec),
  ]);
}
