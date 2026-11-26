/* Explanatory tips: a "how does this work" button with a short note under it. One board-wide switch
   (checks/ui_prefs.tips, default on); off renders nothing. Every number in a note comes from RULES, so tips follow
   the game. Open notes are remembered in viewState.expanded so a re-render keeps them open. */
import { RULES } from '../../game/index.ts';
import { escapeHtml } from './format.ts';
import { icon } from './icons.ts';
import { ecosystemOn, tipsOn } from './prefs.ts';
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

/* Points tips talk about life points and the Ecosystem, so they show only while it is on. */
const none = { button: '', note: '' };

export const tipEarnPoints = (): { button: string; note: string } => !ecosystemOn() ? none : tip('points', 'What earns points',
  `Each day’s ring is the tasks you finished ÷ the tasks you committed to that day. A closed ring earns ${String(RULES.tide.perPct + RULES.tide.fullBonus)} life points (${String(RULES.tide.perPct)} for the ring, ${String(RULES.tide.fullBonus)} bonus for closing it); a part ring earns its share of ${String(RULES.tide.perPct)}. Life points move the Ecosystem along.`);

export const tipLosePoints = (): { button: string; note: string } => !ecosystemOn() ? none : tip('losses', 'What loses points',
  `Skipping a break costs ${String(RULES.breaks.skipCost)} Ecosystem growth (never below the current phase). A task you commit to a day and don’t finish leaves that day’s ring short, so it earns less. Overdue tasks also cloud the water or air (${String(RULES.tide.cloudyAt)} is fully murky) and, after ${String(RULES.tide.blightAfter)} days, bring blight. Rings averaging under ${pct(RULES.bleach.below)} for ${String(RULES.bleach.days)} days bleach the scene. Murk, blight and bleaching change how it looks and cost no points; they fade as you clear tasks.`);

export const tipGarden = (): { button: string; note: string } => tip('garden', 'How plants grow',
  `Each habit has a floor (the least you must do) and a target (your goal), per week, or per day for daily habits. A plant grows one stage each week you reach the floor, and dies the first week you don’t; for a daily habit, one day under the floor kills it. A seed that hasn’t sprouted just waits. It takes ${String(RULES.garden.stages.length - 1)} floor weeks to bloom. A floor week scores ${String(RULES.garden.points.floor)} point toward a rarer next seed, a target week ${String(RULES.garden.points.target)}, above target ${String(RULES.garden.points.above)}. A missed floor also breaks the habit’s streak.`);

export const tipEcosystem = (): { button: string; note: string } => tip('ecosystem', 'What changes the Ecosystem',
  `Rings earn life points, part rings too, and those carry the scene through ${String(RULES.tide.phases)} phases per biome; the last phase starts the next biome. One visitor arrives each week (none while the scene is bleached), and a rare one comes after ${String(RULES.visitor.fullDaysForRare)} full rings in a week or finishing a task that waited ${String(RULES.visitor.rareOverdue)}+ days. Overdue tasks cloud the water or air; old ones bring blight. Lessons feed the creatures.`);
