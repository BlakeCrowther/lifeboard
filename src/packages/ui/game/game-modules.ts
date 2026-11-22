/* The garden and ecosystem packages, loaded on demand (a separate bundle chunk each) only when the game is on.
   Undefined until loadGameModules() resolves. */
import type { Ecosystem } from '../../ecosystem/index.ts';

type GardenModule = typeof import('../../garden/index.ts');

let garden: GardenModule | undefined;
let ecosystem: Ecosystem | undefined;

export const loadedGarden = (): GardenModule | undefined => garden;
export const loadedEcosystem = (): Ecosystem | undefined => ecosystem;

/** Loads both packages. `rerender` runs when the garden's plant pool or manifests finish loading. */
export async function loadGameModules(pageUrl: string, rerender: () => void): Promise<void> {
  const [gardenModule, ecosystemModule] = await Promise.all([import('../../garden/index.ts'), import('../../ecosystem/index.ts')]);
  gardenModule.setGardenRerender(rerender);
  garden = gardenModule;
  ecosystem = ecosystemModule.createEcosystem(pageUrl);
}
