/* The Ecosystem card's DOM, persistent across app renders. Class names and data-h hooks are styled by index.html and
   capture.html, so they keep their short names. Full screen: one tap on the scene opens it over the whole page; the close
   button or Esc closes it. A fixed overlay, not the Fullscreen API (inside the artifact frame that API took the whole page first). */
import type { LookState } from './engine.ts';

export interface Card {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  look: LookState;
  field(name: 'phase' | 'fs' | 'biome' | 'visitor' | 'bar' | 'line' | 'msg'): HTMLElement;
  isOpen: () => boolean;
}

/** onLookChange: the view moved (full screen opened or closed, or a drag) and the scene should draw a frame. */
export function createCard(onLookChange: () => void): Card {
  const element = document.createElement('section');
  element.className = 'sec eco-card';
  element.setAttribute('aria-label', 'Ecosystem');
  element.innerHTML = `<div class="sec-h"><h3 class="sec-t">Ecosystem</h3><span class="hab-ph" data-h="phase"></span></div>
    <div class="hab"><canvas aria-hidden="true"></canvas><button type="button" class="hab-fs" data-h="fs" aria-label="Open ecosystem full screen"></button><div class="hab-chips"><span class="hab-chip" data-h="biome"></span><span class="hab-chip" data-h="visitor" hidden></span></div>
    <div class="hab-info"><div class="hab-bar"><div data-h="bar"></div></div><p data-h="line"></p></div><p class="hab-msg" data-h="msg">Ecosystem loads when you scroll here.</p></div>`;
  const field: Card['field'] = (name) => {
    const found = element.querySelector<HTMLElement>(`[data-h="${name}"]`);
    if (!found) throw new Error(`[ecosystem] card has no ${name}`);
    return found;
  };
  const canvas = element.querySelector('canvas');
  const stage = element.querySelector<HTMLElement>('.hab');
  if (!canvas || !stage) throw new Error('[ecosystem] card markup incomplete');
  const fullScreenButton = field('fs');
  const isOpen = (): boolean => stage.classList.contains('open');
  const look: LookState = { yaw: 0, pitch: 0 };
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null; /* drag to look around while open */
  const setFullScreen = (on: boolean): void => {
    if (on === isOpen()) return;
    stage.classList.toggle('open', on);
    document.documentElement.classList.toggle('hab-lock', on);
    fullScreenButton.setAttribute('aria-label', on ? 'Close full screen' : 'Open ecosystem full screen');
    if (!on) {
      look.yaw = 0;
      look.pitch = 0;
    }
    onLookChange();
  };
  fullScreenButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setFullScreen(!isOpen());
  });
  stage.addEventListener('click', () => {
    if (!isOpen()) setFullScreen(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) setFullScreen(false);
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    drag = { x: event.clientX, y: event.clientY, yaw: look.yaw, pitch: look.pitch };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const sensitivity = 2.2 / Math.max(320, canvas.clientWidth);
    look.yaw = Math.max(-1, Math.min(1, drag.yaw - (event.clientX - drag.x) * sensitivity));
    look.pitch = Math.max(-0.25, Math.min(0.35, drag.pitch + (event.clientY - drag.y) * sensitivity * 0.5));
    onLookChange();
  });
  const endDrag = (): void => {
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  return { element, canvas, look, field, isOpen };
}
