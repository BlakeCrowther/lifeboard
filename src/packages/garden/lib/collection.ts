/* Grow → Collection: dioramas (the Ecosystem in progress first, tap one to inspect) and pressed plants, each with a title
   and note the owner writes. The stat tiles count from the same keepsakes. */
import type { GameState, PressedPlant } from '../../game/derive.ts';
import { dioramaSVG } from './diorama.ts';
import { RARITY_LABELS, capitalize, escapeHtml, formatShortDate, lookLabel, speciesNames } from './labels.ts';
import { specimen, type PlantLook } from './plant-svg.ts';
import { biomeById, visitorsOf } from './roster.ts';

/** The owner's title and note for one keepsake (db `keepsakes`, keyed by keepsake id). */
export interface KeepsakeNote {
  title?: string | null | undefined;
  note?: string | null | undefined;
}

export interface GardenTile {
  n: string | number;
  l: string;
  s: string;
}

type FinishedDiorama = GameState['reef']['dioramas'][number] & { id: string; kind: 'reef'; inProgress: false };
interface EcosystemInProgress {
  id: 'now';
  kind: 'reef';
  inProgress: true;
  biome: number;
  phase: number;
  phases: number;
  pts: number;
  from: string;
}
type DioramaKeepsake = FinishedDiorama | EcosystemInProgress;
type Keepsake = DioramaKeepsake | PressedPlant;

const isDiorama = (keepsake: Keepsake): keepsake is DioramaKeepsake => keepsake.kind === 'reef';
const isPlant = (keepsake: Keepsake): keepsake is PressedPlant => keepsake.kind === 'plant';
const plantLookOf = (plant: PressedPlant): PlantLook => ({ ...plant.seed, kind: plant.species, base: plant.stageName });

function keepsakesOf(game: GameState): (FinishedDiorama | PressedPlant)[] {
  return [
    ...game.reef.dioramas.map((diorama, i): FinishedDiorama => ({ id: `reef-${String(i)}`, kind: 'reef', inProgress: false, ...diorama })).reverse(),
    ...game.history.filter((plant) => plant.bloomed || plant.died || plant.stage > 0).slice().reverse(),
  ];
}

function keepsakeTitle(keepsake: Keepsake): string {
  if (isDiorama(keepsake)) return `${biomeById(keepsake.biome).name} diorama`;
  const species = (speciesNames[keepsake.species] || 'plant').toLowerCase();
  return `${keepsake.name} ${species}, ${keepsake.bloomed ? 'in bloom' : keepsake.died ? 'withered' : lookLabel(keepsake.stageName).toLowerCase()}`;
}

/* naming and notes, shared by plants and dioramas: the pencil renames inline; the note is a one-line box whose Save shows while editing */
const PENCIL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const keepsakeForm = (keepsake: Keepsake, kind: string, inner: string): string => `<form class="dio-f" data-form="keep" data-id="${escapeHtml(keepsake.id)}" data-kind="${kind}">${inner}</form>`;

function nameRow(keepsake: Keepsake, note: KeepsakeNote, kind: string, fallback: string, editing: string | null, className: string): string {
  const name = note.title || fallback;
  const id = escapeHtml(keepsake.id);
  return editing === keepsake.id
    ? keepsakeForm(
        keepsake,
        kind,
        `<label class="sr" for="kt-${id}">Name</label><input id="kt-${id}" name="title" maxlength="60" value="${escapeHtml(note.title || '')}" placeholder="${escapeHtml(fallback)}" autocomplete="off" enterkeyhint="done"><input type="hidden" name="note" value="${escapeHtml(note.note || '')}"><span class="dio-fb"><button class="btn sm primary" type="submit">Save</button><button class="btn sm ghost" type="button" data-act="keep-cancel">Cancel</button></span>`,
      )
    : `<p class="${className}">${escapeHtml(name)}<button class="dio-pen" data-act="keep-edit" data-id="${id}" aria-label="Rename ${escapeHtml(name)}">${PENCIL_ICON}</button></p>`;
}

const noteRow = (keepsake: Keepsake, note: KeepsakeNote, kind: string): string =>
  keepsakeForm(
    keepsake,
    kind,
    `<input type="hidden" name="title" value="${escapeHtml(note.title || '')}"><label class="sr" for="kn-${escapeHtml(keepsake.id)}">Note</label><textarea id="kn-${escapeHtml(keepsake.id)}" name="note" rows="1" maxlength="600" placeholder="Add a note…" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'">${escapeHtml(note.note || '')}</textarea><button class="btn sm primary dio-save" type="submit">Save</button>`,
  );

