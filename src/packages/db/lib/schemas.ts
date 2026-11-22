/* Document shapes for every db collection. Extra fields are allowed (older docs carry recurrence_series_id,
   icon_key and so on); known fields must have the right type. An optional field may be missing or null. */
// zod/mini: the full zod build bundles every locale (about 790 KB in dist/app.js); mini is about 30 KB.
import * as z from 'zod/mini';

const dateString = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const plainObject = z.record(z.string(), z.unknown()).check(z.refine((v) => !Array.isArray(v)));
const stringOrNumber = z.union([z.string(), z.number()]);

/* Rule numbers accept anything that coerces to an integer in range ("3" as well as 3), as stored rules always have. */
const intIn = (min: number, max: number) =>
  z.custom<number | string>((v: unknown) => v !== '' && v !== null && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max);
const ordinal = z.custom<number | string>((v: unknown) => [1, 2, 3, 4, -1].includes(Number(v)));
const month = intIn(1, 12);
const weekday = intIn(0, 6);

/* Allowed on every rule kind; checked after the kind's own fields. */
const ruleExtras = { every_months: z.nullish(intIn(1, 99)), basis: z.nullish(z.enum(['completion', 'schedule'])) };

export const RULE_SCHEMAS = {
  interval: z.looseObject({ kind: z.literal('interval'), every: intIn(1, 999), unit: z.enum(['day', 'week', 'month', 'year']), ...ruleExtras }),
  monthly_day: z.looseObject({ kind: z.literal('monthly_day'), day: intIn(1, 31), ...ruleExtras }),
  monthly_last_day: z.looseObject({ kind: z.literal('monthly_last_day'), ...ruleExtras }),
  monthly_weekday: z.looseObject({ kind: z.literal('monthly_weekday'), ordinal, weekday, ...ruleExtras }),
  yearly_day: z.looseObject({ kind: z.literal('yearly_day'), month, day: intIn(1, 31), ...ruleExtras }),
  yearly_first_day: z.looseObject({ kind: z.literal('yearly_first_day'), month, ...ruleExtras }),
  yearly_last_day: z.looseObject({ kind: z.literal('yearly_last_day'), month, ...ruleExtras }),
  yearly_weekday: z.looseObject({ kind: z.literal('yearly_weekday'), month, ordinal, weekday, ...ruleExtras }),
};
export type RuleKind = keyof typeof RULE_SCHEMAS;
export const RULE_KINDS = Object.keys(RULE_SCHEMAS) as RuleKind[];
export const recurrenceRuleSchema = z.discriminatedUnion('kind', [
  RULE_SCHEMAS.interval,
  RULE_SCHEMAS.monthly_day,
  RULE_SCHEMAS.monthly_last_day,
  RULE_SCHEMAS.monthly_weekday,
  RULE_SCHEMAS.yearly_day,
  RULE_SCHEMAS.yearly_first_day,
  RULE_SCHEMAS.yearly_last_day,
  RULE_SCHEMAS.yearly_weekday,
]);

export const LESSON_FORMATS = ['tap', 'recall', 'apply'] as const;
const lessonFormat = z.enum(LESSON_FORMATS);
/* One rung per ladder step. A recall rung needs an answer to check against. */
const rung = z
  .looseObject({ format: lessonFormat, prompt: z.string().check(z.minLength(1)), answer: z.optional(z.unknown()), choices: z.nullish(z.array(z.string())) })
  .check(z.refine((r) => r.format !== 'recall' || (typeof r.answer === 'string' && r.answer.length > 0)));

const str = z.nullish(z.string());
const num = z.nullish(z.number());
const bool = z.nullish(z.boolean());
const date = z.nullish(dateString);

