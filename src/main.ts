// Page entry, bundled to dist/app.js and loaded as a classic script; garden.js and habitat.js load later, on demand.
import { installClassicScriptBridge } from './classic-script-bridge.ts';
import { bootBoard } from './packages/ui/boot.ts';

installClassicScriptBridge(window);
bootBoard();
