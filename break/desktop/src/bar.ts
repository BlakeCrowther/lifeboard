/* The bar under the break page (bar.html): countdown, "N more min" and Skip. */
import { clockText, type BarState } from './bar-state.ts';

interface BarHost { skip(): void; postpone(): void; onState(show: (state: BarState) => void): void }
const host = (window as unknown as { barHost: BarHost }).barHost;

const el = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`bar.html is missing #${id}`);
  return found;
};
const button = (id: string): HTMLButtonElement => {
  const found = el(id);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`#${id} is not a button`);
  return found;
};
const countdown = el('countdown');
const postpone = button('postpone');
const skip = button('skip');

postpone.addEventListener('click', () => { host.postpone(); });
skip.addEventListener('click', () => { host.skip(); });

host.onState((s) => {
  countdown.textContent = clockText(s.secondsLeft);
  postpone.textContent = `${String(s.postponeMinutes)} more min (${String(s.postponesLeft)} left)`;
  postpone.disabled = s.postponesLeft <= 0;
  skip.disabled = s.skipInSeconds > 0;
  skip.textContent = s.skipInSeconds > 0 ? `Skip (${String(s.skipInSeconds)})` : 'Skip';
});
