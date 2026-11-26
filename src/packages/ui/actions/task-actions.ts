/* What the person does to tasks: complete, move, reorder, hand to Claude or Duet, and handle Claude's suggestions. */
import { addDays, weekdayOf, type DateString } from '../../dates/index.ts';
import { TASK_GROUPS } from '../../tasks/index.ts';
import { feedEcosystem } from '../game/game.ts';
import { errorCode, useSample } from '../shared/artifact-runtime.ts';
import type { BoardTask } from '../board-model.ts';
import { liveCalendar } from '../shared/calendar-feed.ts';
import { clock, mondayOf, relativeDay, weekdayName } from '../shared/clock.ts';
import { isDateString, plural } from '../shared/format.ts';
import { reducedMotion } from '../shared/media.ts';
import { render } from '../shared/redraw.ts';
import { model, profile, store, viewState } from '../shared/state.ts';
import { taskPrompt } from '../shared/task-row.ts';
import { bucketOf, bucketsOf, effectiveDateOf, type Bucket } from '../shared/tasks.ts';
import { toast } from '../shared/toast.ts';
import { nextDueAfter, runWrite, spawnSuccessor } from '../shared/writes.ts';

const taskById = (id: string): BoardTask | undefined => model.tasks.find((x) => x.id === id);

export function toggleTask(id: string, button: Element | null): void {
  const t = taskById(id);
  if (!t) return;
  const d = t.doc;
  const finish = (): void => {
    if (t.done) { void runWrite((rec) => store.patch('tasks', id, { status: 'open', completed_at: null }, rec), 'Marked not done'); return; }
    const next = d.recurrence_rule && !d.recurrence_spawned ? nextDueAfter(d.recurrence_rule, d, clock.today) : null;
    feedEcosystem();
    void runWrite((rec) => Promise.all([store.patch('tasks', id, { status: 'done', completed_at: Date.now() }, rec), next ? spawnSuccessor(d, clock.today, rec) : null]),
      next ? `Done. Next one ${relativeDay(next)}` : 'Done. Nice.');
  };
  const row = button?.closest('.task');
  if (row && !t.done && !reducedMotion.matches) { row.classList.add('done'); setTimeout(() => { row.classList.add('leaving'); setTimeout(finish, 180); }, 160); }
  else finish();
}

/** Saturday ahead; on a weekend day, the next one. */
function nextWeekend(): DateString {
  const w = weekdayOf(clock.today);
  return addDays(clock.today, w === 6 ? 7 : w === 0 ? 6 : 6 - w);
}
export type SnoozeTarget = 'week' | 'tomorrow' | 'today' | 'weekend' | 'day';
/** Moves a task's do date; 'day' = one day past its do date (or today). */
export function snooze(id: string, target: SnoozeTarget): void {
  const t = taskById(id);
  if (!t) return;
  viewState.expandedId = null;
  const today = clock.today, base = t.due && t.due > today ? t.due : today;
  const nd = target === 'week' ? addDays(mondayOf(today), 7) : target === 'tomorrow' ? addDays(today, 1) : target === 'today' ? today : target === 'weekend' ? nextWeekend() : addDays(base, 1);
  void runWrite((rec) => store.patch('tasks', id, { due_date: nd, deadline_date: t.deadline && t.deadline < nd ? null : t.deadline, urgent_sort_order: null }, rec), `Moved “${t.title}” to ${relativeDay(nd)}`);
}
/** Overdue and slipped tasks, all to tomorrow. */
export function carryAll(): void {
  const tomorrow = addDays(clock.today, 1), list = model.tasks.filter((t) => { const e = effectiveDateOf(t); return !t.done && e && e < clock.today; });
  if (!list.length) return;
  viewState.expandedId = null;
  void runWrite((rec) => Promise.all(list.map((t) => store.patch('tasks', t.id, { due_date: tomorrow, deadline_date: t.deadline && t.deadline < tomorrow ? null : t.deadline, urgent_sort_order: null }, rec))), `Moved ${plural(list.length, 'task')} to tomorrow`);
}

