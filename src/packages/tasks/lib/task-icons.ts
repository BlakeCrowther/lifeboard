/* A task's icon picked from its title: the first matching keyword rule, else a stable fallback from the title's hash.
   Pet names come from the board's profile (checks/profile pets), never from code. */

/** A pet from the profile: a title naming it gets its icon. */
export interface Pet {
  readonly name: string;
  readonly icon: string;
}
/* Made-up pets, used only when the caller passes none. */
const EXAMPLE_PETS: readonly Pet[] = [{ name: 'Biscuit', icon: 'dog' }, { name: 'Pickle', icon: 'cat' }];

const EARLY_RULES: readonly (readonly [RegExp, string])[] = [
  [/water|plant|garden/, 'plant'], [/dentist|teeth|floss/, 'tooth'], [/doctor|appoint|dr\.? |therap|physio|checkup|check-up|derm|eye exam/, 'medical'],
  [/massage|stretch|yoga|mobility/, 'lotus'], [/pill|meds|medication|vitamin|flea|prescription/, 'pill'], [/call|phone|text /, 'phone'],
  [/email|mail|letter|thank.?you|card/, 'mail'], [/car\b|oil change|smog|registration|dmv|tire/, 'car'], [/clean|vacuum|sweep|mop|tidy|declutter/, 'broom'],
  [/laundry|wash|bath|shower/, 'droplet'], [/gym|workout|lift/, 'dumbbell'], [/trip|flight|travel|hotel|airport|pack/, 'plane'],
  [/birthday|cake|party/, 'cake'], [/wedding|ring|registry|elope/, 'rings'], [/music|song|playlist|league|drum/, 'music'],
  [/climb|boulder|hike|el cap/, 'mountain'],
];
/* After the pet names, so a pet's own icon wins over these. */
const LATER_RULES: readonly (readonly [RegExp, string])[] = [
  [/dog|vet|leash/, 'dog'], [/\bcat\b|litter/, 'cat'],
  [/fix|repair|install|assemble|replace/, 'wrench'], [/bill|pay|rent|tax|invoice|spending|budget|refund|insurance/, 'receipt'],
  [/gift|present/, 'gift'], [/grocer|shop|buy|order|return/, 'bag'], [/book|read/, 'books'], [/cook|recipe|meal|dinner|lunch/, 'pot'],
  [/\brun\b|running|jog/, 'shoe'], [/surf/, 'surf'], [/trash|recycl|garbage|compost/, 'trash'], [/key|lock/, 'key'],
  [/goal|retro|quarter|review|plan/, 'chart'], [/computer|laptop|backup|update|password|app\b/, 'laptop'], [/hair|barber/, 'scissors'],
  [/meditat/, 'lotus'], [/journal|write|draft/, 'journal'], [/spanish/, 'hola'], [/beach|ocean/, 'wave'], [/movie|film/, 'film'],
  [/coffee|tea|drink/, 'cup'], [/friend|hang|dinner with|catch up|date/, 'social'], [/home|house|apartment|lease/, 'house'],
];
const FALLBACK_ICONS = ['spark', 'star', 'diamond', 'flag', 'dot', 'check'] as const;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function iconForTitle(title: string | null | undefined, pets: readonly Pet[] = EXAMPLE_PETS): string {
  const padded = ' ' + (title ?? '').toLowerCase() + ' ';
  for (const [pattern, icon] of EARLY_RULES) if (pattern.test(padded)) return icon;
  for (const pet of pets) if (pet.name.trim() && new RegExp(`\\b${escapeRegExp(pet.name.trim().toLowerCase())}\\b`).test(padded)) return pet.icon;
  for (const [pattern, icon] of LATER_RULES) if (pattern.test(padded)) return icon;
  let hash = 0;
  for (const char of padded) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return FALLBACK_ICONS[Math.abs(hash) % FALLBACK_ICONS.length] ?? 'spark';
}

/** Buy list tags (buy_list_items.tag): how many days an item waits before it's ready to buy (null = no timer). */
export const BUY_LIST_TAGS = {
  need: { label: 'Need', days: 0 },
  love: { label: 'Love', days: 7 },
  like: { label: 'Like', days: 30 },
  one_day: { label: 'One day', days: null },
} as const satisfies Record<string, { label: string; days: number | null }>;
