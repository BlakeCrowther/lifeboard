/* A task as a list row (tick, title, meta chips, and its tray of actions when expanded), and a group's task list. */
import { daysBetween } from '../../dates/index.ts';
import { RULES } from '../../game/index.ts';
import { gameRun } from '../game/game.ts';
import type { BoardTask } from '../board-model.ts';
import { clock, relativeDay } from './clock.ts';
import { lockLabel, lockMinutesLeft } from './commitments.ts';
import { escapeHtml } from './format.ts';
import { icon } from './icons.ts';
import { model, profile, viewState } from './state.ts';
import { bucketOf, compareByDate, effectiveDateOf, sortUrgentTasks, stateOf } from './tasks.ts';
import { ruleShortLabel } from './writes.ts';

export const TASK_GROUP_ICONS: Readonly<Record<string, string>> = { Social: 'social', Health: 'heart', Money: 'coin', Home: 'house', Pets: 'paw', Personal: 'person', Work: 'laptop', Goals: 'sprout' };

export interface TaskRowOptions {
  /** status markup in place of the date chips (a past day's missed task) */
  status?: string;
  hideGroup?: boolean;
  /** draggable: a grip and move buttons */
  grip?: boolean;
}

function taskMeta(t: BoardTask, opts: TaskRowOptions): string {
  const st = stateOf(t), e = effectiveDateOf(t), bits: string[] = [];
  if (opts.status) bits.push(opts.status);
  else if (t.done) bits.push(`<span class="m">${icon('check', 15)}Done</span>`);
  else if (e) {
    if (st.overdue) bits.push(`<span class="m bad">Overdue · ${relativeDay(e)}</span>`);
    else if (st.slipped && t.due && t.deadline) bits.push(`<span class="m hot">Slipped from ${relativeDay(t.due)}</span><span class="m">Due by ${relativeDay(t.deadline)}</span>`);
    else if (e === clock.today) bits.push(`<span class="m hot">Today</span>`);
    else bits.push(`<span class="m">${relativeDay(e)}</span>`);
    if (t.deadline && t.due && t.deadline !== t.due && !st.slipped && e !== t.deadline) bits.push(`<span class="m">Deadline ${relativeDay(t.deadline)}</span>`);
  }
  if (t.rule) bits.push(`<span class="m">${icon('repeat')}${escapeHtml(ruleShortLabel(t.rule))}</span>`);
  /* missed: days since first committed, whether it sat overdue or kept getting pushed (SPEC.md aged tasks) */
  if (!t.done) {
    const first = t.days[0] || (e && e < clock.today ? e : null), age = first ? daysBetween(first, clock.today) : 0, pushes = t.days.length - 1;
    /* red = this task grows blight; blight counts age from the game start at the earliest (the game package's ageAt) */
    const blightAge = first && gameRun.start && first < gameRun.start ? daysBetween(gameRun.start, clock.today) : age;
    if (age > 0 && first) bits.push(`<span class="chip${blightAge >= RULES.tide.blightAfter ? ' bad' : ''}" title="First committed ${relativeDay(first)}; it hasn't been done since">Missed ${String(age)}d${pushes > 0 ? ` · pushed ${String(pushes)}×` : ''}</span>`);
    const left = e === clock.today ? lockMinutesLeft(t) : 0;
    if (left > 0 && left !== Infinity) bits.push(`<span class="chip" title="Moving it off today before then won't count as missed">${icon('snooze', 13)}Locks in ${lockLabel(left)}</span>`);
  }
  if (!opts.hideGroup) bits.push(`<span class="chip gm" title="Group">${icon(TASK_GROUP_ICONS[t.group] || 'spark', 15)}${escapeHtml(t.group)}</span>`);
  if (t.project) bits.push(`<span class="chip" title="Project">${icon('folder', 13)}${escapeHtml(t.project)}</span>`);
  if (t.duet && !t.done) bits.push(`<span class="chip hot" title="Handed to Duet">${icon('chat', 13)}Sent to Duet</span>`);
  return `<span class="tmeta">${bits.join('')}</span>`;
}

/** A task as a prompt for Claude: a fresh chat, or (duet) the owner's Duet agent. */
export function taskPrompt(t: BoardTask, duet: boolean): string {
  const when: string[] = [];
  if (t.due) when.push(`do date ${t.due}`);
  if (t.deadline) when.push(`deadline ${t.deadline}`);
  const lines = [duet ? `Lifeboard task: “${t.title}”. Help me work on this one now.` : `Help me get this task done: “${t.title}”.`];
  const context = [t.group, t.project, when.join(', ')].filter(Boolean).join(' · ');
  if (context) lines.push(`Context: ${context}.`);
  if (t.notes) lines.push(`Notes: ${t.notes}`);
  if (duet) lines.push('Update the task on the board if anything changes, but leave marking it done to me.');
  else lines.push('Start by asking me anything you need, then do as much of it as you can.');
  return lines.join('\n');
}
/* The desktop app's viewer drops new tabs and claude:// links blank the frame, so there the button copies the prompt. */
const IN_DESKTOP_APP = /Electron|Claude\//i.test(navigator.userAgent);
const newChatUrl = (t: BoardTask): string => 'https://claude.ai/new?q=' + encodeURIComponent(taskPrompt(t, false));

