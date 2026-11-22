/* Today's Habits card: rings (one per habit, toward the weekly target) or, with the Garden on, one plot per habit.
   Habit pips (SPEC.md "Habit pips"): daily = a water drop per day, weekly = a honey cell per session.
   Fill: 0..floor fills the bottom half, floor..target the top half. */
import type { HabitStats } from '../../habits/index.ts';
import { currentGame } from '../game/game.ts';
import { loadedGarden } from '../game/game-modules.ts';
import type { BoardHabit } from '../board-model.ts';
import { clock, firstDayOfHabitWeek, habitWeekOf, lastDayOfHabitWeek } from '../shared/clock.ts';
import { escapeHtml, plural } from '../shared/format.ts';
import { lastWeekCheck } from '../shared/habit-weeks.ts';
import { icon } from '../shared/icons.ts';
import { gardenOn } from '../shared/prefs.ts';
import { goLink, sectionHeader } from '../shared/sections.ts';
import { viewState } from '../shared/state.ts';
import { daysBetween } from '../../dates/index.ts';

/** A habit on Today: its stats, target met, and floor at risk. */
export interface HabitTile {
  h: BoardHabit;
  st: HabitStats;
  met: boolean;
  low: boolean;
  /** the floor's final chance: the week's last day, or a daily habit's evening */
  last: boolean;
}

export const PIP_DROP = 'M10 2C10 2 3 11 3 15a7 7 0 0 0 14 0C17 11 10 2 10 2Z';
export const PIP_HEX = '10,2 18,7 18,17 10,22 2,17 2,7';
let pipCount = 0;
function pipFill(n: number, floor: number, target: number): number {
  const f = Math.max(1, floor), t = Math.max(f, target);
  if (n <= 0) return 0;
  if (n < f) return 0.5 * n / f;
  return t <= f ? 1 : Math.min(1, 0.5 + 0.5 * (n - f) / (t - f));
}
const pipSvg = (inner: string, cls = '', viewBox = '1 1 18 23'): string => `<svg class="pip${cls}" viewBox="${viewBox}" aria-hidden="true">${inner}</svg>`;
function dropPip(n: number, floor: number, target: number, { future = false, today = false }: { future?: boolean; today?: boolean } = {}): string {
  const fr = future ? 0 : pipFill(n, floor, target), id = 'pd' + String(++pipCount), y = (22 - 20 * fr).toFixed(2);
  const miss = !future && !today && n < floor, above = !future && n > target;
  let s = above ? '<g class="rb" fill="none" stroke-width="2"><path d="M-4 16a14 14 0 0 1 28 0" class="r1"/><path d="M-2 16a12 12 0 0 1 24 0" class="r2"/><path d="M0 16a10 10 0 0 1 20 0" class="r3"/></g>' : '';
  s += `<path d="${PIP_DROP}" class="${future ? 'dz' : 'de'}"/>`;
  if (fr > 0) s += `<clipPath id="${id}"><rect x="0" y="${y}" width="20" height="24"/></clipPath><path d="${PIP_DROP}" class="df" clip-path="url(#${id})"/>`;
  if (!future && fr < 1) s += `<clipPath id="${id}f"><path d="M10 3.6C10 3.6 4.1 11.4 4.1 15a5.9 5.9 0 0 0 11.8 0C15.9 11.4 10 3.6 10 3.6Z"/></clipPath><line x1="0" y1="12" x2="20" y2="12" class="dl" clip-path="url(#${id}f)"/>`;
  if (!future) s += `<path d="${PIP_DROP}" class="${miss ? 'dm' : fr >= 0.5 ? 'dok' : 'do'}"/>`;
  return pipSvg(s, today ? ' today' : '');
}
function honeyPip(on: boolean, { floorSlot = false, extra = false, hot = false } = {}): string {
  let s = `<polygon points="${PIP_HEX}" class="${extra ? 'hx' : on ? 'hf' : 'he'}"/>`;
  if (floorSlot) s += `<polygon points="${PIP_HEX}" class="hs${on ? ' on' : ''}"/>`;
  if (extra) s += '<path d="M13 19v3a1.5 1.5 0 0 0 3 0v-5z" class="hx"/><ellipse cx="14.5" cy="6" rx="3.2" ry="2.2" class="bee"/><path d="M13.5 4v4M15.5 4v4" class="bs"/><ellipse cx="13.5" cy="3.4" rx="1.8" ry="1.2" class="bw"/>';
  return pipSvg(s, hot ? ' hot' : '', '2 2 16 20');
}
export function habitPips(h: BoardHabit, st: HabitStats, hot = -1): string {
  if (h.daily) return '<span class="pips dly">' + st.days.map((x) => `<span class="pd${x.today ? ' td' : ''}">${dropPip(x.n, h.floor, h.target, x)}<small>${'SMTWTFS'[new Date(x.d + 'T12:00').getDay()] ?? ''}</small></span>`).join('') + '</span>';
  const n = Math.max(h.target, st.week);
  let p = '';
  for (let i = 0; i < n; i++) p += honeyPip(i < st.week, { floorSlot: i < h.floor, extra: i >= h.target, hot: i === hot });
  return `<span class="pips wk" style="--n:${String(n)}">${p}</span>`;
}
/** Streak badge: solid = safe this week, outlined = still needs the floor, red = at risk. */
export function flameBadge(st: HabitStats, low: boolean): string {
  if (!st.streak) return '';
  return `<span class="flb num${st.pending ? (low ? ' risk' : ' pend') : ''}" title="${String(st.streak)}-week streak${st.pending ? ', not safe yet this week' : ''}">${icon('flame', 11)}${String(st.streak)}</span>`;
}
function lastWeekLine(): string {
  const wc = daysBetween(habitWeekOf(clock.today), clock.today) <= 1 ? lastWeekCheck() : null;
  return wc && wc.rows.length ? `Last week: ${String(wc.kept)} of ${String(wc.rows.length)} streaks kept${wc.reset ? `, ${String(wc.reset)} reset` : ''}. ` : '';
}

