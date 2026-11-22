// Page entry, bundled to dist/app.js (an ES module); the garden and ecosystem packages load later as separate chunks.
import { bootBoard } from './packages/ui/boot.ts';

bootBoard();
