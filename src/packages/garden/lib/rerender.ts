let rerender: (() => void) | null = null;

/** The board redraws through this once the plant pool, biomes.json or roster.json finish loading. */
export function setGardenRerender(callback: () => void): void {
  rerender = callback;
}

export function requestRerender(): void {
  rerender?.();
}
