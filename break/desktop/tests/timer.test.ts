import { describe, expect, it } from 'vitest';
import { afterAway, BreakTimer } from '../src/timer.ts';
import { parseSettings, type BreakSettings } from '../src/settings.ts';

const MIN = 60_000;
const settings = parseSettings({ workMinutes: 50, breakMinutes: 5, postponeMinutes: 5, maxPostpones: 2, skipDelaySeconds: 15 });
const timer = (s: BreakSettings = settings, now = 0) => new BreakTimer(() => s, now);

/** ticks once a second from `from` to `to` (inclusive), with no idle time, and collects the effects */
function run(t: BreakTimer, from: number, to: number, idle = 0) {
  const out = [];
  for (let now = from; now <= to; now += 1000) out.push(...t.tick(now, idle));
  return out;
}

describe('afterAway (same table as break/pacing-test.swift)', () => {
  const brk = 5 * MIN;
  it('overnight sleep does not start a break', () => { expect(afterAway(8 * 60 * MIN, brk, false)).toEqual({ kind: 'resetWork' }); });
  it('away exactly a break counts as a break', () => { expect(afterAway(brk, brk, false)).toEqual({ kind: 'resetWork' }); });
  it('short lock keeps remaining work time', () => { expect(afterAway(120_000, brk, false)).toEqual({ kind: 'resume', shiftByMs: 120_000 }); });
  it('slept during overlay: break over on wake', () => { expect(afterAway(60 * MIN, brk, true)).toEqual({ kind: 'endBreak' }); });
  it('blip during overlay keeps it', () => { expect(afterAway(10_000, brk, true)).toEqual({ kind: 'resume', shiftByMs: 10_000 }); });
});

describe('BreakTimer', () => {
  it('starts a break once the work period runs out, then ends it with done when the break runs out', () => {
    const t = timer();
    expect(run(t, 1000, 50 * MIN - 1000).filter((e) => e.kind === 'start')).toEqual([]);
    expect(t.tick(50 * MIN, 0)[0]).toEqual({ kind: 'start' });
    expect(t.tick(50 * MIN + 1000, 0)).toEqual([{ kind: 'tick', secondsLeft: 299, skipInSeconds: 14 }]);
    expect(run(t, 50 * MIN + 2000, 55 * MIN)).toContainEqual({ kind: 'end', reason: 'done' });
    expect(t.status(55 * MIN)).toEqual({ kind: 'work', minutesLeft: 50 });
  });

  it('unlocks Skip after skipDelaySeconds', () => {
    const t = timer();
    t.startBreak(0);
    run(t, 1000, 13_000);
    expect(t.tick(14_000, 0)).toEqual([{ kind: 'tick', secondsLeft: 286, skipInSeconds: 1 }]);
    expect(t.tick(15_000, 0)).toEqual([{ kind: 'tick', secondsLeft: 285, skipInSeconds: 0 }]);
  });

  it('idle for a break length resets the work timer instead of starting a break', () => {
    const t = timer();
    run(t, 1000, 40 * MIN);
    expect(t.tick(40 * MIN + 1000, 5 * 60)).toEqual([]);
    expect(t.status(40 * MIN + 1000)).toEqual({ kind: 'work', minutesLeft: 50 });
  });

  it('postpone brings the break back after postponeMinutes and runs out after maxPostpones', () => {
    const t = timer();
    t.startBreak(0);
    expect(t.postpone(1000)).toEqual([{ kind: 'end', reason: 'postpone' }]);
    expect(t.postponesLeft).toBe(1);
    expect(run(t, 2000, 5 * MIN + 1000).filter((e) => e.kind === 'start')).toHaveLength(1);
    expect(t.postpone(5 * MIN + 2000)).toEqual([{ kind: 'end', reason: 'postpone' }]);
    run(t, 5 * MIN + 3000, 10 * MIN + 3000);
    expect(t.onBreak).toBe(true);
    expect(t.postpone(10 * MIN + 4000)).toEqual([]);
    expect(t.end('skip', 10 * MIN + 5000)).toEqual([{ kind: 'end', reason: 'skip' }]);
    expect(t.postponesLeft).toBe(2);
  });

  it('a second start or end does nothing', () => {
    const t = timer();
    expect(t.end('skip', 0)).toEqual([]);
    t.startBreak(0);
    expect(t.startBreak(1)).toEqual([]);
  });

  it('never starts a break while away, and a long lock counts as the break', () => {
    const t = timer();
    run(t, 1000, 45 * MIN);
    t.leave(45 * MIN);
    expect(run(t, 45 * MIN + 1000, 52 * MIN).some((e) => e.kind === 'start')).toBe(false);
    t.returned(52 * MIN);
    expect(t.status(52 * MIN)).toEqual({ kind: 'work', minutesLeft: 50 });
  });

  it('a short lock pushes the next break out by the time away', () => {
    const t = timer();
    t.leave(10 * MIN);
    t.returned(12 * MIN);
    expect(t.nextBreak).toBe(52 * MIN);
  });

  it('a gap between ticks (suspend with no notification) is treated as time away', () => {
    const t = timer();
    run(t, 1000, 49 * MIN);
    // laptop lid closed for an hour: the first tick after waking must not show a break
    expect(t.tick(49 * MIN + 60 * MIN, 0)).toEqual([]);
    expect(t.status(109 * MIN)).toEqual({ kind: 'work', minutesLeft: 50 });
  });

  it('sleeping during a break ends it on wake', () => {
    const t = timer();
    t.startBreak(0);
    expect(t.tick(60 * MIN, 0)).toEqual([{ kind: 'end', reason: 'away' }]);
  });

  it('pause holds the timer, then restarts a full work period', () => {
    const t = timer();
    t.pause(0, 60 * MIN);
    expect(run(t, 1000, 59 * MIN).some((e) => e.kind === 'start')).toBe(false);
    expect(t.status(30 * MIN)).toEqual({ kind: 'paused' });
    t.tick(60 * MIN, 0);
    expect(t.status(60 * MIN)).toEqual({ kind: 'work', minutesLeft: 50 });
  });

  it('reads settings live: a new work length applies on the next reset', () => {
    let s = settings;
    const t = new BreakTimer(() => s, 0);
    s = parseSettings({ ...settings, workMinutes: 25 });
    t.reset(0);
    expect(t.status(0)).toEqual({ kind: 'work', minutesLeft: 25 });
  });
});
