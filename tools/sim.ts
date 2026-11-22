/* Balance simulation: runs the game package against made-up personas for WEEKS weeks over SEEDS seeds and prints averages.
   node tools/sim.ts [seeds] [weeks]      No Claude in the loop: Claude's jobs never change numbers.
   node tools/sim.ts --visitors[=persona[:seed]]   also print one run's week-by-week visitor events as JSON
   (the weekly-visitor skill's --dry-run picks an event from this list).
   Overrides: node tools/sim.ts garden.bloomWeeks=1 lessons.intervals=[3,7,21] */
import {
  RULES,
  answerLesson,
  blight,
  buildDeck,
  cloudiness,
  dayTide,
  newLesson,
  newPlot,
  newReef,
  overdueReward,
  plotWeek,
  reefDay,
  sourceDone,
  weekResult,
  weekVisitor,
  type DayTide,
  type Lesson,
  type LessonAction,
  type Rarity,
} from '../src/packages/game/index.ts';

const cliArgs = process.argv.slice(2);
const visitorsArg = cliArgs.find((arg) => arg.startsWith('--visitors'));
const positional = cliArgs.filter((arg) => !arg.startsWith('--'));
const overrides = positional.filter((arg) => arg.includes('='));
const numbers = positional.filter((arg) => !arg.includes('='));
const SEEDS = Number(numbers[0]) || 200;
const WEEKS = Number(numbers[1]) || 28;

for (const override of overrides) {
  const [path = '', raw = ''] = override.split('=');
  const keys = path.split('.');
  let target = RULES as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1) ?? ''] = JSON.parse(raw) as unknown;
}
if (overrides.length) console.log('overrides:', overrides.join(' '));

