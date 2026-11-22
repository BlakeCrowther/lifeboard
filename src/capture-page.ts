/* capture.html's entry: the Ecosystem alone, filling the window, with a synthetic game state (no board, no db).
   window.Ecosystem is the handle the model pipeline's headless tools drive (models/shared/tools/capture_habitat.mjs,
   watch_creatures.mjs: inspect.pose, debug, feed). Query: every ecosystem URL hook plus ?neglect=<0..1>. */
import { createEcosystem, type Ecosystem } from './packages/ecosystem/index.ts';

declare global {
  interface Window {
    Ecosystem?: Ecosystem;
  }
}

const query = new URLSearchParams(location.search);
const neglect = Math.max(0, Math.min(1, Number(query.get('neglect') ?? 0) || 0));
const ecosystem = createEcosystem(location.href);
const slot = document.getElementById('slot');
if (slot) ecosystem.mount(slot);
ecosystem.setState({
  reef: { biome: Number(query.get('biome') ?? 0) || 0, phase: 4, phases: 5, bleached: false, pts: 100, prev: 0, next: null },
  cloudiness: neglect * 0.8, blight: neglect, overdue: Math.round(neglect * 10),
  todayTide: null, breaks: { sad: false, skipsToday: 0, lost: 0 }, lessons: { hide: false, daysSince: null },
});
window.Ecosystem = ecosystem;
