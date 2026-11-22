/* Logging habit sessions and the other things Life logs (breaks, check-ins). */
import { padTwo, type DateString } from '../../dates/index.ts';
import { isValidException, type SessionException } from '../board-model.ts';
import { clock, habitWeekOf, relativeDay } from '../shared/clock.ts';
import { statsOf } from '../shared/habit-weeks.ts';
import { render } from '../shared/redraw.ts';
import { model, store, viewState } from '../shared/state.ts';
import { toast } from '../shared/toast.ts';
import { runWrite } from '../shared/writes.ts';

/** Logs a session; a date in a closed week needs an exception (reason + evidence). */
export function logHabit(id: string, date: DateString = clock.today, exception: Omit<SessionException, 'at'> | null = null): void {
  const h = model.habits.find((x) => x.id === id);
  if (!h) return;
  const thisWeek = habitWeekOf(clock.today);
  if (date < thisWeek && !isValidException(exception)) { toast('That week is closed. Add a reason and evidence to log it.'); return; }
  if (date >= thisWeek) viewState.habitPulse = { id, d: 1, week: statsOf(h).week + 1 };
  void runWrite((rec) => store.create('habit_sessions', exception ? { habit_id: h.key, date, exception: { ...exception, at: Date.now() } } : { habit_id: h.key, date }, rec),
    () => { const st = statsOf(h); return `Logged ${h.name}${date !== clock.today ? ' for ' + relativeDay(date).toLowerCase() : ''} · ${String(st.week)}/${String(h.target)} this week${st.week === h.target ? '. Target hit!' : ''}`; });
}
/** Undoes an accidental log: removes this week's (a daily habit: today's) most recent session. */
export function unlogHabit(id: string): void {
  const h = model.habits.find((x) => x.id === id);
  if (!h) return;
  const from = h.daily ? clock.today : habitWeekOf(clock.today);
  const sessions = model.habitSessions.filter((x) => (x.h === h.key || x.h === h.id) && x.date >= from && x.date <= clock.today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created || 0) - (a.created || 0)));
  const latest = sessions[0];
  if (!latest) return;
  viewState.habitPulse = { id, d: -1, week: statsOf(h).week - 1 };
  void runWrite((rec) => store.remove('habit_sessions', latest.id, rec), () => `Removed a ${h.name} session · ${String(statsOf(h).week)}/${String(h.target)} this week`);
}

/** A logs doc for today; the toast offers Undo only when there's a message. */
export const logEvent = (kind: string, label: string, value: unknown, message?: string): void => {
  void runWrite((rec) => store.create('logs', { kind, label, value: value ?? null, date: clock.today }, rec), message, !!message);
};

let timerInterval: ReturnType<typeof setInterval> | null = null;
export function startBreakTimer(): void {
  const t = viewState.breakTimer;
  t.endsAt = Date.now() + t.minutes * 60000;
  t.message = '';
  render();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(breakTimerTick, 1000);
}
export function breakTimerTick(): void {
  const t = viewState.breakTimer, out = document.getElementById('timerOut');
  if (!t.endsAt) { if (timerInterval) clearInterval(timerInterval); timerInterval = null; return; }
  const left = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
  if (out) out.textContent = `${String(Math.floor(left / 60))}:${padTwo(left % 60)}`;
  if (left <= 0) { t.endsAt = null; t.message = 'Break done and logged.'; logEvent('break', `${String(t.minutes)} min`, t.minutes, 'Break done and logged'); render(); }
}
