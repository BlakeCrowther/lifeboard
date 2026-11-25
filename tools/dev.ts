// Serves the repo root (models from the board, starter and pipeline layers) and rebuilds dist/ on change.
// Port: PORT env, else 8765 (the .claude/launch.json default).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../models/shared/tools/static-server.ts';

const port = Number(process.env['PORT'] ?? '8765');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = spawn('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'tools/build.ts', '--watch'], { stdio: 'inherit' });
const server = createStaticServer(root).listen(port, '127.0.0.1');
const stop = (): void => {
  build.kill();
  server.close();
};
server.on('error', (error) => {
  console.error(error.message);
  stop();
  process.exit(1);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
build.on('exit', () => {
  stop();
  process.exit();
});
