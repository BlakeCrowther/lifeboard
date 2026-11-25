/** What the bar under the break page shows; sent by the main process every tick. */
export interface BarState {
  secondsLeft: number;
  skipInSeconds: number;
  postponeMinutes: number;
  postponesLeft: number;
}

export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}
