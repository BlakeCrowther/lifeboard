/* Ecosystem card: the three.js scene of the current biome, driven by game state. */
export { createEcosystem, type Ecosystem } from './lib/ecosystem.ts';
export type { EcosystemDebug, EcosystemInspect, EcosystemStats, InspectPoseInput } from './lib/engine.ts';
export type { CreatureDebug } from './lib/creatures.ts';
export type { WeatherReading } from './lib/weather.ts';
export { visitorFromUrl } from './lib/url-hooks.ts';
export type { SceneView } from './lib/rules.ts';
