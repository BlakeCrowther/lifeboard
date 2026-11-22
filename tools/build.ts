// Bundles src/main.ts into dist/app.js (the page) and src/fake-db-page.ts into dist/fake-db.js (local preview
// and UI smoke only). `--watch` rebuilds on change.
// Run directly: node tools/build.ts (Node 24+ strips types).
import { statSync } from 'node:fs';
import { build, context, type BuildOptions } from 'esbuild';

const options: BuildOptions = {
  entryPoints: { app: 'src/main.ts', 'fake-db': 'src/fake-db-page.ts' },
  outdir: 'dist',
  bundle: true,
  // iife, not esm: the page loads it as a classic script so its globals exist before the legacy scripts after it run.
  format: 'iife',
  target: 'es2023',
  sourcemap: true,
  // three stays on the page's import map.
  external: ['three', 'three/addons/*'],
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
  // The whole page ships as one artifact: a library that drags in its locales or a second copy of itself shows up
  // here first. Raise the budget on purpose, never to get past it.
  const BUDGET_BYTES = 300_000;
  const size = statSync('dist/app.js').size;
  if (size > BUDGET_BYTES) {
    console.error(`dist/app.js is ${String(size)} bytes, over the ${String(BUDGET_BYTES)} byte budget (check the bundle with esbuild --metafile)`);
    process.exit(1);
  }
}
