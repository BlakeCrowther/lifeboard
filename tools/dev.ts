// Serves the repo root and rebuilds dist/ on change.
// Port: PORT env, else 8765 (the .claude/launch.json default).
import { spawn } from 'node:child_process';

const port = process.env['PORT'] ?? '8765';
const children = [
  spawn('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'tools/build.ts', '--watch'], { stdio: 'inherit' }),
  spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { stdio: 'inherit' }),
];
const stop = (): void => {
  for (const c of children) c.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) {
  c.on('exit', () => {
    stop();
    process.exit();
  });
}
