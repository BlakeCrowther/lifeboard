// Every code file is TypeScript. Fails (exit 1) and lists any tracked .js/.mjs/.cjs outside the allowlist.
// Allowed: generated model assets (base64 glb wrappers written by model-ship: goldens in assets/, the starter set, a board's own) and tool configs that must stay JS.
import { execFileSync } from 'node:child_process';

const ALLOWED: RegExp[] = [
  /^models\/(starter\/|board\/)?assets\/[^/]+-glb\.js$/,
  /^\.dependency-cruiser\.cjs$/,
  /^eslint\.config\.mjs$/,
];

const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0');
const offenders = tracked.filter((file) => /\.(js|mjs|cjs)$/.test(file) && !ALLOWED.some((rule) => rule.test(file)));
if (offenders.length) {
  console.error(`check-no-js: ${String(offenders.length)} JavaScript file(s) outside the allowlist; write TypeScript instead:\n  ${offenders.join('\n  ')}`);
  process.exit(1);
}
console.log('check-no-js: ok');
