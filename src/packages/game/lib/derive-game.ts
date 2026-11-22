/* Game state derived from db history on every load (SPEC.md "Derived, not stored"). Pure: the page and node share it.
   Choices where the rules leave the mapping open:
   - Tide day = the Today ring: dayTide(committed, done) from ringTally. A day with nothing committed is neutral (null).
     Days run from the first task/session date (max 365 back) to today.
   - Overdue = open tasks whose effective date < today; cloudiness counts them. Blight uses each open task's age since it
     was first committed (rescheduling doesn't reset it); tasks without committed days use their current date.
   - Visitor this week = the better of weekVisitor(week start..today tides) and an aged-task drop this week, else 'common';
     none while bleached.
   - Garden: weeks run from the garden start; each habit's plot runs plotWeek on finished weeks only (the current week is
     still open). "Thirsty" = this week below floor with <= need+2 days left (the habit rings' rule).
   - plotWeek's random rolls are seeded from the habit key, so reloads agree. */
import { firstCommittedDay, ringTally } from '../../tasks/index.ts';
import { RULES, type Rarity } from './rules.ts';
import { newPlot, plotWeek, rarityOf, weekResult, type Plant, type Seed } from './garden-plots.ts';
import { blight, cloudiness, dayTide, newReef, overdueReward, reefDay, weekVisitor, type DayTide, type Diorama, type ReefEvent } from './reef.ts';

type DateString = string;

export interface GameTask {
  /** due-or-deadline date */
  eff?: DateString | null;
  done: boolean;
  doneDate?: DateString | null;
  /** committed days */
  days?: DateString[] | undefined;
}

export interface GameHabit {
  key: string;
  name: string;
  floor: number;
  target: number;
  /** floor/target are per day */
  daily?: boolean;
  /** created date */
  since?: DateString | null;
}

export interface PlantPool {
  n?: number;
  byBiome?: Record<string, string[]>;
  /** roster plants: plot = habit key, gen = which plant of that plot */
  plants?: Record<string, { added?: string; plot?: string | null; gen?: number | null }>;
}

export interface GameInput {
  today: DateString;
  tasks: GameTask[];
  habits?: GameHabit[];
  sessions?: { h: string; date: DateString }[];
  /** the game begins this day at 0; earlier history is ignored */
  start?: DateString | null;
  /** 0 Sunday .. 6 Saturday; default 1 Monday */
  weekStart?: number;
  breakSkips?: DateString[];
  /** may arrive as a string from checks/break_rules */
  skipCost?: number | string;
  lessonDates?: (DateString | null | undefined)[];
  plantPool?: PlantPool | null;
}

export interface CalendarSeason {
  name: string;
  label: string;
  from: DateString;
  ends: DateString;
}

const MS_PER_DAY = 864e5;
/** day number (days since 1970-01-01) of a date */
const dayNumber = (date: DateString): number => Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / MS_PER_DAY);
const dateOfDayNumber = (day: number): DateString => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** One SVG species per habit, spread by key hash with no repeats until all are used. */
export const PLANT_SPECIES = ['daisy', 'tulip', 'sunflower', 'mushroom', 'cactus', 'fern', 'bonsai', 'lavender'] as const;
const hashOf = (text: string): number => {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash;
};

/** Lessons: creatures hide after RULES.lessons.hideAfter days with no lesson. Dormant until the first lesson. */
function lessonState(dates: GameInput['lessonDates'], today: number): { daysSince: number | null; hide: boolean } {
  const last = (dates ?? []).filter((date): date is string => !!date).map(dayNumber).filter((day) => day <= today).reduce((a, b) => Math.max(a, b), -Infinity);
  if (!isFinite(last)) return { daysSince: null, hide: false };
  const daysSince = today - last;
  return { daysSince, hide: daysSince >= (RULES.lessons.hideAfter || 3) };
}

const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;

