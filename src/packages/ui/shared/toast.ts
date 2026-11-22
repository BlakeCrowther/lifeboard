/* The toast: one short message at a time, with Undo when the change can be put back. */
import { escapeHtml } from './format.ts';

let hideTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, undo?: (() => void) | null): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span>${escapeHtml(message)}</span>${undo ? '<button type="button" id="undoBtn">Undo</button>' : ''}`;
  el.classList.add('show');
  const undoButton = document.getElementById('undoBtn');
  if (undo && undoButton) undoButton.onclick = () => { el.classList.remove('show'); undo(); };
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { el.classList.remove('show'); }, undo ? 5000 : 2600);
}