/** Habit rings: one per habit, filling toward the weekly target. The dot on each ring is the floor that keeps the streak alive. */
export function habitRings(hs: HabitTile[], done: number, total: number, daysLeft: number): string {
  if (!hs.length) return '';
  const allTarget = hs.every((x) => x.met), allFloor = hs.every((x) => x.st.week >= x.h.floor);
  const lowN = hs.filter((x) => x.low).length;
  const msg = allTarget ? 'Perfect week. Every habit hit its target.'
    : allFloor ? 'Every streak is safe this week. The rest is bonus.'
    : lowN ? `${plural(lowN, 'streak')} need${lowN === 1 ? 's' : ''} a session in the next ${plural(daysLeft, 'day')}.`
    : 'Tap a habit to log a session.';
  const tiles = hs.map(({ h, st, met, low }) => {
    const p = habitPips(h, st), count = h.daily ? st.today : st.week;
    const label = `Log a ${h.name} session today. ${String(count)} of ${String(h.target)} ${h.daily ? 'today' : 'this week'}${met ? ', target hit' : count >= h.floor ? ', streak safe' : low ? ', streak at risk' : ''}. ${st.streak ? `${String(st.streak)}-week streak.` : 'No streak yet.'}`;
    return `<li class="pt${met ? ' met' : ''}${low ? ' low' : ''}"><button class="ptb" data-act="log" data-id="${h.id}" aria-label="${escapeHtml(label)}"><span class="ptt"><span class="ptn">${escapeHtml(h.name.split(' ')[0])}</span>${flameBadge(st, low)}</span><span class="ptp" aria-hidden="true">${p}</span></button>
      <button class="hminus" data-act="unlog" data-id="${h.id}" aria-label="Remove a ${escapeHtml(h.name)} session from ${h.daily ? 'today' : 'this week'}"${count ? '' : ' disabled'}>${icon('minus', 13)}</button></li>`;
  }).join('');
  const f = total ? Math.min(done / total, 1) : 0, C = 238.8;
  return `<section class="sec z-now habitsec">${sectionHeader('Habits', goLink('All', 'grow/habits'), 2, `${String(done)}/${String(total)}`)}
    <div class="card hsc"><div class="hscore${f >= 1 ? ' full' : ''}" role="img" aria-label="Week score ${String(Math.round(f * 100))} percent, ${String(done)} of ${String(total)} sessions"><svg viewBox="0 0 88 88" aria-hidden="true"><circle class="ht" cx="44" cy="44" r="38"/><circle class="ha" cx="44" cy="44" r="38" stroke-dasharray="${String(C)}" stroke-dashoffset="${(C - C * f).toFixed(1)}" transform="rotate(-90 44 44)"/></svg><b class="num">${String(Math.round(f * 100))}%<small>this week</small></b></div>
    <ul class="pgrid">${tiles}</ul></div><p class="wmsg">${escapeHtml(lastWeekLine() + msg)}</p></section>`;
}

/** Garden: the habits card as a garden. One plot per habit; tap the plant (or +) to log, − to undo.
    '' until the game state is ready (Today falls back to the rings card). */
