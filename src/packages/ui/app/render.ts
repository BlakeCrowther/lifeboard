/* The render loop: tabs, the current view, the quote footer, the + button, the scrolled header bar and the display
   popover. Registers itself with shared/redraw.ts, which every other module calls. */
import { textOf } from '../shared/format.ts';
import { todayDate } from '../../dates/clock.ts';
import { afterRenderGame } from '../game/game.ts';
import { viewGrow } from '../grow/view.ts';
import { viewLife } from '../life/view.ts';
import { boardListKinds, viewLists } from '../lists/view.ts';
import { viewPlan } from '../plan/view.ts';
import { COLLECTION_VIEW, GROW_VIEWS, LIFE_AREAS, TABS } from '../shared/areas.ts';
import { watchCalendar } from '../shared/calendar-watch.ts';
import { clock } from '../shared/clock.ts';
import { recordCommitments } from '../shared/commitments.ts';
import { escapeHtml, plural } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { devicePrefs, ecosystemLink, ecosystemOn, gameOn, gardenOn, tipsOn } from '../shared/prefs.ts';
import { setRenderer } from '../shared/redraw.ts';
import { refreshBoard } from '../shared/refresh.ts';
import { model, store, viewState, type Tab } from '../shared/state.ts';
import { fabConfig } from '../sheet/sheet.ts';
import { daySummaryHtml, viewToday } from '../today/view.ts';
import { isDragging } from './drag.ts';
import { writeHash } from './navigation.ts';

