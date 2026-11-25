/* The add/edit sheet: task, list item, goal, habit, log a session, and Ask Claude. */
import { addDays, shortDate, weekdayOf } from '../../dates/index.ts';
import { ruleError, type CollectionDoc } from '../../db/schema.ts';
import { TASK_GROUPS } from '../../tasks/index.ts';
import { BUY_LIST_TAGS, iconForTitle } from '../../tasks/icons.ts';
import { GOAL_CATEGORIES, GOAL_CATEGORY_ICONS, GROCERY_AISLES, iconKeyOf, isBuyListTag } from '../board-model.ts';
import { clock, mondayOf, relativeDay } from '../shared/clock.ts';
import { clockLabel, escapeHtml, isDateString, safeUrl } from '../shared/format.ts';
import { statsOf } from '../shared/habit-weeks.ts';
import { hasLineIcon, icon } from '../shared/icons.ts';
import { reducedMotion } from '../shared/media.ts';
import { catchUp, render } from '../shared/redraw.ts';
import { model, profile, store, viewState, type Sheet } from '../shared/state.ts';
import { TASK_GROUP_ICONS } from '../shared/task-row.ts';
import { effectiveDateOf } from '../shared/tasks.ts';
import { toast } from '../shared/toast.ts';
import { newTaskBody, ruleDescription, ruleShortLabel, runWrite } from '../shared/writes.ts';
import { boardListKinds } from '../lists/view.ts';
import { guessAisle } from '../list-kinds.ts';
import { chatLogHtml, sendChat } from './chat.ts';
import { quickSync, readRule, repeatFields } from './repeat-fields.ts';
import { REPEAT_PRESETS, presetOf } from '../repeat-presets.ts';
import { parseQuickAdd } from '../quick-add.ts';

const TASK_ICONS = ['spark', 'heart', 'med', 'pill', 'coin', 'receipt', 'house', 'wrench', 'leaf', 'dog', 'cat', 'rings', 'gift', 'chat', 'phone', 'car', 'book', 'mountain', 'wave', 'lotus', 'laptop', 'target'];
const LIFE_AREA_GROUPS: Readonly<Record<string, string>> = { health: 'Health', money: 'Money', home: 'Home', hobbies: 'Personal' };

/** The + button: its label and the sheet it opens, by tab. */
export function fabConfig(): { label: string; sheet: Sheet } {
  const tab = viewState.tab;
  if (tab === 'lists') { const d = boardListKinds().find((l) => l.key === viewState.listKey) ?? { key: 'groceries', title: 'Groceries' }; return { label: 'Add to ' + d.title, sheet: { kind: 'item', list: d.key } }; }
  if (tab === 'grow') return viewState.growView !== 'goals' ? (model.habits.length ? { label: 'Log a habit', sheet: { kind: 'log' } } : { label: 'New habit', sheet: { kind: 'habit' } }) : { label: 'New goal', sheet: { kind: 'goal' } };
  if (tab === 'life') { const g = LIFE_AREA_GROUPS[viewState.lifeArea] ?? 'Personal'; return { label: 'New ' + g.toLowerCase() + ' task', sheet: { kind: 'task', defaults: { group: g } } }; }
  if (tab === 'plan') return { label: 'New task on ' + shortDate(viewState.calendarDay), sheet: { kind: 'task', defaults: { due: viewState.calendarDay } } };
  return { label: 'New task', sheet: { kind: 'task' } };
}

