// Game rules (SPEC.md): garden plots, habitat growth, visitors, lessons. Days and weeks are plain integers.
export { RULES, type GameRules, type LessonRules, type Rarity, type WeekResult } from './lib/rules.ts';
export { finishPlant, newPlant, newPlot, plantWeek, plotWeek, rarityOf, weekResult, type FinishedPlant, type Plant, type Plot, type Seed } from './lib/garden-plots.ts';
export {
  blight,
  cloudiness,
  dayTide,
  newReef,
  overdueDrop,
  overdueReward,
  phaseThresholds,
  reefDay,
  weekVisitor,
  type DayTide,
  type Diorama,
  type Reef,
  type ReefEvent,
} from './lib/reef.ts';
export { answerLesson, buildDeck, feedingOf, newLesson, rungOf, sourceDone, type Lesson, type LessonAction } from './lib/lessons.ts';
