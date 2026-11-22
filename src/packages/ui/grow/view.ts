/* The Grow tab: Habits (stats band, records, logbook), Goals (a line per quarter), and with the game on, Collection. */
import { loadedGarden } from '../game/game-modules.ts';
import { currentGame, gameRun, listenKeepsakes } from '../game/game.ts';
import { GROW_VIEWS } from '../shared/areas.ts';
import { GOAL_CATEGORY_ICONS, type Goal } from '../board-model.ts';
import { clock } from '../shared/clock.ts';
import { escapeHtml } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { gameOn } from '../shared/prefs.ts';
import { areaHeader, sectionHeader } from '../shared/sections.ts';
import { model, viewState } from '../shared/state.ts';
import { groupTasks } from '../shared/task-row.ts';
import { gameLogbook, growBand, recordsCard } from './records.ts';

function habitsBody(): string {
  if (!model.habits.length) return `<div class="card pad" style="margin-top:14px"><p class="empty" style="padding:0 4px 10px">No habits yet. Give one a weekly target and a lower floor that keeps the streak alive.</p><button class="btn primary" data-act="new-habit">${icon('plus', 18)}Add a habit</button></div>`;
  const g = gameOn() ? currentGame() : null;
  if (g) void listenKeepsakes();
  return growBand(g) + recordsCard() + (g ? gameLogbook(g) : '');
}
function collectionBody(): string {
  const g = gameOn() ? currentGame() : null, garden = loadedGarden();
  if (g) void listenKeepsakes();
  return g && garden ? garden.collectionHTML(g, gameRun.keepsakes, viewState.editingKeepsake, viewState.inspectedKeepsake, viewState.animateInspect, viewState.collectionView) : '<div class="card pad" style="margin-top:14px"><p class="empty">Loading the collection…</p></div>';
}
const QUARTER_LABELS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'] as const;
function goalCard(g: Goal, currentYear: number, currentQuarter: number): string {
  const quarterCell = (q: number): string => {
    const now = g.year === currentYear && q === currentQuarter, key = g.id + ':' + String(q), label = QUARTER_LABELS[q - 1] ?? '', note = g.quarterNotes[q - 1] ?? '';
    return viewState.editingQuarter === key
      ? `<form class="qcell${now ? ' now' : ''}" data-form="q" data-id="${g.id}" data-q="${String(q)}"><label class="q" for="q-${key}">Q${String(q)} · ${label}</label><textarea id="q-${key}" name="v" style="min-height:64px;font-size:16px;padding:8px">${escapeHtml(note)}</textarea><span style="display:flex;gap:4px;margin-top:4px"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-act="q-cancel">Cancel</button></span></form>`
      : `<button class="qcell${now ? ' now' : ''}" data-act="q-edit" data-id="${key}" aria-label="Q${String(q)} ${label}${now ? ', current quarter' : ''}. Edit note."><span class="q"><span>Q${String(q)} · ${label}</span>${now ? '<span>Now</span>' : ''}</span><span class="${note ? '' : 'ph'}">${escapeHtml(note) || 'Add a note…'}</span></button>`;
  };
  return `<article class="card goal${g.done ? ' complete' : ''}">
        <div class="hhead"><span class="hicon">${icon(g.icon || GOAL_CATEGORY_ICONS[g.category] || 'star', 24)}</span><div style="min-width:0"><h3>${escapeHtml(g.title)}</h3><p class="tmeta" style="margin:2px 0 0">${g.category ? `<span class="chip">${escapeHtml(g.category)}</span>` : ''}<span class="chip${g.done ? '' : ' hot'}">${g.done ? 'Completed' : 'Active'}</span></p></div></div>
        ${g.notes ? `<p class="small muted" style="margin:10px 0 0">${escapeHtml(g.notes)}</p>` : ''}
        <div class="qgrid">${[1, 2, 3, 4].map(quarterCell).join('')}</div>
        <div class="row-btns" style="margin-top:12px"><button class="btn sm" data-act="goal-done" data-id="${g.id}">${g.done ? 'Back to active' : icon('check', 18) + 'Mark completed'}</button><button class="btn sm ghost" data-act="goal-del" data-id="${g.id}">${icon('trash', 18)}Delete</button></div>
      </article>`;
}
function goalsBody(): string {
  const years = [...new Set(model.goals.map((g) => g.year))].sort((a, b) => b - a);
  const currentQuarter = Math.ceil(Number(clock.today.slice(5, 7)) / 3), currentYear = Number(clock.today.slice(0, 4));
  const active = model.goals.filter((g) => !g.done).length;
  return `${model.goals.length ? `<p class="small muted" style="margin:16px 4px 0">${String(active)} active, ${String(model.goals.length - active)} completed. Tap a quarter to write how it went.</p>` : `<div class="card pad" style="margin-top:14px"><p class="empty" style="padding:0 4px 10px">No goals yet. Give each one a year, then write a line per quarter on how it went.</p><button class="btn primary" data-act="fab">${icon('plus', 18)}Add a goal</button></div>`}
      ${years.map((y) => `<section class="sec">${sectionHeader(String(y))}<div class="goals2">${model.goals.filter((g) => g.year === y).sort((a, b) => Number(a.done) - Number(b.done)).map((g) => goalCard(g, currentYear, currentQuarter)).join('')}</div></section>`).join('')}
      <section class="sec">${sectionHeader('Goal tasks')}${groupTasks((t) => t.group === 'Goals', 'No goal-related tasks right now.')}</section>`;
}

export function viewGrow(): string {
  const view = viewState.growView;
  let body: string;
  if (view === 'collection') body = collectionBody();
  else if (view === 'habits') {
    body = habitsBody();
    const hidden = model.hiddenHabits;
    if (hidden.length) body += `<div class="card pad hidh" style="margin-top:14px"><p class="qhint" style="margin:0 0 8px">Hidden habits: off the board, history kept.</p>${hidden.map((h) => `<div class="hidrow"><span>${escapeHtml(h.name)}</span><button type="button" class="btn sm ghost" data-act="habit-unhide" data-id="${h.id}">Unhide</button></div>`).join('')}</div>`;
  } else body = goalsBody();
  const current = GROW_VIEWS.find((x) => x.id === view);
  return `${areaHeader(view, current?.icon ?? '', 'Grow', "Habits you keep and goals you're chasing.")}
    <div class="kinds" style="grid-template-columns:repeat(${String(GROW_VIEWS.length)},1fr);margin-top:4px;max-width:${String(GROW_VIEWS.length * 180)}px" role="tablist" aria-label="Grow">${GROW_VIEWS.map(({ id, label, icon: i }) => `<button class="sub k-${id}" role="tab" data-act="grow" data-val="${id}" aria-selected="${String(view === id)}" aria-pressed="${String(view === id)}" style="display:flex;align-items:center;justify-content:center;gap:6px">${icon(i, 18)}${label}</button>`).join('')}</div>
    <div role="tabpanel">${body}</div>`;
}