const sheetEl = (): HTMLElement | null => document.getElementById('sheet');
let lastFocus: Element | null = null;
export function openSheet(config: Sheet): void {
  lastFocus = document.activeElement;
  viewState.sheet = { ...config };
  renderSheet();
  const sh = sheetEl();
  if (!sh) return;
  sh.hidden = false;
  sh.getBoundingClientRect();
  requestAnimationFrame(() => {
    sh.classList.add('open');
    document.getElementById('scrim')?.classList.add('open');
    (sh.querySelector<HTMLElement>('[autofocus]') ?? sh.querySelector<HTMLElement>('input,button'))?.focus({ preventScroll: true });
  });
}
export function closeSheet(): void {
  const sh = sheetEl();
  sh?.classList.remove('open');
  document.getElementById('scrim')?.classList.remove('open');
  viewState.sheet = null;
  setTimeout(() => { if (!viewState.sheet && sh) { sh.hidden = true; sh.innerHTML = ''; } }, reducedMotion.matches ? 0 : 300);
  if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
  catchUp();
}
const radios = (name: string, opts: readonly (readonly [value: string, labelHtml: string])[], value: string): string =>
  `<div class="radios">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${escapeHtml(v)}" ${v === value ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;

function taskFields(c: Sheet, editing: (typeof model.tasks)[number] | null): { title: string; fields: string; submit: string } {
  const today = clock.today;
  const t = editing ?? { title: '', notes: '', project: '', group: c.defaults?.group ?? 'Personal', due: c.defaults?.due ?? today, deadline: '', rule: null };
  if (!editing) { c.baseDue = t.due || ''; c.touched ??= {}; }
  const currentIcon = editing?.doc.icon_key ? iconKeyOf(editing.doc.icon_key) : 'auto';
  const projects = [...new Set(model.tasks.map((x) => x.project).filter(Boolean))].sort();
  const quickDates: [string, string][] = [['Today', today], ['Tomorrow', addDays(today, 1)], ['Saturday', addDays(today, ((6 - weekdayOf(today)) + 7) % 7 || 7)], ['Next week', addDays(mondayOf(today), 7)], ['No date', '']];
  const full = `<label class="fld"><span>Title</span><input name="title" required value="${escapeHtml(t.title)}" autocomplete="off" enterkeyhint="done" placeholder="What needs doing?"></label>
      <fieldset class="fld"><legend>Group</legend>${radios('group', TASK_GROUPS.map((g) => [g, icon(TASK_GROUP_ICONS[g] ?? 'spark', 18) + g] as const), (TASK_GROUPS as readonly string[]).includes(t.group) ? t.group : 'Personal')}</fieldset>
      <label class="fld"><span>Project <small class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">optional</small></span><input name="project" list="projects" value="${escapeHtml(t.project || '')}" autocomplete="off" placeholder="Job search"><datalist id="projects">${projects.map((p) => `<option value="${escapeHtml(p)}">`).join('')}</datalist></label>
      <div class="two"><label class="fld"><span>Do date</span><input type="date" name="due" id="fDue" value="${t.due || ''}"></label><label class="fld"><span>Deadline</span><input type="date" name="deadline" value="${t.deadline || ''}"></label></div>
      <div class="quick">${quickDates.map(([l, v]) => `<button type="button" data-act="quick-date" data-val="${v}"><span>${l}</span></button>`).join('')}</div>
      <label class="fld"><span>Repeats</span><select name="rec">${REPEAT_PRESETS.map(([k, l]) => `<option value="${k}" ${presetOf(t.rule) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div id="recx">${repeatFields(t.rule)}</div><p class="qhint" id="rechelp">${t.rule ? escapeHtml(ruleDescription(t.rule)) : ''}</p>
      <fieldset class="fld"><legend>Icon</legend><div class="radios icons"><label><input type="radio" name="icon" value="auto" ${currentIcon === 'auto' ? 'checked' : ''} aria-label="Pick for me"><span style="width:auto;padding:0 12px">Auto</span></label>${TASK_ICONS.map((k) => `<label><input type="radio" name="icon" value="${k}" ${currentIcon === k ? 'checked' : ''} aria-label="${k}"><span>${icon(k, 24)}</span></label>`).join('')}</div></fieldset>
      <label class="fld"><span>Notes</span><textarea name="notes" placeholder="Anything future you should know">${escapeHtml(t.notes)}</textarea></label>`;
  const examples = ['dentist fri', 'water plants every 3 days', 'pay rent monthly'];
  const fields = editing ? full : `<label class="fld qfield"><span>Just type it</span><input name="quick" value="${escapeHtml(c.name || '')}" autocomplete="off" autofocus enterkeyhint="done" placeholder="dentist fri" aria-describedby="pchips qhint"></label>
      <div class="pchips" id="pchips" aria-live="polite"></div>
      <p class="qhint" id="qhint">Dates and repeats are picked up as you type. More options sets deadlines and monthly or yearly patterns.</p>
      <div class="quick" role="group" aria-label="Examples">${examples.map((x) => `<button type="button" data-act="q-try" data-val="${x}"><span>${x}</span></button>`).join('')}</div>
      <details class="more"><summary>${icon('chevR', 18)}More options</summary>${full}</details>`;
  return { title: editing ? 'Edit task' : 'New task', fields, submit: editing ? 'Save' : 'Add task' };
}

function itemFields(c: Sheet): string {
  const defs = boardListKinds(), key = defs.some((l) => l.key === c.list) ? (c.list ?? 'groceries') : 'groceries';
  const extra = key === 'groceries' ? `<label class="fld"><span>Aisle</span><select name="sec"><option value="">Guess for me</option>${GROCERY_AISLES.map((s) => `<option>${s}</option>`).join('')}</select></label>`
    : key === 'wish' ? `<fieldset class="fld"><legend>How much do you want it?</legend>${radios('tag', Object.entries(BUY_LIST_TAGS).map(([k, t]) => [k, `${t.label} <small class="muted" style="font-weight:400">${t.days === 0 ? 'now' : t.days ? String(t.days) + 'd' : '∞'}</small>`] as const), 'love')}</fieldset><div class="two"><label class="fld"><span>Price</span><input name="price" placeholder="about $120"></label><label class="fld"><span>Link</span><input name="url" type="url" placeholder="https://"></label></div>`
    : key === 'recipes' ? `<div class="two"><label class="fld"><span>Mood or cuisine</span><input name="mood" placeholder="Rice bowl"></label><label class="fld"><span>Time</span><input name="time" placeholder="30 min"></label></div><label class="fld"><span>Ingredients, one per line</span><textarea name="ing"></textarea></label><label class="fld"><span>Link</span><input name="url" type="url" placeholder="https://"></label>`
    : key === 'gifts' ? `<label class="fld"><span>For</span><input name="person" required list="people" autocomplete="off"><datalist id="people">${[...new Set(model.giftIdeas.map((g) => g.person))].map((p) => `<option value="${escapeHtml(p)}">`).join('')}</datalist></label><label class="fld"><span>Link</span><input name="url" type="url" placeholder="https://"></label>`
    : key === 'books' ? `<label class="fld"><span>Author</span><input name="by"></label>` : '';
  return `<label class="fld"><span>List</span><select name="list" data-act-change="sheet-list">${defs.map((l) => `<option value="${escapeHtml(l.key)}" ${l.key === key ? 'selected' : ''}>${escapeHtml(l.title)}</option>`).join('')}</select></label>
      <label class="fld"><span>${key === 'gifts' ? 'Gift idea' : key === 'recipes' ? 'Recipe' : 'Name'}</span><input name="name" required autocomplete="off" autofocus value="${escapeHtml(c.name || '')}"></label>${extra}`;
}

export function renderSheet(): void {
  const sh = sheetEl(), c = viewState.sheet;
  if (!sh || !c) return;
  const editing = c.kind === 'task' && c.id ? model.tasks.find((t) => t.id === c.id) ?? null : null;
  if (c.kind === 'task' && c.id && !editing) { closeSheet(); return; }
  const editingHabit = c.kind === 'habit' && c.id ? model.habits.find((h) => h.id === c.id) ?? null : null;
  if (c.kind === 'habit' && c.id && !editingHabit) { closeSheet(); return; }
  const kindButtons: [string, string][] = [['task', 'Task'], ['item', 'List item'], ['goal', 'Goal'], [model.habits.length ? 'log' : 'habit', 'Habit']];
  const kinds = !editing && !editingHabit && c.kind !== 'chat' ? `<div class="kinds" role="group" aria-label="What to add">${kindButtons.map(([k, l]) => `<button type="button" data-act="sheet-kind" data-val="${k}" aria-pressed="${String(c.kind === k || (l === 'Habit' && (c.kind === 'log' || c.kind === 'habit')))}">${l}</button>`).join('')}</div>` : '';
  let title: string, fields: string, submit: string;
  if (c.kind === 'task') ({ title, fields, submit } = taskFields(c, editing));
  else if (c.kind === 'item') { title = 'Add to a list'; submit = 'Add'; fields = itemFields(c); }
  else if (c.kind === 'goal') {
    title = 'New goal'; submit = 'Add goal';
    fields = `<label class="fld"><span>Goal</span><input name="title" required autofocus autocomplete="off" placeholder="e.g. Surf Mavericks (watch, not ride)" value="${escapeHtml(c.name || '')}"></label>
      <fieldset class="fld"><legend>Category</legend>${radios('cat', GOAL_CATEGORIES.map((g) => [g, icon(GOAL_CATEGORY_ICONS[g] ?? 'star', 17) + g] as const), 'Personal')}</fieldset>
      <label class="fld"><span>Year</span><input type="number" name="year" value="${clock.today.slice(0, 4)}" inputmode="numeric"></label>
      <label class="fld"><span>Notes</span><textarea name="notes"></textarea></label>`;
  } else if (c.kind === 'habit') {
    const eh = editingHabit;
    title = eh ? `Edit ${escapeHtml(eh.name)}` : 'New habit'; submit = eh ? 'Save' : 'Add habit';
    fields = `<label class="fld"><span>Habit</span><input name="name" required ${eh ? '' : 'autofocus '}autocomplete="off" placeholder="e.g. Drumming" value="${escapeHtml(eh ? eh.name : c.name || '')}"></label>
      <fieldset class="fld"><legend>Counts</legend><div class="radios">${[['week', 'Per week'], ['day', 'Per day']].map(([v, l]) => `<label><input type="radio" name="cadence" value="${v ?? ''}"${(eh?.daily ? 'day' : 'week') === v ? ' checked' : ''}><span>${l ?? ''}</span></label>`).join('')}</div></fieldset>
      <div class="two"><label class="fld"><span>Target</span><input type="number" name="target" min="1" max="14" value="${String(eh ? eh.target : 3)}" inputmode="numeric" ${eh ? 'autofocus' : ''}></label><label class="fld"><span>Floor</span><input type="number" name="floor" min="1" max="14" value="${String(eh ? eh.floor : 1)}" inputmode="numeric"></label></div>
      <p class="qhint">Per week: hit the floor by the week's end to keep the streak. Per day: hit it every day; one missed day ends the week's streak and withers the plant.${eh ? ' Changes re-score past weeks too (streaks, plants).' : ''}</p>
      <label class="fld"><span>Notes</span><textarea name="notes" placeholder="What counts as a session">${eh ? escapeHtml(eh.notes) : ''}</textarea></label>`;
  } else if (c.kind === 'chat') {
    const t = model.tasks.find((x) => x.id === c.taskId), started = !!c.messages?.length;
    title = 'Ask Claude'; submit = '';
    fields = `<p class="qhint" style="margin-top:0">${t ? icon(t.icon || 'spark', 18) + ' ' + escapeHtml(t.title) : ''}</p>
      <div id="chatLog" class="chatlog" aria-live="polite">${chatLogHtml(c)}</div>
      <label class="fld"><span class="sr">Message</span><textarea name="msg" id="chatIn" placeholder="${started ? 'Reply…' : 'What do you want help with? Leave blank to just start.'}" ${c.busy ? 'disabled' : ''}></textarea></label>
      <div class="row-btns" style="margin-top:8px"><button type="submit" class="btn primary" ${c.busy ? 'disabled' : ''}>${c.busy ? 'Thinking…' : started ? 'Send' : 'Start'}</button><button type="button" class="btn ghost" data-act="chat-copy">${icon('chat', 18)}Copy for a full chat</button></div>`;
  } else {
    title = 'Log a session'; submit = '';
    fields = `<label class="fld"><span>When</span><input type="date" name="date" id="logDate" value="${clock.today}" max="${clock.today}"></label>
      <div id="logEx" class="logex" hidden><p class="qhint"><b>That week is closed.</b> Its streaks were already checked. A late session counts only with a real reason and evidence, and it stays marked as an exception.</p>
        <label class="fld"><span>Why it wasn't logged that week</span><textarea name="exReason" id="exReason" placeholder="At least a sentence: what happened"></textarea></label>
        <label class="fld"><span>Evidence</span><input name="exEvidence" id="exEvidence" placeholder="e.g. Strava link, photo in camera roll, lesson receipt"></label></div>
      <div class="hpick">${model.habits.map((h) => `<button type="button" data-act="log-pick" data-id="${h.id}"><span class="hicon">${icon(h.icon, 22)}</span><span>${escapeHtml(h.name)}<br><span class="small muted" style="font-weight:400">${String(statsOf(h).week)} of ${String(h.target)} this week</span></span>${icon('plus', 20)}</button>`).join('')}</div>
      <button type="button" class="link" data-act="sheet-kind" data-val="habit" style="margin-top:6px">${icon('plus', 16)} New habit</button>`;
  }
  const eh = editingHabit;
  sh.innerHTML = `<div class="grab" aria-hidden="true"></div><form data-form="sheet" novalidate style="display:contents">
    <div class="sh-h"><h2 id="sheetT">${title}</h2><button type="button" class="iconbtn" data-act="sheet-close" aria-label="Close">${icon('x')}</button></div>
    <div class="sh-b">${kinds}${fields}</div>
    ${submit ? `<div class="sh-f">${editing ? `<button type="button" class="btn" data-act="sheet-del" data-id="${editing.id}" aria-label="Delete task">${icon('trash', 18)}</button>` : ''}${eh ? `<button type="button" class="btn" data-act="habit-del" data-id="${eh.id}" aria-label="Remove habit ${escapeHtml(eh.name)}">${icon('trash', 18)}Remove</button><button type="button" class="btn" data-act="habit-hide" data-id="${eh.id}" aria-label="Hide habit ${escapeHtml(eh.name)}">Hide</button>` : ''}<button type="submit" class="btn primary" id="sheetSubmit">${submit}</button></div>` : ''}
  </form>`;
  quickSync(true);
}

const fieldText = (f: Record<string, FormDataEntryValue>, k: string): string => { const v = f[k]; return typeof v === 'string' ? v : ''; };
const focusField = (form: HTMLFormElement, name: string): void => { form.querySelector<HTMLElement>(`[name=${name}]`)?.focus(); };

function submitTask(form: HTMLFormElement, f: Record<string, FormDataEntryValue>, c: Sheet): boolean {
  const title = fieldText(f, 'title').trim() || (f['quick'] ? parseQuickAdd(fieldText(f, 'quick'), clock.today).title : '');
  if (!title) { (form.querySelector<HTMLElement>('[name=quick]') ?? form.querySelector<HTMLElement>('[name=title]'))?.focus(); toast('Give it a title'); return false; }
  let notes = fieldText(f, 'notes').trim();
  if (!c.id && c.time != null && !notes) notes = 'At ' + clockLabel(c.time);
  const rule = readRule(form);
  if (rule && ruleError(rule)) { toast('That repeat pattern is incomplete'); return false; }
  const due = fieldText(f, 'due'), deadline = fieldText(f, 'deadline');
  const patch: Partial<CollectionDoc<'tasks'>> = { title, category: fieldText(f, 'group') || 'Personal', due_date: isDateString(due) ? due : null, deadline_date: isDateString(deadline) ? deadline : null, recurrence_rule: rule, notes, project: fieldText(f, 'project').trim().replace(/\s+/g, ' ') || null };
  const chosenIcon = f['icon'] && f['icon'] !== 'auto' ? fieldText(f, 'icon') : null;
  const id = c.id;
  if (id) {
    const t = model.tasks.find((x) => x.id === id);
    if (chosenIcon) patch.icon_key = chosenIcon;
    if ((t?.doc.due_date || null) !== patch.due_date) patch.urgent_sort_order = null;
    void runWrite((rec) => store.patch('tasks', id, patch, rec), 'Task saved');
  } else {
    const when = patch.due_date || patch.deadline_date ? relativeDay(effectiveDateOf({ due: patch.due_date ?? null, deadline: patch.deadline_date ?? null }) ?? '') : 'no date yet';
    void runWrite((rec) => store.create('tasks', newTaskBody({ title, category: patch.category, notes, due_date: patch.due_date, deadline_date: patch.deadline_date, rule, project: patch.project, icon_key: chosenIcon || iconForTitle(title, profile.pets) }), rec),
      `Added “${title}” · ${when}${rule ? ' · ' + ruleShortLabel(rule).toLowerCase() : ''}`);
  }
  return true;
}
function submitItem(form: HTMLFormElement, f: Record<string, FormDataEntryValue>): boolean {
  const name = fieldText(f, 'name').trim();
  if (!name) { focusField(form, 'name'); toast('Add a name first'); return false; }
  const list = fieldText(f, 'list'), url = safeUrl(fieldText(f, 'url')) || null, person = fieldText(f, 'person').trim();
  if (list === 'gifts' && !person) { focusField(form, 'person'); toast('Who is it for?'); return false; }
  const tag = fieldText(f, 'tag');
  void runWrite((rec) => {
    if (list === 'groceries') return store.create('groceries', { name, group_name: fieldText(f, 'sec') || guessAisle(name), checked: false, sort_order: 9999 }, rec);
    if (list === 'wish') return store.create('buy_list_items', { name, tag: isBuyListTag(tag) ? tag : 'love', price: fieldText(f, 'price').trim(), url, notes: '', status: 'waiting', added_date: clock.today, sort_order: 9999 }, rec);
    if (list === 'recipes') return store.create('recipes', { name, mood: fieldText(f, 'mood').trim(), url, notes: '', time: fieldText(f, 'time').trim(), ingredients: fieldText(f, 'ing').split('\n').map((x) => x.trim()).filter(Boolean), status: 'planned', cooked_at: null, session_ref: null, sort_order: 9999 }, rec);
    if (list === 'gifts') return store.create('gift_ideas', { person, idea: name, url, status: 'idea', sort_order: 9999 }, rec);
    return store.create('list_items', { list_key: list, title: name, author: list === 'books' ? fieldText(f, 'by').trim() || null : null, url, notes: '', status: 'want', sort_order: 9999 }, rec);
  }, `Added to ${boardListKinds().find((l) => l.key === list)?.title ?? 'the list'}`);
  viewState.listKey = list;
  viewState.tab = 'lists';
  return true;
}
function submitGoal(f: Record<string, FormDataEntryValue>): boolean {
  const title = fieldText(f, 'title').trim();
  if (!title) { toast('Name the goal first'); return false; }
  const auto = iconForTitle(title, profile.pets), category = fieldText(f, 'cat') || 'Personal';
  void runWrite((rec) => store.create('goals', { title, category, year: Math.round(Number(f['year'])) || Number(clock.today.slice(0, 4)), status: 'active', notes: fieldText(f, 'notes').trim(), icon_key: hasLineIcon(auto) && !['spark', 'star'].includes(auto) ? auto : GOAL_CATEGORY_ICONS[category] || 'star', progress_q1: '', progress_q2: '', progress_q3: '', progress_q4: '', sort_order: 9999 }, rec), 'Goal added');
  viewState.tab = 'grow';
  viewState.growView = 'goals';
  return true;
}
/** A garden plot id: random, so a roster that names it says nothing about the habit. */
const newPlotId = (): string => 'p' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
function submitHabit(f: Record<string, FormDataEntryValue>, c: Sheet): boolean {
  const name = fieldText(f, 'name').trim();
  if (!name) { toast('Name the habit first'); return false; }
  const target = Math.max(1, Math.min(14, Math.round(Number(f['target'])) || 1)), floor = Math.max(1, Math.min(target, Math.round(Number(f['floor'])) || 1)), cadence = f['cadence'] === 'day' ? 'day' : 'week';
  const id = c.id;
  if (id) {
    void runWrite((rec) => store.patch('habits', id, { name, cadence, target_per_week: target, streak_floor_per_week: floor, notes: fieldText(f, 'notes').trim() }, rec), `${name}: floor ${String(floor)}, target ${String(target)} a ${cadence}`);
    return true;
  }
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit';
  void runWrite((rec) => store.create('habits', { key: model.habits.some((h) => h.key === key) ? key + '-' + Date.now().toString(36) : key, plot_id: newPlotId(), name, cadence, target_per_week: target, streak_floor_per_week: floor, notes: fieldText(f, 'notes').trim(), sort_order: (model.habits.length + 1) * 10 }, rec), 'Habit added');
  viewState.tab = 'grow';
  viewState.growView = 'habits';
  return true;
}
export function submitSheet(form: HTMLFormElement): void {
  const f = Object.fromEntries(new FormData(form).entries()), c = viewState.sheet;
  if (!c) return;
  if (c.kind === 'chat') { void sendChat(fieldText(f, 'msg').trim(), renderSheet); return; }
  const done = c.kind === 'task' ? submitTask(form, f, c) : c.kind === 'item' ? submitItem(form, f) : c.kind === 'goal' ? submitGoal(f) : c.kind === 'habit' ? submitHabit(f, c) : true;
  if (!done) return;
  closeSheet();
  render();
}