export const COLLECTION_SCHEMAS = {
  tasks: z.looseObject({
    title: z.string(), category: str, notes: str, due_date: date, deadline_date: date,
    status: z.enum(['open', 'done']), completed_at: num, recurrence_rule: z.nullish(recurrenceRuleSchema), sort_order: num,
    urgent_sort_order: num, created_at: num, icon_key: str, recurrence_spawned: bool,
    recurrence_series_id: str, recurrence_parent_task_id: str, suggested: bool, project: str,
    committed_days: z.nullish(z.array(dateString)), /* dates the task was committed to (SPEC.md Ring %) */
    committed_at: num, /* when today's commitment landed (commit lock clock) */
  }),
  habits: z.looseObject({
    name: z.string(), key: str, cadence: z.nullish(z.enum(['week', 'day'])), target_per_week: z.number(), streak_floor_per_week: num,
    sort_order: num, notes: str, icon_key: str, hidden: bool, created_at: num,
  }),
  /* `exception` (a late log's reason + evidence) is read by the page, not checked here. */
  habit_sessions: z.looseObject({ habit_id: z.string(), date: dateString, created_at: num }),
  groceries: z.looseObject({ name: z.string(), group_name: str, checked: bool, sort_order: num, created_at: num }),
  recipes: z.looseObject({
    name: z.string(), mood: str, url: str, notes: str, status: z.nullish(z.enum(['planned', 'archived'])), cooked_at: num,
    ingredients: z.nullish(z.array(z.unknown())), time: str, sort_order: num, created_at: num,
  }),
  list_items: z.looseObject({
    list_key: z.string(), title: z.string(), author: str, url: str, notes: str, status: z.nullish(z.enum(['want', 'done'])), sort_order: num, created_at: num,
  }),
  buy_list_items: z.looseObject({
    name: z.string(), tag: z.nullish(z.enum(['need', 'love', 'like', 'one_day'])), price: z.nullish(stringOrNumber), url: str, notes: str,
    status: z.nullish(z.enum(['waiting', 'bought', 'dropped'])), added_date: date, sort_order: num, created_at: num,
  }),
  gift_ideas: z.looseObject({ person: z.string(), idea: str, url: str, status: z.nullish(z.enum(['idea', 'given'])), sort_order: num, created_at: num }),
  goals: z.looseObject({
    title: z.string(), category: str, year: z.number(), status: z.nullish(z.enum(['active', 'completed'])), notes: str, icon_key: str,
    progress_q1: str, progress_q2: str, progress_q3: str, progress_q4: str, sort_order: num, created_at: num,
  }),
  logs: z.looseObject({ kind: z.string(), label: str, value: z.optional(z.unknown()), date: dateString, created_at: num }),
  checks: z.looseObject({ value: z.optional(z.unknown()), updated_at: num, week: date }),
  snapshots: z.looseObject({
    fetched_at: num, weather: z.nullish(plainObject), surf: z.nullish(plainObject), tides: z.nullish(z.array(z.unknown())),
    events: z.nullish(z.array(z.unknown())), quote: z.nullish(plainObject),
  }),
  countdowns: z.looseObject({
    kind: z.string(), title: z.string(), date: dateString, detail: str, when: str, gift: str,
    links: z.nullish(z.array(z.unknown())), match: z.nullish(z.array(z.unknown())),
  }),
  /* the game's start day */
  game_state: z.looseObject({ started: dateString, created_at: num }),
  keepsakes: z.looseObject({ kind: z.enum(['plant', 'reef']), title: str, note: str, updated_at: num }),
  /* lessons (SPEC.md Lessons): written by the lesson-make skill; the deck writes level/due/state and answers */
  sources: z.looseObject({
    title: z.string(), type: z.enum(['book', 'video', 'post', 'article', 'talk', 'podcast', 'course', 'note']), author: str, url: str,
    size: num, salience: num, ladder: z.array(lessonFormat).check(z.minLength(1)),
    intervals: z.nullish(z.array(z.int().check(z.minimum(1), z.maximum(365))).check(z.minLength(1))), summary: str, status: z.nullish(z.enum(['active', 'paused', 'finished'])), created_at: num,
  }),
  lessons: z.looseObject({
    source_id: z.string(), level: z.number(), due: dateString, state: z.enum(['active', 'graduated', 'dropped']),
    rungs: z.array(rung).check(z.minLength(1)), order: num, flagged: bool, created_at: num, updated_at: num,
  }),
  lesson_answers: z.looseObject({
    lesson_id: z.string(), source_id: str, action: z.enum(['advance', 'wrong', 'again', 'drop', 'skip', 'flag']), format: str, text: str,
    date: dateString, created_at: num,
  }),
  /* 'legendary' is the old name for exotic */
  visitors_met: z.looseObject({ creature: z.string(), met_at: z.number(), biome: num, week: date, rarity: z.nullish(z.enum(['common', 'rare', 'exotic', 'legendary'])) }),
};

export type CollectionName = keyof typeof COLLECTION_SCHEMAS;
/** A stored document body, without its id. */
export type CollectionDoc<C extends CollectionName> = z.infer<(typeof COLLECTION_SCHEMAS)[C]>;
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

/* Game and lesson collections the page reads on demand; the store never listens to them. */
export const OPTIONAL_COLLECTIONS = ['visitors_met', 'keepsakes', 'sources', 'lessons', 'lesson_answers'] as const satisfies readonly CollectionName[];
export type StoreCollection = Exclude<CollectionName, (typeof OPTIONAL_COLLECTIONS)[number]>;
export const STORE_COLLECTIONS: readonly StoreCollection[] = [
  'tasks', 'habits', 'habit_sessions', 'groceries', 'recipes', 'list_items', 'buy_list_items', 'gift_ideas', 'goals', 'logs', 'checks', 'snapshots', 'countdowns', 'game_state',
];
