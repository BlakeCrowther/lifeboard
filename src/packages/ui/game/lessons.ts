/* Lessons (SPEC.md Lessons): sources + lessons are written by the lesson-make skill; the deck writes each lesson's
   level/due/state and one lesson_answers doc per action. Listened to only with the Ecosystem on, straight from the db
   (kept out of the store). Today shows a Lessons card above the habitat while lessons are due; answering happens inside
   the card so the scene (creatures feeding) stays in view. */
import { textOf } from '../shared/format.ts';
import { dateOfInstant, timeZone } from '../../dates/clock.ts';
import { validate, type CollectionDoc } from '../../db/schema.ts';
import { RULES, answerLesson, buildDeck, feedingOf, rungOf, type LessonAction, type LessonRules } from '../../game/index.ts';
import { useDb } from '../shared/artifact-runtime.ts';
import { clock } from '../shared/clock.ts';
import { escapeHtml, plural } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { ecosystemOn } from '../shared/prefs.ts';
import { render, scheduleRender } from '../shared/redraw.ts';
import { store } from '../shared/state.ts';
import { toast } from '../shared/toast.ts';
import { lessonAnswered } from './game.ts';

type StoredLesson = CollectionDoc<'lessons'> & { id: string };
type StoredSource = CollectionDoc<'sources'> & { id: string };
type Rung = StoredLesson['rungs'][number];

export const lessonRun = {
  sources: {} as Record<string, StoredSource>,
  lessons: {} as Record<string, StoredLesson>,
  /** bit 1: sources delivered, bit 2: lessons delivered */
  loaded: 0,
  /** the open deck's lesson ids, null when closed */
  deck: null as string[] | null,
  /** the card showing */
  position: 0,
  /** a recall card's answer, shown before moving on */
  feedback: null as { rung: Rung; right: boolean } | null,
  /** cards answered this deck */
  answered: 0,
};
const dayNumber = (date: string): number => Math.round(Date.parse(date + 'T00:00:00Z') / 864e5);
const dateOfDayNumber = (n: number): string => new Date(n * 864e5).toISOString().slice(0, 10);

let listening: Promise<void> | null = null;
function listenLessons(): Promise<void> {
  listening ??= (async () => {
    try {
      const db = await useDb(); if (!db) return;
      (['sources', 'lessons'] as const).forEach((c, k) => db.collection(c).onSnapshot((snap) => {
        const all: Record<string, CollectionDoc<typeof c> & { id: string }> = {};
        for (const d of snap.docs) { const body = d.data(); if (!validate(c, body)) all[d.id] = { id: d.id, ...(body as CollectionDoc<typeof c>) }; }
        if (c === 'sources') lessonRun.sources = all as Record<string, StoredSource>; else lessonRun.lessons = all as Record<string, StoredLesson>;
        lessonRun.loaded |= 1 << k;
        scheduleRender();
      }, () => undefined));
    } catch { /* no db: no lessons */ }
  })();
  return listening;
}

/** RULES.lessons with the board's override (checks/lesson_rules: { feedings, perFeeding, dayStart, dayEnd }; old { deck } = perFeeding) */
function lessonRules(): LessonRules {
  const v = (store.get('checks', 'lesson_rules')?.value ?? {}) as Record<string, unknown>, rules: LessonRules = { ...RULES.lessons };
  if (Number(v['deck']) > 0) rules.perFeeding = Number(v['deck']);
  for (const k of ['feedings', 'perFeeding', 'dayStart', 'dayEnd'] as const) { if (v[k] != null && isFinite(Number(v[k]))) rules[k] = Number(v[k]); }
  return rules;
}
/** Hours since midnight (with minutes as a fraction) at an instant, in the board's zone. */
function hourOf(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone(), hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const part = (type: string): number => Number(parts.find((x) => x.type === type)?.value);
  return part('hour') + part('minute') / 60;
}
const rungNow = (l: StoredLesson): Rung | undefined => l.rungs[rungOf(l.level, l.rungs.length)];

