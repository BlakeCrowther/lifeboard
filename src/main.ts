// Page entry, bundled to dist/app.js and loaded as a classic script before app.js, garden.js and habitat.js.
import { installLegacyGlobals } from './legacy-globals.ts';

installLegacyGlobals(window);
