// Builds Lifeboard Break (Electron) into break/out/desktop/: main.cjs, the two preloads, bar.js + bar.html,
// the placeholder page and the tray icons. Run: node break/desktop/build.ts (pnpm break:build).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type BuildOptions } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'out', 'desktop');
mkdirSync(out, { recursive: true });

const node: BuildOptions = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'warning', sourcemap: true };
await Promise.all([
  build({ ...node, entryPoints: { main: path.join(here, 'src/main.ts') }, outdir: out, outExtension: { '.js': '.cjs' } }),
  // sandboxed preloads: one file each, requiring only 'electron'
  build({ ...node, entryPoints: { 'bridge-preload': path.join(here, 'src/bridge-preload.ts'), 'bar-preload': path.join(here, 'src/bar-preload.ts') }, outdir: out, outExtension: { '.js': '.cjs' } }),
  build({ bundle: true, platform: 'browser', format: 'iife', target: 'es2023', logLevel: 'warning', entryPoints: { bar: path.join(here, 'src/bar.ts') }, outdir: out }),
]);
copyFileSync(path.join(here, 'bar.html'), path.join(out, 'bar.html'));
copyFileSync(path.join(here, '..', 'placeholder.html'), path.join(out, 'placeholder.html'));
for (const icon of readdirSync(path.join(here, 'assets'))) copyFileSync(path.join(here, 'assets', icon), path.join(out, icon));
console.log(`built ${path.relative(process.cwd(), out)}`);
