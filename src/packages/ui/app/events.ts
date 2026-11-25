/* Page events: every control carries data-act (clicks), data-form (submits) or a name the sheet watches. One listener
   per event type dispatches them. */
import { addMonths } from '../../dates/index.ts';
import type { LessonAction } from '../../game/index.ts';
import { BUY_LIST_TAGS } from '../../tasks/icons.ts';
import { logEvent, logHabit, startBreakTimer, unlogHabit } from '../actions/habit-actions.ts';
import { adjustSuggestion, carryAll, copyText, moveTask, sendToDuet, snooze, toggleTask } from '../actions/task-actions.ts';
import { loadGameModulesOnce, saveKeepsake } from '../game/game.ts';
import { answerCurrentLesson, checkLessonAnswer, closeLessons, lessonRun, nextLesson, openLessons, pickLessonChoice } from '../game/lessons.ts';
import { guessAisle } from '../list-kinds.ts';
import { isBuyListTag, isValidException } from '../board-model.ts';
import { allowCalendar } from '../shared/calendar-watch.ts';
import { clock, habitWeekOf } from '../shared/clock.ts';
import { isDateString, plural } from '../shared/format.ts';
import { phoneLayout, reducedMotion } from '../shared/media.ts';
import { devicePrefs, ecosystemLink, gameOn, saveBoardPrefs, saveDevicePrefs, setFoldOpen, setTheme, setTips } from '../shared/prefs.ts';
import { render, renderPending, userBusy } from '../shared/redraw.ts';
import { model, profile, store, viewState, type Sheet } from '../shared/state.ts';
import { taskPrompt } from '../shared/task-row.ts';
import { toast } from '../shared/toast.ts';
import { deleteDoc, ruleDescription, runWrite } from '../shared/writes.ts';
import { chatTranscript } from '../sheet/chat.ts';
import { quickSync, readRule, syncRepeatFields } from '../sheet/repeat-fields.ts';
import { ruleForPreset } from '../repeat-presets.ts';
import { closeSheet, fabConfig, openSheet, renderSheet, submitSheet } from '../sheet/sheet.ts';
import { toggleTip } from '../shared/tips.ts';
import { collapseRingTasks, ringTasksOpen } from '../today/week-rings.ts';
import { isDragging, listenForDrags } from './drag.ts';
import { go, readHash } from './navigation.ts';
import { onScroll, popoverOpen, popoverOpenedBy, setPopover } from './render.ts';

const SHEET_KINDS: readonly string[] = ['task', 'item', 'goal', 'habit', 'log', 'chat'];
const isSheetKind = (k: string): k is Sheet['kind'] => SHEET_KINDS.includes(k);
const LESSON_ACTIONS: readonly string[] = ['advance', 'wrong', 'again', 'drop', 'skip', 'flag'];
const inputValue = (id: string): string => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const focusFirst = (selector: string): void => { document.querySelector<HTMLElement>(selector)?.focus(); };

