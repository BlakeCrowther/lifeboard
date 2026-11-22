/* Section building blocks the views share: area header, section header, link, fold and sort control. */
import { escapeHtml } from './format.ts';
import { icon } from './icons.ts';
import { devicePrefs, isFoldOpen } from './prefs.ts';

/** Area header; Life and Grow wear the tint of the sub-view you're in (`k-<tint>`). */
export function areaHeader(tint: string, iconName: string, title: string, subtitle: string): string {
  return `<div class="phead k-${tint}"><span class="aico">${icon(iconName, 19)}</span><h2 class="ltitle" id="ltitle">${title}</h2><p class="psub">${subtitle}</p></div>`;
}
export function sectionHeader(title: string, link = '', tier: number | string = '', count: number | string = '', late = 0): string {
  return `<div class="sec-h"><h3 class="sec-t">${tier ? '<i class="tm"></i>' : ''}${title}${count !== '' ? ` <span class="ct num">${String(count)}</span>` : ''}${late ? ` <span class="lt num">${String(late)} late</span>` : ''}</h3>${link}</div>`;
}
/** A button that goes to a tab or sub-view ('life/home'). */
export function goLink(label: string, to: string): string {
  return `<button class="link" data-act="go" data-to="${to}">${label}${icon('chevR', 16)}</button>`;
}

export interface FoldOptions {
  body: string;
  /** open unless the person closed it (default true) */
  openByDefault?: boolean;
  tier?: number;
  /** extra section classes */
  zone?: string;
  id?: string;
  count?: number | string | null;
  /** the one-line summary shown while closed */
  summary?: string;
  link?: string;
}
/** A section whose header carries a one-line live summary while closed (open state in device prefs). */
export function fold(key: string, title: string, o: FoldOptions): string {
  const open = isFoldOpen(key, o.openByDefault !== false), count = o.count != null && o.count !== '' ? ` <span class="ct num">${String(o.count)}</span>` : '';
  return `<section class="sec t${String(o.tier || 2)} fold${open ? '' : ' shut'} ${o.zone || ''}"${o.id ? ` id="${o.id}"` : ''}>
    <div class="sec-h"><h3 class="sec-t"><button class="fold-b" data-act="fold" data-key="${key}" aria-expanded="${String(open)}" aria-controls="f-${key}"><i class="tm"></i><span class="fold-t">${title}</span>${count}${!open && o.summary ? `<span class="fold-s">${o.summary}</span>` : ''}${icon('chevD', 18)}</button></h3>${o.link || ''}</div>
    <div class="fold-body" id="f-${key}"${open ? '' : ' hidden'}>${open ? o.body : ''}</div></section>`;
}

/* list sorts, remembered per device */
const SORT_OPTIONS: Readonly<Record<string, readonly (readonly [value: string, label: string])[]>> = {
  groceries: [['aisle', 'Aisle'], ['az', 'A-Z'], ['new', 'Newest']],
  wish: [['ready', 'Ready first'], ['tag', 'Tag'], ['price', 'Price'], ['new', 'Newest']],
  recipes: [['az', 'A-Z'], ['new', 'Newest']],
  gifts: [['person', 'Person'], ['new', 'Newest']],
};
const DEFAULT_SORTS = [['new', 'Newest'], ['az', 'A-Z']] as const;
const sortOptionsOf = (key: string): readonly (readonly [string, string])[] => SORT_OPTIONS[key] ?? DEFAULT_SORTS;
export function sortOf(key: string): string {
  const options = sortOptionsOf(key), chosen = devicePrefs.sort[key];
  return options.some((x) => x[0] === chosen) && chosen ? chosen : (options[0]?.[0] ?? 'new');
}
export const sortControl = (key: string, title: string): string =>
  `<label class="sortc"><span>Sort</span><select data-sort="${escapeHtml(key)}" aria-label="Sort ${escapeHtml(title)}">${sortOptionsOf(key).map(([v, l]) => `<option value="${v}"${sortOf(key) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
/** az: by name; new: newest first; anything else keeps stored order. */
export const sortItems = <T>(items: T[], mode: string, nameOf: (x: T) => string): T[] =>
  mode === 'az' ? items.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })) : mode === 'new' ? items.slice().reverse() : items.slice();