function plantSummary(plant: PressedPlant): { subtitle: string; chips: string } {
  const subtitle = `${capitalize(plant.season)} · ${formatShortDate(plant.from)}–${formatShortDate(plant.to)} · ${String(plant.sessions)} session${plant.sessions === 1 ? '' : 's'}`;
  const chips = plant.bloomed
    ? `<span class="chip gok">Bloomed</span><span class="chip r-${plant.earned.rarity}">${RARITY_LABELS[plant.earned.rarity]} seed${plant.earned.mutated ? ' · mutant' : ''}</span>`
    : plant.died
      ? '<span class="chip gwarn">Withered</span><span class="chip">Next seed starts sprouted</span>'
      : `<span class="chip">Reached ${lookLabel(plant.stageName).toLowerCase()}</span>`;
  return { subtitle, chips };
}

const dateSpan = (keepsake: { from?: string; to?: string }): string =>
  keepsake.from && keepsake.to ? `${formatShortDate(keepsake.from)} – ${formatShortDate(keepsake.to)}` : keepsake.from ? `Since ${formatShortDate(keepsake.from)}` : '';

/* tiles are read-only; tapping one opens a near-full-screen look (kmodal) with rename and note */
function dioramaTile(diorama: DioramaKeepsake, notes: Readonly<Record<string, KeepsakeNote>>): string {
  const biome = biomeById(diorama.biome);
  const note = notes[diorama.id] ?? {};
  const status = diorama.inProgress ? `Growing · phase ${String(diorama.phase + 1)} of ${String(diorama.phases)}` : escapeHtml(dateSpan(diorama));
  return `<li><button class="dio-t${diorama.inProgress ? ' now' : ''}" data-act="inspect" data-id="${escapeHtml(diorama.id)}"><span class="dio-a">${dioramaSVG(biome, 104)}</span><span class="dio-n">${escapeHtml(note.title || biome.name)}</span><span class="dio-s">${status}</span></button></li>`;
}

function plantTile(plant: PressedPlant, notes: Readonly<Record<string, KeepsakeNote>>): string {
  const note = notes[plant.id] ?? {};
  const title = note.title || keepsakeTitle(plant);
  return `<li><button class="dio-t pl${plant.died ? ' gone' : ''}" data-act="inspect" data-id="${escapeHtml(plant.id)}"><span class="dio-a">${specimen(plant.died ? 'dead' : plant.stageName, plantLookOf(plant), 76, title)}</span><span class="dio-n">${escapeHtml(title)}</span><span class="dio-s">${capitalize(plant.season)} · ${plant.bloomed ? 'bloomed' : plant.died ? 'withered' : lookLabel(plant.stageName).toLowerCase()}</span>${note.note ? `<span class="dio-note">${escapeHtml(note.note)}</span>` : ''}</button></li>`;
}

function inspectModal(keepsake: Keepsake, notes: Readonly<Record<string, KeepsakeNote>>, editing: string | null, animate: boolean): string {
  const note = notes[keepsake.id] ?? {};
  const inProgress = isDiorama(keepsake) && keepsake.inProgress;
  let art: string;
  let kicker: string;
  let head: string;
  let subtitle: string;
  let body: string;
  if (isDiorama(keepsake)) {
    const biome = biomeById(keepsake.biome);
    const visitors = visitorsOf(keepsake.biome);
    const stats: [string, string | number][] = keepsake.inProgress
      ? [['Phase', `${String(keepsake.phase + 1)} / ${String(keepsake.phases)}`], ['Started', keepsake.from ? formatShortDate(keepsake.from) : '—'], ['Life points', Math.round(keepsake.pts)]]
      : [['Days', keepsake.days], ['Full days', keepsake.full], ['Life points', keepsake.pts]];
    art = dioramaSVG(biome, 240);
    kicker = `${keepsake.inProgress ? 'In progress' : 'Diorama'} · ${biome.medium || 'water'}`;
    head = keepsake.inProgress ? `<p class="dio-h">${escapeHtml(biome.name)}</p>` : nameRow(keepsake, note, 'reef', biome.name, editing, 'dio-h');
    subtitle = `${note.title ? `${escapeHtml(biome.name)} · ` : ''}${escapeHtml(dateSpan(keepsake))}`;
    const owns = biome.look?.owns;
    const visitorList = visitors.length
      ? visitors.map((visitor) => `${escapeHtml(visitor.name)}${visitor.rarity !== 'common' ? ` <span class="chip r-${visitor.rarity === 'exotic' ? 'exotic' : 'rare'}">${visitor.rarity}</span>` : ''}`).join(', ')
      : 'none yet';
    body = `<dl class="dio-st">${stats.map(([term, value]) => `<div><dt>${term}</dt><dd class="num">${escapeHtml(String(value))}</dd></div>`).join('')}</dl>${owns ? `<p class="dio-l"><b>Signature</b> ${escapeHtml(owns.join(', '))}</p>` : ''}<p class="dio-l"><b>Visitors</b> ${visitorList}</p>`;
  } else {
    const summary = plantSummary(keepsake);
    art = specimen(keepsake.died ? 'dead' : keepsake.stageName, plantLookOf(keepsake), 200, keepsakeTitle(keepsake));
    kicker = `Pressed plant · ${keepsake.season}`;
    head = nameRow(keepsake, note, keepsake.kind, keepsakeTitle(keepsake), editing, 'dio-h');
    subtitle = escapeHtml(summary.subtitle);
    body = `<p class="gal-c">${summary.chips}</p>`;
  }
  return `<div class="kmodal${animate ? ' in' : ''}" role="dialog" aria-modal="true" aria-label="Closer look"><button class="km-bg" data-act="inspect" data-id="" aria-label="Close" tabindex="-1"></button>
      <article class="km-card"><button class="km-x" data-act="inspect" data-id="" aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <div class="km-art">${art}</div><div class="dio-info"><p class="dio-k">${escapeHtml(kicker)}</p>${head}<p class="gal-s">${subtitle}</p>${body}${inProgress ? '' : noteRow(keepsake, note, keepsake.kind)}</div></article></div>`;
}

