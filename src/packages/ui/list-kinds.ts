/* The lists the Lists tab shows, the grocery aisle guess, and the wish list's cooling-off timer. Pure. */
import { addDays, daysBetween, type DateString } from '../dates/index.ts';
import { BUY_LIST_TAGS } from '../tasks/icons.ts';
import type { BuyListItem, GroceryAisle } from './board-model.ts';

export interface ListKind {
  key: string;
  title: string;
  icon: string;
  /** what a finished item is called: Read, Watched… (list_items lists) */
  done?: string;
  /** the author field's label */
  by?: string;
}
/* list_items keep the original app's list_key values */
const BASE_LISTS: readonly ListKind[] = [
  { key: 'groceries', title: 'Groceries', icon: 'cart' },
  { key: 'wish', title: 'Wish list', icon: 'star' },
  { key: 'recipes', title: 'Recipes', icon: 'pot' },
  { key: 'gifts', title: 'Gifts', icon: 'gift' },
  { key: 'books', title: 'Books', icon: 'book', done: 'Read', by: 'Author' },
  { key: 'movies', title: 'Movies', icon: 'film', done: 'Watched' },
  { key: 'shows', title: 'Shows', icon: 'tv', done: 'Finished' },
  { key: 'halloween-costumes', title: 'Costumes', icon: 'spark', done: 'Worn' },
];
/** The built-in lists, then one per other list_key the board has. */
export const listKindsFor = (listKeys: readonly string[]): ListKind[] => [
  ...BASE_LISTS,
  ...listKeys.filter((k) => !BASE_LISTS.some((l) => l.key === k)).map((k) => ({ key: k, title: k.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()), icon: 'list', done: 'Done' })),
];

const AISLE_GUESSES: readonly (readonly [RegExp, GroceryAisle])[] = [
  [/apple|banana|lemon|lime|avocado|onion|garlic|spinach|kale|tomato|pepper|berr|herb|cilantro|potato|carrot|lettuce|ginger|scallion/i, 'Produce'],
  [/milk|yogurt|cheese|butter|egg|cream/i, 'Dairy'],
  [/chicken|beef|salmon|fish|shrimp|pork|turkey|tofu/i, 'Meat & seafood'],
  [/bread|tortilla|bagel|bun/i, 'Bakery'],
  [/rice|pasta|bean|oil|flour|sugar|sauce|spice|oat|cereal|coffee|tea|stock|broth|lentil|curry|coconut/i, 'Pantry'],
  [/frozen|ice cream/i, 'Frozen'],
  [/water|juice|soda|beer|wine|kombucha/i, 'Drinks'],
  [/soap|towel|detergent|sponge|trash bag|litter|dog food|cat food/i, 'Household'],
];
/** The aisle a grocery name probably belongs in: the first matching guess, else 'Other'. */
export const guessAisle = (name: string): GroceryAisle => AISLE_GUESSES.find(([re]) => re.test(name))?.[1] ?? 'Other';

export interface WishTimer {
  /** the tag's wait in days; null = no timer */
  days: number | null;
  /** the day it settles */
  ready: DateString | null;
  /** days left to settle */
  left: number | null;
  isReady: boolean;
  /** share of the wait gone, 0..1 */
  pct: number;
}
/** A wish list item's cooling-off timer on `today`. */
export function wishTimer(item: Pick<BuyListItem, 'tag' | 'added'>, today: DateString): WishTimer {
  const days = BUY_LIST_TAGS[item.tag].days;
  const ready = days == null ? null : addDays(item.added, days);
  const left = ready ? Math.max(0, daysBetween(today, ready)) : null;
  return { days, ready, left, isReady: days === 0 || (!!ready && ready <= today), pct: days ? Math.max(0, Math.min(1, daysBetween(item.added, today) / days)) : 1 };
}
