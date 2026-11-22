/* The tabs and the sub-views inside Life and Grow. */
import type { Tab } from './state.ts';

export interface Area<Id extends string = string> {
  id: Id;
  label: string;
  icon: string;
}
export const TABS: readonly Area<Tab>[] = [
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'plan', label: 'Plan', icon: 'calendar' },
  { id: 'lists', label: 'Lists', icon: 'list' },
  { id: 'life', label: 'Life', icon: 'leaf' },
  { id: 'grow', label: 'Grow', icon: 'sprout' },
];
export const LIFE_AREAS: readonly Area[] = [
  { id: 'health', label: 'Health', icon: 'heart' },
  { id: 'money', label: 'Money', icon: 'coin' },
  { id: 'home', label: 'Home & Pets', icon: 'house' },
  { id: 'hobbies', label: 'Hobbies', icon: 'wave' },
];
/** Grow's views; the render loop adds Collection while the game is on. */
export const GROW_VIEWS: Area[] = [
  { id: 'habits', label: 'Habits', icon: 'flame' },
  { id: 'goals', label: 'Goals', icon: 'target' },
];
export const COLLECTION_VIEW: Area = { id: 'collection', label: 'Collection', icon: 'star' };
export const isTab = (id: string | undefined): id is Tab => TABS.some((t) => t.id === id);