/** The Collection shelf (view 'dioramas' or 'plants') plus the inspect modal when `inspected` names a keepsake. */
export function collectionHTML(
  game: GameState | null,
  notes: Readonly<Record<string, KeepsakeNote>> = {},
  editing: string | null = null,
  inspected: string | null = null,
  animate = false,
  view = 'dioramas',
): string {
  if (!game) return '';
  const keepsakes = keepsakesOf(game);
  const reef = game.reef;
  const dioramas: DioramaKeepsake[] = [
    { id: 'now', kind: 'reef', inProgress: true, biome: reef.biome, phase: reef.phase, phases: reef.phases, pts: reef.pts, from: reef.from },
    ...keepsakes.filter((keepsake): keepsake is FinishedDiorama => keepsake.kind === 'reef'),
  ];
  const plants = keepsakes.filter(isPlant);
  const season = game.season;
  const open = [...dioramas, ...plants].find((keepsake) => keepsake.id === inspected);
  const plantList = plants.length
    ? `<ul class="dio">${plants.map((plant) => plantTile(plant, notes)).join('')}</ul>`
    : `<div class="card pad"><p class="empty" style="padding:0 4px">No pressed plants yet. When a habit's plant blooms or withers it is pressed the week after and lands here, for you to name and caption.</p></div>`;
  const segments: [string, string, number][] = [['dioramas', 'Dioramas', dioramas.length - 1], ['plants', 'Plants', plants.length]];
  const tabs = `<div class="seg" role="tablist" aria-label="Collection">${segments.map(([value, label, count]) => `<button role="tab" data-act="coll" data-val="${value}" aria-selected="${String(view === value)}">${label} <span class="num">${String(count)}</span></button>`).join('')}</div>`;
  const subtitle = view === 'plants' ? escapeHtml(season.opens ? `Seeds plant ${formatShortDate(season.opens)}` : `${season.label} · ends ${formatShortDate(season.ends)}`) : 'Tap one for a closer look';
  const list = view === 'plants' ? plantList : `<ul class="dio">${dioramas.map((diorama) => dioramaTile(diorama, notes)).join('')}</ul>`;
  return `<section class="sec game-shelf"><div class="seg-row">${tabs}<span class="gseason">${subtitle}</span></div>${list}</section>${open ? inspectModal(open, notes, editing, animate) : ''}`;
}

/** Stat tiles for the band, counted from the same keepsakes the Collection shows. */
export function gardenTiles(game: GameState | null): GardenTile[] {
  if (!game) return [];
  const keepsakes = keepsakesOf(game);
  const plants = keepsakes.filter(isPlant);
  const rareSeeds = plants.filter((plant) => plant.bloomed && plant.earned.rarity !== 'common');
  return [
    { n: plants.filter((plant) => plant.bloomed).length, l: 'Blooms', s: `${String(plants.filter((plant) => plant.died).length)} withered` },
    { n: rareSeeds.length, l: 'Rare seeds', s: `${String(rareSeeds.filter((plant) => plant.earned.rarity === 'rare').length)} rare · ${String(rareSeeds.filter((plant) => plant.earned.rarity === 'exotic').length)} exotic` },
    { n: keepsakes.filter(isDiorama).length, l: 'Dioramas', s: `ecosystem phase ${String(game.reef.phase + 1)} of ${String(game.reef.phases)}` },
    game.season.opens ? { n: '–', l: 'Season', s: `opens ${formatShortDate(game.season.opens)}` } : { n: capitalize(game.season.name), l: 'Season', s: `ends ${formatShortDate(game.season.ends)}` },
  ];
}
