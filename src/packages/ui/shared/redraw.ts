/* Redrawing the page. Any module asks for a redraw here; the render loop (app/render.ts) registers how. db changes
   arrive any time (other devices too), so scheduled redraws wait while someone is typing or dragging. */
let renderer: () => void = () => undefined;
let isBusy: () => boolean = () => false;
let pending = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function setRenderer(render: () => void, busy: () => boolean): void {
  renderer = render;
  isBusy = busy;
}
/** Draws the page now. */
export function render(): void {
  pending = false;
  renderer();
}
/** Draws on the next tick unless someone is typing or dragging; then a later catchUp() draws it. */
export function scheduleRender(): void {
  pending = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (!isBusy()) render();
  }, 16);
}
/** A redraw was skipped while busy. */
export const renderPending = (): boolean => pending;
export function catchUp(): void {
  if (pending) scheduleRender();
}
export const userBusy = (): boolean => isBusy();
