/* Game: Ecosystem & Garden (each on by default, own switch, synced via checks/ui_prefs). Off: nothing here loads or
   runs (no three.js, no game derivation). The game state is derived from db history (game package deriveGame). */
import { dateOfInstant } from '../../dates/clock.ts';
import type { GameState } from '../../game/derive.ts';
import { validate, type CollectionDoc } from '../../db/schema.ts';
import { useDb } from '../shared/artifact-runtime.ts';
import { clock } from '../shared/clock.ts';
import { effectiveDateOf } from '../shared/tasks.ts';
import { ecosystemOn, gameOn } from '../shared/prefs.ts';
import { render, scheduleRender } from '../shared/redraw.ts';
import { model, modelRevision, store, viewState } from '../shared/state.ts';
import { toast } from '../shared/toast.ts';
import { gardenScript, habitatScript } from './classic-scripts.ts';

export const gameRun = {
  loading: null as Promise<void> | null,
  /** garden.js and habitat.js have loaded */
  ready: false,
  game: null as GameState | null,
  /** the model revision and plant pool version the game was derived from */
  derivedFrom: null as { revision: number; poolVersion: number } | null,
  /** game_state/game.started; undefined until read */
  start: undefined as string | undefined,
  /** the visitor week already recorded as met */
  metSeenWeek: null as string | null,
  /** checks/game_status as last written */
  statusKey: null as string | null,
  /** keepsakes/<id>: shelf titles and notes */
  keepsakes: {} as Record<string, CollectionDoc<'keepsakes'>>,
};

/** True when a URL is a visitor test link or #eco (habitat.js reads the same hooks). */
export function isGameLink(href: string): boolean {
  try {
    const u = new URL(href), h = u.hash.slice(1);
    return h === 'eco' || h === 'labs' || /^(?:labs-)?visitor-[\w-]+$/.test(h) || /(^|[&/])visitor=/.test(h) || u.searchParams.has('visitor');
  } catch { return false; }
}

export function loadGameScripts(): Promise<void> {
  if (gameRun.loading) return gameRun.loading;
  const one = (src: string): Promise<void> => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  gameRun.loading = Promise.all([one('garden.js'), one('habitat.js')])
    .then(() => { gameRun.ready = true; scheduleRender(); })
    .catch((e: unknown) => { console.warn('[game] load failed', e); gameRun.loading = null; });
  return gameRun.loading;
}

/** The game state for today, recomputed when the model or the plant pool changes; null until it can be derived. */
export function currentGame(): GameState | null {
  const garden = gardenScript();
  if (!gameRun.ready || !garden || store.state.status !== 'ready') return null;
  const startDoc = store.get('game_state', 'game');
  if (startDoc?.started) gameRun.start = startDoc.started;
  if (gameRun.start === undefined) { recordGameStart(); return null; }
  const pool = garden.plantPool(), poolVersion = garden.poolVersion();
  const from = gameRun.derivedFrom;
  if (from && from.revision === modelRevision.count && from.poolVersion === poolVersion && gameRun.game && gameRun.game.today === clock.today) return gameRun.game;
  const tasks = model.tasks.map((t) => ({ eff: effectiveDateOf(t), done: t.done, doneDate: t.done && t.doneAt ? dateOfInstant(t.doneAt) : null, days: t.days }));
  const habits = model.habits.map((h) => ({ key: h.key, name: h.name, floor: h.floor, target: h.target, daily: h.daily, since: h.doc.created_at ? dateOfInstant(h.doc.created_at) : null }));
  const sessions = model.habitSessions.map((x) => { const h = model.habits.find((k) => k.key === x.h || k.id === x.h); return { h: h ? h.key : x.h, date: x.date }; });
  const breakSkips = store.all('logs').filter((l) => l.kind === 'break' && l.label === 'skip').map((l) => l.date);
  const lessonDates = store.all('logs').filter((l) => l.kind === 'lesson').map((l) => l.date);
  const breakRules = store.get('checks', 'break_rules')?.value as { skipCost?: unknown } | null | undefined;
  const skipCost = breakRules && breakRules.skipCost != null ? Number(breakRules.skipCost) : undefined;
  try {
    gameRun.game = garden.deriveGame({ today: clock.today, tasks, habits, sessions, start: gameRun.start, breakSkips, ...(skipCost === undefined ? {} : { skipCost }), lessonDates, plantPool: pool, weekStart: clock.weekStart });
  } catch (e) { console.warn('[game] derive', e); gameRun.game = null; }
  gameRun.derivedFrom = { revision: modelRevision.count, poolVersion };
  return gameRun.game;
}

/* The game starts at 0 on the day it is first turned on: game_state/game.started, written once, shared across devices.
   game_state is a store-tracked collection, so it is read only once the db has fully loaded: never overwrite a start
   that exists (an early empty read used to reset it to today on every load). */
let startWrite: Promise<void> | null = null;
function recordGameStart(): void {
  const d = store.get('game_state', 'game');
  if (d?.started) { gameRun.start = d.started; return; }
  if (startWrite || store.state.status !== 'ready') return;
  const body = { started: clock.today, created_at: Date.now() };
  startWrite = store.put('game_state', 'game', body).then(() => { gameRun.start = clock.today; }).catch(() => { gameRun.start = clock.today; /* no db: start today for this page */ })
    .finally(() => { gameRun.derivedFrom = null; scheduleRender(); });
}