function onClick(e: MouseEvent): void {
  const target = e.target as Element | null;
  if (popoverOpen() && !target?.closest('#pop') && !target?.closest('[data-act="menu"]')) setPopover(false);
  const b = target?.closest<HTMLElement>('[data-act]');
  if (!b) return;
  const act = b.dataset['act'] ?? '', id = b.dataset['id'] ?? '', val = b.dataset['val'] ?? '';
  const task = (): (typeof model.tasks)[number] | undefined => model.tasks.find((x) => x.id === id);
  const suggestion = (): (typeof model.suggested)[number] | undefined => model.suggested.find((x) => x.id === id);
  switch (act) {
    case 'tab': if (viewState.tab === val) scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' }); else go(val); break;
    case 'go': go(b.dataset['to'] ?? 'today', b.dataset['anchor']); break;
    case 'chat': { const t = task(); if (t) openSheet({ kind: 'chat', taskId: t.id, messages: [] }); break; }
    case 'chat-copy': {
      const c = viewState.sheet, t = c && model.tasks.find((x) => x.id === c.taskId), messages = c?.messages ?? [];
      if (t) void copyText(taskPrompt(t, false) + (messages.length ? '\n\nSo far:\n' + chatTranscript(messages) : '')).then((ok) => { toast(ok ? 'Copied. Paste it into a full Claude chat.' : 'Couldn’t copy here.'); });
      break;
    }
    case 'claudecopy': { const t = task(); if (t) void copyText(taskPrompt(t, false)).then((ok) => { toast(ok ? 'Task prompt copied. Paste it into a new chat (⌘N).' : 'Couldn’t copy the prompt here.'); }); break; }
    case 'menu': setPopover(!popoverOpen() || !popoverOpenedBy(b), b); break;
    case 'set-theme': setTheme(val); saveBoardPrefs({ theme: val }); render(); break;
    case 'set-eco': devicePrefs.eco = val === 'on'; ecosystemLink.forced = false; saveDevicePrefs(); saveBoardPrefs({ eco: devicePrefs.eco }); if (gameOn()) void loadGameModulesOnce(); render(); break;
    case 'set-garden': devicePrefs.garden = val === 'on'; saveDevicePrefs(); saveBoardPrefs({ garden: devicePrefs.garden }); if (gameOn()) void loadGameModulesOnce(); render(); break;
    case 'set-tips': setTips(val === 'on'); render(); break;
    case 'tip': toggleTip(id); break;
    case 'fold': setFoldOpen(b.dataset['key'] ?? '', b.getAttribute('aria-expanded') !== 'true'); render(); break;
    case 'fab': if (store.state.status === 'ready') openSheet(fabConfig().sheet); break;
    case 'new-habit': openSheet({ kind: 'habit' }); break;
    case 'edit-habit': if (model.habits.some((h) => h.id === id)) openSheet({ kind: 'habit', id }); break;
    case 'sheet-close': closeSheet(); break;
    case 'sheet-kind': {
      const f = document.querySelector<HTMLInputElement>('#sheet [name=quick], #sheet [name=title], #sheet [name=name]');
      if (isSheetKind(val)) viewState.sheet = { kind: val, list: viewState.tab === 'lists' ? viewState.listKey : 'groceries', name: f ? f.value : '' };
      renderSheet();
      focusFirst('#sheet [autofocus]');
      break;
    }
    case 'quick-date': { const i = document.getElementById('fDue') as HTMLInputElement | null; if (i) i.value = val; if (viewState.sheet?.touched) viewState.sheet.touched.due = true; quickSync(false); break; }
    case 'q-try': { const q = document.querySelector<HTMLInputElement>('#sheet [name=quick]'); if (q) { q.value = val; quickSync(true); q.focus(); } break; }
    case 'habit-hide': { const h = model.habits.find((x) => x.id === id); closeSheet(); if (h) void runWrite((rec) => store.patch('habits', id, { hidden: true }, rec), `Hid “${h.name}”. Unhide it at the bottom of Grow.`); break; }
    case 'habit-unhide': { const h = model.hiddenHabits.find((x) => x.id === id); if (h) void runWrite((rec) => store.patch('habits', id, { hidden: false }, rec), `“${h.name}” is back`); break; }
    case 'habit-del': { const h = model.habits.find((x) => x.id === id); closeSheet(); if (h) void deleteDoc('habits', id, `Removed “${h.name}” (sessions kept)`); break; }
    case 'sheet-del': { const t = task(); closeSheet(); if (t) void deleteDoc('tasks', id, `Deleted “${t.title}”`); break; }
    case 'log-pick': {
      const picked = inputValue('logDate'), date = isDateString(picked) && picked <= clock.today ? picked : clock.today;
      let exception: { reason: string; evidence: string } | null = null;
      if (date < habitWeekOf(clock.today)) {
        exception = { reason: inputValue('exReason').trim(), evidence: inputValue('exEvidence').trim() };
        if (!isValidException(exception)) {
          const short = exception.reason.length < 20;
          toast(short ? 'Write a real reason (at least a sentence).' : 'Add evidence: a link, photo or record.');
          document.getElementById(short ? 'exReason' : 'exEvidence')?.focus();
          break;
        }
      }
      closeSheet();
      logHabit(id, date, exception);
      break;
    }
    case 'toggle': toggleTask(id, b); break;
    case 'expand': viewState.expandedId = viewState.expandedId === id ? null : id; render(); break;
    case 'snooze': snooze(id, 'day'); break;
    case 'snooze-week': snooze(id, 'week'); break;
    case 'resched': if (val === 'today' || val === 'tomorrow' || val === 'weekend') snooze(id, val); break;
    case 'carry-all': carryAll(); break;
    case 'move': moveTask(id, Number(b.dataset['dir'])); break;
    case 'edit': openSheet({ kind: 'task', id }); break;
    case 'duet': { const t = task(); if (t) void sendToDuet(t); break; }
    case 'sug-adjust': viewState.adjustingId = viewState.adjustingId === id ? null : id; render(); if (viewState.adjustingId) document.getElementById('adj-' + id)?.focus(); break;
    case 'cal-allow': void allowCalendar(); break;
    case 'sug-keep': { const t = suggestion(); if (t) void runWrite((rec) => store.patch('tasks', id, { suggested: false }, rec), `Kept “${t.title}”`); break; }
    case 'sug-done': {
      const t = suggestion();
      if (t) void runWrite((rec) => store.patch('tasks', id, { status: 'done', completed_at: Date.now() }, rec)
        .then(() => store.create('logs', { kind: 'suggestion_done', label: t.title, value: { task_id: id, note: `${profile.name || 'The owner'} marked this suggestion done (already done)` }, date: clock.today }, rec)), `Marked “${t.title}” done`);
      break;
    }
    case 'sug-drop': { const t = suggestion(); if (t) void deleteDoc('tasks', id, `Dismissed “${t.title}”`); break; }
    case 'del': { const t = task(); if (t) void deleteDoc('tasks', id, `Deleted “${t.title}”`); break; }
    case 'tomorrow': viewState.showTomorrow = !viewState.showTomorrow; render(); break;
    case 'ring-day': { const wasOpen = ringTasksOpen(); if (wasOpen && viewState.ringDay === val) setFoldOpen('rtasks', false); else { viewState.ringDay = val; if (!wasOpen) setFoldOpen('rtasks', true); } render(); break; }
    case 'ring-tasks': if (ringTasksOpen()) collapseRingTasks(); else { setFoldOpen('rtasks', true); render(); } break;
    case 'ring-tile': viewState.ringDay = clock.today; setFoldOpen('rtasks', true); setFoldOpen(val, true); render(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'exp': viewState.expanded[val] = !viewState.expanded[val]; render(); break;
    case 'log': logHabit(id); break;
    case 'unlog': unlogHabit(id); break;
    case 'cal': viewState.calendarMonth = addMonths(viewState.calendarMonth, Number(b.dataset['dir'])); viewState.calendarDay = viewState.calendarMonth.slice(0, 7) === clock.today.slice(0, 7) ? clock.today : viewState.calendarMonth; render(); break;
    case 'day': viewState.calendarDay = b.dataset['d'] ?? clock.today; if (viewState.calendarDay.slice(0, 7) !== viewState.calendarMonth.slice(0, 7)) viewState.calendarMonth = viewState.calendarDay.slice(0, 7) + '-01'; render(); break;
    case 'list': viewState.listKey = val; viewState.expandedId = null; render(); break;
    case 'life': viewState.lifeArea = val; viewState.expandedId = null; render(); break;
    case 'grow': viewState.growView = val; render(); break;
    case 'groc-toggle': { const g = model.groceries.find((x) => x.id === id); if (g) void runWrite((rec) => store.patch('groceries', id, { checked: !g.done }, rec)); break; }
    case 'groc-del': void deleteDoc('groceries', id, 'Removed'); break;
    case 'groc-clear': void runWrite((rec) => Promise.all(model.groceries.filter((x) => x.done).map((x) => store.remove('groceries', x.id, rec))), 'Cleared the cart'); break;
    case 'li-toggle': { const x = (model.listItemsByKey[viewState.listKey] ?? []).find((y) => y.id === id); if (x) void runWrite((rec) => store.patch('list_items', id, { status: x.done ? 'want' : 'done' }, rec)); break; }
    case 'li-del': void deleteDoc('list_items', id, 'Removed'); break;
    case 'wish-filter': viewState.wishFilter = val; render(); break;
    case 'wish-bought': void runWrite((rec) => store.patch('buy_list_items', id, { status: 'bought' }, rec), 'Marked bought'); break;
    case 'wish-drop': viewState.expandedId = null; void runWrite((rec) => store.patch('buy_list_items', id, { status: 'dropped' }, rec), 'Dropped'); break;
    case 'wish-back': void runWrite((rec) => store.patch('buy_list_items', id, { status: 'waiting' }, rec), 'Back on the list'); break;
    case 'wish-tag': if (isBuyListTag(val)) void runWrite((rec) => store.patch('buy_list_items', id, { tag: val, added_date: clock.today }, rec), `Tagged ${BUY_LIST_TAGS[val].label}`); break;
    case 'wish-del': viewState.expandedId = null; void deleteDoc('buy_list_items', id, 'Deleted'); break;
    case 'recipe-add': {
      const r = model.recipes.find((x) => x.id === id);
      if (!r) break;
      const have = new Set(model.groceries.filter((g) => !g.done).map((g) => g.name.toLowerCase())), missing = r.ingredients.filter((i) => !have.has(i.toLowerCase()));
      void runWrite((rec) => Promise.all(missing.map((n) => store.create('groceries', { name: n, group_name: guessAisle(n), checked: false, sort_order: 9999 }, rec))), `Added ${plural(missing.length, 'item')} to Groceries`);
      break;
    }
    case 'recipe-cooked': { const r = model.recipes.find((x) => x.id === id); if (r) void runWrite((rec) => store.patch('recipes', id, r.cooked ? { status: 'planned' } : { status: 'archived', cooked_at: Date.now() }, rec), r.cooked ? 'Planned again' : 'Cooked, archived'); break; }
    case 'gift-toggle': { const g = model.giftIdeas.find((x) => x.id === id); if (g) void runWrite((rec) => store.patch('gift_ideas', id, { status: g.done ? 'idea' : 'given' }, rec)); break; }
    case 'gift-del': void deleteDoc('gift_ideas', id, 'Removed'); break;
    case 'check': {
      const key = b.dataset['key'] ?? '', week = b.dataset['week'] ?? '', c = model.checks[key];
      const on = !!(c?.value && (!week || c.week === week));
      void runWrite((rec) => store.put('checks', key, { value: !on, updated_at: Date.now(), ...(week ? { week } : {}) }, rec));
      break;
    }
    case 'script': viewState.showCallScript = !viewState.showCallScript; render(); break;
    case 'timer-len': viewState.breakTimer.minutes = Number(val); render(); break;
    case 'timer-start': startBreakTimer(); break;
    case 'timer-end': viewState.breakTimer.endsAt = null; viewState.breakTimer.message = 'Ended early and logged.'; logEvent('break', 'ended early', viewState.breakTimer.minutes, 'Break logged'); render(); break;
    case 'timer-log': viewState.breakTimer.message = 'Logged.'; logEvent('break', 'logged manually', null, 'Break logged'); break;
    case 'part': logEvent('parts', val, null, 'Checked in'); break;
    case 'blend': logEvent('blended', val, null); break;
    case 'pet': viewState.petFilter = val; render(); break;
    case 'q-edit': viewState.editingQuarter = id; render(); focusFirst('[data-form="q"] textarea'); break;
    case 'q-cancel': viewState.editingQuarter = null; render(); break;
    case 'keep-edit': viewState.editingKeepsake = id; render(); focusFirst('[data-form="keep"] input'); break;
    case 'keep-cancel': viewState.editingKeepsake = null; render(); break;
    case 'coll': viewState.collectionView = val; render(); break;
    case 'les-open': openLessons(); break;
    case 'les-close': closeLessons(); break;
    case 'les-act': if (LESSON_ACTIONS.includes(val)) void answerCurrentLesson(val as LessonAction | 'flag'); break;
    case 'les-pick': pickLessonChoice(Number(val)); break;
    case 'les-next': nextLesson(); break;
    case 'inspect': viewState.inspectedKeepsake = id || null; viewState.editingKeepsake = null; viewState.animateInspect = !!viewState.inspectedKeepsake; render(); viewState.animateInspect = false; break;
    case 'rec': viewState.recordsView = val; render(); break;
    case 'goal-done': { const g = model.goals.find((x) => x.id === id); if (g) void runWrite((rec) => store.patch('goals', id, { status: g.done ? 'active' : 'completed' }, rec)); break; }
    case 'goal-del': { const g = model.goals.find((x) => x.id === id); if (g) void deleteDoc('goals', id, `Deleted “${g.title}”`); break; }
    case 'quote': viewState.quoteIndex++; render(); break;
    default: break;
  }
}

function onSubmit(e: SubmitEvent): void {
  const f = (e.target as Element | null)?.closest<HTMLFormElement>('[data-form]');
  if (!f) return;
  e.preventDefault();
  const kind = f.dataset['form'], field = (name: string): HTMLInputElement | HTMLTextAreaElement | null => f.querySelector(`[name=${name}]`);
  const text = (name: string): string => field(name)?.value.trim() ?? '';
  if (kind === 'sheet') submitSheet(f);
  else if (kind === 'groc') {
    const v = text('name');
    if (!v) return;
    const input = field('name');
    if (input) input.value = '';
    void runWrite((rec) => store.create('groceries', { name: v, group_name: guessAisle(v), checked: false, sort_order: 9999 }, rec), `Added ${v}`);
    document.getElementById('qaG')?.focus();
  } else if (kind === 'adj') { const v = text('v'); if (v) void adjustSuggestion(f.dataset['id'] ?? '', v); }
  else if (kind === 'les-recall') checkLessonAnswer(text('v'));
  else if (kind === 'les-apply') { const v = text('v'); if (v) void answerCurrentLesson('advance', v); else field('v')?.focus(); }
  else if (kind === 'keep') void saveKeepsake(f.dataset['id'] ?? '', f.dataset['kind'] ?? '', text('title'), text('note'));
  else if (kind === 'q') {
    const v = f.querySelector('textarea')?.value.trim() ?? '', id = f.dataset['id'] ?? '', q = Number(f.dataset['q']);
    viewState.editingQuarter = null;
    void runWrite((rec) => store.patch('goals', id, { ['progress_q' + String(q)]: v }, rec), `Q${String(q)} note saved`);
    render();
  }
}

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  const sheet = viewState.sheet;
  if (!sheet || !target.closest('#sheet')) return;
  const n = target.name;
  if (n === 'quick') quickSync(true);
  else if (n === 'title' || n === 'due' || n.startsWith('r_')) {
    if (sheet.touched && n === 'title') sheet.touched.title = true;
    if (sheet.touched && n === 'due') sheet.touched.due = true;
    const form = target.form;
    if (n.startsWith('r_') && form) { const r = readRule(form), help = form.querySelector('#rechelp'); if (help) help.textContent = r ? ruleDescription(r) : ''; }
    quickSync(false);
  }
}

