// The public template never commits a board's models: fails when git tracks anything under models/board/ in a checkout of
// the public repo (origin BlakeCrowther/lifeboard exactly, so a board copy such as my-lifeboard passes; or GITHUB_REPOSITORY in CI).
// A board's own copy of the repo passes and commits models/board/ as that board's model history.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const isPublicTemplate = (origin: string, githubRepository: string | undefined): boolean =>
  githubRepository === 'BlakeCrowther/lifeboard' || /[:/]BlakeCrowther\/lifeboard(\.git)?\/?$/.test(origin.trim());

/** Tracked board files that must not be in this checkout, or none. */
export const forbiddenBoardFiles = (tracked: string[], origin: string, githubRepository: string | undefined): string[] =>
  isPublicTemplate(origin, githubRepository) ? tracked.filter((file) => file.startsWith('models/board/')) : [];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (...args: string[]): string => {
    try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
  };
  const origin = git('remote', 'get-url', 'origin');
  const bad = forbiddenBoardFiles(git('ls-files', 'models/board').split('\n').filter(Boolean), origin, process.env['GITHUB_REPOSITORY']);
  if (bad.length) {
    console.error(`check-public-board: the public template tracks ${String(bad.length)} file(s) under models/board/; a board's models belong in its own copy of the repo:\n  ${bad.slice(0, 10).join('\n  ')}`);
    process.exit(1);
  }
  console.log(`check-public-board: ok (${isPublicTemplate(origin, process.env['GITHUB_REPOSITORY']) ? 'public template' : 'board copy'})`);
}
