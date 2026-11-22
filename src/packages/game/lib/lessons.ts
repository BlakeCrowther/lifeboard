/* Lessons: spaced review decks fed to the habitat's creatures. Days are plain integers. SPEC.md "Lessons". */
import { RULES, type LessonRules } from './rules.ts';

export interface Lesson {
  id: string | number;
  sourceId: string | number;
  format: string;
  /** rungs climbed so far; 0 = new */
  level: number;
  due: number;
  state: 'active' | 'dropped' | 'graduated';
}

export type LessonAction = 'advance' | 'wrong' | 'again' | 'drop' | 'skip';

export const newLesson = (id: string | number, sourceId: string | number, format: string, day: number): Lesson => ({ id, sourceId, format, level: 0, due: day, state: 'active' });

/** Due reviews first (oldest due first), then new lessons; at most `size`. */
export function buildDeck(lessons: Lesson[], day: number, size: number = RULES.lessons.perFeeding): Lesson[] {
  const due = lessons.filter((lesson) => lesson.state === 'active' && lesson.due <= day);
  const reviews = due.filter((lesson) => lesson.level > 0).sort((a, b) => a.due - b.due);
  const fresh = due.filter((lesson) => lesson.level === 0);
  return reviews.concat(fresh).slice(0, size);
}

/** Which feeding an hour (0-23, may be fractional) falls in; before dayStart is the first, after dayEnd the last.
    rules: RULES.lessons with any per-board override merged in. */
export function feedingOf(hour: number, rules: Pick<LessonRules, 'feedings' | 'dayStart' | 'dayEnd'> = RULES.lessons): number {
  const feedings = Math.max(1, rules.feedings | 0);
  const span = (rules.dayEnd - rules.dayStart) / feedings;
  return Math.min(feedings - 1, Math.max(0, Math.floor((hour - rules.dayStart) / span)));
}

/** Applies an answer (mutates and returns the lesson). Graduates after the last interval.
    intervals: the source's own (sources.intervals) when it sets them. */
export function answerLesson(lesson: Lesson, action: LessonAction, day: number, intervals: number[] = RULES.lessons.intervals): Lesson {
  const intervalAt = (level: number): number => intervals[level] ?? intervals[intervals.length - 1] ?? 1;
  if (action === 'drop') lesson.state = 'dropped';
  else if (action === 'skip') lesson.due = day + 1;
  else if (action === 'again') lesson.due = day + intervalAt(Math.max(0, lesson.level - 1));
  else if (action === 'wrong') {
    lesson.level = Math.max(0, lesson.level - 1);
    lesson.due = day + (lesson.level ? intervalAt(lesson.level - 1) : 1);
  } else if (lesson.level >= intervals.length) lesson.state = 'graduated';
  else {
    lesson.level++;
    lesson.due = day + intervalAt(lesson.level - 1);
  }
  return lesson;
}

export const sourceDone = (lessons: Lesson[]): boolean => lessons.every((lesson) => lesson.state !== 'active');

/** The rung of the source's ladder a lesson is on: its level, capped at the last rung. */
export const rungOf = (level: number | null | undefined, rungs: number): number => Math.min(level ?? 0, rungs - 1);
