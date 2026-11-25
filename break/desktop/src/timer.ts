/* The break timer's decisions, with no Electron and no clock of its own: every call takes `now` (ms since epoch)
   and returns the effects the shell must carry out. The same rules as the macOS app (break/Pacing.swift). */
import type { BreakSettings } from './settings.ts';

export type EndReason = 'done' | 'skip' | 'postpone' | 'escape' | 'away' | 'skip-page' | 'done-page';

export type Effect =
  | { kind: 'start' }
  | { kind: 'end'; reason: EndReason }
  /** once a second during a break: whole seconds left, and seconds until Skip unlocks (0 = unlocked) */
  | { kind: 'tick'; secondsLeft: number; skipInSeconds: number };

export type Status =
  | { kind: 'work'; minutesLeft: number }
  | { kind: 'break' }
  | { kind: 'paused' }
  | { kind: 'away' };

export type AwayOutcome =
  /** away long enough to count as a break: full work period again */
  | { kind: 'resetWork' }
  /** short absence: push the next break out by the time away */
  | { kind: 'resume'; shiftByMs: number }
  /** was on a break overlay: the break is over */
  | { kind: 'endBreak' };

/** Gap between 1 s ticks above which the process must have been suspended. */
export const SUSPEND_GAP_MS = 5_000;
/** Absence during an overlay break that ends it (the user already rested; never make them wait). */
export const MIN_AWAY_ENDS_BREAK_MS = 30_000;

export function afterAway(awayMs: number, breakMs: number, onBreak: boolean): AwayOutcome {
  if (onBreak) return awayMs >= MIN_AWAY_ENDS_BREAK_MS ? { kind: 'endBreak' } : { kind: 'resume', shiftByMs: awayMs };
  return awayMs >= breakMs ? { kind: 'resetWork' } : { kind: 'resume', shiftByMs: awayMs };
}

const MINUTE = 60_000;

export class BreakTimer {
  nextBreak = 0;
  breakEnds: number | null = null;
  breakStarted = 0;
  postponesLeft = 0;
  pausedUntil: number | null = null;
  /** set while asleep or locked: no break may start until the machine is back */
  awaySince: number | null = null;
  lastTick: number;

  constructor(private readonly settings: () => BreakSettings, now: number) {
    this.lastTick = now;
    this.resetWork(now);
  }

  private get workMs(): number { return this.settings().workMinutes * MINUTE; }
  private get breakMs(): number { return this.settings().breakMinutes * MINUTE; }

  get onBreak(): boolean { return this.breakEnds !== null; }

  resetWork(now: number): void {
    this.nextBreak = now + this.workMs;
    this.postponesLeft = this.settings().maxPostpones;
  }

  /** Reset timer menu item: also lifts a pause. */
  reset(now: number): void { this.pausedUntil = null; this.resetWork(now); }

  pause(now: number, ms: number): void { this.pausedUntil = now + ms; }

  /** The machine went away (sleep, lock, user switch). Overlapping signals keep the earliest time. */
  leave(now: number): void { this.awaySince ??= now; }

  /** The machine is back, or the tick loop noticed a suspend: decide what the time away means. */
  returned(now: number, from?: number): Effect[] {
    const since = this.awaySince ?? from;
    if (since === undefined) return [];
    this.awaySince = null;
    this.lastTick = now;
    const outcome = afterAway(now - since, this.breakMs, this.onBreak);
    if (outcome.kind === 'resetWork') { this.resetWork(now); return []; }
    if (outcome.kind === 'endBreak') return this.end('away', now);
    this.nextBreak += outcome.shiftByMs;
    if (this.breakEnds !== null) this.breakEnds += outcome.shiftByMs;
    return [];
  }

  /** Call once a second. `idleSeconds`: time since the last keyboard or mouse input. */
  tick(now: number, idleSeconds: number): Effect[] {
    const effects: Effect[] = [];
    if (now - this.lastTick > SUSPEND_GAP_MS) effects.push(...this.returned(now, this.awaySince ?? this.lastTick));
    this.lastTick = now;
    if (this.awaySince !== null) return effects;
    if (this.breakEnds !== null) {
      const left = this.breakEnds - now;
      if (left <= 0) return [...effects, ...this.end('done', now)];
      const skipIn = this.settings().skipDelaySeconds * 1000 - (now - this.breakStarted);
      return [...effects, { kind: 'tick', secondsLeft: Math.ceil(left / 1000), skipInSeconds: Math.max(0, Math.ceil(skipIn / 1000)) }];
    }
    if (this.pausedUntil !== null) {
      if (now < this.pausedUntil) return effects;
      this.pausedUntil = null;
      this.resetWork(now);
    }
    // Away from the keyboard for a break's length counts as a break.
    if (idleSeconds * 1000 >= this.breakMs) this.resetWork(now);
    if (now >= this.nextBreak) effects.push(...this.startBreak(now));
    return effects;
  }

  startBreak(now: number): Effect[] {
    if (this.breakEnds !== null) return [];
    this.breakStarted = now;
    this.breakEnds = now + this.breakMs;
    const skipIn = Math.ceil(this.settings().skipDelaySeconds);
    return [{ kind: 'start' }, { kind: 'tick', secondsLeft: Math.ceil(this.breakMs / 1000), skipInSeconds: Math.max(0, skipIn) }];
  }

  end(reason: EndReason, now: number): Effect[] {
    if (this.breakEnds === null) return [];
    this.breakEnds = null;
    this.resetWork(now);
    return [{ kind: 'end', reason }];
  }

  /** "N more min": ends this break and brings it back after postponeMinutes, using up one postpone. */
  postpone(now: number): Effect[] {
    if (this.postponesLeft <= 0 || this.breakEnds === null) return [];
    const left = this.postponesLeft - 1;
    const effects = this.end('postpone', now);
    this.nextBreak = now + this.settings().postponeMinutes * MINUTE;
    this.postponesLeft = left;
    return effects;
  }

  status(now: number): Status {
    if (this.breakEnds !== null) return { kind: 'break' };
    if (this.awaySince !== null) return { kind: 'away' };
    if (this.pausedUntil !== null && now < this.pausedUntil) return { kind: 'paused' };
    return { kind: 'work', minutesLeft: Math.max(0, Math.ceil((this.nextBreak - now) / MINUTE)) };
  }
}
