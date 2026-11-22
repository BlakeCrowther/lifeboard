/* The Ecosystem: a 3D scene of the current biome, driven by game state. three.js (via the page's import map) loads only once
   the card scrolls into view. Models: roster.json and biomes.json come from MODEL_BASES (tried in order); each roster entry's
   `js` sets window.LB_CREATURES[id] (or LB_SCENERY) to a base64 glb: glTF +X is the head, meters, clips `idle` (loop) and
   `feed`, an empty `mouth` node. */
import { createCard } from './card.ts';
import { buildEngine, type EcosystemDebug, type EcosystemInspect, type EcosystemStats, type Engine, type Manifests } from './engine.ts';
import { loadThreeKit } from './kit.ts';
import { biomeFor, readBiomes, readRoster, type Biome } from './manifests.ts';
import { infoLine, phaseFill, phaseLabel, pinPhase, visitorChip, type SceneView } from './rules.ts';
import { readSceneHooks } from './url-hooks.ts';
import { conditionText, type WeatherReading } from './weather.ts';

/** the one place the model path lives */
const MODEL_BASES = ['models/'];

export interface Ecosystem {
  readonly element: HTMLElement;
  readonly stats: EcosystemStats;
  /** the visitor creature on screen now (null for a forced test visitor) */
  readonly visitor: string | null;
  /** move the persistent card into a placeholder after each app render */
  mount(slot: Element): void;
  setState(game: SceneView): void;
  /** the board's conditions snapshot, or null */
  setWeather(weather: WeatherReading | null): void;
  /** drop food particles; nearby creatures steer in and eat */
  feed(particles?: number): void;
  readonly inspect: EcosystemInspect | null;
  debug(): EcosystemDebug | null;
}

async function loadManifests(manifests: Manifests, stats: EcosystemStats): Promise<void> {
  for (const base of MODEL_BASES) {
    try {
      const response = await fetch(base + 'roster.json', { cache: 'no-cache' });
      if (!response.ok) continue;
      const raw: unknown = await response.json();
      manifests.base = base;
      stats.base = base;
      manifests.roster = readRoster(raw);
      try {
        const biomes = await fetch(base + 'biomes.json', { cache: 'no-cache' });
        if (biomes.ok) {
          manifests.biomes = readBiomes(await biomes.json());
          manifests.biomesLoaded = true;
        }
      } catch {
        /* default biome */
      }
      return;
    } catch {
      /* try the next base */
    }
  }
}

export function createEcosystem(pageUrl: string): Ecosystem {
  const href = pageUrl || location.href;
  const hooks = readSceneHooks(href);
  const isPhone = matchMedia('(max-width:699px), (pointer:coarse)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let engine: Engine | null = null;
  let starting = false;
  let inView = false;
  let game: SceneView | null = null;
  let weather: WeatherReading | null = null;
  let lastBiome: number | null = null;
  let pendingFood = 0;
  const stats: EcosystemStats = { fps: null, bloom: true, pixelRatio: null, creatures: 0, loadMs: null, base: null };
  const manifests: Manifests = { roster: { creatures: [], plants: [], scenery: [] }, biomes: [], biomesLoaded: false, base: null };
  const card = createCard(() => engine?.kick());
  const forcedVisitor = hooks.forcedVisitor;

  /* the state the scene draws: the real game, with preview pins on top */
  const view = (): SceneView | null => (game ? pinPhase<SceneView>(game, hooks.forcedPhase) : null);
  const biome = (id: number): Biome => biomeFor(manifests.biomes, manifests.biomesLoaded, id);
  function sceneBiomeId(): number {
    if (hooks.forcedBiome != null) return +hooks.forcedBiome;
    const forcedEntry = forcedVisitor ? manifests.roster.creatures.find((entry) => entry.id === forcedVisitor) : undefined;
    if (forcedEntry?.biome != null) return forcedEntry.biome;
    const count = manifests.biomes.length || 1;
    const current = view();
    return current ? current.reef.biome % count : 0;
  }
  function paintInfo(): void {
    const current = view();
    if (!current) return;
    const shownBiome = biome(sceneBiomeId());
    card.field('biome').textContent = shownBiome.name;
    card.field('phase').textContent = phaseLabel(current.reef);
    card.field('bar').style.width = String(Math.round(phaseFill(current.reef) * 100)) + '%';
    card.field('line').textContent = infoLine(current, shownBiome, engine ? engine.newToday : []);
    const chip = card.field('visitor');
    const info = engine ? engine.visitorInfo : null;
    const text = visitorChip(forcedVisitor, engine ? engine.visitorName : null, info);
    chip.hidden = !text;
    if (text) chip.textContent = text;
    chip.dataset['rarity'] = info?.rarity ?? '';
  }

  async function start(): Promise<void> {
    if (engine || starting) return;
    starting = true;
    const startedAt = performance.now();
    const message = card.field('msg');
    message.textContent = 'Loading ecosystem…';
    try {
      const [kit] = await Promise.all([loadThreeKit(), loadManifests(manifests, stats)]);
      const built = buildEngine(kit, {
        canvas: card.canvas, stats, hooks, look: card.look, manifests, isPhone, reducedMotion,
        isOpen: card.isOpen, inView: () => inView, view, sceneBiomeId, biome, weather: () => weather,
      });
      engine = built;
      await built.loadCreatures();
      stats.loadMs = Math.round(performance.now() - startedAt);
      message.hidden = true;
      paintInfo();
      built.apply();
      built.kick();
      if (pendingFood) {
        built.dropFood(Math.min(12, pendingFood));
        pendingFood = 0;
      }
    } catch (error) {
      console.warn('[ecosystem]', error);
      message.hidden = false;
      message.textContent = 'The ecosystem preview could not load here.';
    }
    starting = false;
  }

  /* visibility: lazy start, pause off-screen */
  const observer = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) {
        if (!engine) void start();
        else engine.kick();
      }
    },
    { rootMargin: '200px 0px' },
  );
  observer.observe(card.element);

  const weatherKey = (reading: WeatherReading | null): string => (reading?.condition ? `${conditionText(reading.condition)}|${String(reading.at)}` : '');
  return {
    element: card.element,
    stats,
    get visitor() {
      return forcedVisitor ? null : engine ? engine.visitorName : null;
    },
    mount(slot) {
      if (card.element.parentNode !== slot) slot.appendChild(card.element);
    },
    setState(next) {
      game = next;
      paintInfo();
      const running = engine;
      if (!running) return;
      const biomeId = sceneBiomeId();
      if (lastBiome !== null && biomeId !== lastBiome) {
        void running.loadCreatures().then(() => {
          running.apply();
          paintInfo();
        });
      }
      lastBiome = biomeId;
      running.apply();
      paintInfo();
    },
    setWeather(reading) {
      if (weatherKey(reading) === weatherKey(weather)) return;
      weather = reading?.condition ? { condition: reading.condition, at: reading.at } : null;
      engine?.apply();
    },
    get inspect() {
      return engine ? engine.inspect : null;
    },
    feed(particles = 6) {
      if (engine) engine.dropFood(particles);
      else pendingFood += particles;
    },
    debug: () => (engine ? engine.debug() : null),
  };
}
