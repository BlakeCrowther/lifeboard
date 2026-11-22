/* The game's two classic scripts, loaded on demand: garden.js (window.LBGarden: the Garden card SVG and Collection)
   and habitat.js (window.Habitat: the Ecosystem's three.js scene). These types cover what the ui calls; the scripts
   call back through window.LBGame and read window.LB_GAME_HREF, both published here.
   TODO(#26): step 3b turns both scripts into the garden and ecosystem packages; then this file goes. */
import type { GameInput, GameState, PlantPool } from '../../game/derive.ts';
import type { CollectionDoc } from '../../db/schema.ts';

export type GardenPlot = GameState['plots'][number];
export interface GardenTile {
  n: string | number;
  l: string;
  s: string;
}
export interface LogbookItem {
  d: string;
  t: string;
  c: string;
}
interface GardenScript {
  deriveGame(input: GameInput): GameState;
  plantPool(): PlantPool;
  poolVersion(): number;
  /** a plot's look now: stage name, or 'wilt' / 'dead' */
  visual(plot: GardenPlot): string;
  /** stage and look names -> labels */
  LABEL: Record<string, string>;
  plotSVG(plot: GardenPlot, size: number): string;
  /** 'Nov 23' */
  fmt(date: string): string;
  gardenTiles(game: GameState): GardenTile[];
  logbookItems(game: GameState): LogbookItem[];
  logbookHTML(items: LogbookItem[]): string;
  collectionHTML(game: GameState, keepsakes: Record<string, CollectionDoc<'keepsakes'>>, editing: string | null, inspected: string | null, animate: boolean, view: string): string;
}
interface HabitatScript {
  mount(slot: Element): void;
  setState(game: GameState): void;
  setWeather?(weather: { condition: unknown; at: number | null } | null): void;
  feed(particles: number): void;
  /** the visitor creature on screen now */
  visitor?: string;
}
/** What the scripts call back into. */
export interface GameCallbacks {
  feed(): void;
  lessonDone(): void;
  game(): GameState | null;
  render(): void;
}

declare global {
  interface Window {
    LBGarden?: GardenScript;
    Habitat?: HabitatScript;
    LBGame?: GameCallbacks;
    /** the page URL at load, for habitat.js's test hooks (?visitor=, #phase=…) */
    LB_GAME_HREF?: string;
  }
}

export const gardenScript = (): GardenScript | undefined => window.LBGarden;
export const habitatScript = (): HabitatScript | undefined => window.Habitat;
export function publishGameCallbacks(callbacks: GameCallbacks, pageUrl: string): void {
  window.LBGame = callbacks;
  window.LB_GAME_HREF = pageUrl;
}
