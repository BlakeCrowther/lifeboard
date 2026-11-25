// The public template never commits a board's models: fails when git tracks anything under models/board/ in a checkout of
// the public repo (origin BlakeCrowther/lifeboard, not a board copy such as my-lifeboard; or GITHUB_REPOSITORY in CI).
// A board's own copy of the repo passes and commits models/board/ as that board's model history.
import { execFileSync } from 'node:child_process';

const git = (...args: string[]): string => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
};
const origin = git('remote', 'get-url', 'origin');
const isPublic = process.env['GITHUB_REPOSITORY'] === 'BlakeCrowther/lifeboard' || (origin.includes('BlakeCrowther/lifeboard') && !origin.includes('my-lifeboard'));
const tracked = git('ls-files', 'models/board').split('\n').filter(Boolean);
if (isPublic && tracked.length) {
  console.error(`check-public-board: the public template tracks ${String(tracked.length)} file(s) under models/board/; a board's models belong in its own copy of the repo:\n  ${tracked.slice(0, 10).join('\n  ')}`);
  process.exit(1);
}
console.log(`check-public-board: ok (${isPublic ? 'public template' : 'board copy'})`);