/** Saves a bucket's new order. In This week and Later, a task dropped among other dates takes its neighbour's date. */
export function applyOrder(bucket: Bucket, ids: string[], movedId: string): void {
  const field = bucket === 'urgent' ? 'urgent_sort_order' : 'sort_order';
  let message: string | null = null;
  void runWrite((rec) => {
    const writes: Promise<unknown>[] = [];
    const me = taskById(movedId);
    if ((bucket === 'week' || bucket === 'later') && me) {
      const i = ids.indexOf(movedId), prev = i > 0 ? taskById(ids[i - 1] ?? '') : undefined, next = taskById(ids[i + 1] ?? '');
      const pe = prev ? effectiveDateOf(prev) : null, ne = next ? effectiveDateOf(next) : null, e = effectiveDateOf(me) ?? '';
      if ((pe && pe > e) || (ne && ne < e)) {
        const nd = (pe && pe > e ? pe : ne) ?? e;
        writes.push(store.patch('tasks', movedId, { due_date: nd, deadline_date: me.deadline && me.deadline < nd ? null : me.deadline, urgent_sort_order: null }, rec));
        message = `Moved “${me.title}” to ${relativeDay(nd)}`;
      }
    }
    ids.forEach((id, i) => { const t = taskById(id); if (t && t.doc[field] !== (i + 1) * 10) writes.push(store.patch('tasks', id, { [field]: (i + 1) * 10 }, rec)); });
    return Promise.all(writes);
  }, () => message, true);
}
/** One step up (-1) or down (1) within its bucket; false at either end. */
export function moveTask(id: string, dir: number): boolean {
  const t = taskById(id);
  if (!t || t.done) return false;
  const bucket = bucketOf(t), list = bucketsOf(model.tasks)[bucket].slice(), i = list.indexOf(t), j = i + dir;
  if (j < 0 || j >= list.length) return false;
  list.splice(i, 1);
  list.splice(j, 0, t);
  applyOrder(bucket, list.map((x) => x.id), id);
  return true;
}

