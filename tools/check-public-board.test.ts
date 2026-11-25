import { describe, expect, it } from 'vitest';
import { forbiddenBoardFiles } from './check-public-board.ts';

const tracked = ['models/board/roster.json'];

describe('check-public-board', () => {
  it('fails a tracked board file in the public repo, by origin or by CI variable', () => {
    expect(forbiddenBoardFiles(tracked, 'https://github.com/BlakeCrowther/lifeboard', undefined)).toEqual(tracked);
    expect(forbiddenBoardFiles(tracked, 'git@github.com:BlakeCrowther/lifeboard.git', undefined)).toEqual(tracked);
    expect(forbiddenBoardFiles(tracked, '', 'BlakeCrowther/lifeboard')).toEqual(tracked);
  });

  it('passes board copies, whatever their name', () => {
    for (const origin of ['https://github.com/BlakeCrowther/my-lifeboard', 'https://github.com/BlakeCrowther/lifeboard-private', 'https://github.com/someone/lifeboard']) {
      expect(forbiddenBoardFiles(tracked, origin, undefined)).toEqual([]);
    }
  });
});
