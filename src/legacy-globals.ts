/* Bridge for the classic scripts not yet migrated (app.js, garden.js, habitat.js): they read the domain
   packages through window.LB (dates, tasks, recurrence, habits), window.LBG (game rules + deriveGame), window.LBS
   (db schemas) and window.LBDB (the db store), by these old names and shapes. Add a name here only when a classic script reads it.
   TODO(#26): delete this file once the ui step moves those scripts into packages and they import directly. */
import {
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  addDays,
  addMonths,
  datePartsOf,
  daysBetween,
  longDate,
  padTwo,
  shortDate,
  weekStartOf,
  weekdayOf,
  ymd,
} from './packages/dates/index.ts';
import { dateOfInstant, minutesOfDay, setTimeZone, timeZone, todayDate } from './packages/dates/clock.ts';
import { describeRule, nextDueDate, shortRuleLabel } from './packages/recurrence/index.ts';
import { bucketTasks, compareByDateThenOrder, firstCommittedDay, missedTaskStatus, ringPercent, ringTally, sortUrgent, taskState, type TaskDates } from './packages/tasks/index.ts';
import { BUY_LIST_TAGS, iconForTitle } from './packages/tasks/icons.ts';
import { habitStats } from './packages/habits/index.ts';
import {
  RULES,
  answerLesson,
  blight,
  buildDeck,
  cloudiness,
  dayTide,
  feedingOf,
  finishPlant,
  newLesson,
  newPlant,
  newPlot,
  newReef,
  overdueDrop,
  overdueReward,
  phaseThresholds,
  plantWeek,
  plotWeek,
  rarityOf,
  reefDay,
  rungOf,
  sourceDone,
  weekResult,
  weekVisitor,
} from './packages/game/index.ts';
import { PLANT_SPECIES, calendarSeason, deriveGame } from './packages/game/derive.ts';
import { LESSON_FORMATS, OPTIONAL_COLLECTIONS, RULE_KINDS, STORE_COLLECTIONS, ruleError, validate } from './packages/db/schema.ts';
import { createStore, type DbAdapter } from './packages/db/index.ts';

export const legacyDomainGlobals = {
  tz: timeZone,
  setTZ: setTimeZone,
  todayStr: (): string => todayDate(),
  localDateOf: dateOfInstant,
  minsOfDay: minutesOfDay,
  addDays,
  diffDays: daysBetween,
  dow: weekdayOf,
  ymd,
  pad: padTwo,
  addMonths,
  weekStartOf,
  dateParts: datePartsOf,
  longDate,
  shortDate,
  MONTHS: MONTH_NAMES,
  MON3: MONTH_SHORT_NAMES,
  WD: WEEKDAY_NAMES,
  WD3: WEEKDAY_SHORT_NAMES,
  taskState: (task: TaskDates, today: string) => {
    const state = taskState(task, today);
    return { eff: state.effective, overdue: state.overdue, slipped: state.slipped };
  },
  byDateThenOrder: compareByDateThenOrder,
  sortUrgent,
  buckets: bucketTasks,
  missedTaskStatus,
  nextDue: nextDueDate,
  describeRule,
  shortRule: shortRuleLabel,
  habitStats,
  TAGS: BUY_LIST_TAGS,
  autoIcon: iconForTitle,
};

export const legacyGameGlobals = {
  RULES,
  ringTally,
  firstCommit: firstCommittedDay,
  ringPct: ringPercent,
  weekResult,
  newPlant,
  plantWeek,
  rarityOf,
  finishPlant,
  newPlot,
  plotWeek,
  dayTide,
  phaseThresholds,
  newReef,
  reefDay,
  weekVisitor,
  overdueDrop,
  overdueReward,
  cloudiness,
  blight,
  newLesson,
  buildDeck,
  answer: answerLesson,
  sourceDone,
  rungOf,
  feedingOf,
  deriveGame,
  calSeason: calendarSeason,
  SPECIES: PLANT_SPECIES,
};

export const legacySchemaGlobals = { validate, ruleError, COLLECTIONS: STORE_COLLECTIONS, OPTIONAL: OPTIONAL_COLLECTIONS, RULE_KINDS, FORMATS: LESSON_FORMATS };

declare global {
  interface Window {
    LB: typeof legacyDomainGlobals;
    LBG: typeof legacyGameGlobals;
    LBS: typeof legacySchemaGlobals;
    LBDB: ReturnType<typeof createStore>;
    /** The claude.ai artifact runtime; absent outside claude.ai unless dist/fake-db.js stands in. */
    claude?: { use(capability: string): Promise<unknown> };
  }
}

export function installLegacyGlobals(target: Window): void {
  target.LB = legacyDomainGlobals;
  target.LBG = legacyGameGlobals;
  target.LBS = legacySchemaGlobals;
  target.LBDB = createStore({
    connect: () => (target.claude?.use ? (target.claude.use('db') as Promise<DbAdapter | null>) : null),
  });
}