type Random = () => number;
function mulberry32(seed: number): Random {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<Key extends string>(random: Random, weights: Partial<Record<Key, number>>): Key {
  let roll = random();
  const entries = Object.entries(weights) as [Key, number][];
  for (const [key, weight] of entries) if ((roll -= weight) < 0) return key;
  return (entries[0] as [Key, number])[0];
}
const poisson = (random: Random, mean: number): number => {
  let count = 0;
  let product = 1;
  const limit = Math.exp(-mean);
  do {
    count++;
    product *= random();
  } while (product > limit);
  return count - 1;
};
const binomial = (random: Random, trials: number, chance: number): number => {
  let hits = 0;
  for (let index = 0; index < trials; index++) if (random() < chance) hits++;
  return hits;
};
const randomInt = (random: Random, low: number, high: number): number => low + Math.floor(random() * (high - low + 1));

type Mood = 'great' | 'good' | 'meh' | 'gap';
type MoodWeights = Partial<Record<Mood, number>>;
interface SimHabit {
  floor: number;
  target: number;
}
interface Persona {
  habits: SimHabit[];
  /** shared mood weights for week `week` */
  mode: (week: number, state: { off: number }, random: Random) => MoodWeights;
  /** tasks a day (poisson mean) */
  tasksPerDay: number;
  /** finish chance by mood */
  finishChance: Record<Mood, number>;
  /** chance a day pulls one overdue task back in */
  pull: number;
  /** chance to open each feeding's deck */
  deck: number;
  /** chance an overdue task is tidied each day */
  tidy: number;
  /** tiny tasks added and done every day (gaming the ring) */
  tiny?: number;
}

const HABITS: SimHabit[] = [{ floor: 2, target: 3 }, { floor: 1, target: 2 }, { floor: 3, target: 5 }, { floor: 1, target: 1 }];
const STEADY_WEIGHTS: MoodWeights = { great: 0.15, good: 0.6, meh: 0.2, gap: 0.05 };

const PERSONAS: Record<string, Persona> = {
  steady: { habits: HABITS, mode: () => STEADY_WEIGHTS, tasksPerDay: 3, finishChance: { great: 0.95, good: 0.88, meh: 0.7, gap: 0.3 }, pull: 0.5, deck: 0.85, tidy: 0.08 },
  bursty: {
    habits: HABITS, tasksPerDay: 3, finishChance: { great: 0.95, good: 0.85, meh: 0.6, gap: 0.2 }, pull: 0.4, deck: 0.75, tidy: 0.05,
    mode: (_week, state, random) => {
      if (state.off > 0) {
        state.off--;
        return { gap: 0.8, meh: 0.2 };
      }
      if (random() < 0.2) {
        state.off = randomInt(random, 0, 1);
        return { gap: 0.8, meh: 0.2 };
      }
      return { great: 0.35, good: 0.45, meh: 0.2 };
    },
  },
  slump: { habits: HABITS, tasksPerDay: 3, finishChance: { great: 0.95, good: 0.88, meh: 0.7, gap: 0.25 }, pull: 0.5, deck: 0.85, tidy: 0.08,
    mode: (week) => (week >= 9 && week <= 11 ? { gap: 0.7, meh: 0.3 } : STEADY_WEIGHTS) },
  over: { habits: HABITS, tasksPerDay: 2.5, finishChance: { great: 0.99, good: 0.97, meh: 0.9, gap: 0.6 }, pull: 0.8, deck: 0.95, tidy: 0.2,
    mode: () => ({ great: 0.7, good: 0.3 }) },
  light: { habits: [{ floor: 1, target: 2 }, { floor: 1, target: 1 }], tasksPerDay: 1.2, finishChance: { great: 0.8, good: 0.65, meh: 0.5, gap: 0.2 }, pull: 0.15, deck: 0.5, tidy: 0.03,
    mode: () => ({ good: 0.5, meh: 0.3, gap: 0.2 }) },
  gamer: { habits: HABITS, tasksPerDay: 3, finishChance: { great: 0.8, good: 0.7, meh: 0.5, gap: 0.3 }, pull: 0.3, deck: 0.8, tidy: 0.05, tiny: 3, mode: () => STEADY_WEIGHTS },
};

function habitCount(random: Random, mood: Mood, habit: SimHabit): number {
  if (mood === 'great') return habit.target + binomial(random, 2, 0.5);
  if (mood === 'good') return randomInt(random, habit.floor, habit.target);
  if (mood === 'meh') return random() < 0.5 ? habit.floor : Math.max(0, habit.floor - 1);
  return binomial(random, habit.floor, 0.2);
}
/* per-habit mood: usually the week's, sometimes a step either way */
const MOOD_ORDER: Mood[] = ['gap', 'meh', 'good', 'great'];
function habitMood(random: Random, weekMood: Mood): Mood {
  const index = MOOD_ORDER.indexOf(weekMood);
  const roll = random();
  if (roll < 0.15) return MOOD_ORDER[Math.max(0, index - 1)] ?? weekMood;
  if (roll < 0.25) return MOOD_ORDER[Math.min(3, index + 1)] ?? weekMood;
  return weekMood;
}

const RANK: Record<Rarity | 'none', number> = { none: 0, common: 1, rare: 2, exotic: 3 };

interface VisitorEvent {
  week: number;
  biome: number;
  rarity: Rarity | null;
  reason: string;
}
interface RunOptions {
  booksPerMonth?: number;
  postsPerMonth?: number;
}

function runOne(persona: Persona, seed: number, options: RunOptions = {}) {
  const random = mulberry32(seed);
  const moodState = { off: 0 };
  const metrics = {
    deaths: 0, blooms: 0, finished: 0, deadPlotWeeks: 0, plotWeeks: 0, rarity: { common: 0, rare: 0, exotic: 0 } as Record<Rarity, number>,
    visitors: [] as VisitorEvent[], biomeDays: [] as number[], rare: 0, rareOverdue: 0, pileEnd: 0, blightDays: 0, pileSum: 0, exotic: 0, bleach: 0, bleachDays: 0, cloudyDays: 0,
    ringSum: 0, ringDays: 0, fullDays: 0, neutral: 0, lessonsShown: 0, backlogEnd: 0, backlogMax: 0, bookDays: [] as number[], booksStarted: 0, booksDone: 0,
  };
  const plots = persona.habits.map(() => newPlot());
  const reef = newReef();
  let pile: { since: number }[] = [];
  const rescheduled: Record<number, number> = {};
  const lessons: Lesson[] = [];
  const sources: { kind: 'book' | 'post'; day: number; done: number | null }[] = [];
  let lessonId = 0;
  const booksPerMonth = options.booksPerMonth ?? 1;
  const postsPerMonth = options.postsPerMonth ?? 2;
  const ingest = (day: number, kind: 'book' | 'post'): void => {
    const count = kind === 'book' ? randomInt(random, 10, 25) : randomInt(random, 3, 5);
    const sourceId = sources.length;
    sources.push({ kind, day, done: null });
    for (let index = 0; index < count; index++) lessons.push(newLesson(lessonId++, sourceId, pick(random, { tap: 0.4, recall: 0.35, apply: 0.25 }), day));
    if (kind === 'book') metrics.booksStarted++;
  };

  for (let week = 0; week < WEEKS; week++) {
    reef.weekDrops = 0;
    let weekDrop: Rarity | null = null;
    const weekWeights = persona.mode(week, moodState, random);
    const weekMood = pick(random, weekWeights);
    const tides: (DayTide | null)[] = [];
    if (week % 4 === 0) for (let book = 0; book < booksPerMonth; book++) ingest(week * 7 + (Math.floor((book * 28) / Math.max(1, booksPerMonth)) % 28), 'book');
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = week * 7 + weekday;
      const dayMood = random() < 0.7 ? weekMood : pick(random, weekWeights);
      const finishChance = persona.finishChance[dayMood];
      /* cleanup: each overdue task may get rescheduled (60%, due again in 2-7 days) or deleted (40%); less on gap days */
      pile = pile.filter(() => {
        if (random() >= persona.tidy * (dayMood === 'gap' ? 0.3 : 1)) return true;
        if (random() < 0.6) {
          const dueAgain = day + randomInt(random, 2, 7);
          rescheduled[dueAgain] = (rescheduled[dueAgain] ?? 0) + 1;
        }
        return false;
      });
      const due = poisson(random, persona.tasksPerDay) + (rescheduled[day] ?? 0);
      let committed = due;
      let done = binomial(random, due, finishChance);
      for (let index = 0; index < due - done; index++) pile.push({ since: day });
      if (pile.length && random() < persona.pull) {
        const pickIndex = randomInt(random, 0, pile.length - 1);
        const pulled = pile[pickIndex] as { since: number };
        committed++;
        if (random() < finishChance) {
          done++;
          pile.splice(pickIndex, 1);
          const drop = overdueReward(reef, day - pulled.since);
          if (drop === 'rare') metrics.rareOverdue++;
          if (drop === 'exotic') metrics.exotic++;
          if (drop && RANK[drop] > RANK[weekDrop ?? 'none']) weekDrop = drop;
        }
      }
      if (persona.tiny) {
        committed += persona.tiny;
        done += persona.tiny;
      }
      const tide = dayTide(committed, done);
      tides.push(tide);
      if (!tide) metrics.neutral++;
      else {
        metrics.ringSum += tide.pct;
        metrics.ringDays++;
        if (tide.full) metrics.fullDays++;
      }
      const events = reefDay(reef, day, tide);
      if (events.includes('bleach')) metrics.bleach++;
      if (reef.bleached) metrics.bleachDays++;
      if (cloudiness(pile.length) >= 0.5) metrics.cloudyDays++;
      if (blight(pile.map((task) => day - task.since)) >= 0.5) metrics.blightDays++;
      metrics.pileSum += pile.length;
      for (let feeding = 0; feeding < RULES.lessons.feedings; feeding++) {
        if (random() >= persona.deck * (dayMood === 'gap' ? 0.4 : 1)) continue;
        for (const lesson of buildDeck(lessons, day)) {
          metrics.lessonsShown++;
          const roll = random();
          let action: LessonAction = 'advance';
          if (roll < 0.02) action = 'drop';
          else if (roll < 0.07) action = 'again';
          else if (lesson.format === 'recall' && roll < 0.27) action = 'wrong';
          answerLesson(lesson, action, day);
          const source = sources[Number(lesson.sourceId)];
          if (source && source.done == null && sourceDone(lessons.filter((other) => other.sourceId === lesson.sourceId))) {
            source.done = day;
            if (source.kind === 'book') {
              metrics.booksDone++;
              metrics.bookDays.push(day - source.day);
            }
          }
        }
      }
      if (day % 14 === 7) for (let post = 0; post < postsPerMonth / 2; post++) ingest(day, 'post');
      const backlog = lessons.filter((lesson) => lesson.state === 'active' && lesson.due <= day).length;
      metrics.backlogMax = Math.max(metrics.backlogMax, backlog);
      metrics.backlogEnd = backlog;
    }
    if (weekVisitor(tides) === 'rare') metrics.rare++;
    /* visitor event for this week: best of tide streak (rare) and overdue drop (rare/exotic); common otherwise; none while bleached.
       ASSUMPTION: a common visitor arrives every non-bleached week. The rules only define rare/exotic triggers. */
    const tideVisitor = weekVisitor(tides);
    const best = [tideVisitor, weekDrop].filter((rarity): rarity is Rarity => rarity !== null).sort((a, b) => RANK[b] - RANK[a])[0];
    metrics.visitors.push({
      week, biome: reef.biome, rarity: reef.bleached ? null : (best ?? 'common'),
      reason: reef.bleached ? 'bleached' : best === weekDrop ? 'overdue task finished' : tideVisitor ? 'full-tide streak' : 'weekly',
    });
    persona.habits.forEach((habit, index) => {
      const result = weekResult(habitCount(random, habitMood(random, weekMood), habit), habit.floor, habit.target);
      const plot = plots[index];
      if (!plot) return;
      const wasAlive = plot.plant.alive;
      const finished = plotWeek(plot, result, week, random);
      if (wasAlive && !plot.plant.alive) metrics.deaths++;
      metrics.plotWeeks++;
      if (!plot.plant.alive) metrics.deadPlotWeeks++;
      if (finished) {
        metrics.finished++;
        if (finished.bloomed) {
          metrics.blooms++;
          metrics.rarity[finished.seed.rarity]++;
        }
      }
    });
  }
  metrics.biomeDays = reef.dioramas.map((diorama) => diorama.days);
  metrics.pileEnd = pile.length;
  return metrics;
}