export function copyText(text: string): Promise<boolean> {
  const fallback = (): boolean => {
    const a = document.createElement('textarea');
    a.value = text;
    a.setAttribute('readonly', '');
    a.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(a);
    a.select();
    let ok: boolean;
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- fallback for pages without the async clipboard API
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    a.remove();
    return ok;
  };
  if ((navigator.clipboard as Clipboard | undefined)?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  return Promise.resolve(fallback());
}

/* Send to Duet: mark the task, then start Duet's scheduled run right now with this task as its focus.
   Duet is the owner's own scheduled agent; its trigger id lives in checks/profile.duet_trigger, and the button hides without it.
   If the page can't start it (connector not allowed), copy the task to paste into Duet instead. */
const CLAUDE_CODE_REMOTE = 'Claude Code Remote';
function duetRunText(t: BoardTask): string {
  const when = [t.due && `due ${t.due}`, t.deadline && `deadline ${t.deadline}`].filter(Boolean).join(', ');
  const who = profile.name || 'The owner';
  return `${who} tapped "Send to Duet" on a lifeboard task, so this run was started early. Do the usual check, then make this task the focus of your message.\n\n`
    + `Task: "${t.title}" (tasks doc ${t.id}${t.group ? ', ' + t.group : ''}${t.project ? ', project ' + t.project : ''}${when ? ', ' + when : ''}).${t.notes ? '\nNotes: ' + t.notes : ''}\n\n`
    + `Start working on it with them in this chat: say what you can already do, do the parts that need no decision from them, and ask them for anything only they have. `
    + `Don't send any email, pay, or book anything; drafts only. Don't mark or edit the task; ${who} taps done themself.`;
}
export async function sendToDuet(t: BoardTask): Promise<void> {
  if (!store.ready) { toast("Your data isn't connected in this view."); return; }
  if (viewState.duetBusy || !profile.duetTrigger) return;
  viewState.duetBusy = true;
  const fallback = async (why: string): Promise<void> => {
    store.patch('tasks', t.id, { duet_request: null }).catch(() => undefined);
    const ok = await copyText(taskPrompt(t, true));
    toast(ok ? `${why} Copied the task instead: paste it into Duet.` : `${why} Open your Duet chat and paste the task title.`);
  };
  try {
    await store.patch('tasks', t.id, { duet_request: { requested_at: Date.now(), status: 'queued' } });
    if (!liveCalendar.mcp) { await fallback("Couldn't start Duet from here."); return; }
    toast('Starting Duet…');
    await liveCalendar.mcp.callTool(CLAUDE_CODE_REMOTE, 'fire_trigger', { trigger_id: profile.duetTrigger, text: duetRunText(t) }, { cache: false });
    toast('Sent. Duet is starting now; its reply will be in your Duet chat.');
  } catch (e) {
    console.warn('[lifeboard] send to Duet failed', e);
    const code = errorCode(e);
    await fallback(code === 'not_granted' || code === 'denied' ? 'Duet needs permission first.' : "Couldn't start Duet.");
  } finally { viewState.duetBusy = false; }
}

interface AdjustReply { intent?: unknown; title?: unknown; notes?: unknown; due_date?: unknown; deadline_date?: unknown; category?: unknown; reason?: unknown; rule?: unknown }
const trimmedText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/* Adjust a suggestion: Claude rewrites it from a short instruction. Without Claude in this view,
   the ask is saved on the task for the next check-in. */
export async function adjustSuggestion(id: string, ask: string): Promise<void> {
  const t = model.suggested.find((x) => x.id === id);
  if (!t || viewState.adjustBusyId) return;
  const d = t.doc;
  let sample;
  try { sample = await useSample(); } catch { sample = null; }
  if (!sample) { viewState.adjustingId = null; void runWrite((rec) => store.patch('tasks', id, { adjust_request: ask }, rec), 'Saved. Claude will adjust it on the next check-in.'); return; }
  viewState.adjustBusyId = id;
  render();
  try {
    const cur = { title: d.title, notes: d.notes || '', due_date: d.due_date || null, deadline_date: d.deadline_date || null, category: d.category || 'Personal' };
    const reply = (await sample.json(`You handle feedback on one suggested to-do on a personal life dashboard. Today is ${weekdayName(weekdayOf(clock.today))} ${clock.today}.
Current suggestion (JSON): ${JSON.stringify(cur)}
The person wrote: ${JSON.stringify(ask)}
First decide the intent. "dismiss" if they reject the suggestion outright (e.g. "no", "dismiss", "already done", "not relevant", "don't suggest this"). Otherwise "edit".
If "edit": apply only that change and keep everything else. Keep the title short and plain; notes are one or two plain sentences.
If "dismiss": give the reason in a few words, and a one-sentence rule the suggestion assistant could follow to avoid suggestions like this (or null if it's a one-off, like "already done").
Reply with JSON only: {"intent": "edit" | "dismiss", "title": string, "notes": string, "due_date": "YYYY-MM-DD" or null, "deadline_date": "YYYY-MM-DD" or null, "category": one of ${JSON.stringify(TASK_GROUPS)}, "reason": string or null, "rule": string or null}`, { modelTier: 'quick' })) as AdjustReply | null;
    if (reply?.intent === 'dismiss') {
      const reason = trimmedText(reply.reason) ? trimmedText(reply.reason).slice(0, 200) : ask.slice(0, 200);
      const rule = trimmedText(reply.rule) ? trimmedText(reply.rule).slice(0, 300) : null;
      viewState.adjustingId = null;
      void runWrite(async (rec) => {
        await store.create('logs', { kind: 'dismissal', label: d.title, value: { reason, rule, said: ask.slice(0, 300) }, date: clock.today }, rec);
        await store.remove('tasks', id, rec);
      }, `Dismissed. Reason saved for the weekly review.`);
      return;
    }
    const title = trimmedText(reply?.title) ? trimmedText(reply?.title).slice(0, 200) : null;
    if (!title) throw new Error('bad reply');
    const due = isDateString(reply?.due_date) ? reply.due_date : null, deadline = isDateString(reply?.deadline_date) ? reply.deadline_date : null;
    const category = typeof reply?.category === 'string' && (TASK_GROUPS as readonly string[]).includes(reply.category) ? reply.category : cur.category;
    const patch = { title, notes: trimmedText(reply?.notes) || null, due_date: due, deadline_date: deadline && (!due || deadline >= due) ? deadline : null, category, adjust_request: null };
    viewState.adjustingId = null;
    void runWrite((rec) => store.patch('tasks', id, patch, rec), `Adjusted: “${title}”`);
  } catch (e) {
    const code = errorCode(e);
    toast(code === 'rate_limited' ? 'Claude is busy right now. Try again in a minute.' : code === 'not_granted' ? 'Claude isn’t available in this view.' : 'Couldn’t adjust that. Try wording it differently.');
  } finally { viewState.adjustBusyId = null; render(); }
}
