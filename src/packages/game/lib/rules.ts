/* Every tunable game number. SPEC.md names each leaf as `section.key = value`; tools/spec-check.ts holds them equal.
   Mutable on purpose: the balance sim (tools/sim.ts) overrides entries from its command line. */

export type Rarity = 'common' | 'rare' | 'exotic';
export type WeekResult = 'died' | 'floor' | 'target' | 'above';

export const RULES = {
  /* one plant at a time per plot (habit): it blooms or dies, shows that for bloomWeeks / restWeeks, is pressed, and a new seed goes in.
     seasons are the real calendar seasons (meteorological, by hemisphere): flavour and reviews only, they don't end plants.
     points: what each growing week adds to the plant's score; rarity: score needed for the next seed. */
  garden: {
    stages: ['seed', 'sprout', 'leafy', 'bud', 'bloom'],
    bloomWeeks: 1,
    restWeeks: 1,
    points: { floor: 1, target: 2, above: 3 },
    rarity: { rare: 6, exotic: 10 },
    mutation: 0.05,
    wilt: false,
    hemisphere: 'north' as 'north' | 'south',
  },
  tide: { perPct: 10, fullBonus: 5, phases: 5, targetWeeks: 4.5, defaultDaily: 9, trailingDays: 28, cloudyAt: 10, blightAfter: 4, blightAt: 10 },
  visitor: { fullDaysForRare: 6, rareOverdue: 7, exoticOverdue: 30, overdueDropsPerWeek: 1 as number | null, exoticPerBiome: 1 },
  bleach: { days: 14, below: 0.25, recoverDays: 7, recoverAt: 0.5 },
  /* feedings: decks a day, perFeeding cards each; the waking day dayStart..dayEnd (hours) splits evenly between them.
     hideAfter: days without a lesson before creatures hide */
  lessons: { intervals: [3, 7, 21], feedings: 2, perFeeding: 5, dayStart: 6, dayEnd: 22, hideAfter: 3 },
  /* break overlay: each skipped break costs this much growth (never below the current phase) */
  breaks: { skipCost: 5 },
};

export type GameRules = typeof RULES;
export type LessonRules = GameRules['lessons'];