type RunMetrics = ReturnType<typeof runOne>;

function summarize(name: string, persona: Persona, options?: RunOptions): Record<string, string> {
  const runs = Array.from({ length: SEEDS }, (_, index) => runOne(persona, 1000 + index, options));
  const average = (read: (run: RunMetrics) => number): number => runs.reduce((sum, run) => sum + read(run), 0) / runs.length;
  const months = WEEKS / 4;
  const habitCountTotal = persona.habits.length;
  const laterBiomes = runs.flatMap((run) => run.biomeDays.slice(1)); /* skip the cold-start biome */
  const firstBiome = runs.flatMap((run) => run.biomeDays.slice(0, 1));
  const bookDays = runs.flatMap((run) => run.bookDays);
  const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
  const blooms = average((run) => run.blooms);
  const rarity = [average((run) => run.rarity.common), average((run) => run.rarity.rare), average((run) => run.rarity.exotic)];
  return {
    persona: name,
    'ring%': (100 * average((run) => run.ringSum / Math.max(1, run.ringDays))).toFixed(0),
    'deaths/plot/mo': (average((run) => run.deaths) / months / habitCountTotal).toFixed(2),
    'blooms/plot/mo': (blooms / months / habitCountTotal).toFixed(2),
    'new plants/wk': (average((run) => run.finished) / WEEKS).toFixed(2),
    'dead plot %': (100 * average((run) => run.deadPlotWeeks / run.plotWeeks)).toFixed(0),
    'seed c/r/e %': rarity.map((value) => ((100 * value) / Math.max(1e-9, blooms)).toFixed(0)).join('/'),
    'biome1 wks': (mean(firstBiome) / 7).toFixed(1),
    'biome wks': (mean(laterBiomes) / 7).toFixed(1),
    'rare wk/mo': (average((run) => run.rare) / months).toFixed(2),
    'rare od/mo': (average((run) => run.rareOverdue) / months).toFixed(2),
    'pile end': average((run) => run.pileEnd).toFixed(0),
    'exotic/mo': (average((run) => run.exotic) / months).toFixed(2),
    'visitors c/r/e per mo': (['common', 'rare', 'exotic'] as const).map((kind) => (average((run) => run.visitors.filter((visitor) => visitor.rarity === kind).length) / months).toFixed(1)).join('/'),
    bleach: average((run) => run.bleach).toFixed(2),
    'murk50 %': ((100 * average((run) => run.cloudyDays)) / (WEEKS * 7)).toFixed(0),
    'blight50 %': ((100 * average((run) => run.blightDays)) / (WEEKS * 7)).toFixed(0),
    'pile avg': average((run) => run.pileSum / (WEEKS * 7)).toFixed(1),
    'backlog end': average((run) => run.backlogEnd).toFixed(0),
    'book days': mean(bookDays).toFixed(0),
    'books done %': ((100 * average((run) => run.booksDone)) / Math.max(1e-9, average((run) => run.booksStarted))).toFixed(0),
  };
}

console.log(`\n${String(SEEDS)} seeds x ${String(WEEKS)} weeks, 1 book + 2 posts a month\n`);
console.table(Object.entries(PERSONAS).map(([name, persona]) => summarize(name, persona)));
console.log('\nLesson load (steady persona), books per month:\n');
const steady = PERSONAS['steady'] as Persona;
console.table(
  [1, 2, 4].map((books) => {
    const summary = summarize('steady', steady, { booksPerMonth: books });
    return { 'books/mo': books, 'backlog end': summary['backlog end'], 'book days': summary['book days'], 'books done %': summary['books done %'] };
  }),
);

if (visitorsArg) {
  const [personaName = 'steady', seedText] = (visitorsArg.split('=')[1] ?? 'steady').split(':');
  const persona = PERSONAS[personaName];
  if (!persona) throw new Error(`unknown persona ${personaName}; one of ${Object.keys(PERSONAS).join(', ')}`);
  const seed = Number(seedText) || 1000;
  const run = runOne(persona, seed);
  console.log(`\nVisitor events (${personaName}, seed ${String(seed)}):`);
  console.log(JSON.stringify(run.visitors));
}
