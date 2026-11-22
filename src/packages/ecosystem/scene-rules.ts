/* The scene's pure rules (no three.js, no DOM): URL hooks, weather and season, manifests, growth, resting, card text. */
export { hookFromUrl, readSceneHooks, visitorFromUrl, type SceneHooks } from './lib/url-hooks.ts';
export { seasonValue, weatherAmounts, type WeatherAmounts, type WeatherReading } from './lib/weather.ts';
export { biomeFor, readBiomes, readRoster, readSpec, sceneKeyOf, type Biome, type CreatureSpec, type Roster, type RosterEntry } from './lib/manifests.ts';
export {
  createSeededRandom, fieldOfView, groundHeight, infoLine, nextDayRecord, phaseFill, phaseLabel, pinPhase, placementPhase, progressOf, readDayRecord, restSpec,
  smoothstep, unlockShare, visitorChip, type DayRecord, type RestSpec, type SceneView,
} from './lib/rules.ts';