function onChange(e: Event): void {
  const target = e.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === 'logDate') { const x = document.getElementById('logEx'); if (x) x.hidden = !(isDateString(target.value) && target.value < habitWeekOf(clock.today)); }
  if (target.matches('select[data-sort]')) {
    const k = target.dataset['sort'] ?? '';
    devicePrefs.sort[k] = target.value;
    saveDevicePrefs();
    render();
    focusFirst(`select[data-sort="${CSS.escape(k)}"]`);
    return;
  }
  const sheet = viewState.sheet, inSheet = !!sheet && !!target.closest('#sheet'), form = target.form;
  if (inSheet && target.name === 'rec' && form) {
    if (sheet.touched) sheet.touched.rec = true;
    syncRepeatFields(form, ruleForPreset(target.value, form.querySelector<HTMLInputElement>('[name=due]')?.value, clock.today));
    quickSync(false);
  }
  if (inSheet && target.name === 'due') { if (sheet.touched) sheet.touched.due = true; quickSync(false); }
  if (target.matches('[data-act-change="sheet-list"]')) {
    const n = document.querySelector<HTMLInputElement>('#sheet [name=name]');
    viewState.sheet = { kind: 'item', list: target.value, name: n ? n.value : '' };
    renderSheet();
    focusFirst('#sheet [name=list]');
  }
}

