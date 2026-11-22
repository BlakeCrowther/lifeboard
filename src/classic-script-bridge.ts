/* Bridge for garden.js, the one classic script that still reads a domain package through a window global: it takes
   deriveGame, calSeason and SPECIES from window.LBG when it loads. Add a name here only when a classic script reads it.
   TODO(#26): step 3b moves garden.js and habitat.js into packages that import the game package; then this file goes. */
import { PLANT_SPECIES, calendarSeason, deriveGame } from './packages/game/derive.ts';

const gardenGlobals = { deriveGame, calSeason: calendarSeason, SPECIES: PLANT_SPECIES };

declare global {
  interface Window {
    LBG: typeof gardenGlobals;
  }
}

export function installClassicScriptBridge(target: Window): void {
  target.LBG = gardenGlobals;
}
