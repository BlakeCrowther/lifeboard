// Bundles src/main.ts into dist/app.js. `--watch` rebuilds on change.
// Run directly: node tools/build.ts (Node 24+ strips types).
import { build, context, type BuildOptions } from 'esbuild';

const options: BuildOptions = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'esm',
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
}