/* Shelf titles and notes: keepsakes/<keepsake id> = { kind, title, note, updated_at }. Listens only with the game on. */
let keepsakesListen: Promise<void> | null = null;
export function listenKeepsakes(): Promise<void> {
  keepsakesListen ??= (async () => {
    try {
      const db = await useDb(); if (!db) return;
      db.collection('keepsakes').onSnapshot((snap) => {
        const all: Record<string, CollectionDoc<'keepsakes'>> = {};
        for (const d of snap.docs) all[d.id] = d.data() as CollectionDoc<'keepsakes'>;
        gameRun.keepsakes = all;
        scheduleRender();
      }, () => undefined);
    } catch { /* no db: titles stay local to this page */ }
  })();
  return keepsakesListen;
}
export async function saveKeepsake(id: string, kind: string, title: string, note: string): Promise<void> {
  const body = { kind, title, note, updated_at: Date.now() };
  viewState.editingKeepsake = null;
  gameRun.keepsakes = { ...gameRun.keepsakes, [id]: body as CollectionDoc<'keepsakes'> };
  render();
  try {
    const why = validate('keepsakes', body);
    if (why) throw new Error(why);
    const db = await useDb();
    if (!db) throw new Error('no db');
    await db.collection('keepsakes').doc(id).set(body);
    toast('Saved to the shelf');
  } catch { toast('Could not save that note'); }
}

/** After each render: mount the Ecosystem card, hand it the state, record visitors and the status for Claude's weekly run. */
export function afterRenderGame(): void {
  if (!gameOn() || !gameRun.ready) return;
  const habitat = habitatScript();
  if (!ecosystemOn() || !habitat) { const g0 = currentGame(); if (g0) writeGameStatus(g0); return; }
  const slot = document.querySelector('.eco-slot');
  if (slot) habitat.mount(slot);
  const g = currentGame();
  if (habitat.setWeather) habitat.setWeather(model.conditions?.weather ? { condition: model.conditions.weather['condition'], at: model.conditions.fetchedAt } : null);
  if (g) { habitat.setState(g); void recordVisitor(g); writeGameStatus(g); }
}

/* checks/game_status: the ecosystem's biome/phase for Claude's weekly run (weekly-visitor reads it to know when a
   biome is finished and the next one needs designing), and the garden for season-seeds: `needs` = plots whose current plant
   (habit key + gen) has no 3D model yet, i.e. a new habit or a plant pressed this week. Written only when it changes. */
function writeGameStatus(g: GameState): void {
  const r = g.reef, season = g.season, last = g.history.slice(-12);
  /* the plant growing now when it has no model, plus the next one for a plot showing a bloom/withered plant (pressed when the week starts) */
  const needs = g.plots.flatMap((p) => p.upcoming ? (p.upcoming.made ? [] : [{ plot: p.key, habit: p.name, gen: p.upcoming.gen, rarity: p.upcoming.rarity, mutated: false, biome: season.biome, sown: 'next Monday' }])
    : p.made ? [] : [{ plot: p.key, habit: p.name, gen: p.gen, rarity: p.rarity, mutated: p.mutated, biome: p.biome, sown: p.sown }]);
  const garden = { season: season.name, from: season.from, ends: season.ends, opens: season.opens || null, biome: season.biome, plots: g.plots.length, needs,
    pressed: last.map((h) => ({ plot: h.key, gen: h.gen, species: h.species, bloomed: h.bloomed, earned: h.earned.rarity, to: h.to })) };
  const v = { biome: r.biome, phase: r.phase, phases: r.phases, bleached: r.bleached, dioramas: r.dioramas.length, visitor: g.visitor || null, visitorWeek: g.visitorWeek || null, garden };
  const cur = store.get('checks', 'game_status'), key = JSON.stringify(v);
  if (!store.ready || (cur && JSON.stringify(cur.value) === key) || gameRun.statusKey === key) return;
  gameRun.statusKey = key;
  store.put('checks', 'game_status', { value: v, updated_at: Date.now() }).catch((e: unknown) => { console.warn('[game] reef status', e); });
}

/** Drops food in the Ecosystem (a task done, a lesson answered). */
export function feedEcosystem(): void {
  const habitat = habitatScript();
  if (ecosystemOn() && habitat) habitat.feed(6);
}
/** A lesson card was answered: drops food, and logs logs kind 'lesson' once a day (days without one make the creatures hide). */
export function lessonAnswered(): void {
  if (store.ready && !store.all('logs').some((l) => l.kind === 'lesson' && l.date === clock.today)) store.create('logs', { kind: 'lesson', label: 'done', date: clock.today }).catch((err: unknown) => { console.warn('[lessons] log failed', err); });
  feedEcosystem();
}

/* "A visitor arrived": one visitors_met doc per creature per week, written only with the Ecosystem on.
   Talks to the db directly so the collection stays out of the store's always-on listeners. */
async function recordVisitor(g: GameState): Promise<void> {
  if (!g.visitor || gameRun.metSeenWeek === g.visitorWeek) return;
  const who = habitatScript()?.visitor;
  if (!who) return;
  gameRun.metSeenWeek = g.visitorWeek;
  try {
    const db = await useDb(); if (!db) return;
    const id = (who + '-' + g.visitorWeek).replace(/[^\w-]/g, '_'), body = { creature: who, met_at: Date.now(), biome: g.reef.biome, week: g.visitorWeek, rarity: g.visitor };
    if (validate('visitors_met', body)) return;
    const col = db.collection('visitors_met');
    const seen = await new Promise<boolean>((resolve) => {
      let off: unknown = null;
      off = col.onSnapshot((snap) => { resolve(snap.docs.some((d) => d.id === id)); if (typeof off === 'function') (off as () => void)(); }, () => { resolve(true); });
    });
    if (!seen) { await col.doc(id).set(body); toast(`A visitor arrived in your ecosystem: ${who}`); }
  } catch { /* preview only: never block the board */ }
}