const QUOTES: readonly (readonly [text: string, author: string])[] = [
  ['The best time to plant a tree was twenty years ago. The second best time is now.', 'Proverb'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['Nature does not hurry, yet everything is accomplished.', 'Lao Tzu'],
  ['Well begun is half done.', 'Aristotle'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['Go confidently in the direction of your dreams.', 'Henry David Thoreau'],
];
const VIEWS: Readonly<Record<Tab, () => string>> = { today: viewToday, plan: viewPlan, lists: viewLists, life: viewLife, grow: viewGrow };

const byId = (id: string): HTMLElement | null => document.getElementById(id);
const mainEl = (): HTMLElement | null => byId('main');

/* display popover: theme, Ecosystem, Garden, Tips */
let popoverOpener: HTMLElement | null = null;
const popover = (): HTMLElement | null => byId('pop');
export const popoverOpen = (): boolean => !(popover()?.hidden ?? true);
export const popoverOpenedBy = (el: Element): boolean => popoverOpener === el;
function renderPopover(): void {
  const pop = popover();
  if (!pop) return;
  const theme = document.documentElement.dataset['theme'] || 'auto';
  const group = (label: string, act: string, opts: readonly (readonly [string, string])[], cur: string): string => `<p class="pop-l">${label}</p><div class="kinds" style="grid-template-columns:repeat(${String(opts.length)},1fr)" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-val="${v}" aria-pressed="${String(cur === v)}">${l}</button>`).join('')}</div>`;
  pop.innerHTML = group('Theme', 'set-theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], theme)
    + group('Ecosystem', 'set-eco', [['off', 'Off'], ['on', 'On']], ecosystemOn() ? 'on' : 'off')
    + group('Garden', 'set-garden', [['off', 'Off'], ['on', 'On']], gardenOn() ? 'on' : 'off')
    + group('Tips', 'set-tips', [['off', 'Off'], ['on', 'On']], tipsOn() ? 'on' : 'off')
    + (ecosystemLink.forced && !devicePrefs.eco ? '<p class="pop-n">Ecosystem on for this visit (link).</p>' : '');
}
export function setPopover(open: boolean, button?: HTMLElement | null): void {
  const pop = popover();
  if (!pop) return;
  for (const id of ['themeBtn', 'barTheme']) byId(id)?.setAttribute('aria-expanded', String(open && button?.id === id));
  if (!open || !button) {
    if (pop.hidden) return;
    pop.hidden = true;
    popoverOpener?.focus({ preventScroll: true });
    popoverOpener = null;
    return;
  }
  popoverOpener = button;
  renderPopover();
  pop.hidden = false;
  const r = button.getBoundingClientRect();
  pop.style.top = String(Math.round(r.bottom + 6)) + 'px';
  pop.style.right = String(Math.max(12, Math.round(innerWidth - r.right))) + 'px';
  pop.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
}

function statusView(status: string): string {
  const box = (h: string, p: string): string => `<div class="card pad" style="margin-top:14px"><h2 class="ltitle" id="ltitle" style="font-size:22px;margin:0 4px 6px">${h}</h2><p class="muted" style="margin:0 4px">${p}</p></div>`;
  if (status === 'nodb') return box("Your lifeboard data can't be reached here", 'Open lifeboard from claude.ai while signed in. Nothing is shown rather than placeholder data.');
  if (status === 'error') return box('Lifeboard lost its connection to your data', 'Reload the page to reconnect. Nothing you saw before the drop was lost.');
  if (status === 'slow') return box('Still waiting for your data', 'It may be a slow connection. This page keeps trying on its own.');
  return `<p class="muted" style="padding:18px 4px" id="ltitle">Loading your lifeboard…</p>`;
}

/** Shows the header bar once the page header scrolls away. */
export function onScroll(): void {
  const bar = byId('bar'), top = byId('top');
  if (!bar) return;
  const show = (top ? top.getBoundingClientRect().bottom : 0) < 6;
  bar.classList.toggle('show', show);
  bar.setAttribute('aria-hidden', String(!show));
  const barTheme = byId('barTheme');
  if (barTheme) barTheme.tabIndex = show ? 0 : -1;
}

/** With the game on, Grow gets a third view: dioramas and pressed plants. */
function syncGrowViews(): void {
  const i = GROW_VIEWS.findIndex((x) => x.id === COLLECTION_VIEW.id);
  if (gameOn() && i < 0) GROW_VIEWS.push(COLLECTION_VIEW);
  else if (!gameOn() && i >= 0) { GROW_VIEWS.splice(i, 1); if (viewState.growView === COLLECTION_VIEW.id) viewState.growView = 'habits'; }
}
/** The focused control as a selector key, so focus survives the redraw. */
function focusKey(): [string, string] | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || !a.dataset['act']) return null;
  return [a.dataset['act'], a.dataset['id'] || a.dataset['val'] || a.dataset['key'] || a.dataset['d'] || ''];
}
function restoreFocus(key: [string, string] | null): void {
  if (!key) return;
  const [act, v] = key, e = CSS.escape(v);
  const sel = `[data-act="${act}"]` + (v ? `[data-id="${e}"],[data-act="${act}"][data-val="${e}"],[data-act="${act}"][data-key="${e}"],[data-act="${act}"][data-d="${e}"]` : '');
  const el = document.querySelector<HTMLElement>(sel);
  if (el && el !== document.activeElement) el.focus({ preventScroll: true });
}

function renderPage(): void {
  const main = mainEl();
  if (!main) return;
  syncGrowViews();
  if (todayDate() !== clock.today) { clock.today = todayDate(); watchCalendar(); if (store.state.status === 'ready') { refreshBoard(); recordCommitments(); } }
  const focused = focusKey();
  /* re-rendering main must not move the page (a tap that re-renders, like logging a habit, would jump it) */
  const scrolledTo = scrollY;
  writeHash();
  const tabs = byId('tabs');
  if (tabs) tabs.innerHTML = TABS.map((t) => `<button class="tab k-${t.id === 'life' ? viewState.lifeArea : t.id === 'grow' ? viewState.growView : t.id}" data-act="tab" data-val="${t.id}" ${viewState.tab === t.id ? 'aria-current="page"' : ''}><span class="pill">${icon(t.icon, 23)}</span>${t.label}</button>`).join('');
  const status = store.state.status, ready = status === 'ready';
  const html = ready ? VIEWS[viewState.tab]() : statusView(status);
  const savedQuote = model.conditions?.quote, fallbackQuote = QUOTES[viewState.quoteIndex % QUOTES.length] ?? QUOTES[0];
  const quoteText = savedQuote ? textOf(savedQuote['text']) : fallbackQuote?.[0] ?? '';
  const quoteBy = savedQuote ? textOf(savedQuote['author']) || 'Unknown' : fallbackQuote?.[1] ?? '';
  const skipped = store.skipped();
  main.innerHTML = html + `<footer class="quote"><p>“${escapeHtml(quoteText)}”</p><div class="by">${escapeHtml(quoteBy)}${savedQuote ? '' : ' · <button class="link" style="display:inline-flex;min-height:44px" data-act="quote">Another</button>'}</div>
    ${skipped.n ? `<p class="skipnote" title="${escapeHtml(Object.entries(skipped.by).map(([c, n]) => `${c}: ${String(n)}`).join(', '))}">${plural(skipped.n, 'item')} skipped because the saved data didn't match the expected shape.</p>` : ''}</footer>`;
  document.body.classList.toggle('km-open', !!main.querySelector('.kmodal'));
  const fab = byId('fab'), fc = fabConfig();
  if (fab) {
    fab.hidden = !ready;
    fab.innerHTML = `${icon(viewState.tab === 'grow' && viewState.growView === 'habits' ? 'flame' : 'plus', 26)}<span class="lbl">${fc.label}</span>`;
    fab.setAttribute('aria-label', fc.label);
  }
  for (const id of ['themeBtn', 'barTheme']) { const b = byId(id); if (b) b.innerHTML = icon('sliders'); }
  if (popoverOpen()) renderPopover();
  const title = byId('ltitle');
  const subName = viewState.tab === 'lists' ? (boardListKinds().find((l) => l.key === viewState.listKey)?.title ?? 'Groceries')
    : viewState.tab === 'life' ? LIFE_AREAS.find((x) => x.id === viewState.lifeArea)?.label ?? ''
    : viewState.tab === 'grow' ? GROW_VIEWS.find((x) => x.id === viewState.growView)?.label ?? '' : '';
  const barTitle = byId('barT');
  if (barTitle) barTitle.innerHTML = !ready ? '' : viewState.tab === 'today' ? daySummaryHtml() : escapeHtml(title ? title.textContent : '') + (subName ? ' · ' + escapeHtml(subName) : '');
  restoreFocus(focused);
  afterRenderGame();
  if (scrollY !== scrolledTo) scrollTo(0, scrolledTo);
  onScroll();
}
/* db changes arrive any time (other devices too). Never redraw under someone typing or dragging; catch up after. */
function userBusy(): boolean {
  const a = document.activeElement, main = mainEl();
  return isDragging() || (!!a && !!main && main.contains(a) && a.matches('input,textarea,select'));
}
export function registerRenderer(): void {
  setRenderer(renderPage, userBusy);
}
