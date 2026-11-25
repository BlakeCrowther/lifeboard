/* Explanatory tips: a "how does this work" button with a short note under it. One board-wide switch
   (checks/ui_prefs.tips, default on); off renders nothing. Every number in a note comes from RULES, so tips follow
   the game. Open notes are remembered in viewState.expanded so a re-render keeps them open. */
import { RULES } from '../../game/index.ts';
import { escapeHtml } from './format.ts';
import { icon } from './icons.ts';
import { tipsOn } from './prefs.ts';
import { viewState } from './state.ts';

const key = (id: string): string => 'tip-' + id;

/** Flips a tip's note without a re-render: state, button and note together. */
export function toggleTip(id: string): void {
  const open = !viewState.expanded[key(id)];
  viewState.expanded[key(id)] = open;
  document.querySelector(`[data-act="tip"][data-id="${id}"]`)?.setAttribute('aria-expanded', String(open));
  const note = document.getElementById(key(id));
  if (note) note.hidden = !open;
}

/** The info button and its note, as one string each so a view can put the button in a row and the note below it. Both
    are '' when tips are off. */
export function tip(id: string, label: string, note: string): { button: string; note: string } {
  if (!tipsOn()) return { button: '', note: '' };
  const open = !!viewState.expanded[key(id)];
  return {
    button: `<button type="button" class="tip-b" data-act="tip" data-id="${id}" aria-expanded="${String(open)}" aria-controls="${key(id)}">${icon('info', 16)}<span>${escapeHtml(label)}</span></button>`,
    note: `<p class="tip-n" id="${key(id)}"${open ? '' : ' hidden'}>${note}</p>`,
  };
}

/** A row of tip buttons with their notes underneath ('' when tips are off). */
export function tipRow(...tips: { button: string; note: string }[]): string {
  const shown = tips.filter((t) => t.button);
  return shown.length ? `<div class="tip-row">${shown.map((t) => t.button).join('')}</div>${shown.map((t) => t.note).join('')}` : '';
}

const pct = (f: number): string => String(Math.round(f * 100)) + '%';

export const tipEarnPoints = (): { button: string; note: string } => tip('points', 'What earns points',
  `Each day’s ring is the tasks you finished ÷ the tasks you committed to that day. A closed ring earns ${String(RULES.tide.perPct + RULES.tide.fullBonus)} life points (${String(RULES.tide.perPct)} for the ring, ${String(RULES.tide.fullBonus)} bonus for closing it); a part ring earns its share of ${String(RULES.tide.perPct)}. Life points move the Ecosystem along.`);

export const tipLosePoints = (): { button: string; note: string } => tip('losses', 'What loses points',
  `Points are never taken away, but a task you commit to a day and don’t finish leaves that day’s ring short. Open tasks turn into murk (${String(RULES.tide.cloudyAt)} overdue tasks is fully murky) and, after ${String(RULES.tide.blightAfter)} days, blight. Rings averaging under ${pct(RULES.bleach.below)} for ${String(RULES.bleach.days)} days bleach the Ecosystem. Missing a habit’s weekly floor breaks its streak and kills its plant.`);

export const tipGarden = (): { button: string; note: string } => tip('garden', 'How plants grow',
  `Each habit has a floor (the least you must do each week) and a target (your goal). A plant grows one stage each week you reach the floor, and withers the first week you don’t. It takes ${String(RULES.garden.stages.length - 1)} floor weeks to bloom. A target week scores ${String(RULES.garden.points.target)} points toward a rarer next seed, above target ${String(RULES.garden.points.above)}, the floor ${String(RULES.garden.points.floor)}.`);

export const tipEcosystem = (): { button: string; note: string } => tip('ecosystem', 'What changes the Ecosystem',
  `Closing rings earns life points, and those carry the scene through ${String(RULES.tide.phases)} phases per biome; the last phase starts the next biome. One visitor arrives each week, and a rare one comes after ${String(RULES.visitor.fullDaysForRare)} full rings in a week or finishing a task that waited ${String(RULES.visitor.rareOverdue)}+ days. Overdue tasks cloud the water; old ones bring blight. Lessons feed the creatures.`);