/** The real season a date falls in (meteorological: Mar-May spring, Jun-Aug summer, Sep-Nov fall, Dec-Feb winter; flipped south). */
export function calendarSeason(date: DateString, hemisphere: 'north' | 'south'): CalendarSeason {
  const [year = 0, month = 1] = date.split('-').map(Number);
  const quarter = Math.floor((month % 12) / 3);
  const name = SEASONS[hemisphere === 'south' ? (quarter + 2) % 4 : quarter] ?? 'winter';
  const startMonth = quarter === 0 ? 12 : quarter * 3;
  const startYear = quarter === 0 && month === 12 ? year : quarter === 0 ? year - 1 : year;
  const from = `${String(startYear)}-${String(startMonth).padStart(2, '0')}-01`;
  const endMonth = startMonth + 3 > 12 ? startMonth - 9 : startMonth + 3;
  const endYear = startMonth + 3 > 12 ? startYear + 1 : startYear;
  const ends = dateOfDayNumber(dayNumber(`${String(endYear)}-${String(endMonth).padStart(2, '0')}-01`) - 1);
  const label = name.charAt(0).toUpperCase() + name.slice(1) + ' ' + (quarter === 0 ? `${String(startYear)}–${String(endYear).slice(2)}` : String(startYear));
  return { name, label, from, ends };
}

export interface PressedPlant {
  id: string;
  kind: 'plant';
  key: string;
  name: string;
  gen: number;
  species: string;
  hi: number;
  from: DateString;
  to: DateString;
  season: string;
  biome: number;
  seed: Seed;
  stage: number;
  stageName: string;
  bloomed: boolean;
  died: boolean;
  score: number;
  sessions: number;
  earned: Required<Seed>;
}

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, exotic: 2 };