export function gardenHabits(hs: HabitTile[], done: number, total: number, daysLeft: number): string {
  const garden = loadedGarden();
  if (!gardenOn() || !hs.length || !garden) return '';
  const g = currentGame();
  if (!g) return '';
  const plotByKey = new Map(g.plots.map((p) => [p.key, p])), pulse = viewState.habitPulse;
  const label = (name: string): string => (garden.LOOK_LABELS[name] ?? '').toLowerCase();
  const firstDay = firstDayOfHabitWeek(), lastDay = lastDayOfHabitWeek();
  const tile = ({ h, st, met, low, last }: HabitTile): string => {
    let anim = '';
    if (pulse && !pulse.used && pulse.id === h.id && pulse.week === st.week) { pulse.used = true; anim = pulse.d > 0 ? ' add' : ' sub'; }
    const pl = plotByKey.get(h.key);
    if (!pl) return '';
    const vis = garden.plotLook(pl);
    const hot = anim && pulse ? (pulse.d > 0 ? st.week - 1 : st.week) : -1, p = habitPips(h, st, hot);
    const nextRarity = pl.showing === 'bloom' && pl.upcoming ? pl.upcoming.rarity : 'common';
    const status = pl.waiting ? `Seed · goes in ${firstDay}`
      : pl.showing === 'withered' ? `Withered · new seed ${firstDay}`
      : pl.showing === 'bloom' ? `In bloom · pressed ${firstDay}${nextRarity !== 'common' ? ` · ${nextRarity} seed next` : ''}`
      : last && pl.alive ? (pl.daily ? `${String(pl.need)} more before bed` : `${String(pl.need)} more today`)
      : pl.daily ? (pl.need > 0 ? `${String(pl.need)} more today${pl.stage ? ' or it withers' : ' to sprout'}` : pl.grows ? `Grows to ${label(pl.next ?? '')} ${firstDay}` : `Today done · every day to ${lastDay}`)
      : vis === 'wilt' ? `Thirsty · ${String(pl.need)} more by ${lastDay}`
      : pl.grows ? (pl.stage >= 4 ? (met ? 'In full bloom' : 'Blooming') : `Grows to ${label(pl.next ?? '')} ${firstDay}`)
      : pl.stage === 0 ? `${plural(pl.need, 'session')} to sprout` : `${String(pl.need)} more to grow`;
    const cls = !pl.alive || vis === 'wilt' ? ' warn' : pl.grows ? ' good' : '';
    const count = h.daily ? st.today : st.week;
    const aria = `Log a ${h.name} session today. ${String(count)} of ${String(h.target)} ${h.daily ? 'today' : 'this week'}. Plant: ${label(vis)}. ${status}.`;
    const risk = pl.alive && !pl.showing && !pl.waiting ? (last ? ' last' : low ? ' low' : '') : '';
    return `<li class="gt${met ? ' met' : ''}${risk}${anim}"><button class="gtp" data-act="log" data-id="${h.id}" aria-label="${escapeHtml(aria)}">${garden.plotSVG(pl, 84)}</button>
      <div class="gtm"><span class="ptt"><span class="ptn">${escapeHtml(h.name)}</span>${flameBadge(st, low)}</span><span class="ptp" aria-hidden="true">${p}</span><span class="gts${cls}">${escapeHtml(status)}</span></div>
      <div class="gstep"><button class="gs-m" data-act="unlog" data-id="${h.id}" aria-label="Remove a ${escapeHtml(h.name)} session from ${h.daily ? 'today' : 'this week'}"${count ? '' : ' disabled'}>${icon('minus', 15)}</button><span class="gs-n num" aria-hidden="true">${String(count)}<small>/${String(h.target)}${h.daily ? ' today' : ''}</small></span><button class="gs-p" data-act="log" data-id="${h.id}" aria-label="Log a ${escapeHtml(h.name)} session today">${icon('plus', 17)}</button></div></li>`;
  };
  const daily = hs.filter((x) => x.h.daily), weekly = hs.filter((x) => !x.h.daily);
  const group = (xs: HabitTile[], title: string, groupIcon: string): string => xs.length ? `${daily.length && weekly.length ? `<p class="gtg">${groupIcon}<span>${title}</span></p>` : ''}<ul class="gtiles">${xs.map(tile).join('')}</ul>` : '';
  const tiles = group(daily, 'Daily', '<svg viewBox="1 1 18 23" aria-hidden="true"><path d="' + PIP_DROP + '" fill="#4f8fb3"/></svg>') + group(weekly, 'Weekly', '<svg viewBox="2 2 16 20" aria-hidden="true"><polygon points="' + PIP_HEX + '" fill="#e9a93a"/></svg>');
  const lowN = hs.filter((x) => x.low).length;
  const msg = g.season.opens ? 'Sessions this week still count for streaks.' : hs.every((x) => x.met) ? 'Perfect week. Every plant is drinking its fill.' : hs.every((x) => x.st.week >= x.h.floor) ? `Every plant grows on ${firstDay}. The rest is bonus.`
    : lowN ? `${plural(lowN, 'plant')} need${lowN === 1 ? 's' : ''} water in the next ${plural(daysLeft, 'day')}.` : `Tap a plant to log a session. Meet the floor and it grows a stage on ${firstDay}.`;
  const season = g.season.opens ? `Garden opens Mon ${garden.formatShortDate(g.season.opens)}` : g.season.label;
  return `<section class="sec z-now habitsec">${sectionHeader('Habits', goLink('History', 'grow/habits'), 2, `${String(done)}/${String(total)}`)}
    <div class="card gcard"><p class="gwh"><span>${escapeHtml(season)}</span>${g.season.opens ? '' : `<span class="muted">ends ${garden.formatShortDate(g.season.ends)}</span>`}</p>${tiles}</div><p class="wmsg">${escapeHtml(lastWeekLine() + msg)}</p></section>`;
}
