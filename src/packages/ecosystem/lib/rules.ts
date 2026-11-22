/* Pure scene rules: no three.js, no DOM. The engine and the card call these; tests pin them. */
import type { Range, RestInput } from './manifests.ts';

/** The reef fields of the game state the scene reads. */
export interface ReefView {
  biome: number;
  phase: number;
  phases: number;
  pts: number;
  next: number | null;
  prev: number;
  bleached: boolean;
}

/** The game state fields the scene reads, plus the preview pins (`pf` = a fixed progress, `pf0` = its start of day). */
export interface SceneView {
  reef: ReefView;
  pf?: number | null;
  pf0?: number | null;
  /** set when ?phase= pins the phase */
  pinnedPhase?: boolean;
  todayTide: { pct: number; full: boolean } | null;
  overdue: number;
  breaks: { sad: boolean; skipsToday: number; lost: number };
  lessons: { hide: boolean; daysSince: number | null };
  cloudiness: number;
  blight: number;
}

/** Seeded mulberry32: the world's layout depends on the exact order of calls, so builders must keep it. */
export interface SeededRandom {
  next: () => number;
  between: (low: number, high: number) => number;
  reset: () => void;
}

export function createSeededRandom(start = 7): SeededRandom {
  let seed = start;
  const next = (): number => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (low, high) => low + next() * (high - low),
    reset: () => {
      seed = start;
    },
  };
}

export const smoothstep = (low: number, high: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** Sand height at (x, z): gentle ripples plus a mound in front of the camera. */
export function groundHeight(x: number, z: number): number {
  const ripple = Math.sin(x * 0.9) * Math.cos(z * 0.7) * 0.3 + Math.sin(x * 2.3 + z * 1.7) * 0.1 + Math.sin(z * 3.1 - x) * 0.04;
  return ripple + 0.6 * Math.exp(-(x * x + (z + 1) * (z + 1)) / 10);
}

/** The scene's view of the game: ?phase= pins the phase (1-based) on top of the real game. */
export function pinPhase<T extends SceneView>(game: T, forcedPhase: number | null): T {
  if (!forcedPhase) return game;
  return { ...game, reef: { ...game.reef, phase: Math.min(forcedPhase, game.reef.phases || 5) - 1 }, pinnedPhase: true };
}

/** Biome progress 0..1 from reef points (phase thresholds are evenly spaced); preview pins override it. */
export function progressOf(view: Pick<SceneView, 'reef' | 'pf' | 'pinnedPhase'>): number {
  if (view.pf != null) return view.pf;
  const reef = view.reef;
  const phases = reef.phases || 5;
  if (view.pinnedPhase) return (reef.phase + 1) / phases - 1e-5;
  const perPhase = reef.next != null ? reef.next / (reef.phase + 1) : reef.prev / Math.max(1, phases - 1);
  return perPhase > 0 ? Math.min(1, reef.pts / (perPhase * phases)) : 0;
}

/** Progress at the start of today, kept per viewer (`d` day, `b` biome, `f` start, `fEnd` latest) so "new today" survives reloads. */
export interface DayRecord {
  d: string;
  b: number;
  f: number;
  fEnd?: number;
}

export function readDayRecord(raw: unknown): DayRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Partial<Record<keyof DayRecord, unknown>>;
  if (typeof record.d !== 'string' || typeof record.b !== 'number' || typeof record.f !== 'number') return null;
  return typeof record.fEnd === 'number' ? { d: record.d, b: record.b, f: record.f, fEnd: record.fEnd } : { d: record.d, b: record.b, f: record.f };
}

/** The record after seeing `progress` today. A new day in the same biome starts from yesterday's last progress. */
export function nextDayRecord(previous: DayRecord | null, today: string, biome: number, progress: number): DayRecord {
  let record = previous;
  if (!record || record.d !== today || record.b !== biome || record.f > progress) {
    const carried = record && record.b === biome && record.d !== today ? Math.min(record.fEnd ?? progress, progress) : progress;
    record = { d: today, b: biome, f: carried };
  }
  return { ...record, fEnd: progress };
}

/** Phase of the k-th of n copies of a scenery piece spread over a phase range. */
export function placementPhase(phases: Range, index: number, count: number): number {
  return phases[0] + Math.floor((index * (phases[1] - phases[0] + 1)) / count);
}

/** Share of the biome's progress (0..1) at which the i-th of `count` pieces of a phase unlocks; the last one (the landmark)
    lands as the phase completes. */
export function unlockShare(phase: number, index: number, count: number, phases = 5): number {
  const last = index === count - 1 && count > 1;
  return last ? (phase + 1) / phases - 1e-4 : (phase + index / count) / phases;
}

