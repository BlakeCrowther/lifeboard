// Page entry, bundled to dist/app.js and loaded as a classic script before schema.js, store.js and app.js.
import { installLegacyGlobals } from './legacy-globals.ts';

installLegacyGlobals(window);
