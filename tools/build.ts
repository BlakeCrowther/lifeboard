// Bundles the page: src/main.ts -> dist/app.js and src/capture-page.ts -> dist/capture.js (capture.html), ES modules
// that share chunks in dist/chunks/ (the garden and ecosystem packages, loaded on demand). src/fake-db-page.ts ->
// dist/fake-db.js is a classic script (local preview and UI smoke inject it before the page). `--watch` rebuilds on change.
// Run directly: node tools/build.ts (Node 24+ strips types).
import { statSync } from 'node:fs';
import { build, context, type BuildOptions } from 'esbuild';

const shared: BuildOptions = {
  outdir: 'dist',
  bundle: true,
  target: 'es2023',
  minify: true,
  // the sourcemap keeps stack traces readable
  sourcemap: true,
  // three stays on the page's import map.
  external: ['three', 'three/addons/*'],
  logLevel: 'info',
};
const pages: BuildOptions = {
  ...shared,
  entryPoints: { app: 'src/main.ts', capture: 'src/capture-page.ts' },
  format: 'esm',
  splitting: true,
  // no hash: publishing lists every dist file by name
  chunkNames: 'chunks/[name]',
};
const fakeDb: BuildOptions = { ...shared, entryPoints: { 'fake-db': 'src/fake-db-page.ts' }, format: 'iife' };

if (process.argv.includes('--watch')) {
  for (const options of [pages, fakeDb]) await (await context(options)).watch();
} else {
  await Promise.all([build(pages), build(fakeDb)]);
  // The board's first load: a library that drags in its locales or a second copy of itself shows up here first.
  // The game chunks load later, only with the game on, and are not counted. Raise the budget on purpose, never to get past it.
  const BUDGET_BYTES = 300_000;
  const size = statSync('dist/app.js').size;
  if (size > BUDGET_BYTES) {
    console.error(`dist/app.js is ${String(size)} bytes, over the ${String(BUDGET_BYTES)} byte budget (check the bundle with esbuild --metafile)`);
    process.exit(1);
  }
}
