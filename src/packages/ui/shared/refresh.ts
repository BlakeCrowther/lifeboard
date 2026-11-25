/* refreshBoard: rebuild the model and profile from the store, after applying board prefs, the week start and the
   profile's time zone. Runs on every db change and live calendar update. */
import { setTimeZone, timeZone, todayDate } from '../../dates/clock.ts';
import { loadGameModulesOnce } from '../game/game.ts';
import { buildBoardModel, readProfile } from '../board-model.ts';
import { liveCalendar } from './calendar-feed.ts';
import { clock } from './clock.ts';
import { applyBoardPrefs, gameOn } from './prefs.ts';
import { model, modelRevision, profile, store } from './state.ts';

export function refreshBoard(): void {
  if (applyBoardPrefs() && gameOn()) setTimeout(() => { void loadGameModulesOnce(); }, 0);
  const weekStartDoc = store.get('checks', 'week_start'), weekStart = weekStartDoc ? Number(weekStartDoc.value) : NaN;
  clock.weekStart = Number.isInteger(weekStart) && weekStart >= 0 && weekStart <= 6 ? weekStart : 1;
  const read = readProfile(store.get('checks', 'profile')?.value);
  if (read.timeZone && read.timeZone !== timeZone() && setTimeZone(read.timeZone)) clock.today = todayDate();
  profile.name = read.name;
  profile.place = read.place;
  profile.placeName = read.placeName;
  profile.duetTrigger = read.duetTrigger;
  profile.pets = read.pets;
  profile.demo = read.demo;
  applyDemoMarks(read.demo);
  Object.assign(model, buildBoardModel(store.all, {
    today: clock.today, weekStart: clock.weekStart, pets: profile.pets,
    liveCalendar: liveCalendar.events ? { events: liveCalendar.events, fetchedAt: liveCalendar.fetchedAt } : null,
  }));
  modelRevision.count++;
}

/** The Demo badge (header and collapsed bar) and the document title follow checks/profile.demo. */
function applyDemoMarks(demo: boolean): void {
  for (const id of ['demoBadge', 'barDemo']) {
    const badge = document.getElementById(id);
    if (badge) badge.hidden = !demo;
  }
  document.title = demo ? 'Lifeboard Demo' : 'lifeboard';
}
