/* Where the person is: the URL hash (#life/health, #lists/books) and going to a tab or sub-view. */
import { GROW_VIEWS, LIFE_AREAS, isTab } from '../shared/areas.ts';
import { reducedMotion } from '../shared/media.ts';
import { render } from '../shared/redraw.ts';
import { viewState } from '../shared/state.ts';

export function readHash(): void {
  const [a, b] = location.hash.slice(1).split('/');
  if (isTab(a)) viewState.tab = a;
  if (a === 'life' && LIFE_AREAS.some((x) => x.id === b) && b) viewState.lifeArea = b;
  if (a === 'grow' && GROW_VIEWS.some((x) => x.id === b) && b) viewState.growView = b;
  if (a === 'lists' && b) viewState.listKey = decodeURIComponent(b);
}
export function writeHash(): void {
  const tab = viewState.tab;
  const sub = tab === 'life' ? '/' + viewState.lifeArea : tab === 'grow' ? '/' + viewState.growView : tab === 'lists' ? '/' + encodeURIComponent(viewState.listKey) : '';
  const hash = '#' + tab + sub;
  if (location.hash !== hash) try { history.replaceState(null, '', hash); } catch { /* sandboxed frame */ }
}
/** Goes to 'tab' or 'tab/sub', then scrolls to `anchor` (or the top). */
export function go(to: string, anchor?: string): void {
  const [tab, sub] = to.split('/');
  if (isTab(tab)) viewState.tab = tab;
  viewState.expandedId = null;
  if (tab === 'life' && sub) viewState.lifeArea = sub;
  if (tab === 'grow' && sub) viewState.growView = sub;
  if (tab === 'lists' && sub) viewState.listKey = sub;
  render();
  if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  else scrollTo({ top: 0 });
  document.getElementById('main')?.focus({ preventScroll: true });
}
