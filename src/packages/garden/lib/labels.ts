import type { GameState } from '../../game/derive.ts';
import type { Rarity, ReefEvent } from '../../game/index.ts';

export type GardenPlot = GameState['plots'][number];

export const PLANT_STAGES: readonly string[] = ['seed', 'sprout', 'leafy', 'bud', 'bloom'];

/** Stage and look names -> labels. */
export const LOOK_LABELS: Readonly<Record<string, string>> = { seed: 'Seed', sprout: 'Sprout', leafy: 'Leafy', bud: 'Bud', bloom: 'Bloom', wilt: 'Thirsty', dead: 'Withered' };
export const lookLabel = (look: string): string => LOOK_LABELS[look] ?? '';

export const RARITY_LABELS: Readonly<Record<Rarity, string>> = { common: 'Common', rare: 'Rare', exotic: 'Exotic' };

/** Species id -> display name. Roster plants add their own names when the plant pool loads. */
export const speciesNames: Record<string, string> = { daisy: 'Daisy', tulip: 'Tulip', sunflower: 'Sunflower', mushroom: 'Toadstool', cactus: 'Cactus', fern: 'Fern', bonsai: 'Bonsai', lavender: 'Lavender' };

export const REEF_EVENT_LABELS: Readonly<Record<ReefEvent, string>> = {
  phase: 'Ecosystem reached a new phase',
  biome: 'Ecosystem biome finished: a diorama joined the shelf',
  bleach: 'Ecosystem bleached: too few full days',
  recover: 'Ecosystem recovered',
};

/** A plot's look now: its stage name, or 'wilt' (thirsty or wilted) / 'dead'. */
export const plotLook = (plot: GardenPlot): string => (!plot.alive ? 'dead' : plot.thirsty || plot.wilted ? 'wilt' : (plot.stageName ?? 'seed'));

const HTML_ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string | number | null | undefined): string => String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);

export const capitalize = (text: string | null | undefined): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' -> 'Nov 23'; empty for no date. */
export const formatShortDate = (date: string | null | undefined): string => (date ? `${String(MONTHS[+date.slice(5, 7) - 1])} ${String(+date.slice(8, 10))}` : '');

let svgIdCount = 0;
/** A page-unique prefix for one SVG's gradient and filter ids. */
export const nextSvgIdPrefix = (kind: string): string => `${kind}${String(svgIdCount++)}-`;