// The returned shape is read by garden.js, habitat.js and the ui package as plain data; its field names are that contract.
export function deriveGame(input: GameInput) {
  const weekStart = Number.isInteger(input.weekStart) && (input.weekStart ?? -1) >= 0 && (input.weekStart ?? 7) <= 6 ? (input.weekStart as number) : 1;
  const weekStartDay = (day: number): number => day - ((new Date(day * MS_PER_DAY).getUTCDay() - weekStart + 7) % 7);
  const today = dayNumber(input.today);
  const tally = ringTally(input.tasks.map((task) => ({ eff: task.eff ?? null, doneDate: task.done && task.doneDate ? task.doneDate : null, days: task.days })));
  const start = input.start ? dayNumber(input.start) : null;
  const notBeforeStart = (day: number): number => (start != null ? Math.max(day, start) : day);
  const tasks = input.tasks
    .filter((task) => start == null || !(task.done && task.doneDate && dayNumber(task.doneDate) < start))
    .map((task) => (task.eff && start != null && !task.done && dayNumber(task.eff) < start ? { ...task, eff: dateOfDayNumber(start) } : task));
  const habits = input.habits ?? [];
  const sessions = (input.sessions ?? []).filter((session) => session.date && session.date <= input.today && (start == null || dayNumber(session.date) >= start));

  /* ---- reef ---- */
  let first = today;
  for (const task of tasks) {
    if (task.done && task.doneDate) first = Math.min(first, dayNumber(task.doneDate));
    if (task.eff) {
      const due = dayNumber(task.eff);
      if (due <= today) first = Math.min(first, due);
    }
  }
  for (const session of sessions) first = Math.min(first, dayNumber(session.date));
  first = Math.max(notBeforeStart(first), today - 365);
  /* skipped breaks cost growth on their day */
  const skipCost = input.skipCost != null ? Number(input.skipCost) : RULES.breaks.skipCost;
  const skipsOn: Record<number, number> = {};
  for (const skip of input.breakSkips ?? []) {
    if (skip && (start == null || dayNumber(skip) >= start)) {
      const day = dayNumber(skip);
      skipsOn[day] = (skipsOn[day] ?? 0) + 1;
    }
  }
  let lost = 0;
  const reef = newReef();
  const events: { date: DateString; ev: ReefEvent[] }[] = [];
  const tides: (DayTide | null)[] = [];
  const biomeAt: Record<number, number> = {};
  for (let day = first; day <= today; day++) {
    const ring = tally[dateOfDayNumber(day)];
    const tide = ring?.committed ? dayTide(ring.committed, ring.done) : null;
    tides.push(tide);
    const dayEvents = reefDay(reef, day - first, tide);
    const skips = skipsOn[day] ?? 0;
    if (skips && skipCost > 0) {
      const phaseFloor = reef.phase ? (reef.th[reef.phase - 1] ?? 0) : 0;
      const before = reef.pts;
      reef.pts = Math.max(phaseFloor, reef.pts - skips * skipCost);
      if (day === today) lost += before - reef.pts;
    }
    if (dayEvents.length) events.push({ date: dateOfDayNumber(day), ev: dayEvents });
    biomeAt[day] = reef.biome;
  }
  const thisWeek = weekStartDay(today);
  const weekTides = tides.slice(Math.max(0, tides.length - (today - thisWeek + 1)));
  const overdueAges = tasks.filter((task) => !task.done && task.eff && dayNumber(task.eff) < today).map((task) => today - dayNumber(task.eff as string));
  /* age = days since first committed, counted from the game start at the earliest */
  const ageAt = (task: GameTask, day: number): number => {
    const firstCommitted = firstCommittedDay({ eff: task.eff ?? null, days: task.days });
    return firstCommitted && dayNumber(firstCommitted) < day ? day - notBeforeStart(dayNumber(firstCommitted)) : 0;
  };
  const neglectAges = tasks.filter((task) => !task.done).map((task) => ageAt(task, today)).filter((age) => age > 0);
  /* finishing a long-pushed task brings a rare/exotic visitor (capped per week, exotic per biome) */
  const biomeStart = first + reef.startDay;
  const drops = { weekDrops: 0, exotics: 0 };
  let dropWeek: number | null = null;
  let weekDrop: Rarity | null = null;
  const finishedInBiome = tasks
    .filter((task) => task.done && task.doneDate && dayNumber(task.doneDate) >= biomeStart)
    .sort((a, b) => ((a.doneDate ?? '') < (b.doneDate ?? '') ? -1 : 1));
  for (const task of finishedInBiome) {
    const day = dayNumber(task.doneDate as string);
    const week = weekStartDay(day);
    if (week !== dropWeek) {
      dropWeek = week;
      drops.weekDrops = 0;
    }
    const got = overdueReward(drops, ageAt(task, day));
    if (got && week === thisWeek) weekDrop = got;
  }
  const tideVisitor = weekVisitor(weekTides);
  const visitor: Rarity | null = weekDrop && RARITY_RANK[weekDrop] > RARITY_RANK[tideVisitor ?? 'common'] ? weekDrop : tideVisitor;
  const todayTide = tides[tides.length - 1] ?? null;

  /* ---- garden ---- */
  /* with a start date the garden opens the first week start on/after it; until then every plot is a seed.
     A habit added later gets its plot in the week it was created. */
  const gardenStart = start == null ? null : weekStartDay(start) === start ? start : weekStartDay(start) + 7;
  const waiting = gardenStart != null && today < gardenStart;
  const gardenSessions = gardenStart == null ? sessions : sessions.filter((session) => dayNumber(session.date) >= gardenStart);
  const firstWeek = gardenStart ?? (gardenSessions.length ? weekStartDay(Math.min(...gardenSessions.map((session) => dayNumber(session.date)))) : thisWeek);
  const weeksDone = waiting ? 0 : Math.max(0, Math.round((thisWeek - firstWeek) / 7));
  const daysLeft = 7 - (today - thisWeek);
  const meta = input.plantPool?.plants ?? {};
  const biomeOn = (day: number): number => biomeAt[day] ?? (day < first ? 0 : reef.biome);
  const hemisphere = RULES.garden.hemisphere;
  const stages = RULES.garden.stages;
  /* a plant's species: the roster plant made for it (plot + gen), else the plot's SVG species */
  const speciesCount = PLANT_SPECIES.length;
  const used = new Set<string>();
  const speciesOf: Record<string, string> = {};
  for (const habit of habits) {
    if (used.size >= speciesCount) used.clear();
    let index = ((hashOf(habit.key) % speciesCount) + speciesCount) % speciesCount;
    while (used.has(PLANT_SPECIES[index] ?? '')) index = (index + 1) % speciesCount;
    const species = PLANT_SPECIES[index] ?? 'daisy';
    used.add(species);
    speciesOf[habit.key] = species;
  }
  const madeFor: Record<string, string> = {};
  for (const id of Object.keys(meta).sort()) {
    const plant = meta[id];
    if (plant?.plot != null && plant.gen != null) madeFor[`${plant.plot}#${String(plant.gen)}`] = id;
  }
  const speciesFor = (key: string, gen: number): string => madeFor[`${key}#${String(gen)}`] ?? speciesOf[key] ?? 'daisy';
  const history: PressedPlant[] = [];
  const plots = habits.map((habit, habitIndex) => {
    const perWeek: Record<number, number> = {};
    const perDay: Record<number, number> = {};
    for (const session of gardenSessions) {
      if (session.h !== habit.key) continue;
      const day = dayNumber(session.date);
      const week = weekStartDay(day);
      perWeek[week] = (perWeek[week] ?? 0) + 1;
      perDay[day] = (perDay[day] ?? 0) + 1;
    }
    /* daily habits: a day below the floor kills the plant that week; otherwise the week is scored on its total vs 7x floor/target */
    /* days before the habit existed never count as misses (it can be planted mid-week) */
    const born = habit.since ? dayNumber(habit.since) : -Infinity;
    const missedIn = (week: number, upto: number): boolean => {
      for (let day = Math.max(week, born); day < Math.min(week + 7, upto); day++) if ((perDay[day] ?? 0) < habit.floor) return true;
      return false;
    };
    const daysIn = (week: number): number => week + 7 - Math.max(week, born);
    const resultOf = (week: number) =>
      habit.daily
        ? missedIn(week, week + 7)
          ? 'died'
          : weekResult(perWeek[week] ?? 0, daysIn(week) * habit.floor, daysIn(week) * habit.target)
        : weekResult(perWeek[week] ?? 0, habit.floor, habit.target);
    const random = seededRandom(hashOf(habit.key));
    /* planted in the week it was created: that partial week is scored against the full floor; a miss leaves the seed waiting */
    const since = habit.since ? Math.max(firstWeek, weekStartDay(dayNumber(habit.since))) : firstWeek;
    const plot = newPlot();
    let sown = since;
    let sessionsSinceSown = 0;
    for (let week = since; week < thisWeek && !waiting; week += 7) {
      const grewFrom = plot.plant.seed;
      sessionsSinceSown += perWeek[week] ?? 0;
      const result = resultOf(week);
      const finished = plotWeek(plot, result, (week - firstWeek) / 7, random, habit.daily && result === 'died' ? { rest: 0 } : undefined);
      if (finished) {
        const gen = plot.gen - 1;
        history.push({
          id: `plant-${habit.key}-g${String(gen)}`, kind: 'plant', key: habit.key, name: habit.name, gen, species: speciesFor(habit.key, gen), hi: habitIndex,
          from: dateOfDayNumber(sown), to: dateOfDayNumber(week + 6), season: calendarSeason(dateOfDayNumber(sown), hemisphere).name, biome: biomeOn(sown),
          seed: grewFrom, stage: finished.died ? 0 : 4, stageName: finished.died ? 'seed' : 'bloom', bloomed: finished.bloomed, died: finished.died, score: finished.score, sessions: sessionsSinceSown, earned: finished.seed,
        });
        sown = week + 7;
        sessionsSinceSown = 0;
      }
    }
    const plant: Plant = plot.plant;
    const week = perWeek[thisWeek] ?? 0;
    const todayCount = perDay[today] ?? 0;
    /* a daily habit that missed a day earlier this week: its growing plant is dead now; the next seed goes in when the week starts */
    const doomed = !waiting && !!habit.daily && plot.rest < 0 && plant.alive && plant.stage > 0 && missedIn(thisWeek, today);
    const need = habit.daily ? Math.max(1, habit.floor) - todayCount : Math.max(1, habit.floor) - week;
    const showing = doomed ? 'withered' : plot.rest > 0 ? (plant.alive ? 'bloom' : 'withered') : null;
    return {
      key: habit.key, name: habit.name, gen: plot.gen, species: speciesFor(habit.key, plot.gen), made: !!madeFor[`${habit.key}#${String(plot.gen)}`], sown: dateOfDayNumber(sown), biome: biomeOn(sown),
      upcoming: showing ? { gen: plot.gen + 1, made: !!madeFor[`${habit.key}#${String(plot.gen + 1)}`], rarity: plant.alive && !doomed ? rarityOf(plant.score) : 'common', compost: !plant.alive || doomed } : null,
      stage: plant.stage, stageName: stages[plant.stage], alive: plant.alive && !doomed, daily: !!habit.daily, today: todayCount, wilted: !!plant.wilted, showing, rarity: plant.seed.rarity, mutated: !!plant.seed.mutated,
      thirsty: !waiting && !showing && plant.alive && plant.stage > 0 && need > 0 && (!!habit.daily || daysLeft <= need + 2), week, floor: habit.floor, target: habit.target, seed: plant.seed, plant,
      /* this week's floor met: the plant grows a stage when the week closes */
      grows: !waiting && !showing && plant.alive && need <= 0 && !(habit.daily && today - thisWeek < 6), next: stages[Math.min(4, plant.stage + 1)], need: Math.max(0, need), waiting,
    };
  });
  history.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  const gardenStats = {
    blooms: history.filter((plant) => plant.bloomed).length, withered: history.filter((plant) => plant.died).length,
    rare: history.filter((plant) => plant.earned.rarity === 'rare').length, exotic: history.filter((plant) => plant.earned.rarity === 'exotic').length,
    mutated: history.filter((plant) => plant.earned.mutated).length, sessions: gardenSessions.length, weeks: weeksDone,
  };
  const season = calendarSeason(input.today, hemisphere);
  return {
    day: today - first, today: input.today,
    reef: {
      biome: reef.biome, phase: reef.phase, phases: RULES.tide.phases, pts: reef.pts, next: reef.th[reef.phase] ?? null, prev: reef.phase ? (reef.th[reef.phase - 1] ?? 0) : 0, bleached: reef.bleached, from: dateOfDayNumber(first + reef.startDay),
      dioramas: reef.dioramas.map((diorama: Diorama) => ({ ...diorama, from: dateOfDayNumber(first + diorama.start), to: dateOfDayNumber(first + diorama.end) })),
    },
    todayTide, weekTides, events,
    lessons: lessonState(input.lessonDates, today),
    breaks: { skipsToday: skipsOn[today] ?? 0, skipCost, lost: Math.round(lost), sad: (skipsOn[today] ?? 0) > 0 },
    overdue: overdueAges.length, cloudiness: cloudiness(overdueAges.length), blight: blight(neglectAges), agedDrop: weekDrop,
    visitor: reef.bleached ? null : (visitor ?? 'common'), visitorWeek: dateOfDayNumber(thisWeek),
    season: { ...season, biome: reef.biome, opens: waiting ? dateOfDayNumber(gardenStart) : null },
    start: start != null ? dateOfDayNumber(start) : null,
    plots, history, gardenStats,
  };
}

export type GameState = ReturnType<typeof deriveGame>;