export function taskRow(t: BoardTask, opts: TaskRowOptions = {}): string {
  const open = viewState.expandedId === t.id, grip = opts.grip && !t.done, e = effectiveDateOf(t);
  return `<li class="task${t.done ? ' done' : ''}${grip ? '' : ' nogrip'}${!t.done && stateOf(t).overdue ? ' late' : ''}" data-id="${t.id}">
    <button class="tick" data-act="toggle" data-id="${t.id}" aria-pressed="${String(t.done)}" aria-label="${t.done ? 'Mark not done' : 'Complete'}: ${escapeHtml(t.title)}"><span class="ring">${icon('check', 16)}</span></button>
    <button class="tmain" data-act="expand" data-id="${t.id}" aria-expanded="${String(open)}"><span class="ttl">${icon(t.icon || 'spark', 22)} ${escapeHtml(t.title)}</span>${taskMeta(t, opts)}</button>
    ${t.done ? '' : `<button class="act" data-act="snooze" data-id="${t.id}" aria-label="Snooze ${escapeHtml(t.title)} by a day">${icon('snooze')}</button>`}
    ${grip ? `<button class="act grip" data-drag="${t.id}" data-act="grip" data-id="${t.id}" aria-label="Reorder ${escapeHtml(t.title)}. Drag, or use arrow keys">${icon('grip')}</button>` : ''}
    ${open && t.notes ? `<p class="notes">${escapeHtml(t.notes)}</p>` : ''}
    ${open ? `<div class="tray">
      ${t.done ? '' : `${e && e < clock.today ? `<button class="btn sm" data-act="resched" data-val="today" data-id="${t.id}">Today</button>` : ''}<button class="btn sm" data-act="resched" data-val="tomorrow" data-id="${t.id}">Tomorrow</button><button class="btn sm" data-act="resched" data-val="weekend" data-id="${t.id}">This weekend</button><button class="btn sm" data-act="snooze-week" data-id="${t.id}">${icon('snooze', 18)}Next week</button>`}
      ${grip ? `<button class="btn sm" data-act="move" data-dir="-1" data-id="${t.id}" aria-label="Move up">${icon('up', 18)}</button><button class="btn sm" data-act="move" data-dir="1" data-id="${t.id}" aria-label="Move down">${icon('down', 18)}</button>` : ''}
      ${t.done ? '' : `${IN_DESKTOP_APP ? `<button class="btn sm" data-act="claudecopy" data-id="${t.id}" title="Copies this task as a prompt for a new chat">${icon('spark', 18)}Copy for Claude</button>` : `<a class="btn sm" href="${escapeHtml(newChatUrl(t))}" target="_blank" rel="noopener noreferrer" title="Opens a new Claude chat with this task filled in">${icon('spark', 18)}New Claude chat</a>`}${profile.duetTrigger ? `<button class="btn sm" data-act="duet" data-id="${t.id}" title="Starts Duet now with this task as its focus">${icon('chat', 18)}${t.duet ? 'Send to Duet again' : 'Send to Duet'}</button>` : ''}`}
      <button class="btn sm" data-act="edit" data-id="${t.id}">${icon('edit', 18)}Edit</button>
      <button class="btn sm ghost" data-act="del" data-id="${t.id}">${icon('trash', 18)}Delete</button>
    </div>` : ''}
  </li>`;
}

/** A group's open tasks (urgent first) and those finished in the last day, in a card. */
export function groupTasks(filter: (t: BoardTask) => boolean, empty: string): string {
  const open = sortUrgentTasks(model.tasks.filter((t) => !t.done && filter(t) && bucketOf(t) === 'urgent'))
    .concat(model.tasks.filter((t) => !t.done && filter(t) && bucketOf(t) !== 'urgent').sort(compareByDate));
  const done = model.tasks.filter((t) => t.done && filter(t) && t.doneAt && Date.now() - t.doneAt < 864e5);
  if (!open.length && !done.length) return `<div class="card"><p class="empty">${empty}</p></div>`;
  return `<div class="card"><ul class="list">${open.map((t) => taskRow(t, { hideGroup: true })).join('')}${done.map((t) => taskRow(t, { hideGroup: true })).join('')}</ul></div>`;
}
