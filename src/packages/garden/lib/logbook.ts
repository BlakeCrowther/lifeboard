import type { GameState } from '../../game/derive.ts';
import { REEF_EVENT_LABELS, RARITY_LABELS, escapeHtml, formatShortDate, lookLabel } from './labels.ts';

/** d: 'YYYY-MM-DD', t: text, c: row class ('good' | 'bad' | '') */
export interface LogbookItem {
  d: string;
  t: string;
  c: string;
}

/** Finished plants, ecosystem events, garden opening and game start, newest first. */
export function logbookItems(game: GameState): LogbookItem[] {
  const log: LogbookItem[] = [];
  for (const plant of game.history) {
    const text = plant.bloomed
      ? `${plant.name} bloomed · ${RARITY_LABELS[plant.earned.rarity].toLowerCase()} seed${plant.earned.mutated ? ', mutant' : ''}`
      : plant.died
        ? `${plant.name} withered`
        : `${plant.name} ended at ${lookLabel(plant.stageName).toLowerCase()}`;
    log.push({ d: plant.to, t: text, c: plant.bloomed ? 'good' : plant.died ? 'bad' : '' });
  }
  for (const day of game.events) {
    for (const event of day.ev) log.push({ d: day.date, t: REEF_EVENT_LABELS[event], c: event === 'bleach' ? 'bad' : event === 'phase' || event === 'biome' ? 'good' : '' });
  }
  if (game.season.opens) log.push({ d: game.season.opens, t: 'Garden opens: seeds go in', c: '' });
  if (game.start) log.push({ d: game.start, t: 'Game started: everything at zero', c: '' });
  return log.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
}

export const logbookHTML = (items: readonly LogbookItem[]): string =>
  `<ol class="lbk">${items.map((item) => `<li class="${item.c}"><span class="num">${formatShortDate(item.d)}</span><span>${escapeHtml(item.t)}</span></li>`).join('')}</ol>`;