function onKeydown(e: KeyboardEvent): void {
  const target = e.target as Element | null;
  if (e.key === 'Escape' && popoverOpen()) { setPopover(false); return; }
  if (e.key === 'Escape' && viewState.sheet) { closeSheet(); return; }
  if (e.key === 'Escape' && viewState.tab === 'today' && !lessonRun.deck && !viewState.inspectedKeepsake && ringTasksOpen() && !target?.closest('input, textarea, select')) { collapseRingTasks(); return; }
  if (viewState.sheet && e.key === 'Tab') {
    const focusable = [...document.querySelectorAll<HTMLElement & { disabled?: boolean }>('#sheet button, #sheet input, #sheet select, #sheet textarea')].filter((x) => !x.disabled && x.offsetParent !== null);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const grip = target?.closest<HTMLElement>('[data-drag]');
  if (grip && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); moveTask(grip.dataset['drag'] ?? '', e.key === 'ArrowUp' ? -1 : 1); }
}
/* Escape also closes the lessons deck, then the keepsake inspector. */
function onEscapeGame(e: KeyboardEvent): void {
  if (e.key === 'Escape' && lessonRun.deck) { closeLessons(); return; }
  if (e.key === 'Escape' && viewState.inspectedKeepsake) { viewState.inspectedKeepsake = null; viewState.editingKeepsake = null; render(); }
}

export function listenForEvents(): void {
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  listenForDrags();
  document.getElementById('main')?.addEventListener('focusout', () => setTimeout(() => { if (renderPending() && !userBusy()) render(); }, 0));
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('hashchange', () => { readHash(); render(); });
  matchMedia('(min-width:1280px)').addEventListener('change', () => { render(); });
  phoneLayout.addEventListener('change', () => { render(); });
  addEventListener('scroll', () => { const opener = document.getElementById('themeBtn'); if (popoverOpen() && opener && popoverOpenedBy(opener)) setPopover(false); }, { passive: true });
  addEventListener('resize', () => { setPopover(false); });
  setInterval(() => {
    const a = document.activeElement;
    if (!viewState.sheet && !isDragging() && document.visibilityState === 'visible' && viewState.tab === 'today' && !a?.matches('input,textarea')) render();
  }, 60000);
  document.addEventListener('keydown', onEscapeGame);
}
