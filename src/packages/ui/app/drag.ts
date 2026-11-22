/* Drag to reorder (pointer): a task's grip moves its row within its list; dropping saves the bucket's order. */
import { applyOrder } from '../actions/task-actions.ts';
import { catchUp } from '../shared/redraw.ts';
import type { Bucket } from '../shared/tasks.ts';

interface Drag { li: HTMLElement; ul: HTMLElement; startY: number; moved: boolean }
let drag: Drag | null = null;
export const isDragging = (): boolean => !!drag;
const BUCKETS: readonly string[] = ['urgent', 'week', 'later', 'none'];
const isBucket = (k: string | undefined): k is Bucket => !!k && BUCKETS.includes(k);

function endDrag(): void {
  if (!drag) return;
  const { li, ul, moved } = drag;
  drag = null;
  li.classList.remove('dragging');
  li.style.transform = '';
  if (!moved) return;
  const bucket = ul.dataset['bucket'], ids = [...ul.children].map((c) => (c as HTMLElement).dataset['id'] ?? '');
  if (isBucket(bucket)) applyOrder(bucket, ids, li.dataset['id'] ?? '');
  catchUp();
}
export function listenForDrags(): void {
  document.addEventListener('pointerdown', (e) => {
    const handle = (e.target as Element | null)?.closest<HTMLElement>('[data-drag]');
    if (!handle || e.button > 0) return;
    const li = handle.closest<HTMLElement>('.task'), ul = li?.parentElement;
    if (!li || !ul) return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic or ended pointer */ }
    drag = { li, ul, startY: e.clientY, moved: false };
    li.classList.add('dragging');
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { li, ul } = drag, y = e.clientY;
    if (Math.abs(y - drag.startY) > 3) drag.moved = true;
    const next = li.nextElementSibling, prev = li.previousElementSibling;
    if (next) { const r = next.getBoundingClientRect(); if (y > r.top + r.height / 2) { ul.insertBefore(next, li); drag.startY += r.height; } }
    if (prev) { const r = prev.getBoundingClientRect(); if (y < r.top + r.height / 2) { ul.insertBefore(li, prev); drag.startY -= r.height; } }
    li.style.transform = `translateY(${String(y - drag.startY)}px)`;
  });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest('[data-drag]')) e.stopPropagation(); }, true);
}