/** Today's deck: due reviews then new lessons (game package buildDeck), from active sources, shuffled the same way all day. */
function todaysDeck(): string[] {
  const live = Object.values(lessonRun.lessons).filter((l) => { const s = lessonRun.sources[l.source_id]; return s && (s.status || 'active') === 'active'; });
  const rules = lessonRules(), feeding = feedingOf(hourOf(Date.now()), rules);
  /* the cap is per feeding: cards answered earlier in this feeding (lesson touched today, same window) use it up */
  const used = live.filter((l) => l.updated_at && dateOfInstant(l.updated_at) === clock.today && feedingOf(hourOf(l.updated_at), rules) === feeding).length;
  const ids = buildDeck(live.map((l) => ({ id: l.id, sourceId: l.source_id, format: '', level: l.level, due: dayNumber(l.due), state: l.state })), dayNumber(clock.today), Math.max(0, rules.perFeeding - used)).map((x) => String(x.id));
  let h = 0;
  for (const c of clock.today) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const key = (id: string): number => { let x = h; for (const c of id) x = ((x ^ c.charCodeAt(0)) * 16777619) >>> 0; return x; };
  return ids.sort((a, b) => key(a) - key(b));
}

export function lessonCard(): string {
  if (!ecosystemOn()) return '';
  void listenLessons();
  if (lessonRun.loaded !== 3) return '';
  const open = !!lessonRun.deck, n = lessonRun.deck ? lessonRun.deck.length - lessonRun.position : todaysDeck().length;
  if (!open && !n) return '';
  const status = `<span class="les-hs">${open ? 'Feeding the habitat below' : `${plural(n, 'card')} ready · each one feeds the habitat`}</span>`;
  const head = open
    ? `<div class="les-h">${icon('book', 18)}<h3 class="les-t">Lessons</h3>${status}<button class="km-x les-x" data-act="les-close" aria-label="Close lessons"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>`
    : `<button class="les-h les-row" data-act="les-open" aria-label="Start lessons: ${plural(n, 'card')} ready">${icon('book', 18)}<span class="les-t">Lessons</span><span class="ct num">${String(n)}</span>${status}<span class="les-go" aria-hidden="true">Start${icon('chevR', 16)}</span></button>`;
  return `<section class="sec z-les" aria-label="Lessons"><div class="card les-in${open ? ' on' : ''}">${head}${open ? lessonBody() : ''}</div></section>`;
}
const normalized = (v: unknown): string => textOf(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** A recall answer matches any of the `|`-separated answers, ignoring case, accents and punctuation. */
export const isRightAnswer = (got: unknown, answer: unknown): boolean => String(answer).split('|').some((a) => normalized(a) === normalized(got));

const currentLesson = (): StoredLesson | undefined => {
  const id = lessonRun.deck?.[lessonRun.position];
  return id ? lessonRun.lessons[id] : undefined;
};
function lessonBody(): string {
  const total = lessonRun.deck?.length ?? 0, l = currentLesson();
  if (lessonRun.position >= total || !l) return `<div class="les-body les-done"><p class="dio-k">Deck done</p><p class="les-p">${lessonRun.answered ? `${plural(lessonRun.answered, 'card')} answered. The fish are fed.` : 'Nothing answered this time.'}</p><div class="les-acts"><button class="btn primary" data-act="les-close">Close</button></div></div>`;
  const source = lessonRun.sources[l.source_id], fb = lessonRun.feedback, r = fb ? fb.rung : rungNow(l);
  if (!r) return '';
  const f = r.format;
  const dots = (lessonRun.deck ?? []).map((_, k) => `<i class="${k < lessonRun.position ? 'on' : k === lessonRun.position ? 'cur' : ''}"></i>`).join('');
  const kicker = `<p class="dio-k">${escapeHtml(source?.title || 'Lesson')} · ${f === 'tap' ? 'Read' : f === 'recall' ? 'Recall' : 'Apply'}</p>`;
  const note = typeof r['note'] === 'string' && r['note'] ? `<p class="les-n">${escapeHtml(r['note'])}</p>` : '';
  let body: string;
  if (fb) body = `<p class="les-p">${escapeHtml(r.prompt)}</p><p class="les-fb ${fb.right ? 'good' : 'bad'}">${fb.right ? 'Right.' : `Not quite. It's <b>${escapeHtml(String(r.answer).split('|')[0])}</b>.`}</p>${note}<div class="les-acts"><button class="btn primary" data-act="les-next">Next</button></div>`;
  else if (f === 'tap') body = `<blockquote class="les-q">${escapeHtml(r.prompt)}</blockquote>${note}<div class="les-acts"><button class="btn primary" data-act="les-act" data-val="advance">Got it</button><button class="btn" data-act="les-act" data-val="again">Again</button></div>`;
  else if (f === 'recall') body = `<p class="les-p">${escapeHtml(r.prompt)}</p>` + (r.choices && r.choices.length
    ? `<div class="les-ch">${r.choices.map((c, k) => `<button class="btn" data-act="les-pick" data-val="${String(k)}">${escapeHtml(c)}</button>`).join('')}</div><div class="les-acts"><button class="btn sm" data-act="les-act" data-val="again">Again</button></div>`
    : `<form class="les-f" data-form="les-recall"><label class="sr" for="lesIn">Your answer</label><input id="lesIn" name="v" autocomplete="off" placeholder="Your answer" enterkeyhint="done"><span class="les-acts"><button class="btn primary" type="submit">Check</button><button class="btn" type="button" data-act="les-act" data-val="again">Again</button></span></form>`);
  else body = `<p class="les-p">${escapeHtml(r.prompt)}</p><form class="les-f" data-form="les-apply"><label class="sr" for="lesIn">Where could you use this?</label><textarea id="lesIn" name="v" rows="3" placeholder="One line: where could you use this today?"></textarea><span class="les-acts"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-act="les-act" data-val="again">Again</button></span></form>`;
  const more = fb ? '' : `<details class="les-more"><summary>More</summary><button class="link" data-act="les-act" data-val="skip">Skip today</button><button class="link" data-act="les-act" data-val="flag">${l.flagged ? 'Flagged' : 'Flag as unclear'}</button><button class="link" data-act="les-act" data-val="drop">Drop it</button></details>`;
  return `<div class="les-body"><div class="les-dots" aria-label="Card ${String(lessonRun.position + 1)} of ${String(total)}">${dots}</div>${kicker}${body}${more}</div>`;
}

export function focusLessonInput(): void { document.getElementById('lesIn')?.focus(); }
export function openLessons(): void { lessonRun.deck = todaysDeck(); lessonRun.position = 0; lessonRun.feedback = null; lessonRun.answered = 0; render(); focusLessonInput(); }
export function closeLessons(): void { lessonRun.deck = null; lessonRun.feedback = null; render(); }
export function nextLesson(): void { lessonRun.position++; lessonRun.feedback = null; render(); focusLessonInput(); }
/** A choice on a recall card. */
export function pickLessonChoice(index: number): void {
  const l = currentLesson(), r = l && rungNow(l);
  if (r) void answerCurrentLesson(isRightAnswer(r.choices?.[index], r.answer) ? 'advance' : 'wrong');
}
/** A typed recall answer. */
export function checkLessonAnswer(text: string): void {
  const l = currentLesson(), r = l && rungNow(l);
  if (text && r) void answerCurrentLesson(isRightAnswer(text, r.answer) ? 'advance' : 'wrong', text);
}

/** One action on the current card: the game package's answerLesson() moves level/due/state; writes the lesson and a lesson_answers doc. */
export async function answerCurrentLesson(action: LessonAction | 'flag', text?: string): Promise<void> {
  const id = lessonRun.deck?.[lessonRun.position], l = id ? lessonRun.lessons[id] : undefined;
  if (!id || !l) return;
  const r = rungNow(l);
  const { id: _id, ...stored } = l;
  const body: CollectionDoc<'lessons'> = stored;
  if (action === 'flag') body.flagged = true;
  else {
    const source = lessonRun.sources[l.source_id];
    const next = answerLesson({ id, sourceId: l.source_id, format: r?.format ?? '', level: l.level, due: dayNumber(l.due), state: l.state }, action, dayNumber(clock.today), source?.intervals ?? undefined);
    Object.assign(body, { level: next.level, due: dateOfDayNumber(next.due), state: next.state });
  }
  body.updated_at = Date.now();
  lessonRun.lessons[id] = { id, ...body };
  const answer: CollectionDoc<'lesson_answers'> = { lesson_id: id, source_id: l.source_id, action, format: r?.format, date: clock.today, created_at: Date.now() };
  if (text) answer.text = text;
  if (action === 'advance' || action === 'wrong' || action === 'again') { lessonRun.answered++; lessonAnswered(); }
  if (action === 'advance' && body.state === 'graduated') toast('Lesson graduated');
  if (r?.format === 'recall' && (action === 'advance' || action === 'wrong')) lessonRun.feedback = { rung: r, right: action === 'advance' };
  else if (action !== 'flag') { lessonRun.position++; lessonRun.feedback = null; }
  render();
  focusLessonInput();
  try {
    const why = validate('lessons', body) || validate('lesson_answers', answer);
    if (why) throw new Error(why);
    const db = await useDb();
    if (!db) throw new Error('no db');
    await db.collection('lessons').doc(id).set(body);
    await db.collection('lesson_answers').doc().set(answer);
  } catch (e) { console.warn('[lessons] save failed', e); toast('Could not save that lesson'); }
}
