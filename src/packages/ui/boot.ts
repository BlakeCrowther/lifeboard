/* Starts the board: theme, events, the game hooks, the db store and the live calendar. Entry point. */
import { textOf } from './shared/format.ts';
import { listenForEvents } from './app/events.ts';
import { readHash } from './app/navigation.ts';
import { registerRenderer } from './app/render.ts';
import { isGameLink, loadGameModulesOnce } from './game/game.ts';
import { startCalendar } from './shared/calendar-watch.ts';
import { clock } from './shared/clock.ts';
import { recordCommitments, seedStarterTasks, spawnMissingSuccessors } from './shared/commitments.ts';
import { ecosystemLink, gameOn } from './shared/prefs.ts';
import { render, scheduleRender } from './shared/redraw.ts';
import { refreshBoard } from './shared/refresh.ts';
import { store } from './shared/state.ts';

declare global {
  interface Window {
    /** injected by the break overlay app (break/) */
    lifeboardBreak?: unknown;
  }
}

/* Break overlay (break/ app): it injects window.lifeboardBreak and fires lifeboardbreakend with how the break ended.
   Each end is logged (logs kind 'break'); skips cost growth in the game (RULES.breaks, checks/break_rules). */
function listenForBreakEnds(): void {
  if (!window.lifeboardBreak) return;
  window.addEventListener('lifeboardbreakend', (e) => {
    const how = textOf((e as CustomEvent<unknown>).detail);
    const label = ['skip', 'skip-page', 'escape'].includes(how) ? 'skip' : how.startsWith('done') ? 'done' : how === 'postpone' ? 'postpone' : null;
    if (!label || !store.ready) return;
    store.create('logs', { kind: 'break', label, value: how, date: clock.today }).catch((err: unknown) => { console.warn('[break] log failed', err); });
  });
}

export function bootBoard(): void {
  registerRenderer();
  listenForEvents();
  try { const theme = localStorage.getItem('lb-theme'); if (theme === 'dark' || theme === 'light') document.documentElement.dataset['theme'] = theme; } catch { /* ignore */ }
  ecosystemLink.forced = isGameLink(location.href);
  readHash();
  if (gameOn()) void loadGameModulesOnce();
  store.start(() => {
    refreshBoard();
    if (store.state.status === 'ready') { seedStarterTasks(); spawnMissingSuccessors(); recordCommitments(); }
    scheduleRender();
  });
  render();
  void startCalendar();
  listenForBreakEnds();
}