export interface RestSpec {
  on: string;
  pose: string;
  share: number;
  bout: Range;
  sessile: boolean;
}

const REST_SURFACES: Record<string, string[]> = { lie: ['sand'], cling: ['rock', 'branch', 'prop'], hang: ['branch', 'prop'] };

/** A creature's rest (docs/design/creature-rest.md), from the roster entry first (specs aren't published with the board), then the
    spec; ?rest=<on>_<pose> overrides. null = it never rests (unknown pose or a surface that pose can't use). */
export function restSpec(fromRoster: RestInput | undefined, fromSpec: RestInput | undefined, forcedRest: string | null, locomotion: string): RestSpec | null {
  let rest: RestInput | null = fromRoster ?? fromSpec ?? null;
  if (forcedRest) {
    const [on, pose] = forcedRest.split('_');
    rest = { ...(rest ?? {}) };
    if (on !== undefined) rest.on = on;
    else delete rest.on;
    if (pose !== undefined) rest.pose = pose;
    else delete rest.pose;
  }
  if (!rest?.pose || !rest.on) return null;
  const surfaces = REST_SURFACES[rest.pose];
  if (!surfaces?.includes(rest.on)) return null;
  const share = Math.min(1, Math.max(0.05, rest.share ?? 0.35));
  return { on: rest.on, pose: rest.pose, share, bout: rest.bout_s ?? [10, 25], sessile: share >= 1 || locomotion === 'rooted' };
}

/** 45° vertical at 4:3 and wider; narrower (portrait) screens keep that horizontal view and see more above and below. */
export function fieldOfView(aspect: number): number {
  const base = (45 * Math.PI) / 180;
  const reference = 4 / 3;
  return aspect >= reference ? 45 : Math.min(90, (2 * Math.atan((Math.tan(base / 2) * reference) / aspect) * 180) / Math.PI);
}

export function phaseLabel(reef: ReefView): string {
  return `Phase ${String(Math.min(reef.phase + 1, reef.phases))} of ${String(reef.phases)}${reef.bleached ? ' · bleached' : ''}`;
}

/** Fill of the progress bar toward the next phase, 0..1. */
export function phaseFill(reef: ReefView): number {
  const span = (reef.next ?? reef.pts) - reef.prev;
  const fill = span > 0 ? (reef.pts - reef.prev) / span : 1;
  return Math.max(0, Math.min(1, fill));
}

/** The info line under the scene. */
export function infoLine(view: SceneView, biome: { medium?: string; neglect?: { murk_name?: string } }, newToday: string[]): string {
  const reef = view.reef;
  const tide = view.todayTide;
  const bits = [view.pf != null ? `preview: day ${String(Math.round(view.pf * 31.5))} of ~32` : `${String(Math.round(reef.pts))} / ${reef.next != null ? String(reef.next) : '–'} life points`];
  bits.push(tide ? `today ${String(Math.round(tide.pct * 100))}%${tide.full ? ', full day' : ''}` : 'today neutral');
  if (newToday.length) bits.push(`new today: ${newToday.join(', ')}`);
  if (view.overdue) bits.push(`${String(view.overdue)} overdue: ${biome.neglect?.murk_name || 'murk'} clouding the ${biome.medium === 'water' || !biome.medium ? 'water' : 'air'}`);
  if (view.breaks.sad) {
    const skipped = view.breaks.skipsToday > 1 ? `${String(view.breaks.skipsToday)} breaks` : 'a break';
    bits.push(`skipped ${skipped} · the fish noticed${view.breaks.lost ? ` (−${String(view.breaks.lost)} growth)` : ''}`);
  }
  if (view.lessons.hide) bits.push(`no lessons in ${String(view.lessons.daysSince)} days · the fish are hiding`);
  return bits.join(' · ');
}

export interface VisitorInfo {
  count: number;
  rarity: string | null;
}

/** The visitor chip's text: a forced test visitor, else the newest visitor with the count and a rare/exotic tag. */
export function visitorChip(forcedVisitor: string | null, visitorName: string | null, info: VisitorInfo | null): string | null {
  const who = forcedVisitor || visitorName;
  if (!who) return null;
  if (forcedVisitor) return `Visitor: ${forcedVisitor} (test)`;
  const tag = info?.rarity === 'rare' || info?.rarity === 'exotic' ? ` · ${info.rarity}` : '';
  return `${info && info.count > 1 ? `${String(info.count)} visitors · newest ` : 'Visitor: '}${who}${tag}`;
}
