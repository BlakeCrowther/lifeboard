'use strict';
/* =========================================================
   lifeboard: views and actions. Data comes from the artifact db
   (store.js), validated by schema.js; dates and recurrence from logic.js.
   ========================================================= */

/* ---------- icons: one stroke family, 24px grid ---------- */
const P = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  sliders:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list:'<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/>',
  leaf:'<path d="M5 19.5C5 10.5 10 5 20 4.5c0 10-5.5 15-14 15"/><path d="M5 19.5l7.5-7.5"/>',
  sprout:'<path d="M12 21v-9"/><path d="M12 12c0-4-3-7-8-7 0 5 3 7 8 7zM12 10c0-3 2.2-6 7.5-6 0 4-2.2 6-7.5 6z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevL:'<path d="M15 5l-7 7 7 7"/>', chevR:'<path d="M9 5l7 7-7 7"/>', chevD:'<path d="M6 9l6 6 6-6"/>',
  wave:'<path d="M2 14.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M6.5 10c0-3.5 2.8-5.5 6.5-5.5-1.8 1.2-2.3 3-1 4.8"/>',
  flame:'<path d="M12 21.5c-3.9 0-6.5-2.8-6.5-6.4 0-3.8 2.8-5.6 3.8-9.6 1.9 1.6 2.9 3.6 2.9 5.6 1-.8 1.8-2 1.9-3.7 2.1 1.9 4.4 4.8 4.4 7.7 0 3.6-2.6 6.4-6.5 6.4z"/>',
  heart:'<path d="M12 20s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.4-8 11-8 11z"/>',
  coin:'<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.4-1.4-2.6-1.4-1.5 0-2.5.8-2.5 1.9 0 2.6 5.1 1.4 5.1 4.1 0 1.2-1.1 2-2.6 2-1.2 0-2.2-.5-2.7-1.4M12 6.5V8M12 16v1.5"/>',
  house:'<path d="M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
  paw:'<path d="M12 12.5c-3 0-5 3-5 5 0 1.5 1.3 2 2.4 2 1 0 1.6-.5 2.6-.5s1.6.5 2.6.5c1.1 0 2.4-.5 2.4-2 0-2-2-5-5-5z"/><circle cx="5.8" cy="10.2" r="1.7"/><circle cx="9.2" cy="6.2" r="1.7"/><circle cx="14.8" cy="6.2" r="1.7"/><circle cx="18.2" cy="10.2" r="1.7"/>',
  mountain:'<path d="M2.5 19.5l6.5-11 4 6.2 2-3 6.5 7.8z"/><path d="M7.2 11.6l1.8 1.2 1.6-1"/>',
  grip:'<circle cx="9" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.1" fill="currentColor" stroke="none"/>',
  x:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  repeat:'<path d="M16.5 3l3 3-3 3M4.5 11V9.5A3.5 3.5 0 0 1 8 6h11.5M7.5 21l-3-3 3-3M19.5 13v1.5A3.5 3.5 0 0 1 16 18H4.5"/>',
  snooze:'<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 2M5 3.5L2.5 6M19 3.5L21.5 6"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>', down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  gift:'<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.6-3.6-5.5-3.8-5.5-1.5C6.5 8 10 8 12 8zm0 0c1.6-3.6 5.5-3.8 5.5-1.5C17.5 8 14 8 12 8z"/>',
  cart:'<path d="M3 4h2.2l2.3 10.5h10.8L20.5 7.5H6.3"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  book:'<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  film:'<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  tv:'<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M8.5 2.5l3.5 4 3.5-4"/>',
  star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  rings:'<circle cx="9" cy="14.5" r="5.5"/><circle cx="15" cy="14.5" r="5.5"/><path d="M10 4l2 3 2-3"/>',
  pot:'<path d="M4.5 10h15v5.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5zM2.5 10h2M19.5 10h2M9.5 6.5c0-1 1-1.2 1-2.5M14 6.5c0-1 1-1.2 1-2.5"/>',
  drop:'<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/>',
  person:'<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  social:'<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c0-3.4 2.8-5.4 6.2-5.4s6.2 2 6.2 5.4"/><path d="M15.5 5.6a3.3 3.3 0 0 1 0 6M17.5 14.4c2.2.6 3.7 2.4 3.7 5.1"/>',
  dog:'<path d="M5 10.5V6l3 2h8l3-2v4.5c1.8 1.2 2.5 3 2.5 5.3 0 3-3 5-9.5 5S2.5 18.8 2.5 15.8c0-2.3.7-4.1 2.5-5.3z"/><path d="M9.5 13.5h.01M14.5 13.5h.01M11 17h2"/>',
  cat:'<path d="M4.5 20.5V8.5L7 4l3.2 4h3.6L17 4l2.5 4.5v12z"/><path d="M9.3 13.5h.01M14.7 13.5h.01M11 16.8h2"/>',
  med:'<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
  pill:'<path d="M10.6 3.9a4.9 4.9 0 0 1 6.9 6.9l-6.7 6.7a4.9 4.9 0 0 1-6.9-6.9z"/><path d="M7.3 10.2l6.5 6.5"/>',
  drum:'<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M15.5 3l-3.5 6M8.5 3l3.5 6"/>',
  chat:'<path d="M4.5 5h15v10.5H10l-5.5 4z"/>',
  shoe:'<path d="M3 17.5v-6l4-1 2.8-5 2.2 1-.9 3.8 8.6 3c.9.3 1.3 1.2 1.3 2.2v2zM3 20.5h18"/>',
  lotus:'<path d="M12 20c-5 0-9-2.8-9-6 3.2 0 6.4 1.2 9 6zM12 20c5 0 9-2.8 9-6-3.2 0-6.4 1.2-9 6zM12 20c-2-3-3-5.6-3-8.6C9 8.3 12 5 12 5s3 3.3 3 6.4c0 3-1 5.6-3 8.6z"/>',
  hourglass:'<path d="M6.5 3h11M6.5 21h11M8 3v3.2l4 5.3 4-5.3V3M8 21v-3.2l4-5.3 4 5.3V21"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.7-7.7a4 4 0 0 0-2-2z"/>',
  car:'<path d="M3.5 16v-4l2-5h13l2 5v4z"/><path d="M3.5 16v3h3v-3M17.5 16v3h3v-3M7.5 12.5h.01M16.5 12.5h.01"/>',
  phone:'<path d="M5 3.5h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.8 6.8l1.4-2.2 4.3 1.7V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>',
  spark:'<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4L18 18M6 18l2.6-2.6M15.4 8.6L18 6"/>',
  target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  laptop:'<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>',
  pin:'<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ic = (k, s = 22, label) => `<svg class="i" style="--s:${s}px" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${P[k] || P.spark}</svg>`;

/* ---------- dates: string math is zone-free; "today" and "now" are Pacific, like the original app ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
const dow = (s) => toD(s).getDay();
const mondayOf = (s) => addDays(s, -((dow(s) + 6) % 7));
const addMonths = (s, n) => { const d = toD(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WD3 = WD.map((w) => w.slice(0, 3));
const longDate = (s) => { const d = toD(s); return `${WD[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const shortDate = (s) => { const d = toD(s); return `${WD3[d.getDay()]} ${MON3[d.getMonth()]} ${d.getDate()}`; };
let TODAY = LB.todayStr();
const relDate = (s) => {
  const n = diffDays(TODAY, s);
  if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WD[dow(s)];
  const d = toD(s); return `${MON3[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== toD(TODAY).getFullYear() ? ', ' + d.getFullYear() : ''}`;
};
const minLabel = (m, ap = true) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${(h % 12) || 12}${mm ? ':' + pad(mm) : ''}${ap ? (h < 12 ? ' AM' : ' PM') : ''}`; };
const durLabel = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);
const nowMins = () => LB.minsOfDay(new Date().toISOString());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : '');
const extLink = (u, label) => { const h = safeUrl(u); return h ? `<a class="xl" href="${esc(h)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label; };

/* ---------- domain constants ---------- */
const GROUPS = ['Social', 'Health', 'Money', 'Home', 'Pets', 'Personal', 'Goals'];
const GROUP_IC = { Social: 'social', Health: 'heart', Money: 'coin', Home: 'house', Pets: 'paw', Personal: 'person', Goals: 'sprout' };
const TASK_ICONS = ['spark','heart','med','pill','coin','receipt','house','wrench','leaf','dog','cat','rings','gift','chat','phone','car','book','mountain','wave','lotus','laptop','target'];
/* icon keys written by the original app, drawn with the nearest icon in this set */
const ICON_MAP = { plant: 'leaf', tooth: 'med', medical: 'med', mail: 'chat', broom: 'house', droplet: 'drop', dumbbell: 'flame', plane: 'pin', cake: 'gift', music: 'drum', bag: 'cart', books: 'book', 'book-open': 'book', surf: 'wave', key: 'house', chart: 'target', scissors: 'person', journal: 'book', hola: 'chat', cup: 'drop', diamond: 'star', flag: 'target', dot: 'spark', clipboard: 'list', pumpkin: 'spark', 'bubble-heart': 'heart', sunset: 'sun', stopwatch: 'clock', news: 'list', bulb: 'spark' };
const iconOf = (k) => (k && P[k] ? k : (k && ICON_MAP[k]) || 'spark');
const HABIT_IC = { drumming: 'drum', 'guitar-practice': 'heart', 'spanish-speaking': 'chat', surfing: 'wave', running: 'shoe', meditation: 'lotus', journaling: 'book', reading: 'book' };
const TAGS = LB.TAGS;
const GROC_SECS = ['Produce', 'Dairy', 'Meat & seafood', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'];
const GROC_GUESS = [[/apple|banana|lemon|lime|avocado|onion|garlic|spinach|kale|tomato|pepper|berr|herb|cilantro|potato|carrot|lettuce|ginger|scallion/i, 'Produce'], [/milk|yogurt|cheese|butter|egg|cream/i, 'Dairy'], [/chicken|beef|salmon|fish|shrimp|pork|turkey|tofu/i, 'Meat & seafood'], [/bread|tortilla|bagel|bun/i, 'Bakery'], [/rice|pasta|bean|oil|flour|sugar|sauce|spice|oat|cereal|coffee|tea|stock|broth|lentil|curry|coconut/i, 'Pantry'], [/frozen|ice cream/i, 'Frozen'], [/water|juice|soda|beer|wine|kombucha/i, 'Drinks'], [/soap|towel|detergent|sponge|trash bag|litter|dog food|cat food/i, 'Household']];
const guessSec = (n) => (GROC_GUESS.find(([re]) => re.test(n)) || [0, 'Other'])[1];
/* list_items keep the original app's list_key values */
const BASE_LISTS = [
  { key: 'groceries', title: 'Groceries', icon: 'cart' },
  { key: 'wish', title: 'Wish list', icon: 'star' },
  { key: 'recipes', title: 'Recipes', icon: 'pot' },
  { key: 'gifts', title: 'Gifts', icon: 'gift' },
  { key: 'books', title: 'Books', icon: 'book', done: 'Read', by: 'Author' },
  { key: 'movies', title: 'Movies', icon: 'film', done: 'Watched' },
  { key: 'shows', title: 'Shows', icon: 'tv', done: 'Finished' },
  { key: 'halloween-costumes', title: 'Costumes', icon: 'spark', done: 'Worn' },
];
const listDefs = () => [...BASE_LISTS, ...Object.keys(S.lists).filter((k) => !BASE_LISTS.some((l) => l.key === k)).map((k) => ({ key: k, title: k.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()), icon: 'list', done: 'Done' }))];
const GOAL_CATS = ['Climbing', 'Work', 'School', 'Self Care', 'Personal'];
const GOAL_CAT_IC = { Climbing: 'mountain', Work: 'laptop', School: 'book', 'Self Care': 'lotus', Personal: 'star' };
const QUOTES = [
  ['The best time to plant a tree was twenty years ago. The second best time is now.', 'Proverb'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['Nature does not hurry, yet everything is accomplished.', 'Lao Tzu'],
  ['Well begun is half done.', 'Aristotle'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['Go confidently in the direction of your dreams.', 'Henry David Thoreau'],
];
const TABS = [
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'plan', label: 'Plan', icon: 'calendar' },
  { id: 'lists', label: 'Lists', icon: 'list' },
  { id: 'life', label: 'Life', icon: 'leaf' },
  { id: 'grow', label: 'Grow', icon: 'sprout' },
];
const LIFE = [['health', 'Health', 'heart'], ['money', 'Money', 'coin'], ['home', 'Home & Pets', 'house'], ['hobbies', 'Hobbies', 'wave']];
const GROW = [['habits', 'Habits', 'flame'], ['goals', 'Goals', 'target']];

/* ---------- recurrence (rule shapes and math from the original app: logic.js) ---------- */
const PRESETS = [
  ['none', "Doesn't repeat"], ['daily', 'Every day'], ['weekly', 'Every week'], ['biweekly', 'Every two weeks'], ['monthly', 'Every month'],
  ['interval', 'Every N days / weeks / months / years'], ['monthly_day', 'On a day of the month'], ['monthly_first', 'First day of the month'],
  ['monthly_last_day', 'Last day of the month'], ['monthly_weekday', 'On a weekday of the month'], ['yearly_day', 'On a date each year'],
  ['yearly_first_day', 'First day of a month each year'], ['yearly_last_day', 'Last day of a month each year'], ['yearly_weekday', 'On a weekday of a month each year'],
];
function presetOf(r) {
  if (!r) return 'none';
  if (r.kind === 'interval') {
    if (r.basis !== 'schedule') {
      if (+r.every === 1 && r.unit === 'day') return 'daily';
      if (+r.every === 1 && r.unit === 'week') return 'weekly';
      if (+r.every === 2 && r.unit === 'week') return 'biweekly';
      if (+r.every === 1 && r.unit === 'month') return 'monthly';
    }
    return 'interval';
  }
  if (r.kind === 'monthly_day' && +r.day === 1) return 'monthly_first';
  return r.kind;
}
function ruleFor(preset, due) {
  const d = isDate(due) ? due : TODAY;
  const [, m, dd] = d.split('-').map(Number);
  const wd = dow(d), ord = Math.min(4, Math.ceil(dd / 7));
  const iv = (every, unit) => ({ kind: 'interval', every, unit, basis: 'completion' });
  return ({
    none: null, daily: iv(1, 'day'), weekly: iv(1, 'week'), biweekly: iv(2, 'week'), monthly: iv(1, 'month'), interval: iv(3, 'day'),
    monthly_day: { kind: 'monthly_day', day: dd, every_months: 1 }, monthly_first: { kind: 'monthly_day', day: 1, every_months: 1 },
    monthly_last_day: { kind: 'monthly_last_day', every_months: 1 }, monthly_weekday: { kind: 'monthly_weekday', ordinal: ord, weekday: wd, every_months: 1 },
    yearly_day: { kind: 'yearly_day', month: m, day: dd }, yearly_first_day: { kind: 'yearly_first_day', month: m },
    yearly_last_day: { kind: 'yearly_last_day', month: m }, yearly_weekday: { kind: 'yearly_weekday', month: m, ordinal: ord, weekday: wd },
  })[preset] ?? null;
}
const recShort = (r) => (r ? LB.shortRule(r) : '');

/* =========================================================
   Data: S is a read model rebuilt from the db on every change.
   Views read S; actions write through LBDB and never touch S.
   ========================================================= */
const byOrd = (a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || (a.created_at || 0) - (b.created_at || 0);
const byCreated = (a, b) => (a.created_at || 0) - (b.created_at || 0);
const str = (v) => (v == null ? '' : String(v));
const emptyS = () => ({ tasks: [], habits: [], sessions: [], events: [], calOK: false, calAt: null, cond: null, groceries: [], wish: [], recipes: [], gifts: [], lists: {}, goals: [], weddings: [], checks: {}, logs: [] });
let S = emptyS();
const safeColor = (c) => (typeof c === 'string' && /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(c.trim()) ? c.trim() : '');
const CAL_FALLBACK = ['var(--cal-a)', 'var(--cal-b)', 'var(--cal-c)'];
const calColor = (name) => { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return CAL_FALLBACK[Math.abs(h) % 3]; };
const evColor = (e) => e.color || calColor(e.cal);
function vmEvents(snap) {
  const evs = snap && Array.isArray(snap.events) ? snap.events : [];
  return evs.map((e, i) => {
    if (!e || typeof e.start !== 'string' || !isDate(e.start.slice(0, 10))) return null;
    const base = { id: str(e.id || 'e' + i), title: str(e.title) || '(No title)', cal: str(e.calendar), color: safeColor(e.color || e.calendar_color), loc: str(e.location) };
    if (e.all_day) {
      const s = e.start.slice(0, 10), en = typeof e.end === 'string' && isDate(e.end.slice(0, 10)) ? e.end.slice(0, 10) : null;
      return { ...base, allDay: true, date: s, days: en && en > s ? diffDays(s, en) : 1 };
    }
    const sMs = Date.parse(e.start), eMs = Date.parse(e.end || '');
    if (isNaN(sMs)) return null;
    const date = LB.laDateOf(sMs), s = LB.minsOfDay(e.start);
    const en = isNaN(eMs) ? s + 60 : LB.laDateOf(eMs) === date ? LB.minsOfDay(e.end) : 1440;
    return { ...base, date, s, e: Math.max(en, s) };
  }).filter(Boolean);
}
function vmTask(d) {
  return { id: d.id, title: d.title, group: GROUPS.includes(d.category) ? d.category : (d.category || 'Personal'), icon: iconOf(d.icon_key || LB.autoIcon(d.title)),
    notes: d.notes || '', due: d.due_date || null, deadline: d.deadline_date || null, rule: d.recurrence_rule || null,
    done: d.status === 'done', doneAt: d.completed_at || null, created: d.created_at || 0, _d: d };
}
const validException = (e) => !!e && typeof e === 'object' && typeof e.reason === 'string' && e.reason.trim().length >= 20 && typeof e.evidence === 'string' && e.evidence.trim().length >= 3;
function derive() {
  const A = (c) => LBDB.all(c);
  const s = emptyS();
  const allT = A('tasks').map(vmTask), isSug = (t) => t._d.suggested === true && !t.done;
  s.suggested = allT.filter(isSug).sort((a, b) => b.created - a.created);
  s.tasks = allT.filter((t) => !isSug(t));
  s.habits = A('habits').sort(byOrd).map((d) => ({ id: d.id, key: d.key || d.id, name: d.name, icon: iconOf(d.icon_key || HABIT_IC[d.key]), target: Math.max(1, +d.target_per_week || 1), floor: Math.max(1, +d.streak_floor_per_week || 1), notes: d.notes || '', _d: d }));
  /* a session counts when it was logged during its own week. Later logs count only with an exception (reason + evidence). Older docs without created_at count. */
  const allS = A('habit_sessions').map((d) => ({ id: d.id, h: d.habit_id, date: d.date, created: d.created_at || 0, ex: validException(d.exception) ? d.exception : null }));
  const onTime = (x) => !x.created || mondayOf(LB.laDateOf(x.created)) <= mondayOf(x.date);
  s.sessions = allS.filter((x) => onTime(x) || x.ex);
  s.voidSessions = allS.filter((x) => !onTime(x) && !x.ex);
  const snaps = Object.fromEntries(A('snapshots').map((d) => [d.id, d]));
  const cal = snaps.calendar;
  s.calOK = !!(cal && cal.fetched_at && Array.isArray(cal.events));
  s.calAt = s.calOK ? cal.fetched_at : null;
  s.events = s.calOK ? vmEvents(cal) : [];
  const c = snaps.conditions;
  if (c && (c.weather || c.surf || (c.tides || []).length)) {
    const tides = (Array.isArray(c.tides) ? c.tides : []).filter((t) => t && t.type && t.time).map((t) => ({ type: str(t.type), ft: t.height_ft, time: str(t.time), upcoming: !!t.upcoming }));
    s.cond = { w: c.weather && typeof c.weather === 'object' ? c.weather : null, s: c.surf && typeof c.surf === 'object' ? c.surf : null, tides, at: c.fetched_at || null, quote: c.quote && c.quote.text ? c.quote : null };
  } else if (c && c.quote && c.quote.text) s.cond = { w: null, s: null, tides: [], at: c.fetched_at || null, quote: c.quote };
  s.groceries = A('groceries').sort(byOrd).map((d) => ({ id: d.id, name: d.name, sec: GROC_SECS.includes(d.group_name) ? d.group_name : 'Other', done: !!d.checked, created: d.created_at || 0 }));
  s.wish = A('buy_list_items').sort(byOrd).map((d) => ({ id: d.id, name: d.name, tag: TAGS[d.tag] ? d.tag : 'one_day', added: d.added_date || (d.created_at ? LB.laDateOf(d.created_at) : TODAY), price: str(d.price), url: d.url, notes: d.notes || '', status: d.status || 'waiting' }));
  s.recipes = A('recipes').sort(byOrd).map((d) => ({ id: d.id, name: d.name, time: d.time || '', mood: d.mood || '', url: d.url, notes: d.notes || '', ingredients: (d.ingredients || []).filter((x) => typeof x === 'string' && x.trim()), cooked: d.status === 'archived', cookedAt: d.cooked_at || null }));
  s.gifts = A('gift_ideas').sort(byOrd).map((d) => ({ id: d.id, person: d.person.trim() || 'Someone', idea: d.idea || '', url: d.url, done: d.status === 'given' }));
  A('list_items').sort(byOrd).forEach((d) => { (s.lists[d.list_key] = s.lists[d.list_key] || []).push({ id: d.id, name: d.title, by: d.author || '', url: d.url, notes: d.notes || '', done: d.status === 'done' }); });
  s.goals = A('goals').sort(byOrd).map((d) => ({ id: d.id, title: d.title, cat: d.category || '', icon: iconOf(d.icon_key || GOAL_CAT_IC[d.category] || 'star'), year: +d.year, done: d.status === 'completed', notes: d.notes || '', q: [1, 2, 3, 4].map((q) => d['progress_q' + q] || '') }));
  s.weddings = A('countdowns').filter((d) => d.kind === 'wedding').sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({ id: d.id, title: d.title, date: d.date, where: d.detail || d.when || '', gift: d.gift || '', match: Array.isArray(d.match) ? d.match.filter((x) => typeof x === 'string') : [] }));
  A('checks').forEach((d) => { s.checks[d.id] = d; });
  s.logs = A('logs').sort(byCreated).map((d) => ({ kind: d.kind, label: d.label || '', date: d.date, at: d.created_at || null }));
  S = s;
}

/* ---------- tasks logic (ordering from the original app) ---------- */
const eff = (t) => (t.due && t.deadline ? (t.due < t.deadline ? t.due : t.deadline) : t.due || t.deadline || null);
const bucketOf = (t) => { const e = eff(t); return !e ? 'none' : e <= TODAY ? 'urgent' : e <= addDays(TODAY, 7) ? 'week' : 'later'; };
const tstate = (t) => LB.taskState(t._d, TODAY);
const byDate = (a, b) => LB.byDateThenOrder(a._d, b._d);
const back = (list, ds) => { const m = new Map(list.map((t) => [t.id, t])); return ds.map((d) => m.get(d.id)); };
const sortUrgent = (list) => back(list, LB.sortUrgent(list.map((t) => t._d), TODAY));
function buckets(tasks) {
  const B = LB.buckets(tasks.map((t) => t._d), TODAY);
  return { urgent: back(tasks, B.urgent), week: back(tasks, B.week), later: back(tasks, B.later), none: back(tasks, B.none) };
}

/* ---------- habits & wish timers ---------- */
function habitStats(h, sessions) {
  const ss = sessions.filter((s) => (s.h === h.key || s.h === h.id) && s.date <= TODAY).map((s) => s.date);
  const wk = mondayOf(TODAY), mon = TODAY.slice(0, 7), yr = TODAY.slice(0, 4);
  const counts = {}; ss.forEach((d) => { const m = mondayOf(d); counts[m] = (counts[m] || 0) + 1; });
  const c = (m) => counts[m] || 0;
  const weeks = []; for (let i = 0, m = wk; i < 12; i++, m = addDays(m, -7)) weeks.unshift({ m, n: c(m), cur: i === 0 });
  const curMet = c(wk) >= h.floor; let streak = curMet ? 1 : 0;
  for (let m = addDays(wk, -7); c(m) >= h.floor; m = addDays(m, -7)) streak++;
  /* best run of floor-met weeks, from the first logged week through this one */
  let best = 0, run = 0;
  const first = ss.length ? mondayOf(ss.reduce((a, b) => (a < b ? a : b))) : wk;
  for (let m = first; m <= wk; m = addDays(m, 7)) { run = c(m) >= h.floor ? run + 1 : 0; if (run > best) best = run; }
  return { best: Math.max(best, streak), week: c(wk), month: ss.filter((d) => d.startsWith(mon)).length, year: ss.filter((d) => d.startsWith(yr)).length, total: ss.length, today: ss.filter((d) => d === TODAY).length, weeks, streak, pending: !curMet && streak > 0 };
}
function buyCalc(it) {
  const days = TAGS[it.tag] ? TAGS[it.tag].days : null;
  const ready = days == null ? null : addDays(it.added, days);
  const left = ready ? Math.max(0, diffDays(TODAY, ready)) : null;
  return { days, ready, left, isReady: days === 0 || (!!ready && ready <= TODAY), pct: days ? Math.max(0, Math.min(1, diffDays(it.added, TODAY) / days)) : 1 };
}
function eventsOn(evs, d) {
  const ad = evs.filter((e) => e.allDay && d >= e.date && d < addDays(e.date, e.days || 1));
  const tm = evs.filter((e) => !e.allDay && e.date === d).sort((a, b) => a.s - b.s);
  return { ad, tm };
}

/* ---------- UI state ---------- */
const U = {
  tab: 'today', life: 'health', grow: 'habits', list: 'groceries',
  open: null, adjust: null, adjBusy: null, exp: {}, showDone: false, showTomorrow: false, wishFilter: 'all', petFilter: 'all', script: false,
  calSel: TODAY, calMonth: TODAY.slice(0, 7) + '-01', editQ: null, editKeep: null, inspect: null, coll: 'dioramas', rec: 'habits',
  timer: { len: 2, end: null, msg: '' }, quote: (diffDays('2026-01-01', TODAY) % 7 + 7) % 7, sheet: null,
};
/* which folds are open and how lists sort: remembered per device */
let UI = { fold: {}, sort: {}, labs: false };
try { const r = JSON.parse(localStorage.getItem('lb-ui') || 'null'); if (r) UI = { fold: r.fold && typeof r.fold === 'object' ? r.fold : {}, sort: r.sort && typeof r.sort === 'object' ? r.sort : {}, labs: r.labs === true }; } catch (e) { /* defaults */ }
const saveUI = () => { try { localStorage.setItem('lb-ui', JSON.stringify(UI)); } catch (e) { /* private mode: keep in memory */ } };
const SORTS = { groceries: [['aisle', 'Aisle'], ['az', 'A-Z'], ['new', 'Newest']], wish: [['ready', 'Ready first'], ['tag', 'Tag'], ['price', 'Price'], ['new', 'Newest']], recipes: [['az', 'A-Z'], ['new', 'Newest']], gifts: [['person', 'Person'], ['new', 'Newest']] };
const sortOpts = (k) => SORTS[k] || [['new', 'Newest'], ['az', 'A-Z']];
const sortOf = (k) => { const o = sortOpts(k), v = UI.sort[k]; return o.some((x) => x[0] === v) ? v : o[0][0]; };
const sortCtl = (k, title) => `<label class="sortc"><span>Sort</span><select data-sort="${esc(k)}" aria-label="Sort ${esc(title)}">${sortOpts(k).map(([v, l]) => `<option value="${v}"${sortOf(k) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
const sortBy = (arr, mode, nm) => (mode === 'az' ? arr.slice().sort((a, b) => nm(a).localeCompare(nm(b), undefined, { sensitivity: 'base' })) : mode === 'new' ? arr.slice().reverse() : arr.slice());
const isOpen = (k, def) => (k in UI.fold ? !!UI.fold[k] : def);
const PHONE = matchMedia('(max-width:699px)');
function readHash() {
  const [a, b] = location.hash.slice(1).split('/');
  if (TABS.some((t) => t.id === a)) U.tab = a;
  if (a === 'life' && LIFE.some((x) => x[0] === b)) U.life = b;
  if (a === 'grow' && GROW.some((x) => x[0] === b)) U.grow = b;
  if (a === 'lists' && b) U.list = decodeURIComponent(b);
}
function writeHash() {
  const sub = U.tab === 'life' ? '/' + U.life : U.tab === 'grow' ? '/' + U.grow : U.tab === 'lists' ? '/' + encodeURIComponent(U.list) : '';
  const h = '#' + U.tab + sub;
  if (location.hash !== h) try { history.replaceState(null, '', h); } catch (e) { /* sandboxed frame */ }
}

/* ---------- writes: every action goes through act(); the toast's Undo puts the touched docs back ---------- */
function saveErr(e) {
  console.error('[lifeboard] write failed', e);
  toast(e && e.code === 'quota_exceeded' ? 'Storage is full, so that change did not save. Delete some old items and try again.'
    : e && e.code === 'invalid_doc' ? "That change didn't save because it didn't match the data shape."
    : "That change didn't save. Check your connection and try again.");
}
function act(fn, msg, undoable = true) {
  if (!LBDB.ready) { toast("Your data isn't connected in this view, so nothing was saved."); return; }
  const rec = [];
  let p;
  try { p = Promise.resolve(fn(rec)); } catch (e) { p = Promise.reject(e); }
  p.catch(saveErr);
  const text = typeof msg === 'function' ? msg() : msg;
  if (text) toast(text, undoable ? () => LBDB.undo(rec).then(() => toast('Undone'), saveErr) : null);
  return p;
}
const W = LBDB;
function newTaskBody(f) {
  return { title: f.title, category: f.category || 'Personal', notes: f.notes || '', due_date: f.due_date || null, deadline_date: f.deadline_date || null,
    status: 'open', completed_at: null, recurrence_rule: f.rule || null, recurrence_series_id: null, recurrence_parent_task_id: null, recurrence_spawned: false,
    icon_key: f.icon_key || LB.autoIcon(f.title), sort_order: 9999, urgent_sort_order: null };
}
/* complete-and-reschedule, as in the original app: the done task stays, a successor is spawned once */
function spawnSuccessor(d, completedOn, rec) {
  const due = LB.nextDue(d.recurrence_rule, d, completedOn);
  let deadline = null;
  if (d.deadline_date) deadline = LB.addDays(due, d.due_date ? LB.diffDays(d.due_date, d.deadline_date) : 0);
  return Promise.all([
    W.create('tasks', { ...newTaskBody({ title: d.title, category: d.category, notes: d.notes, rule: d.recurrence_rule, icon_key: d.icon_key }),
      due_date: d.due_date || !d.deadline_date ? due : null, deadline_date: deadline,
      recurrence_series_id: d.recurrence_series_id || d.id, recurrence_parent_task_id: d.id }, rec),
    W.patch('tasks', d.id, { recurrence_spawned: true }, rec),
  ]);
}
function nextDueOf(d) { return LB.nextDue(d.recurrence_rule, d, TODAY); }
let ensured = false;
function ensureRecurring() {
  if (ensured) return; ensured = true;
  LBDB.all('tasks').filter((d) => d.status === 'done' && d.recurrence_rule && !d.recurrence_spawned)
    .forEach((d) => spawnSuccessor(d, d.completed_at ? LB.laDateOf(d.completed_at) : TODAY).catch(saveErr));
}
/* reorder a bucket. Urgent keeps its own order (urgent_sort_order). In This week and Later, dates lead, so a row dropped
   among other dates takes its neighbour's do date. */
function applyOrder(k, ids, movedId) {
  const T = (id) => S.tasks.find((x) => x.id === id);
  const fld = k === 'urgent' ? 'urgent_sort_order' : 'sort_order';
  let msg = null;
  act((rec) => {
    const ps = [];
    if (k === 'week' || k === 'later') {
      const i = ids.indexOf(movedId), me = T(movedId), pe = i > 0 && T(ids[i - 1]) ? eff(T(ids[i - 1])) : null, ne = T(ids[i + 1]) ? eff(T(ids[i + 1])) : null, e = eff(me);
      if ((pe && pe > e) || (ne && ne < e)) {
        const nd = pe && pe > e ? pe : ne;
        ps.push(W.patch('tasks', movedId, { due_date: nd, deadline_date: me.deadline && me.deadline < nd ? null : me.deadline, urgent_sort_order: null }, rec));
        msg = `Moved “${me.title}” to ${relDate(nd)}`;
      }
    }
    ids.forEach((id, i) => { const t = T(id); if (t && t._d[fld] !== (i + 1) * 10) ps.push(W.patch('tasks', id, { [fld]: (i + 1) * 10 }, rec)); });
    return Promise.all(ps);
  }, () => msg, true);
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, undo) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" id="undoBtn">Undo</button>' : ''}`;
  el.classList.add('show');
  if (undo) document.getElementById('undoBtn').onclick = () => { el.classList.remove('show'); undo(); };
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2600);
}

/* =========================================================
   Views
   ========================================================= */
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
/* area tint: Life and Grow wear the tint of the sub-view you're in */
function phead(k, icon, title, sub) { return `<div class="phead k-${k}"><span class="aico">${ic(icon, 19)}</span><h2 class="ltitle" id="ltitle">${title}</h2><p class="psub">${sub}</p></div>`; }
function secH(title, link, tier = '', ct = '', late = 0) { return `<div class="sec-h"><h3 class="sec-t">${tier ? '<i class="tm"></i>' : ''}${title}${ct !== '' ? ` <span class="ct num">${ct}</span>` : ''}${late ? ` <span class="lt num">${late} late</span>` : ''}</h3>${link || ''}</div>`; }
function goLink(label, to) { return `<button class="link" data-act="go" data-to="${to}">${label}${ic('chevR', 16)}</button>`; }
/* fold: a section whose header carries a one-line live summary while closed (state in UI.fold) */
function fold(key, title, o) {
  const open = isOpen(key, o.def !== false), ct = o.ct != null && o.ct !== '' ? ` <span class="ct num">${o.ct}</span>` : '';
  return `<section class="sec t${o.tier || 2} fold${open ? '' : ' shut'} ${o.z || ''}"${o.id ? ` id="${o.id}"` : ''}>
    <div class="sec-h"><h3 class="sec-t"><button class="fold-b" data-act="fold" data-key="${key}" aria-expanded="${open}" aria-controls="f-${key}"><i class="tm"></i><span class="fold-t">${title}</span>${ct}${!open && o.sum ? `<span class="fold-s">${o.sum}</span>` : ''}${ic('chevD', 18)}</button></h3>${o.link || ''}</div>
    <div class="fold-body" id="f-${key}"${open ? '' : ' hidden'}>${open ? o.body : ''}</div></section>`;
}

function taskMeta(t, opts = {}) {
  const st = tstate(t), e = eff(t), bits = [];
  if (t.done) bits.push(`<span class="m">${ic('check', 15)}Done</span>`);
  else if (e) {
    if (st.overdue) bits.push(`<span class="m bad">Overdue · ${relDate(e)}</span>`);
    else if (st.slipped) bits.push(`<span class="m hot">Slipped from ${relDate(t.due)}</span><span class="m">Due by ${relDate(t.deadline)}</span>`);
    else if (e === TODAY) bits.push(`<span class="m hot">Today</span>`);
    else bits.push(`<span class="m">${relDate(e)}</span>`);
    if (t.deadline && t.due && t.deadline !== t.due && !st.slipped && e !== t.deadline) bits.push(`<span class="m">Deadline ${relDate(t.deadline)}</span>`);
  }
  if (t.rule) bits.push(`<span class="m">${ic('repeat')}${esc(recShort(t.rule))}</span>`);
  if (opts.groupIcon) bits.push(`<span class="m" title="${esc(t.group)}">${ic(GROUP_IC[t.group] || 'spark')}<span class="sr">${esc(t.group)}</span></span>`);
  else if (!opts.hideGroup) bits.push(`<span class="m">${ic(GROUP_IC[t.group] || 'spark')}${esc(t.group)}</span>`);
  return `<span class="tmeta">${bits.join('')}</span>`;
}
function taskRow(t, opts = {}) {
  const open = U.open === t.id, grip = opts.grip && !t.done;
  return `<li class="task${t.done ? ' done' : ''}${grip ? '' : ' nogrip'}${!t.done && tstate(t).overdue ? ' late' : ''}" data-id="${t.id}">
    <button class="tick" data-act="toggle" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Complete'}: ${esc(t.title)}"><span class="ring">${ic('check', 16)}</span></button>
    <button class="tmain" data-act="expand" data-id="${t.id}" aria-expanded="${open}"><span class="ttl">${ic(t.icon || 'spark', 17)} ${esc(t.title)}</span>${taskMeta(t, opts)}</button>
    ${t.done ? '' : `<button class="act" data-act="snooze" data-id="${t.id}" aria-label="Snooze ${esc(t.title)} by a day">${ic('snooze')}</button>`}
    ${grip ? `<button class="act grip" data-drag="${t.id}" data-act="grip" data-id="${t.id}" aria-label="Reorder ${esc(t.title)}. Drag, or use arrow keys">${ic('grip')}</button>` : ''}
    ${open && t.notes ? `<p class="notes">${esc(t.notes)}</p>` : ''}
    ${open ? `<div class="tray">
      ${t.done ? '' : `${eff(t) && eff(t) < TODAY ? `<button class="btn sm" data-act="resched" data-val="today" data-id="${t.id}">Today</button>` : ''}<button class="btn sm" data-act="resched" data-val="tomorrow" data-id="${t.id}">Tomorrow</button><button class="btn sm" data-act="resched" data-val="weekend" data-id="${t.id}">This weekend</button><button class="btn sm" data-act="snooze-week" data-id="${t.id}">${ic('snooze', 18)}Next week</button>`}
      ${grip ? `<button class="btn sm" data-act="move" data-dir="-1" data-id="${t.id}" aria-label="Move up">${ic('up', 18)}</button><button class="btn sm" data-act="move" data-dir="1" data-id="${t.id}" aria-label="Move down">${ic('down', 18)}</button>` : ''}
      <button class="btn sm" data-act="edit" data-id="${t.id}">${ic('edit', 18)}Edit</button>
      <button class="btn sm ghost" data-act="del" data-id="${t.id}">${ic('trash', 18)}Delete</button>
    </div>` : ''}
  </li>`;
}
function groupTasks(filter, empty) {
  const open = sortUrgent(S.tasks.filter((t) => !t.done && filter(t) && bucketOf(t) === 'urgent')).concat(S.tasks.filter((t) => !t.done && filter(t) && bucketOf(t) !== 'urgent').sort(byDate));
  const done = S.tasks.filter((t) => t.done && filter(t) && t.doneAt && Date.now() - t.doneAt < 864e5);
  if (!open.length && !done.length) return `<div class="card"><p class="empty">${empty}</p></div>`;
  return `<div class="card"><ul class="list">${open.map((t) => taskRow(t, { hideGroup: true })).join('')}${done.map((t) => taskRow(t, { hideGroup: true })).join('')}</ul></div>`;
}

/* ---------- Today ---------- */
function nextWedding() { return S.weddings.filter((w) => w.date >= TODAY)[0]; }
const vv = (x, u = '') => (x == null || x === '' ? '–' : esc(x) + u);
const nextTideOf = (c) => (c && c.tides.length ? c.tides.find((t) => t.upcoming) || c.tides[0] : null);
function dayLabel(s) { const d = toD(s); return `${WD3[d.getDay()]}, ${MON3[d.getMonth()]} ${d.getDate()}`; }
function greeting() { const h = Math.floor(nowMins() / 60); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function daySummary() {
  const B = buckets(S.tasks), ev = eventsOn(S.events, TODAY), nm = nowMins();
  const late = B.urgent.filter((t) => tstate(t).overdue).length;
  const nxt = ev.tm.find((e) => e.s > nm);
  return { due: B.urgent.length, late, ev: ev.tm.length + ev.ad.length, next: nxt ? minLabel(nxt.s) : null };
}
const sumHTML = (x) => `<span class="hotc${x.late ? ' late' : ''}">${x.due} due</span>${S.calOK ? ` <span class="sep">·</span> <span>${plural(x.ev, 'event')}</span> <span class="sep">·</span> <span>${x.next ? 'next ' + x.next : 'nothing later'}</span>` : ''}`;
function viewToday() {
  const wed = nextWedding(), C = S.cond, w = C && C.w, sf = C && C.s, nextTide = nextTideOf(C);
  const B = buckets(S.tasks), sm = daySummary();
  const doneToday = S.tasks.filter((t) => t.done && t.doneAt && LB.laDateOf(t.doneAt) === TODAY).sort((a, b) => a.doneAt - b.doneAt);
  const rows = (l, o = { grip: true, hideGroup: true }) => l.map((t) => taskRow(t, o)).join('');
  const none = !S.tasks.length;
  /* tier 1: needs me now. Carried over (anything past its day) and Today, each its own list */
  const carried = B.urgent.filter((t) => eff(t) < TODAY), dueToday = B.urgent.filter((t) => eff(t) >= TODAY);
  const moveAll = carried.length ? `<button class="link" data-act="carry-all">Move all ${ic('arrow', 16)} Tomorrow</button>` : '';
  const carriedSec = carried.length ? `<section class="sec t1 z-due carried">${secH('Carried over', moveAll, 1, carried.length)}
    <div class="card"><ul class="list" data-bucket="urgent">${rows(carried)}</ul></div></section>` : '';
  const due = `${carriedSec}<section class="sec t1 z-due" id="tasks">${secH('Today', '', 1, dueToday.length)}
    <div class="card">${dueToday.length ? `<ul class="list" data-bucket="urgent">${rows(dueToday)}</ul>` : `<p class="empty">${none ? 'No tasks yet. The + button adds your first one, with a date if it has one.' : carried.length ? 'Nothing else due today.' : 'Nothing overdue or due today. Nice.'}</p>`}</div></section>`;
  /* suggestions from Claude: kept out of every list until the owner keeps one */
  /* soonest first; one shows, the rest sit behind a toggle (the one being adjusted always shows) */
  const sg = (S.suggested || []).slice().sort((a, b) => (eff(a) || '9999') < (eff(b) || '9999') ? -1 : (eff(a) || '9999') > (eff(b) || '9999') ? 1 : b.created - a.created);
  const sgShow = U.exp.sug ? sg : sg.filter((t, i) => i === 0 || t.id === U.adjust);
  const sgWhen = (t) => [t.due ? (t.due < TODAY ? `<b class="bad">${esc(relDate(t.due))}</b>` : esc(relDate(t.due))) : '', t.deadline && t.deadline !== t.due ? `by ${esc(relDate(t.deadline))}` : '', t.rule ? `${ic('repeat', 13)}${esc(recShort(t.rule))}` : ''].filter(Boolean).join(' · ');
  const sug = sg.length ? `<section class="sec t1 z-sug" id="suggested">${secH('Suggested', '', 1, sg.length)}
    <div class="card"><ul class="list sugl">${sgShow.map((t) => `<li class="sg"><div class="sgt">${ic(t.icon || 'spark', 17)} <span>${esc(t.title)}</span>${sgWhen(t) ? ` <span class="sgd">${sgWhen(t)}</span>` : ''}</div>${t.notes ? `<p class="sgw">${esc(t.notes)}</p>` : ''}
      ${t._d.adjust_request && U.adjust !== t.id ? `<p class="sgw sgq">${ic('spark', 14)} Waiting on Claude: “${esc(t._d.adjust_request)}”</p>` : ''}
      ${U.adjust === t.id ? `<form class="sgf" data-form="adj" data-id="${t.id}"><label for="adj-${t.id}">How should Claude adjust it?</label><span class="sgfr"><input id="adj-${t.id}" name="v" autocomplete="off" placeholder="e.g. make it Saturday, smaller first step" ${U.adjBusy === t.id ? 'disabled' : ''}><button class="btn primary" type="submit" ${U.adjBusy === t.id ? 'disabled' : ''}>${U.adjBusy === t.id ? 'Adjusting…' : 'Adjust'}</button></span></form>` : ''}
      <div class="sga"><button class="btn sm" data-act="sug-keep" data-id="${t.id}">${ic('check', 18)}Keep</button><button class="btn sm${U.adjust === t.id ? ' on' : ''}" data-act="sug-adjust" data-id="${t.id}" aria-expanded="${U.adjust === t.id}">${ic('edit', 18)}${U.adjust === t.id ? 'Cancel' : 'Adjust'}</button><button class="btn sm ghost" data-act="sug-drop" data-id="${t.id}">Dismiss</button></div></li>`).join('')}</ul>${sg.length > 1 ? `<button class="disc" data-act="exp" data-val="sug" aria-expanded="${!!U.exp.sug}">${ic(U.exp.sug ? 'chevD' : 'chevR', 16)}${U.exp.sug ? 'Show less' : `${sg.length - 1} more suggestion${sg.length > 2 ? 's' : ''}`}</button>` : ''}</div></section>` : '';
  /* tier 2: working through. This week stays open; the rest fold to a one-line summary */
  /* Today and Tomorrow show every task; This week and Later show CAP, the rest behind "Show N more" */
  const CAP = 5, TMR = addDays(TODAY, 1);
  const tmr = B.week.filter((t) => eff(t) === TMR), wk = B.week.filter((t) => eff(t) !== TMR);
  const nextOf = (a) => (a[0] ? `next <b>${esc(a[0].title)}</b>${eff(a[0]) ? ', ' + relDate(eff(a[0])) : ''}` : 'nothing here');
  const capped = (k, bucket, a, empty) => { const show = U.exp[k] ? a : a.slice(0, CAP);
    return `<div class="card">${a.length ? `<ul class="list" data-bucket="${bucket}">${rows(show)}</ul>${a.length > CAP ? `<button class="disc" data-act="exp" data-val="${k}" aria-expanded="${!!U.exp[k]}">${ic(U.exp[k] ? 'chevD' : 'chevR', 16)}${U.exp[k] ? 'Show fewer' : 'Show ' + (a.length - CAP) + ' more'}</button>` : ''}` : `<p class="empty">${empty}</p>`}</div>`; };
  const tomorrow = `<section class="sec t2 z-week" id="tomorrow">${secH('Tomorrow', '', 2, tmr.length)}<div class="card">${tmr.length ? `<ul class="list" data-bucket="week">${rows(tmr)}</ul>` : '<p class="empty">Nothing due tomorrow.</p>'}</div></section>`;
  const week = fold('week', 'This week', { z: 'z-week', ct: wk.length, sum: nextOf(wk), body: capped('week', 'week', wk, 'Nothing else this week.') });
  const lst = (k, a, o) => `<div class="card">${a.length ? `<ul class="list" data-bucket="${k}">${rows(a, o)}</ul>` : '<p class="empty">Nothing here.</p>'}</div>`;
  const more = fold('later', 'Later', { z: 'z-more', ct: B.later.length, sum: nextOf(B.later), body: capped('later', 'later', B.later, 'Nothing later.') })
    + fold('none', 'No date yet', { z: 'z-more', def: false, ct: B.none.length, sum: B.none[0] ? `<b>${esc(B.none[0].title)}</b>${B.none.length > 1 ? ` +${B.none.length - 1}` : ''}` : 'nothing here', body: lst('none', B.none) })
    + fold('done', 'Done today', { z: 'z-more', def: false, ct: doneToday.length, sum: doneToday[0] ? `last <b>${esc(doneToday[doneToday.length - 1].title)}</b>` : 'nothing finished yet', body: lst('done', doneToday, {}) });
  /* schedule shows only once a calendar snapshot exists */
  const tm = eventsOn(S.events, addDays(TODAY, 1));
  const schedule = S.calOK ? `<section class="sec t2 z-sched">${secH('Schedule', goLink('Month', 'plan'), 2)}${scheduleCard(TODAY, true)}
      <button class="link" data-act="tomorrow" aria-expanded="${U.showTomorrow}">${ic(U.showTomorrow ? 'chevD' : 'chevR', 16)} Tomorrow · ${plural(tm.ad.length + tm.tm.length, 'event')}</button>
      ${U.showTomorrow ? scheduleCard(addDays(TODAY, 1), false) : ''}</section>` : '';
  /* tier 3: at a glance. Each part shows only when its data exists; with none, the row is gone */
  const daysLeft = 7 - ((dow(TODAY) + 6) % 7);
  const hs = S.habits.map((h) => { const st = habitStats(h, S.sessions), need = h.floor - st.week; return { h, st, met: st.week >= h.target, low: need > 0 && daysLeft <= need + 2 }; });
  const hDone = hs.reduce((n, x) => n + Math.min(x.st.week, x.h.target), 0), hTot = S.habits.reduce((n, h) => n + h.target, 0);
  const wd = wed ? diffDays(TODAY, wed.date) : 0;
  const cells = [];
  if (w) cells.push(`<span><span class="k">Air</span><span class="v num">${vv(w.temp_f, '°')}</span><span class="s">${esc(String(w.condition || '').split(',')[0])}</span></span>`);
  if (sf) cells.push(`<span><span class="k">Surf</span><span class="v num">${vv(sf.wave_ft)}<small style="font-size:12px"> ft</small></span><span class="s">${sf.period_s ? esc(sf.period_s) + 's ' : ''}${esc(sf.direction || '')}</span></span>`);
  if (sf && sf.water_temp_f != null) cells.push(`<span><span class="k">Water</span><span class="v num">${vv(sf.water_temp_f, '°')}</span><span class="s">Local</span></span>`);
  if (nextTide) cells.push(`<span><span class="k">Tide</span><span class="v num">${esc(nextTide.type)}</span><span class="s">${esc(nextTide.time)}</span></span>`);
  const condGrid = cells.length ? `<button class="card cond" style="grid-template-columns:repeat(${cells.length},1fr)" data-act="go" data-to="life/hobbies" aria-label="Local conditions conditions. Open Hobbies for details.">${cells.join('')}</button>` : '';
  const wedRow = wed ? `<button class="wedrow" data-act="go" data-to="life/home" data-anchor="weddings"><b class="num">${wd}</b><span>days to ${esc(wed.title)}</span>${ic('chevR', 16)}</button>` : '';
  const sumBits = [];
  if (w && w.temp_f != null) sumBits.push(`${vv(w.temp_f, '°')}`);
  if (sf && sf.wave_ft != null) sumBits.push(`surf <b>${vv(sf.wave_ft)} ft</b>`);
  if (nextTide) sumBits.push(`${esc(nextTide.type.toLowerCase())} tide ${esc(nextTide.time)}`);
  if (wed) sumBits.push(`wedding ${wd}d`);
  const gw = labsHabits(hs, hDone, hTot, daysLeft);
  const amb = sumBits.length || condGrid ? fold('glance', 'At a glance', { tier: 3, def: false, z: 'z-amb', sum: sumBits.join(' · '), body: condGrid + wedRow }) : '';
  return `<div class="daystrip"><h2 class="sr" id="ltitle">${greeting()}, there. ${longDate(TODAY)}</h2><span class="greet" aria-hidden="true">${greeting()}, there.</span><span class="d">${dayLabel(TODAY)}</span><span class="sep">·</span>${sumHTML(sm)}</div>
    <div class="today"><div class="col a">${weekRings()}${labsOn() ? '<div class="labs-slot" data-labs="habitat"></div>' : ''}${gw || habitRings(hs, hDone, hTot, daysLeft)}${schedule}${amb}</div><div class="col b">${due}${sug}${tomorrow}${week}${more}</div></div>`;
}
/* Habit rings: one per habit, filling toward the weekly target. The dot on each ring is the floor that keeps the streak alive. */
const habitLast = {}; /* sessions this week per habit at the last render: a ring sweeps only when it grows */
function habitRings(hs, done, tot, daysLeft) {
  if (!hs.length) return '';
  const allTarget = hs.every((x) => x.met), allFloor = hs.every((x) => x.st.week >= x.h.floor);
  const lowN = hs.filter((x) => x.low).length;
  const msg = allTarget ? 'Perfect week. Every habit hit its target.'
    : allFloor ? 'Every streak is safe this week. The rest is bonus.'
    : lowN ? `${plural(lowN, 'streak')} need${lowN === 1 ? 's' : ''} a session in the next ${plural(daysLeft, 'day')}.`
    : 'Tap a habit to log a session.';
  const wc = dow(TODAY) === 1 || dow(TODAY) === 2 ? weekCheck() : null;
  const checkMsg = wc && wc.rows.length ? `Last week: ${wc.kept} of ${wc.rows.length} streaks kept${wc.reset ? `, ${wc.reset} reset` : ''}. ` : '';
  const tiles = hs.map(({ h, st, met, low }) => {
    let p = '';
    for (let i = 0; i < h.target; i++) p += `<i class="${i < st.week ? 'on' : ''}${i < h.floor ? ' fl' : ''}"></i>`;
    for (let i = h.target; i < st.week; i++) p += '<i class="bonus"></i>';
    const label = `Log a ${h.name} session today. ${st.week} of ${h.target} this week${met ? ', target hit' : st.week >= h.floor ? ', streak safe' : low ? ', streak at risk' : ''}. ${st.streak ? `${st.streak}-week streak.` : 'No streak yet.'}`;
    return `<li class="pt${met ? ' met' : ''}${low ? ' low' : ''}"><button class="ptb" data-act="log" data-id="${h.id}" aria-label="${esc(label)}"><span class="ptt"><span class="ptn">${esc(h.name.split(' ')[0])}</span>${flameBadge(st, low)}</span><span class="ptp" aria-hidden="true">${p}</span></button>
      <button class="hminus" data-act="unlog" data-id="${h.id}" aria-label="Remove a ${esc(h.name)} session from this week"${st.week ? '' : ' disabled'}>${ic('minus', 13)}</button></li>`;
  }).join('');
  const f = tot ? Math.min(done / tot, 1) : 0, C = 238.8;
  return `<section class="sec z-now habitsec">${secH('Habits', goLink('All', 'grow/habits'), 2, `${done}/${tot}`)}
    <div class="card hsc"><div class="hscore${f >= 1 ? ' full' : ''}" role="img" aria-label="Week score ${Math.round(f * 100)} percent, ${done} of ${tot} sessions"><svg viewBox="0 0 88 88" aria-hidden="true"><circle class="ht" cx="44" cy="44" r="38"/><circle class="ha" cx="44" cy="44" r="38" stroke-dasharray="${C}" stroke-dashoffset="${(C - C * f).toFixed(1)}" transform="rotate(-90 44 44)"/></svg><b class="num">${Math.round(f * 100)}%<small>this week</small></b></div>
    <ul class="pgrid">${tiles}</ul></div><p class="wmsg">${esc(checkMsg + msg)}</p></section>`;
}
/* Labs: the habits card as a garden. One plot per habit, full width above both columns; tap the plant (or +) to log,
   − to undo. Falls back to the rings card until the game state is ready. */
function labsHabits(hs, done, tot, daysLeft) {
  if (!labsOn() || !hs.length) return '';
  const g = labsGame(); if (!g) return '';
  const GD = LBGarden, by = Object.fromEntries(g.plots.map((p) => [p.key, p])), pz = U.pulse;
  const tiles = hs.map(({ h, st, met, low }) => {
    const anim = pz && !pz.used && pz.id === h.id && pz.w === st.week ? (pz.used = true, pz.d > 0 ? ' add' : ' sub') : '';
    const pl0 = by[h.key]; if (!pl0) return '';
    const pl = pl0, vis = GD.visual(pl);
    let p = '';
    const hot = anim ? (pz.d > 0 ? st.week - 1 : st.week) : -1;
    for (let i = 0; i < h.target; i++) p += `<i class="${i < st.week ? 'on' : ''}${i < h.floor ? ' fl' : ''}${i === hot ? ' hot' : ''}"></i>`;
    for (let i = h.target; i < st.week; i++) p += `<i class="bonus${i === hot ? ' hot' : ''}"></i>`;
    const status = pl.waiting ? 'Seed · goes in Monday'
      : !pl.alive ? 'Withered · new seed next season'
      : vis === 'wilt' ? `Thirsty · ${pl.need} more by Sunday`
      : pl.grows ? (pl.stage >= 4 ? (met ? 'In full bloom' : 'Blooming') : `Grows to ${GD.LABEL[pl.next].toLowerCase()} Monday`)
      : pl.stage === 0 ? `${plural(pl.need, 'session')} to sprout` : `${pl.need} more to grow`;
    const cls = !pl.alive || vis === 'wilt' ? ' warn' : pl.grows ? ' good' : '';
    const label = `Log a ${h.name} session today. ${st.week} of ${h.target} this week. Plant: ${GD.LABEL[vis].toLowerCase()}. ${status}.`;
    return `<li class="gt${met ? ' met' : ''}${low ? ' low' : ''}${anim}"><button class="gtp" data-act="log" data-id="${h.id}" aria-label="${esc(label)}">${GD.plotSVG(pl, 84)}</button>
      <div class="gtm"><span class="ptt"><span class="ptn">${esc(h.name)}</span>${flameBadge(st, low)}</span><span class="ptp" aria-hidden="true">${p}</span><span class="gts${cls}">${esc(status)}</span></div>
      <div class="gstep"><button class="gs-m" data-act="unlog" data-id="${h.id}" aria-label="Remove a ${esc(h.name)} session from this week"${st.week ? '' : ' disabled'}>${ic('minus', 15)}</button><span class="gs-n num" aria-hidden="true">${st.week}<small>/${h.target}</small></span><button class="gs-p" data-act="log" data-id="${h.id}" aria-label="Log a ${esc(h.name)} session today">${ic('plus', 17)}</button></div></li>`;
  }).join('');
  const lowN = hs.filter((x) => x.low).length;
  const wc = dow(TODAY) === 1 || dow(TODAY) === 2 ? weekCheck() : null, last = wc && wc.rows.length ? `Last week: ${wc.kept} of ${wc.rows.length} streaks kept${wc.reset ? `, ${wc.reset} reset` : ''}. ` : '';
  const msg0 = g.season.opens ? 'Sessions this week still count for streaks.' : hs.every((x) => x.met) ? 'Perfect week. Every plant is drinking its fill.' : hs.every((x) => x.st.week >= x.h.floor) ? 'Every plant grows on Monday. The rest is bonus.'
    : lowN ? `${plural(lowN, 'plant')} need${lowN === 1 ? 's' : ''} water in the next ${plural(daysLeft, 'day')}.` : 'Tap a plant to log a session. Meet the floor and it grows a stage on Monday.';
  const sea = g.season.opens ? `Season ${g.season.index + 1} starts Mon ${GD.fmt(g.season.opens)}` : `Season ${g.season.index + 1} · week ${g.season.week} of ${g.season.of}`;
  return `<section class="sec z-now habitsec">${secH('Habits', goLink('History', 'grow/habits'), 2, `${done}/${tot}`)}
    <div class="card gcard"><p class="gwh"><span>${esc(sea)}</span>${g.season.opens ? '' : `<span class="muted">ends ${GD.fmt(g.season.ends)}</span>`}</p><ul class="gtiles">${tiles}</ul></div><p class="wmsg">${esc(last + msg0)}</p></section>`;
}
/* streak badge: solid = safe this week, outlined = still needs the floor, red = at risk */
function flameBadge(st, low) {
  if (!st.streak) return '';
  return `<span class="flb num${st.pending ? (low ? ' risk' : ' pend') : ''}" title="${st.streak}-week streak${st.pending ? ', not safe yet this week' : ''}">${ic('flame', 11)}${st.streak}</span>`;
}
/* Week of rings: tasks finished per day over the last seven days. A ring closes at RING_GOAL; today fills live. */
const RING_GOAL = 3;
let ringLast = null; /* today's count at the last render: the ring sweeps only when it grows */
/* completion step for ring color: p1 under a third, p2 under two thirds, p3 almost there, p4 done */
const ringStep = (f) => (f >= 1 ? 'p4' : f >= 2 / 3 ? 'p3' : f >= 1 / 3 ? 'p2' : 'p1');
function weekRings() {
  const counts = {};
  S.tasks.forEach((t) => { if (t.done && t.doneAt) { const d = LB.laDateOf(t.doneAt); counts[d] = (counts[d] || 0) + 1; } });
  const C = 100.5, days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(TODAY, -i));
  const lastFull = days.slice(0, 6).reverse().find((d) => (counts[d] || 0) >= RING_GOAL);
  const n0 = counts[TODAY] || 0, left = Math.max(0, RING_GOAL - n0);
  const grew = ringLast != null && n0 > ringLast; ringLast = n0;
  const msg = !left ? `Today's ring is closed. That's ${n0 >= RING_GOAL + 2 ? 'a big' : 'a full'} day.`
    : n0 ? `${left} more to close today's ring.`
    : `Finish ${RING_GOAL} today to close the ring.${lastFull ? ` Last full one: ${diffDays(lastFull, TODAY) === 1 ? 'yesterday' : WD[dow(lastFull)]}.` : ''}`;
  const cells = days.map((d) => {
    const n = counts[d] || 0, f = Math.min(n / RING_GOAL, 1), today = d === TODAY, full = f >= 1;
    return `<li class="wr ${ringStep(f)}${today ? ' now' : ''}${today && grew ? ' grew' : ''}${full ? ' full' : ''}"><span class="wl">${today ? 'Today' : WD3[dow(d)]}</span>
      <span class="wc"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="wt" cx="20" cy="20" r="16"/><circle class="wa" cx="20" cy="20" r="16" stroke-dasharray="${C}" stroke-dashoffset="${(C - C * f).toFixed(1)}" transform="rotate(-90 20 20)"/></svg><b class="num">${n}</b></span>
      <span class="sr">${plural(n, 'task')} done${full ? ', ring closed' : ''}</span></li>`;
  }).join('');
  return `<section class="sec z-now" aria-label="Tasks finished, last seven days"><div class="card rings"><ol class="wrow">${cells}</ol><p class="wmsg">${esc(msg)}</p></div></section>`;
}

/* Schedule (graft from Daily paper): live Now line, proportional free gaps, past fades and shrinks */
function scheduleCard(day, isToday) {
  const { ad, tm } = eventsOn(S.events, day), nm = isToday ? nowMins() : -1;
  if (!S.calOK) return `<div class="card"><p class="empty">Your calendar hasn't synced yet. Events show here once a calendar copy is saved.</p></div>`;
  if (!ad.length && !tm.length) return `<div class="card"><p class="empty">Nothing on the calendar. ${isToday ? 'Wide open.' : ''}</p></div>`;
  const rows = []; let placed = !isToday;
  const nowRow = () => { placed = true; return `<div class="nowline" role="note" aria-label="Now, ${minLabel(nm)}"><span class="t num">${minLabel(nm)}</span><span class="dot"></span><span class="ln"></span></div>`; };
  const gapRow = (a, b, past) => `<div class="gap${past ? ' past' : ''}" style="--h:${past ? 12 : Math.round(Math.min(84, Math.max(32, (b - a) * 0.35)))}px"><span></span><span class="bar-c"></span><span class="gl">${past ? `<span class="sr">Free ${minLabel(a)} to ${minLabel(b)}, passed</span>` : `<b class="num">${durLabel(b - a)}</b> free, ${minLabel(a, (a < 720) !== (b < 720))}–${minLabel(b)}`}</span></div>`;
  const pushGap = (a, b) => {
    if (b - a < 45) return;
    if (!placed && nm >= a && nm < b) { rows.push(gapRow(a, nm, true)); rows.push(nowRow()); if (b - nm >= 30) rows.push(gapRow(nm, b, false)); return; }
    rows.push(gapRow(a, b, isToday && b <= nm));
  };
  let cur = Math.min(480, tm.length ? tm[0].s : 480);
  if (!placed && nm < cur) rows.push(nowRow());
  tm.forEach((e) => {
    pushGap(cur, e.s);
    if (!placed && nm < e.s) rows.push(nowRow());
    const isNow = isToday && nm >= e.s && nm < e.e, past = isToday && nm >= e.e;
    if (isNow) placed = true;
    rows.push(`<div class="ev${isNow ? ' now' : past ? ' past' : ''}" style="--c:${evColor(e)}"><span class="t num">${minLabel(e.s)}<span>${minLabel(e.e)}</span></span><span class="bar-c"></span>
      <span><span class="et">${esc(e.title)} ${isNow ? '<span class="chip hot">Now</span>' : past ? '<span class="sr">(finished)</span>' : ''}</span><span class="es" style="display:block">${durLabel(e.e - e.s)}${e.loc ? ' · ' + esc(e.loc) : ''}${e.cal ? ' · ' + esc(e.cal) : ''}</span></span></div>`);
    cur = Math.max(cur, e.e);
  });
  if (cur < 1080) pushGap(cur, 1080);
  if (!placed) rows.push(nowRow());
  return `<div class="card">${ad.length ? `<div class="allday">${ad.map((e) => `<span class="adchip" style="--c:${evColor(e)}">${esc(e.title)}</span>`).join('')}</div>` : ''}${rows.join('')}</div>`;
}

/* ---------- Plan (calendar) ---------- */
function viewPlan() {
  const first = toD(U.calMonth), y = first.getFullYear(), m = first.getMonth();
  const start = addDays(U.calMonth, -((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = cells[35] && toD(cells[35]).getMonth() !== m ? 35 : 42;
  const sel = U.calSel, { ad, tm } = eventsOn(S.events, sel);
  const dayTasks = S.tasks.filter((t) => !t.done && eff(t) === sel);
  return `${phead('plan', 'calendar', 'Plan', 'Your month, and what lands on each day.')}
    <div class="split"><div class="col"><section class="sec" style="margin-top:6px"><div class="card pad">
      <div class="cal-h"><button class="iconbtn" data-act="cal" data-dir="-1" aria-label="Previous month">${ic('chevL')}</button><h3 aria-live="polite">${MONTHS[m]} ${y}</h3><button class="iconbtn" data-act="cal" data-dir="1" aria-label="Next month">${ic('chevR')}</button></div>
      <div class="grid7" role="grid" aria-label="${MONTHS[m]} ${y}">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<span class="wdh" aria-hidden="true">${d}</span>`).join('')}
      ${cells.slice(0, weeks).map((d) => { const x = eventsOn(S.events, d), n = x.ad.length + x.tm.length, tk = S.tasks.some((t) => !t.done && eff(t) === d);
        const dots = [...x.ad, ...x.tm].slice(0, 3).map((e) => `<i style="--c:${evColor(e)}"></i>`).join('') + (tk ? '<i style="--c:var(--accent)"></i>' : '');
        return `<button class="day${toD(d).getMonth() !== m ? ' out' : ''}${d === TODAY ? ' today' : ''}" data-act="day" data-d="${d}" aria-pressed="${d === sel}" aria-label="${longDate(d)}${n ? ', ' + plural(n, 'event') : ''}${tk ? ', tasks due' : ''}"><span class="num">${toD(d).getDate()}</span><span class="dd">${dots}</span></button>`; }).join('')}</div>
      <div class="legend" style="margin-top:12px">${[...new Map(S.events.map((e) => [e.cal || 'Calendar', evColor(e)])).entries()].slice(0, 6).map(([k, c]) => `<span><i style="background:${c};border-radius:50%"></i>${esc(k)}</span>`).join('')}<span><i style="background:var(--accent);border-radius:50%"></i>Task due</span></div>
    </div></section></div>
    <div class="col"><section class="sec">${secH(sel === TODAY ? 'Today' : relDate(sel) === WD[dow(sel)] || /^(Tomorrow|Yesterday)$/.test(relDate(sel)) ? relDate(sel) : shortDate(sel), `<span class="small muted">${longDate(sel)}</span>`)}
      ${scheduleCard(sel, sel === TODAY)}
      <div class="group-l" style="margin-top:14px">Tasks on this day <span class="ct num">${dayTasks.length}</span></div>
      ${dayTasks.length ? `<div class="card"><ul class="list">${dayTasks.map((t) => taskRow(t)).join('')}</ul></div>` : `<p class="empty tiny" style="padding:2px 4px">No tasks land here. The + button adds one on ${shortDate(sel)}.</p>`}
    </section></div></div>`;
}

/* ---------- Lists ---------- */
function listCount(k) {
  if (k === 'groceries') return S.groceries.filter((g) => !g.done).length;
  if (k === 'wish') return S.wish.filter((w) => w.status === 'waiting').length;
  if (k === 'recipes') return S.recipes.filter((r) => !r.cooked).length;
  if (k === 'gifts') return S.gifts.filter((g) => !g.done).length;
  return (S.lists[k] || []).filter((x) => !x.done).length;
}
function viewLists() {
  const defs = listDefs();
  if (!defs.some((l) => l.key === U.list)) U.list = 'groceries';
  const def = defs.find((l) => l.key === U.list);
  let body = '';
  if (U.list === 'groceries') {
    const gm = sortOf('groceries'), open = S.groceries.filter((g) => !g.done), got = sortBy(S.groceries.filter((g) => g.done), gm, (g) => g.name);
    const groups = gm === 'aisle' ? GROC_SECS.filter((sec) => open.some((g) => g.sec === sec)).map((sec) => `<div class="group-l">${sec} <span class="ct num">${open.filter((g) => g.sec === sec).length}</span></div><div class="card"><ul class="list">${open.filter((g) => g.sec === sec).map((g) => itemRow(g, 'groc')).join('')}</ul></div>`).join('') : open.length ? `<div class="card"><ul class="list">${sortBy(open, gm, (g) => g.name).map((g) => itemRow(g, 'groc')).join('')}</ul></div>` : '';
    body = `<form class="qa" data-form="groc"><label class="sr" for="qaG">Add to groceries</label><input id="qaG" name="name" placeholder="Add an item, e.g. limes" autocomplete="off" enterkeyhint="done"><button class="btn primary" type="submit" aria-label="Add to groceries">${ic('plus', 20)}</button></form>
      ${S.groceries.length ? sortCtl('groceries', 'groceries') : ''}
      ${groups || `<div class="card"><p class="empty">${got.length ? 'Everything is in the cart.' : 'The list is empty. Add what you need above.'}</p></div>`}
      ${got.length ? `<div class="group-l" style="justify-content:space-between">In the cart · ${got.length}<button class="link" data-act="groc-clear">Clear</button></div><div class="card"><ul class="list">${got.map((g) => itemRow(g, 'groc')).join('')}</ul></div>` : ''}`;
  } else if (U.list === 'wish') {
    const wm = sortOf('wish'), TK = Object.keys(TAGS), pr = (w) => { const n = parseFloat(String(w.price || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 1e12 : n; };
    const ready = (a, b) => { const A = buyCalc(a), B2 = buyCalc(b); return (B2.isReady - A.isReady) || ((A.left ?? 1e9) - (B2.left ?? 1e9)); };
    const waiting = S.wish.filter((w) => w.status === 'waiting');
    const wl = waiting.filter((w) => U.wishFilter === 'all' || w.tag === U.wishFilter);
    const items = wm === 'new' ? wl.slice().reverse() : wm === 'tag' ? wl.slice().sort((a, b) => TK.indexOf(a.tag) - TK.indexOf(b.tag) || ready(a, b)) : wm === 'price' ? wl.slice().sort((a, b) => pr(a) - pr(b) || ready(a, b)) : wl.slice().sort(ready);
    const fin = (st, label) => { const l = S.wish.filter((w) => w.status === st); return l.length ? fold('wish-' + st, label, { def: false, ct: l.length, sum: l.slice(0, 3).map((w) => esc(w.name)).join(', '), body: `<div class="card"><ul class="list">${l.map((w) => `<li class="item done" style="grid-template-columns:1fr auto"><span class="tmain" style="padding-left:4px"><span class="ttl">${extLink(w.url, esc(w.name))}</span></span><button class="btn sm ghost" data-act="wish-back" data-id="${w.id}">Put back</button></li>`).join('')}</ul></div>` }) : ''; };
    body = `<p class="small muted" style="margin:0 4px 10px">A cooling-off timer for wants. <b>Need</b> is ready now, <b>Love</b> waits 7 days, <b>Like</b> 30, <b>One day</b> has no timer. Ready means it has settled, not that it's approved.</p>
      ${waiting.length ? `<div class="scroller" role="group" aria-label="Filter by tag">${[['all', 'All'], ...Object.entries(TAGS).map(([k, t]) => [k, t.label])].map(([k, l]) => `<button class="seg" data-act="wish-filter" data-val="${k}" aria-pressed="${U.wishFilter === k}">${l}</button>`).join('')}</div>
      <div style="margin-top:6px">${sortCtl('wish', 'wish list')}</div>` : ''}
      <div class="card">${items.length ? `<ul class="list">${items.map((w) => { const c = buyCalc(w), open = U.open === w.id; return `<li class="item" style="grid-template-columns:1fr auto">
        <button class="tmain" data-act="expand" data-id="${w.id}" aria-expanded="${open}" style="padding-left:4px"><span class="ttl">${esc(w.name)}</span><span class="tmeta"><span class="chip${c.isReady ? ' hot' : ''}">${TAGS[w.tag].label}</span>${w.price ? `<span class="m num">${esc(w.price)}</span>` : ''}<span class="m${c.isReady ? ' hot' : ''}">${c.days == null ? 'No timer' : c.isReady ? 'Ready' : `${plural(c.left, 'day')} to settle`}</span></span>${c.days ? `<span class="timer-bar" aria-hidden="true"><i style="width:${Math.round(c.pct * 100)}%"></i></span>` : ''}</button>
        <button class="btn sm" data-act="wish-bought" data-id="${w.id}">Bought</button>
        ${open ? `<div class="tray" style="grid-column:1/-1">${w.notes ? `<p class="small muted" style="width:100%;margin:0">${esc(w.notes)}</p>` : ''}${safeUrl(w.url) ? `<p class="small" style="width:100%;margin:0">${extLink(w.url, 'Open link')}</p>` : ''}<span class="small muted" style="width:100%">Change tag (restarts the timer):</span>${Object.entries(TAGS).map(([k, t]) => `<button class="seg" data-act="wish-tag" data-id="${w.id}" data-val="${k}" aria-pressed="${w.tag === k}">${t.label}</button>`).join('')}<button class="btn sm" data-act="wish-drop" data-id="${w.id}">Drop it</button><button class="btn sm ghost" data-act="wish-del" data-id="${w.id}">${ic('trash', 18)}Delete</button></div>` : ''}
      </li>`; }).join('')}</ul>` : `<p class="empty">${waiting.length ? 'Nothing with that tag.' : 'Nothing waiting. The + button adds a want with a tag.'}</p>`}</div>
      ${fin('bought', 'Bought')}${fin('dropped', 'Dropped')}`;
  } else if (U.list === 'recipes') {
    const have = new Set(S.groceries.filter((g) => !g.done).map((g) => g.name.toLowerCase()));
    const planned = sortBy(S.recipes.filter((r) => !r.cooked), sortOf('recipes'), (r) => r.name), cooked = S.recipes.filter((r) => r.cooked).sort((a, b) => (b.cookedAt || 0) - (a.cookedAt || 0));
    const card = (r) => { const missing = r.ingredients.filter((i) => !have.has(i.toLowerCase())); const meta = [r.time, r.mood, r.ingredients.join(', ')].filter(Boolean).map(esc).join(' · '); return `<div class="recipe">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h4>${extLink(r.url, esc(r.name))}</h4>${meta ? `<p class="small muted" style="margin:2px 0 0">${meta}</p>` : ''}${r.notes ? `<p class="small" style="margin:2px 0 0">${esc(r.notes)}</p>` : ''}</div>
      <button class="tick" data-act="recipe-cooked" data-id="${r.id}" aria-pressed="${r.cooked}" aria-label="${r.cooked ? 'Plan again' : 'Cooked, archive'}: ${esc(r.name)}"><span class="ring">${ic('check', 16)}</span></button></div>
      ${!r.cooked && r.ingredients.length ? `<button class="btn sm" style="margin-top:8px" data-act="recipe-add" data-id="${r.id}" ${missing.length ? '' : 'disabled'}>${ic('cart', 18)}${missing.length ? `Add ${plural(missing.length, 'ingredient')} to groceries` : 'All on the grocery list'}</button>` : ''}</div>`; };
    body = `<p class="small muted" style="margin:0 4px 10px">This week's cooking. Tick one when it's cooked and it moves to the archive.</p>${planned.length > 1 ? sortCtl('recipes', 'recipes') : ''}
      <div class="card">${planned.length ? planned.map(card).join('') : '<p class="empty">No recipes planned. The + button adds one.</p>'}</div>
      ${cooked.length ? fold('cooked', 'Cooked', { def: false, ct: cooked.length, sum: cooked.slice(0, 3).map((r) => esc(r.name)).join(', '), body: `<div class="card">${cooked.map(card).join('')}</div>` }) : ''}`;
  } else if (U.list === 'gifts') {
    const people = [...new Set(S.gifts.map((g) => g.person))].sort(), gmode = sortOf('gifts');
    const giftLi = (g, who) => `<li class="item${g.done ? ' done' : ''}"><button class="tick" data-act="gift-toggle" data-id="${g.id}" aria-pressed="${g.done}" aria-label="${g.done ? 'Given' : 'Mark given'}: ${esc(g.idea || g.person)}"><span class="ring">${ic('check', 16)}</span></button><span class="tmain"><span class="ttl">${extLink(g.url, esc(g.idea || '(no idea yet)'))}</span>${who ? `<span class="tmeta"><span class="m">${esc(g.person)}</span></span>` : ''}</span><button class="act" data-act="gift-del" data-id="${g.id}" aria-label="Remove ${esc(g.idea || g.person)}">${ic('x', 18)}</button></li>`;
    body = !S.gifts.length ? '<div class="card"><p class="empty">No gift ideas yet. The + button adds one for someone.</p></div>'
      : sortCtl('gifts', 'gifts') + (gmode === 'new' ? `<div class="card"><ul class="list">${S.gifts.slice().reverse().map((g) => giftLi(g, true)).join('')}</ul></div>` : people.map((p) => `<div class="group-l">${esc(p)}</div><div class="card"><ul class="list">${S.gifts.filter((g) => g.person === p).map((g) => giftLi(g, false)).join('')}</ul></div>`).join(''));
  } else {
    const items = S.lists[U.list] || [], lm = sortOf(U.list), open = sortBy(items.filter((x) => !x.done), lm, (x) => x.name), done = sortBy(items.filter((x) => x.done), lm, (x) => x.name);
    body = `${items.length ? sortCtl(U.list, def.title.toLowerCase()) : ''}<div class="card">${open.length ? `<ul class="list">${open.map((x) => itemRow(x, 'li', def)).join('')}</ul>` : `<p class="empty">${items.length ? 'All caught up.' : 'Nothing here yet. The + button adds one.'}</p>`}</div>
      ${done.length ? `<div class="group-l">${esc(def.done)} · ${done.length}</div><div class="card"><ul class="list">${done.map((x) => itemRow(x, 'li', def)).join('')}</ul></div>` : ''}`;
  }
  return `${phead('lists', def.icon, 'Lists', 'Shopping, wants, food, gifts and everything to read or watch.')}
    <div class="lsplit"><div class="scroller" role="tablist" aria-label="Lists">${defs.map((l) => `<button class="seg sub k-lists" role="tab" data-act="list" data-val="${esc(l.key)}" aria-selected="${U.list === l.key}">${ic(l.icon, 17)}${esc(l.title)} <span class="ct num">${listCount(l.key)}</span></button>`).join('')}</div>
    <section class="sec flow" style="margin-top:8px" role="tabpanel" aria-label="${esc(def.title)}">${body}</section></div>`;
}
function itemRow(x, kind, def) {
  const label = kind === 'groc' ? (x.done ? 'In cart' : 'Got it') : x.done ? 'Not ' + def.done.toLowerCase() : 'Mark ' + def.done.toLowerCase();
  const meta = [x.by ? esc(x.by) : '', x.notes ? esc(x.notes) : ''].filter(Boolean).join(' · ');
  return `<li class="item${x.done ? ' done' : ''}"><button class="tick" data-act="${kind}-toggle" data-id="${x.id}" aria-pressed="${x.done}" aria-label="${label}: ${esc(x.name)}"><span class="ring">${ic('check', 16)}</span></button>
    <span class="tmain"><span class="ttl">${extLink(x.url, esc(x.name))}</span>${meta ? `<span class="tmeta"><span class="m">${meta}</span></span>` : ''}</span>
    <button class="act" data-act="${kind}-del" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">${ic('x', 18)}</button></li>`;
}

/* ---------- Life ---------- */
function checklist(title, intro, keys, steps, weekKey) {
  const on = (k) => { const c = S.checks[k]; return !!(c && c.value && (!weekKey || c.week === weekKey)); };
  const n = keys.filter(on).length;
  return `<div class="card pad"><h4 style="margin:0;font-size:17px">${title}</h4><p class="small muted" style="margin:4px 0 12px">${intro}</p>
    <div style="display:flex;align-items:center;gap:10px"><div class="bar-meter" style="flex:1" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${n}" aria-label="${title} progress"><i style="width:${(n / steps.length) * 100}%"></i></div><span class="small num">${n}/${steps.length}</span></div>
    <ul class="list steps" style="margin-top:6px">${steps.map((s, i) => { const k = keys[i], v = on(k); return `<li class="item${v ? ' done' : ''}" style="grid-template-columns:44px 1fr"><button class="tick" data-act="check" data-key="${k}" data-week="${weekKey || ''}" aria-pressed="${v}" aria-label="Step ${i + 1}: ${esc(s)}"><span class="ring">${ic('check', 16)}</span></button><span class="tmain"><span class="ttl" style="font-weight:400">${i + 1}. ${esc(s)}</span></span></li>`; }).join('')}</ul></div>`;
}
function viewLife() {
  let body = '';
  if (U.life === 'health') {
    const breaks = S.logs.filter((l) => l.kind === 'break' && l.date === TODAY).length;
    const lastOf = (k) => S.logs.filter((l) => l.kind === k && l.date === TODAY).slice(-1)[0];
    const lp = lastOf('parts'), lb = lastOf('blended');
    const PARTS = ['The pusher', 'The worrier', 'The tired one', 'The critic', 'A calmer part'];
    const BLEND = [['Blended', 'Name the part that has the wheel, and notice your feet on the floor.'], ['Noticing it', 'Noticing is the gap. That already counts.'], ['A bit of space', 'Hold onto that space, and take a short break while you have it.']];
    const t = U.timer, left = t.end ? Math.max(0, Math.ceil((t.end - Date.now()) / 1000)) : t.len * 60;
    body = `<section class="sec">${secH('Health tasks')}${groupTasks((x) => x.group === 'Health', 'No health tasks open.')}</section>
      <section class="sec">${checklist('Appointments, in small steps', "Not one big scary task. Step 1 alone counts as progress, and there's no calling yet.", ['appt-1', 'appt-2', 'appt-3', 'appt-4'], ['List what you need: the type of appointment and what it’s for.', 'Find the number or portal for each one.', 'Book just the first one.', 'Add it to your calendar and file the confirmation.'])}
        <button class="link" data-act="script" aria-expanded="${U.script}" style="margin-top:4px">${ic(U.script ? 'chevD' : 'chevR', 16)} ${U.script ? 'Hide' : 'Show'} the call script</button>
        ${U.script ? `<div class="callout"><p style="margin:0">"Hi, I'd like to book an appointment with <b>[doctor type or name]</b>. It's for <b>[one-line reason]</b>. I'm usually free <b>[your availability]</b>. What's the earliest opening? Is there anything I should bring?"</p><p class="muted small" style="margin:8px 0 0">If something isn't handy: "Could you give me a direct number or the patient portal link so I can book that way?"</p></div>` : ''}</section>
      <section class="sec">${secH('Break timer', `<span class="small muted num">${plural(breaks, 'break')} today</span>`)}<div class="card pad">
        <div class="kinds" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Break length">${[2, 5, 10].map((n) => `<button data-act="timer-len" data-val="${n}" aria-pressed="${t.len === n}" ${t.end ? 'disabled' : ''}>${n} min</button>`).join('')}</div>
        <div class="timer" id="timerOut" aria-live="off" role="timer">${Math.floor(left / 60)}:${pad(left % 60)}</div>
        ${t.end ? '<p class="small muted" style="text-align:center;margin:-6px 0 12px">Stretch, breathe, look out a window. No fixing required.</p>' : ''}
        <div class="row-btns" style="justify-content:center">${t.end ? '<button class="btn" data-act="timer-end">End early</button>' : '<button class="btn primary" data-act="timer-start" style="min-width:140px">Start</button>'}<button class="btn ghost" data-act="timer-log">Already took one, log it</button></div>
        ${t.msg ? `<p class="small muted" style="text-align:center;margin:10px 0 0" role="status">${esc(t.msg)}</p>` : ''}
      </div></section>
      <section class="sec">${secH('Check in')}<div class="card pad">
        <h4 style="margin:0 0 8px;font-size:16px">Which part is loudest right now?</h4>
        <div class="row-btns">${PARTS.map((p) => `<button class="seg" data-act="part" data-val="${p}" aria-pressed="${!!lp && lp.label === p}">${p}</button>`).join('')}</div>
        ${lp ? `<p class="small muted" style="margin:8px 0 0">Last check-in: <b>${esc(lp.label)}</b> ${lp.at ? 'at ' + new Intl.DateTimeFormat('en-US', { timeZone: LB.TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(lp.at)) : 'today'}. No fixing required.</p>` : ''}
        <h4 style="margin:18px 0 8px;font-size:16px">How blended with work?</h4>
        <div class="row-btns">${BLEND.map(([b]) => `<button class="seg" data-act="blend" data-val="${b}" aria-pressed="${!!lb && lb.label === b}">${b}</button>`).join('')}</div>
        ${lb ? `<p class="small" style="margin:8px 0 0">${(BLEND.find((x) => x[0] === lb.label) || [])[1]}</p>` : ''}
        <p class="small muted" style="margin:16px 0 0">End of day: close the tabs, write tomorrow's one top thing, log off.</p>
      </div></section>`;
  } else if (U.life === 'money') {
    const wk = mondayOf(TODAY);
    const bills = S.tasks.filter((t) => !t.done && t.group === 'Money' && t.rule).sort(byDate);
    body = `<section class="sec">${checklist('The 10-minute money check', 'Once a week, just these three. The point is knowing where you stand, not a budget lecture. Ticks clear each Monday.', ['fin-1', 'fin-2', 'fin-3'], ['Check balances.', 'List upcoming bills.', 'Pick one thing to sort.'], wk)}</section>
      <section class="sec">${secH('Coming up', `<span class="small muted">${plural(bills.length, 'reminder')}</span>`)}<div class="card">${bills.length ? bills.map((b) => `<div class="kv"><span>${ic('repeat', 16)} ${esc(b.title)}</span><span class="num ${tstate(b).overdue ? 'tmeta' : 'muted'}" style="margin:0"><span class="${tstate(b).overdue || eff(b) === TODAY ? 'hot' : ''}">${relDate(eff(b))}</span></span></div>`).join('') : '<p class="empty">No recurring money reminders.</p>'}</div></section>
      <section class="sec">${secH('Money tasks')}${groupTasks((x) => x.group === 'Money', 'No money tasks open.')}</section>`;
  } else if (U.life === 'home') {
    const terms = S.weddings.flatMap((w) => w.match.length ? w.match : [w.title.split("'")[0]]).map((x) => x.toLowerCase().trim()).filter(Boolean).concat(['wedding']);
    const isWed = (t) => t.group === 'Social' && terms.some((s) => t.title.toLowerCase().includes(s));
    const pf = U.petFilter;
    const petMatch = (t) => pf === 'all' || t.title.toLowerCase().includes(pf) || (/\band\b/.test(t.title) && t.title.toLowerCase().includes(pf));
    body = (S.weddings.length ? `<section class="sec" id="weddings">${secH('Weddings')}<div class="cards2">${S.weddings.map((w) => { const n = diffDays(TODAY, w.date); return `<div class="card pad hcard"><div class="wcard"><span class="stat num">${n >= 0 ? n : '✓'}</span><span class="small muted">${n === 0 ? 'Today!' : n > 0 ? 'days to go' : 'Celebrated'}</span><h4 style="margin:0;font-size:17px">${esc(w.title)}</h4></div>
        <p class="small" style="margin:10px 0 0">${longDate(w.date)}${w.where ? ' · ' + esc(w.where) : ''}</p>${w.gift ? `<p class="small muted" style="margin:4px 0 0">Gift: ${esc(w.gift)}</p>` : ''}</div>`; }).join('')}</div>
        <div class="group-l">Wedding tasks</div>${groupTasks(isWed, 'No wedding tasks open.')}</section>` : '')
      + `      <section class="sec">${secH('Home')}${groupTasks((t) => t.group === 'Home', 'No home tasks open.')}</section>
      <section class="sec">${secH('Pets')}<div class="scroller" role="group" aria-label="Filter pets" style="margin-bottom:10px">${[['all', 'All pets'], ['biscuit', 'Biscuit'], ['pepper', 'Pepper']].map(([k, l]) => `<button class="seg" data-act="pet" data-val="${k}" aria-pressed="${pf === k}">${ic(k === 'pepper' ? 'cat' : k === 'biscuit' ? 'dog' : 'paw', 17)}${l}</button>`).join('')}</div>
        ${groupTasks((t) => t.group === 'Pets' && petMatch(t), pf === 'all' ? 'No pet tasks open.' : 'Nothing open for ' + (pf === 'biscuit' ? 'Biscuit' : 'Pepper') + '.')}</section>
      <section class="sec">${secH('Personal')}${groupTasks((t) => t.group === 'Personal', 'No personal tasks open.')}</section>`;
  } else {
    const C = S.cond, w = C && C.w, sf = C && C.s;
    const outside = S.habits.filter((h) => ['surfing', 'running'].includes(h.key) || /surf|run/i.test(h.name));
    const climbs = S.goals.filter((g) => g.cat === 'Climbing' && !g.done);
    const q = Math.ceil(+TODAY.slice(5, 7) / 3);
    const upd = C && C.at ? `<span class="tiny muted">Updated ${new Intl.DateTimeFormat('en-US', { timeZone: LB.TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(C.at))}${LB.laDateOf(C.at) !== TODAY ? ' on ' + shortDate(LB.laDateOf(C.at)) : ''}</span>` : '';
    const wxCard = w ? `<div class="card pad"><span class="group-l" style="margin:0 0 4px">Weather</span><div class="stat num">${vv(w.temp_f, '°')}</div><p class="small" style="margin:4px 0 8px">${esc(w.condition || '')}<br><span class="muted">Feels ${vv(w.feels_like_f, '°')} · H ${vv(w.high_f, '°')} L ${vv(w.low_f, '°')}</span></p>
          <div class="kv small"><span class="muted">Wind</span><span class="num">${vv(w.wind_mph, ' mph')} ${esc(w.wind_dir || '')}${w.gust_mph != null ? `, gusts ${esc(w.gust_mph)}` : ''}</span></div><div class="kv small"><span class="muted">Sun</span><span class="num">${vv(w.sunrise)} – ${vv(w.sunset)}</span></div><div class="kv small"><span class="muted">UV · Rain</span><span class="num">${vv(w.uv_max)} · ${vv(w.rain_chance, '%')}</span></div></div>` : '';
    const surfCard = sf ? `<div class="card pad"><span class="group-l" style="margin:0 0 4px">Surf</span><div class="stat num">${vv(sf.wave_ft)}<small style="font-size:18px"> ft</small></div><p class="small" style="margin:4px 0 8px">${sf.period_s ? esc(sf.period_s) + 's ' : ''}${esc(sf.direction || '')}<br><span class="muted">Water ${vv(sf.water_temp_f, '°')}</span></p>
          <div class="kv small"><span class="muted">Swell</span><span class="num">${vv(sf.swell_ft, ' ft')} @ ${vv(sf.swell_period_s, 's')}</span></div><div class="kv small"><span class="muted">Wind</span><span>${vv(sf.wind)}</span></div>${Array.isArray(sf.sessions) && sf.sessions.length ? `<div class="kv small"><span class="muted">Today</span><span class="num">${sf.sessions.map((x) => esc((x && x.label) || '') + ' ' + vv(x && x.wave_ft)).join(' · ')}</span></div>` : ''}</div>` : '';
    const fc = w && Array.isArray(w.forecast) ? w.forecast.filter(Boolean) : [];
    const conds = C && (w || sf || C.tides.length) ? `<section class="sec">${secH('Local conditions', upd)}${wxCard || surfCard ? `<div class="wx"${wxCard && surfCard ? '' : ' style="grid-template-columns:1fr"'}>${wxCard}${surfCard}</div>` : ''}
      ${C.tides.length ? `<div class="card" style="margin-top:8px">${C.tides.map((t) => `<div class="kv"><b>${esc(t.type)} tide</b><span class="num muted">${vv(t.ft, ' ft')}</span><span class="num">${esc(t.time)}</span></div>`).join('')}</div>` : ''}
      ${fc.length ? `<div class="card" style="margin-top:8px">${fc.map((f) => `<div class="kv"><b>${esc(f.day || '')}</b><span class="muted">${esc(f.condition || '')}</span><span class="num">${vv(f.high_f, '°')} / ${vv(f.low_f, '°')}</span></div>`).join('')}</div>` : ''}
      <p class="tiny muted" style="margin:8px 4px 0">Open-Meteo forecast and marine swell, NOAA tides station 9410170.</p></section>`
      : `<section class="sec">${secH('Local conditions')}<div class="card"><p class="empty">No conditions report yet. Weather, surf and tides show here once a report is saved. Nothing is guessed.</p></div></section>`;
    body = `${conds}
      <section class="sec">${secH('Climbing & recovery', goLink('Goals', 'grow/goals'))}<div class="card">${climbs.length ? climbs.map((g) => `<div class="kv" style="align-items:flex-start;padding:10px 0"><span>${ic('mountain', 18)} <b>${esc(g.title)}</b><br><span class="small muted">Q${q}: ${esc(g.q[q - 1] || 'No note yet')}</span></span></div>`).join('') : '<p class="empty">No active climbing goals.</p>'}
        <p class="small muted" style="margin:0;padding:0 0 10px">Recovery work (massage, mobility) lives in Health as tasks.</p></div></section>
      <section class="sec">${secH('Time outside')}${outside.length ? `<div class="hgrid" style="grid-template-columns:1fr 1fr">${outside.map((h) => { const st = habitStats(h, S.sessions); return `<div class="htile"><span class="hn">${ic(h.icon, 17)}<span>${esc(h.name)}</span></span><button class="logbtn" data-act="log" data-id="${h.id}" aria-label="Log a ${esc(h.name)} session today">${ic('plus', 20)}</button><span class="hc num">${st.month}<small> this month</small></span><span class="streak">${st.week}/${h.target} this week</span></div>`; }).join('')}</div>` : '<div class="card"><p class="empty">No surfing or running habit yet. Add one in Grow → Habits.</p></div>'}
        <p class="small muted" style="margin:10px 4px 0">Dog-beach days with Biscuit are tasks in Home & Pets.</p></section>`;
  }
  const lf = LIFE.find((x) => x[0] === U.life);
  return `${phead(U.life, lf[2], 'Life', 'Health, money, home, pets and the fun stuff.')}
    <div class="lsplit"><div class="scroller" role="tablist" aria-label="Life areas">${LIFE.map(([k, l, i]) => `<button class="seg sub k-${k}" role="tab" data-act="life" data-val="${k}" aria-selected="${U.life === k}">${ic(i, 17)}${l}</button>`).join('')}</div>
    <div class="flow" style="margin-top:6px" role="tabpanel" aria-label="${LIFE.find((x) => x[0] === U.life)[1]}">${body}</div></div>`;
}

/* ---------- Grow ---------- */
/* all-habits streak: weeks in a row where every habit met its floor (this week counts once it's met) */
/* weekly check: the week that just closed, habit by habit. Streaks are computed from on-time sessions, so a miss resets on its own. */
function weekCheck() {
  const lw = addDays(mondayOf(TODAY), -7), pw = addDays(lw, -7);
  const rows = S.habits.map((h) => {
    const ss = S.sessions.filter((x) => x.h === h.key || x.h === h.id);
    const n = (m) => ss.filter((x) => mondayOf(x.date) === m).length;
    let before = 0; for (let m = pw; n(m) >= h.floor && before < 520; m = addDays(m, -7)) before++;
    const got = n(lw), kept = got >= h.floor;
    const ex = ss.filter((x) => x.ex && mondayOf(x.date) === lw).length;
    return { h, got, kept, before, after: kept ? before + 1 : 0, ex, status: kept ? (got >= h.target ? 'hit' : 'kept') : before ? 'reset' : 'miss' };
  });
  return { lw, rows, kept: rows.filter((r) => r.kept).length, reset: rows.filter((r) => r.status === 'reset').length, late: S.voidSessions.length };
}
/* habit review: 12 weeks per habit, plus a verdict on whether the target needs adjusting.
   Verdicts use the closed weeks since the habit's first session (needs 4+). Raise: target hit in 80%+ of weeks while
   averaging 30%+ above it. Lower: floor met in under half. Slipping / needs work: target hit in under half. */
function habitVerdict(h, st) {
  const past = st.weeks.slice(0, -1), first = past.findIndex((w) => w.n > 0), wks = first < 0 ? [] : past.slice(first);
  const n = wks.length;
  if (n < 4) return { v: 'new', vt: 'Too early', n, hit: null, flr: null, avg: null, tr: 0, why: '' };
  const hit = wks.filter((w) => w.n >= h.target).length / n, flr = wks.filter((w) => w.n >= h.floor).length / n;
  const avg = wks.reduce((a, w) => a + w.n, 0) / n;
  const l4 = past.slice(-4), p4 = past.slice(-8, -4);
  const tr = n >= 8 ? l4.reduce((a, w) => a + w.n, 0) / 4 - p4.reduce((a, w) => a + w.n, 0) / 4 : 0;
  const pc = (x) => Math.round(x * 100) + '%';
  let v = 'ok', vt = 'On track', why = '';
  if (hit >= 0.8 && avg >= h.target * 1.3) { v = 'raise'; vt = `Raise to ${Math.round(avg)}/wk`; why = `Averaging ${avg.toFixed(1)} a week against a target of ${h.target}.`; }
  else if (flr < 0.5) { v = 'lower'; vt = `Lower to ${Math.max(1, Math.round(avg + 0.5))}/wk`; why = `Floor met in only ${pc(flr)} of weeks. ${h.target} a week isn't realistic right now.`; }
  else if (hit < 0.5 && tr < -0.4) { v = 'work'; vt = 'Slipping'; why = `Down ${Math.abs(tr).toFixed(1)} a week from the month before. Target hit in ${pc(hit)} of weeks.`; }
  else if (hit < 0.5) { v = 'work'; vt = 'Needs work'; why = `Floor is holding, but the target was hit in only ${pc(hit)} of weeks.`; }
  return { v, vt, n, hit, flr, avg, tr, why };
}
/* Grow → Garden: one stats band, one Records card (habits | rings), and with Labs on the shelf and logbook.
   Rings: completed = tasks finished that day; committed = tasks whose current due/deadline date is that day
   (a rescheduled task only keeps its latest date, so older weeks are approximate). */
function ringHistory(weeks = 12) {
  const done = {}, due = {};
  S.tasks.forEach((t) => { if (t.done && t.doneAt) { const d = LB.laDateOf(t.doneAt); done[d] = (done[d] || 0) + 1; } const e = eff(t); if (e) due[e] = (due[e] || 0) + 1; });
  const wk = mondayOf(TODAY), rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const m = addDays(wk, -7 * i), days = [];
    for (let k = 0; k < 7; k++) { const d = addDays(m, k); days.push({ d, n: done[d] || 0, due: due[d] || 0, future: d > TODAY, today: d === TODAY }); }
    const past = days.filter((x) => !x.future);
    rows.push({ m, cur: i === 0, days, closed: past.filter((x) => x.n >= RING_GOAL).length, done: past.reduce((n, x) => n + x.n, 0), due: past.reduce((n, x) => n + x.due, 0) });
  }
  return rows;
}
function growBand(g) {
  const hs = S.habits.map((h) => ({ h, st: habitStats(h, S.sessions) }));
  const hDone = hs.reduce((n, x) => n + Math.min(x.st.week, x.h.target), 0), hTot = hs.reduce((n, x) => n + x.h.target, 0), safe = hs.filter((x) => x.st.week >= x.h.floor).length;
  const R = ringHistory(12), cur = R[R.length - 1], past = R.slice(0, -1);
  const avg = (f) => (past.reduce((n, r) => n + f(r), 0) / past.length).toFixed(1);
  const dueT = S.tasks.filter((t) => { const e = eff(t); return e && e >= R[0].m && e <= TODAY; }), met = dueT.filter((t) => t.done).length;
  const tiles = [
    { n: `${hDone}<small>/${hTot}</small>`, l: 'Habit sessions', s: `${safe} of ${hs.length} streaks safe` },
    { n: cur.closed, l: 'Rings closed', s: `this week · avg ${avg((r) => r.closed)}` },
    { n: `${cur.done}<small>/${cur.due}</small>`, l: 'Done / due', s: `this week · avg ${avg((r) => r.done)} done` },
    { n: dueT.length ? Math.round((met / dueT.length) * 100) + '<small>%</small>' : '–', l: 'Due tasks done', s: `${met} of ${dueT.length}, 12 weeks` },
    ...(g ? LBGarden.gardenTiles(g).map((t) => ({ ...t, n: t.n, s: esc(t.s) })) : []),
  ];
  return `<section class="sec"><div class="card pad"><div class="gsts">${tiles.map((t) => `<div class="gst"><b class="num">${t.n}</b><span>${t.l}</span><small>${t.s}</small></div>`).join('')}</div></div></section>`;
}
function recordsCard() {
  const mode = U.rec === 'rings' ? 'rings' : 'habits';
  const seg = `<div class="seg" role="tablist" aria-label="Records">${[['habits', 'Habits'], ['rings', 'Rings']].map(([k, l]) => `<button role="tab" data-act="rec" data-val="${k}" aria-selected="${mode === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (mode === 'habits') {
    const R = S.habits.map((h) => { const st = habitStats(h, S.sessions); return { h, st, ...habitVerdict(h, st) }; });
    const ord = { work: 0, lower: 1, raise: 2 }, attn = R.filter((r) => ord[r.v] != null).sort((a, b) => ord[a.v] - ord[b.v]);
    const lvl = (h, n) => (n <= 0 ? 0 : n < h.floor ? 1 : n < h.target ? 2 : n === h.target ? 3 : 4);
    const arrow = (r) => (r.n < 8 ? '<span class="trf">–</span>' : r.tr > 0.4 ? '<span class="tru" title="Trending up">↑</span>' : r.tr < -0.4 ? '<span class="trd" title="Trending down">↓</span>' : '<span class="trf" title="Steady">→</span>');
    const pc = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
    const wk0 = R[0].st.weeks;
    body = `<div class="tg" role="table" aria-label="Sessions per week, last 12 weeks">
      <span></span>${wk0.map((w, i) => `<span class="h">${w.cur ? 'now' : (11 - i) % 4 === 0 ? `${MON3[toD(w.m).getMonth()]} ${toD(w.m).getDate()}` : ''}</span>`).join('')}<span class="h">hit</span><span class="h">trend</span>
      ${R.map((r) => `<span class="nm" title="${esc(r.h.name)}: target ${r.h.target}, floor ${r.h.floor}${r.st.streak ? `, ${r.st.streak}-week streak (best ${r.st.best})` : ''}">${esc(r.h.name)}</span>${r.st.weeks.map((w) => `<span class="c l${lvl(r.h, w.n)}${w.cur ? ' cur' : ''}" title="Week of ${MON3[toD(w.m).getMonth()]} ${toD(w.m).getDate()}: ${w.n} of ${r.h.target}">${w.n || ''}</span>`).join('')}<span class="s${r.hit == null ? '' : r.hit >= 0.7 ? ' good' : r.hit < 0.4 ? ' bad' : ''}">${pc(r.hit)}</span><span class="tr">${arrow(r)}</span>`).join('')}
    </div>
    <div class="legend" style="margin-top:10px"><span><i></i>None</span><span><i class="l1"></i>Below floor</span><span><i class="floor"></i>Floor</span><span><i class="hit"></i>Target</span><span><i class="l4"></i>Above target</span></div>
    ${attn.length ? `<ul class="recn">${attn.map((r) => `<li><span class="vchip ${r.v}">${esc(r.vt)}</span><span><b>${esc(r.h.name)}</b> ${esc(r.why)}</span></li>`).join('')}</ul>` : ''}
    <p class="wcnote">Hit % and suggestions use closed weeks since each habit's first session. Weeks close Sunday night.</p>`;
  } else {
    const R = ringHistory(12), lv = (x) => (x.future ? ' fut' : x.n <= 0 ? '' : x.n < RING_GOAL ? ' l1' : x.n <= RING_GOAL + 1 ? ' l3' : ' l4');
    body = `<div class="tg rg" role="table" aria-label="Tasks finished per day, last 12 weeks">
      <span></span>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="h">${d}</span>`).join('')}<span class="h">rings</span><span class="h">done/due</span>
      ${R.map((r) => `<span class="nm">${r.cur ? 'This week' : `${MON3[toD(r.m).getMonth()]} ${toD(r.m).getDate()}`}</span>${r.days.map((x) => `<span class="c${lv(x)}${x.today ? ' cur' : ''}" title="${x.d}: ${x.n} done, ${x.due} due">${x.future ? '' : x.n || ''}</span>`).join('')}<span class="s">${r.closed}</span><span class="s${r.done >= r.due ? ' good' : ''}">${r.done}/${r.due}</span>`).join('')}
    </div>
    <div class="legend" style="margin-top:10px"><span><i></i>None</span><span><i class="l1"></i>Under ${RING_GOAL}</span><span><i class="hit"></i>Ring closed</span><span><i class="l4"></i>${RING_GOAL + 2}+</span></div>
    <p class="wcnote">A ring closes at ${RING_GOAL} tasks finished in a day. Due counts each task on its current due or deadline date, so older weeks are approximate.</p>`;
  }
  return `<section class="sec"><div class="sec-h"><h3 class="sec-t">Records <span class="ct">12 weeks</span></h3>${seg}</div><div class="card tgc">${body}</div></section>`;
}
function labsLogbook(g) {
  const items = LBGarden.logbookItems(g);
  return fold('logbook', 'Logbook', { def: false, ct: items.length, sum: items[0] ? `${LBGarden.fmt(items[0].d)} · ${esc(items[0].t)}` : '', body: `<div class="card pad">${LBGarden.logbookHTML(items.slice(0, 40))}</div>` });
}
function viewGrow() {
  let body = '';
  if (U.grow === 'collection') body = labsCollectionHTML();
  else if (U.grow === 'habits') {
    body = S.habits.length ? labsGrowHTML() : `<div class="card pad" style="margin-top:14px"><p class="empty" style="padding:0 4px 10px">No habits yet. Give one a weekly target and a lower floor that keeps the streak alive.</p><button class="btn primary" data-act="new-habit">${ic('plus', 18)}Add a habit</button></div>`;
  } else {
    const years = [...new Set(S.goals.map((g) => +g.year))].sort((a, b) => b - a);
    const curQ = Math.ceil(+TODAY.slice(5, 7) / 3), curY = +TODAY.slice(0, 4);
    const active = S.goals.filter((g) => !g.done).length;
    body = `${S.goals.length ? `<p class="small muted" style="margin:16px 4px 0">${active} active, ${S.goals.length - active} completed. Tap a quarter to write how it went.</p>` : `<div class="card pad" style="margin-top:14px"><p class="empty" style="padding:0 4px 10px">No goals yet. Give each one a year, then write a line per quarter on how it went.</p><button class="btn primary" data-act="fab">${ic('plus', 18)}Add a goal</button></div>`}
      ${years.map((y) => `<section class="sec">${secH(String(y))}<div class="goals2">${S.goals.filter((g) => +g.year === y).sort((a, b) => a.done - b.done).map((g) => `<article class="card goal${g.done ? ' complete' : ''}">
        <div class="hhead"><span class="hicon">${ic(g.icon || GOAL_CAT_IC[g.cat] || 'star', 24)}</span><div style="min-width:0"><h3>${esc(g.title)}</h3><p class="tmeta" style="margin:2px 0 0">${g.cat ? `<span class="chip">${esc(g.cat)}</span>` : ''}<span class="chip${g.done ? '' : ' hot'}">${g.done ? 'Completed' : 'Active'}</span></p></div></div>
        ${g.notes ? `<p class="small muted" style="margin:10px 0 0">${esc(g.notes)}</p>` : ''}
        <div class="qgrid">${[1, 2, 3, 4].map((q) => { const now = +g.year === curY && q === curQ, k = g.id + ':' + q; const lab = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][q - 1];
          return U.editQ === k ? `<form class="qcell${now ? ' now' : ''}" data-form="q" data-id="${g.id}" data-q="${q}"><label class="q" for="q-${k}">Q${q} · ${lab}</label><textarea id="q-${k}" name="v" style="min-height:64px;font-size:16px;padding:8px">${esc(g.q[q - 1])}</textarea><span style="display:flex;gap:4px;margin-top:4px"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-act="q-cancel">Cancel</button></span></form>`
          : `<button class="qcell${now ? ' now' : ''}" data-act="q-edit" data-id="${k}" aria-label="Q${q} ${lab}${now ? ', current quarter' : ''}. Edit note."><span class="q"><span>Q${q} · ${lab}</span>${now ? '<span>Now</span>' : ''}</span><span class="${g.q[q - 1] ? '' : 'ph'}">${esc(g.q[q - 1]) || 'Add a note…'}</span></button>`; }).join('')}</div>
        <div class="row-btns" style="margin-top:12px"><button class="btn sm" data-act="goal-done" data-id="${g.id}">${g.done ? 'Back to active' : ic('check', 18) + 'Mark completed'}</button><button class="btn sm ghost" data-act="goal-del" data-id="${g.id}">${ic('trash', 18)}Delete</button></div>
      </article>`).join('')}</div></section>`).join('')}
      <section class="sec">${secH('Goal tasks')}${groupTasks((t) => t.group === 'Goals', 'No goal-related tasks right now.')}</section>`;
  }
  const gw = GROW.find((x) => x[0] === U.grow);
  return `${phead(U.grow, gw[2], 'Grow', "Habits you keep and goals you're chasing.")}
    <div class="kinds" style="grid-template-columns:repeat(${GROW.length},1fr);margin-top:4px;max-width:${GROW.length * 180}px" role="tablist" aria-label="Grow">${GROW.map(([k, l, i]) => `<button class="sub k-${k}" role="tab" data-act="grow" data-val="${k}" aria-selected="${U.grow === k}" aria-pressed="${U.grow === k}" style="display:flex;align-items:center;justify-content:center;gap:6px">${ic(i, 18)}${l}</button>`).join('')}</div>
    <div role="tabpanel">${body}</div>`;
}

/* =========================================================
   Quick-add parser (graft from Focus): "dentist fri 3pm",
   "water plants every 3 days", "gym every mon 7am"
   ========================================================= */
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const DOWS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DOW_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const nextDow = (k) => { let n = (k - dow(TODAY) + 7) % 7; if (n === 0) n = 7; return addDays(TODAY, n); };
function parseCmd(raw) {
  let s = ' ' + String(raw || '').trim() + ' '; let date = null, time = null, rec = null, m;
  const cut = () => { s = s.replace(m[0], ' '); };
  const UN = { day: 'day', days: 'day', week: 'week', weeks: 'week', month: 'month', months: 'month' };
  if ((m = s.match(/\s(?:every|each)\s+(\d+)\s*(days?|weeks?|months?)\b/i))) { rec = { n: Math.max(1, +m[1]), u: UN[m[2].toLowerCase()] }; cut(); }
  else if ((m = s.match(new RegExp('\\s(?:every|each)\\s+' + DOW_RE + '\\b', 'i')))) { rec = { n: 1, u: 'week', sched: true }; date = nextDow(DOWS[m[1].slice(0, 3).toLowerCase()]); cut(); }
  else if ((m = s.match(/\s(?:every|each)\s+(day|week|month|year|weekday)\b/i))) { const u = m[1].toLowerCase(); rec = u === 'year' ? { n: 12, u: 'month' } : { n: 1, u: u === 'weekday' ? 'day' : u }; cut(); }
  else if ((m = s.match(/\s(daily|weekly|monthly|yearly)\b/i))) { rec = { daily: { n: 1, u: 'day' }, weekly: { n: 1, u: 'week' }, monthly: { n: 1, u: 'month' }, yearly: { n: 12, u: 'month' } }[m[1].toLowerCase()]; cut(); }
  if ((m = s.match(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)\b/i)) && +m[1] >= 1 && +m[1] <= 12) { let h = +m[1] % 12; if (/^p/i.test(m[3])) h += 12; time = h * 60 + (+m[2] || 0); cut(); }
  else if ((m = s.match(/\s(\d{1,2}):(\d{2})\b/)) && +m[1] < 24 && +m[2] < 60) { time = +m[1] * 60 + +m[2]; cut(); }
  else if ((m = s.match(/\sat\s+(\d{1,2})\b/i)) && +m[1] >= 1 && +m[1] <= 12) { let h = +m[1]; if (h <= 6) h += 12; time = h * 60; cut(); }
  else if ((m = s.match(/\s(noon|midday)\b/i))) { time = 720; cut(); }
  const MONRE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  if (!date) {
    if ((m = s.match(/\s(?:on\s+)?(today|tonight)\b/i))) { date = TODAY; cut(); }
    else if ((m = s.match(/\s(?:on\s+)?(tomorrow|tmrw|tmr)\b/i))) { date = addDays(TODAY, 1); cut(); }
    else if ((m = s.match(/\sin\s+(\d+)\s*(days?|weeks?|months?)\b/i))) { const u = UN[m[2].toLowerCase()]; date = u === 'day' ? addDays(TODAY, +m[1]) : u === 'week' ? addDays(TODAY, 7 * +m[1]) : addMonths(TODAY, +m[1]); cut(); }
    else if ((m = s.match(/\snext\s+week\b/i))) { date = addDays(mondayOf(TODAY), 7); cut(); }
    else if ((m = s.match(/\s(?:this\s+)?weekend\b/i))) { date = nextDow(6); cut(); }
    else if ((m = s.match(new RegExp('\\s(?:on\\s+|next\\s+|this\\s+)?' + DOW_RE + '\\b', 'i')))) { date = nextDow(DOWS[m[1].slice(0, 3).toLowerCase()]); cut(); }
    else if ((m = s.match(new RegExp('\\s(?:on\\s+)?' + MONRE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'i')))) {
      const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].slice(0, 3).toLowerCase());
      const y = +TODAY.slice(0, 4); let c = ymd(new Date(y, mi, +m[2])); if (c < TODAY) c = ymd(new Date(y + 1, mi, +m[2])); date = c; cut();
    } else if ((m = s.match(/\s(\d{1,2})\/(\d{1,2})\b/)) && +m[1] <= 12 && +m[2] <= 31) {
      const y = +TODAY.slice(0, 4); let c = ymd(new Date(y, +m[1] - 1, +m[2])); if (c < TODAY) c = ymd(new Date(y + 1, +m[1] - 1, +m[2])); date = c; cut();
    }
  }
  let title = s.replace(/^\s*(remind me to|remember to|todo:?)\s+/i, ' ').replace(/\s+(at|on|by|for|every)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
  title = title.replace(/^(at|on|by)\s+/i, '');
  return { title: cap(title), date, time, rec };
}
/* a parsed {n,u} becomes an interval rule; "every mon" keeps to its weekday (schedule basis) */
function parsedRule(r) {
  if (!r) return null;
  if (r.u === 'month' && r.n % 12 === 0) return { kind: 'interval', every: r.n / 12, unit: 'year', basis: r.sched ? 'schedule' : 'completion' };
  return { kind: 'interval', every: r.n, unit: r.u, basis: r.sched ? 'schedule' : 'completion' };
}
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/* recurrence sub-fields under the Repeats select; names start r_ */
function recFields(r) {
  if (!r) return '';
  const num = (k, lab, min, max) => `<label class="fld"><span>${lab}</span><input type="number" name="r_${k}" min="${min}" max="${max}" inputmode="numeric" value="${esc(r[k] ?? min)}"></label>`;
  const sel = (k, lab, opts) => `<label class="fld"><span>${lab}</span><select name="r_${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(r[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const ORDS = [[1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [-1, 'Last']], WDS = WD.map((w, i) => [i, w]), MOS = MONTHS.map((m, i) => [i + 1, m]);
  const p = presetOf(r), k = r.kind;
  let f = '';
  if (p === 'interval') f = num('every', 'Every', 1, 366) + sel('unit', 'Unit', [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months'], ['year', 'Years']]) + sel('basis', 'Counted from', [['completion', 'The day I finish it'], ['schedule', 'Its do date']]);
  else if (k === 'monthly_day' && p !== 'monthly_first') f = num('day', 'Day of month', 1, 31) + num('every_months', 'Every N months', 1, 24);
  else if (p === 'monthly_first' || k === 'monthly_last_day') f = num('every_months', 'Every N months', 1, 24);
  else if (k === 'monthly_weekday') f = sel('ordinal', 'Which', ORDS) + sel('weekday', 'Weekday', WDS) + num('every_months', 'Every N months', 1, 24);
  else if (k === 'yearly_day') f = sel('month', 'Month', MOS) + num('day', 'Day', 1, 31);
  else if (k === 'yearly_first_day' || k === 'yearly_last_day') f = sel('month', 'Month', MOS);
  else if (k === 'yearly_weekday') f = sel('ordinal', 'Which', ORDS) + sel('weekday', 'Weekday', WDS) + sel('month', 'Month', MOS);
  return f ? `<div class="three">${f}</div>` : '';
}
/* read the rule back from the form: preset gives the kind, r_ fields give the numbers */
function readRule(form) {
  const v = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value : null; };
  const preset = v('rec') || 'none';
  const r = ruleFor(preset, v('due'));
  if (!r) return null;
  const NUMS = ['every', 'day', 'every_months', 'ordinal', 'weekday', 'month'];
  ['every', 'unit', 'basis', 'day', 'every_months', 'ordinal', 'weekday', 'month'].forEach((k) => {
    const x = v('r_' + k);
    if (x == null || x === '' || !(k in r)) return;
    r[k] = NUMS.includes(k) ? Math.round(+x) : x;
  });
  return r;
}
function syncRec(form, rule) {
  const box = form.querySelector('#recx'), help = form.querySelector('#rechelp');
  if (box) box.innerHTML = recFields(rule);
  if (help) help.textContent = rule ? LB.describeRule(rule) + (rule.kind !== 'interval' ? ' Set the do date on a matching day so the chain stays anchored.' : '') : '';
}
function setPreset(sel, rule) { sel.value = presetOf(rule); }
/* Reads the quick field into the full form (fields the person hasn't touched), then draws chips from the form itself. */
function quickSync(fromParse) {
  const sh = document.getElementById('sheet'), c = U.sheet;
  if (!c || c.kind !== 'task' || c.id) return;
  const q = sh.querySelector('[name=quick]'); if (!q) return;
  const form = sh.querySelector('form'), f = (n) => sh.querySelector(`[name=${n}]`), T = c.touched || (c.touched = {});
  const p = parseCmd(q.value);
  c.time = p.time;
  if (fromParse) {
    if (!T.title) f('title').value = p.title;
    if (!T.due) f('due').value = p.date || (p.rec ? TODAY : c.baseDue);
    if (!T.rec) { const r = parsedRule(p.rec); setPreset(f('rec'), r); syncRec(form, r); }
  }
  const due = f('due').value, rule = readRule(form), has = q.value.trim() || f('title').value.trim();
  const chips = has ? [
    `<span class="chip">${ic('calendar', 14)}${due ? relDate(due) : 'No date yet'}</span>`,
    rule ? `<span class="chip">${ic('repeat', 14)}${esc(recShort(rule))}</span>` : '',
    p.time != null ? `<span class="chip num">${ic('clock', 14)}${minLabel(p.time)} · goes in notes</span>` : '',
  ].join('') : '';
  const box = sh.querySelector('#pchips'); if (box) box.innerHTML = chips;
}

/* =========================================================
   Sheet (add / edit)
   ========================================================= */
function fabConfig() {
  if (U.tab === 'lists') { const d = listDefs().find((l) => l.key === U.list) || BASE_LISTS[0]; return { label: 'Add to ' + d.title, sheet: { kind: 'item', list: d.key } }; }
  if (U.tab === 'grow') return U.grow !== 'goals' ? (S.habits.length ? { label: 'Log a habit', sheet: { kind: 'log' } } : { label: 'New habit', sheet: { kind: 'habit' } }) : { label: 'New goal', sheet: { kind: 'goal' } };
  if (U.tab === 'life') { const g = { health: 'Health', money: 'Money', home: 'Home', hobbies: 'Personal' }[U.life]; return { label: 'New ' + g.toLowerCase() + ' task', sheet: { kind: 'task', defaults: { group: g } } }; }
  if (U.tab === 'plan') return { label: 'New task on ' + shortDate(U.calSel), sheet: { kind: 'task', defaults: { due: U.calSel } } };
  return { label: 'New task', sheet: { kind: 'task' } };
}
let lastFocus = null;
function openSheet(cfg) { lastFocus = document.activeElement; U.sheet = { ...cfg }; renderSheet(); const sh = document.getElementById('sheet'); sh.hidden = false; void sh.offsetHeight; requestAnimationFrame(() => { sh.classList.add('open'); document.getElementById('scrim').classList.add('open'); const f = sh.querySelector('[autofocus]') || sh.querySelector('input,button'); f && f.focus({ preventScroll: true }); }); }
function closeSheet() { const sh = document.getElementById('sheet'); sh.classList.remove('open'); document.getElementById('scrim').classList.remove('open'); U.sheet = null; setTimeout(() => { if (!U.sheet) { sh.hidden = true; sh.innerHTML = ''; } }, reduced.matches ? 0 : 300); lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); if (pendingRender) schedule(); }
function radios(name, opts, val) { return `<div class="radios">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === val ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`; }
function renderSheet() {
  const sh = document.getElementById('sheet'), c = U.sheet; if (!c) return;
  const editing = c.kind === 'task' && c.id ? S.tasks.find((t) => t.id === c.id) : null;
  if (c.kind === 'task' && c.id && !editing) { closeSheet(); return; }
  const kinds = !editing ? `<div class="kinds" role="group" aria-label="What to add">${[['task', 'Task'], ['item', 'List item'], ['goal', 'Goal'], [S.habits.length ? 'log' : 'habit', 'Habit']].map(([k, l]) => `<button type="button" data-act="sheet-kind" data-val="${k}" aria-pressed="${c.kind === k || (l === 'Habit' && (c.kind === 'log' || c.kind === 'habit'))}">${l}</button>`).join('')}</div>` : '';
  let title = '', fields = '', submit = 'Save';
  if (c.kind === 'task') {
    const t = editing || { title: '', notes: '', group: 'Personal', due: TODAY, deadline: '', rule: null, icon: null, ...(c.defaults || {}) };
    title = editing ? 'Edit task' : 'New task'; submit = editing ? 'Save' : 'Add task';
    if (!editing) { c.baseDue = t.due || ''; c.touched = c.touched || {}; }
    const curIcon = editing && editing._d.icon_key ? iconOf(editing._d.icon_key) : 'auto';
    const full = `<label class="fld"><span>Title</span><input name="title" required value="${esc(t.title)}" autocomplete="off" enterkeyhint="done" placeholder="What needs doing?"></label>
      <fieldset class="fld"><legend>Group</legend>${radios('group', GROUPS.map((g) => [g, ic(GROUP_IC[g], 17) + g]), GROUPS.includes(t.group) ? t.group : 'Personal')}</fieldset>
      <div class="two"><label class="fld"><span>Do date</span><input type="date" name="due" id="fDue" value="${t.due || ''}"></label><label class="fld"><span>Deadline</span><input type="date" name="deadline" value="${t.deadline || ''}"></label></div>
      <div class="quick">${[['Today', TODAY], ['Tomorrow', addDays(TODAY, 1)], ['Saturday', addDays(TODAY, ((6 - dow(TODAY)) + 7) % 7 || 7)], ['Next week', addDays(mondayOf(TODAY), 7)], ['No date', '']].map(([l, v]) => `<button type="button" data-act="quick-date" data-val="${v}"><span>${l}</span></button>`).join('')}</div>
      <label class="fld"><span>Repeats</span><select name="rec">${PRESETS.map(([k, l]) => `<option value="${k}" ${presetOf(t.rule) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div id="recx">${recFields(t.rule)}</div><p class="qhint" id="rechelp">${t.rule ? esc(LB.describeRule(t.rule)) : ''}</p>
      <fieldset class="fld"><legend>Icon</legend><div class="radios icons"><label><input type="radio" name="icon" value="auto" ${curIcon === 'auto' ? 'checked' : ''} aria-label="Pick for me"><span style="width:auto;padding:0 12px">Auto</span></label>${TASK_ICONS.map((k) => `<label><input type="radio" name="icon" value="${k}" ${curIcon === k ? 'checked' : ''} aria-label="${k}"><span>${ic(k, 20)}</span></label>`).join('')}</div></fieldset>
      <label class="fld"><span>Notes</span><textarea name="notes" placeholder="Anything future you should know">${esc(t.notes)}</textarea></label>`;
    const ex = ['dentist fri', 'water plants every 3 days', 'pay rent monthly'];
    fields = editing ? full : `<label class="fld qfield"><span>Just type it</span><input name="quick" value="${esc(c.name || '')}" autocomplete="off" autofocus enterkeyhint="done" placeholder="dentist fri" aria-describedby="pchips qhint"></label>
      <div class="pchips" id="pchips" aria-live="polite"></div>
      <p class="qhint" id="qhint">Dates and repeats are picked up as you type. More options sets deadlines and monthly or yearly patterns.</p>
      <div class="quick" role="group" aria-label="Examples">${ex.map((x) => `<button type="button" data-act="q-try" data-val="${x}"><span>${x}</span></button>`).join('')}</div>
      <details class="more"><summary>${ic('chevR', 18)}More options</summary>${full}</details>`;
  } else if (c.kind === 'item') {
    const defs = listDefs(), lk = defs.some((l) => l.key === c.list) ? c.list : 'groceries';
    title = 'Add to a list'; submit = 'Add';
    const extra = lk === 'groceries' ? `<label class="fld"><span>Aisle</span><select name="sec"><option value="">Guess for me</option>${GROC_SECS.map((s) => `<option>${s}</option>`).join('')}</select></label>`
      : lk === 'wish' ? `<fieldset class="fld"><legend>How much do you want it?</legend>${radios('tag', Object.entries(TAGS).map(([k, t]) => [k, `${t.label} <small class="muted" style="font-weight:400">${t.days === 0 ? 'now' : t.days ? t.days + 'd' : '∞'}</small>`]), 'love')}</fieldset><div class="two"><label class="fld"><span>Price</span><input name="price" placeholder="about $120"></label><label class="fld"><span>Link</span><input name="url" type="url" placeholder="https://"></label></div>`
      : lk === 'recipes' ? `<div class="two"><label class="fld"><span>Mood or cuisine</span><input name="mood" placeholder="Rice bowl"></label><label class="fld"><span>Time</span><input name="time" placeholder="30 min"></label></div><label class="fld"><span>Ingredients, one per line</span><textarea name="ing"></textarea></label><label class="fld"><span>Link</span><input name="url" type="url" placeholder="https://"></label>`
      : lk === 'gifts' ? `<label class="fld"><span>For</span><input name="person" required list="people" autocomplete="off"><datalist id="people">${[...new Set(S.gifts.map((g) => g.person))].map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label><label class="fld"><span>Link</span><input name="url" type="url" placeholder="https://"></label>`
      : lk === 'books' ? `<label class="fld"><span>Author</span><input name="by"></label>` : '';
    fields = `<label class="fld"><span>List</span><select name="list" data-act-change="sheet-list">${defs.map((l) => `<option value="${esc(l.key)}" ${l.key === lk ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>
      <label class="fld"><span>${lk === 'gifts' ? 'Gift idea' : lk === 'recipes' ? 'Recipe' : 'Name'}</span><input name="name" required autocomplete="off" autofocus value="${esc(c.name || '')}"></label>${extra}`;
  } else if (c.kind === 'goal') {
    title = 'New goal'; submit = 'Add goal';
    fields = `<label class="fld"><span>Goal</span><input name="title" required autofocus autocomplete="off" placeholder="e.g. Surf Mavericks (watch, not ride)" value="${esc(c.name || '')}"></label>
      <fieldset class="fld"><legend>Category</legend>${radios('cat', GOAL_CATS.map((g) => [g, ic(GOAL_CAT_IC[g], 17) + g]), 'Personal')}</fieldset>
      <label class="fld"><span>Year</span><input type="number" name="year" value="${TODAY.slice(0, 4)}" inputmode="numeric"></label>
      <label class="fld"><span>Notes</span><textarea name="notes"></textarea></label>`;
  } else if (c.kind === 'habit') {
    title = 'New habit'; submit = 'Add habit';
    fields = `<label class="fld"><span>Habit</span><input name="name" required autofocus autocomplete="off" placeholder="e.g. Drumming" value="${esc(c.name || '')}"></label>
      <div class="two"><label class="fld"><span>Target a week</span><input type="number" name="target" min="1" max="14" value="3" inputmode="numeric"></label><label class="fld"><span>Floor a week</span><input type="number" name="floor" min="1" max="14" value="1" inputmode="numeric"></label></div>
      <p class="qhint">Hitting the floor keeps the streak alive, even in a slow week.</p>
      <label class="fld"><span>Notes</span><textarea name="notes" placeholder="What counts as a session"></textarea></label>`;
  } else {
    title = 'Log a session'; submit = '';
    fields = `<label class="fld"><span>When</span><input type="date" name="date" id="logDate" value="${TODAY}" max="${TODAY}"></label>
      <div id="logEx" class="logex" hidden><p class="qhint"><b>That week is closed.</b> Its streaks were already checked. A late session counts only with a real reason and evidence, and it stays marked as an exception.</p>
        <label class="fld"><span>Why it wasn't logged that week</span><textarea name="exReason" id="exReason" placeholder="At least a sentence: what happened"></textarea></label>
        <label class="fld"><span>Evidence</span><input name="exEvidence" id="exEvidence" placeholder="e.g. Strava link, photo in camera roll, lesson receipt"></label></div>
      <div class="hpick">${S.habits.map((h) => { const st = habitStats(h, S.sessions); return `<button type="button" data-act="log-pick" data-id="${h.id}"><span class="hicon">${ic(h.icon, 22)}</span><span>${esc(h.name)}<br><span class="small muted" style="font-weight:400">${st.week} of ${h.target} this week</span></span>${ic('plus', 20)}</button>`; }).join('')}</div>
      <button type="button" class="link" data-act="sheet-kind" data-val="habit" style="margin-top:6px">${ic('plus', 16)} New habit</button>`;
  }
  sh.innerHTML = `<div class="grab" aria-hidden="true"></div><form data-form="sheet" novalidate style="display:contents">
    <div class="sh-h"><h2 id="sheetT">${title}</h2><button type="button" class="iconbtn" data-act="sheet-close" aria-label="Close">${ic('x')}</button></div>
    <div class="sh-b">${kinds}${fields}</div>
    ${submit ? `<div class="sh-f">${editing ? `<button type="button" class="btn" data-act="sheet-del" data-id="${editing.id}" aria-label="Delete task">${ic('trash', 18)}</button>` : ''}<button type="submit" class="btn primary" id="sheetSubmit">${submit}</button></div>` : ''}
  </form>`;
  quickSync(true);
}
function submitSheet(form) {
  const f = Object.fromEntries(new FormData(form).entries()), c = U.sheet;
  if (c.kind === 'task') {
    const title = (f.title || '').trim() || (f.quick ? parseCmd(f.quick).title : '');
    if (!title) { (form.querySelector('[name=quick]') || form.querySelector('[name=title]')).focus(); toast('Give it a title'); return; }
    let notes = (f.notes || '').trim();
    if (!c.id && c.time != null && !notes) notes = 'At ' + minLabel(c.time);
    const rule = readRule(form);
    if (rule && LBS.ruleError(rule)) { toast('That repeat pattern is incomplete'); return; }
    const p = { title, category: f.group || 'Personal', due_date: isDate(f.due) ? f.due : null, deadline_date: isDate(f.deadline) ? f.deadline : null, recurrence_rule: rule, notes };
    const icon = f.icon && f.icon !== 'auto' ? f.icon : null;
    if (c.id) {
      const t = S.tasks.find((x) => x.id === c.id);
      if (icon) p.icon_key = icon;
      if ((t._d.due_date || null) !== p.due_date) p.urgent_sort_order = null;
      act((rec) => W.patch('tasks', c.id, p, rec), 'Task saved');
    } else {
      act((rec) => W.create('tasks', newTaskBody({ ...p, category: p.category, rule, icon_key: icon || LB.autoIcon(title) }), rec),
        `Added “${title}” · ${p.due_date || p.deadline_date ? relDate(eff({ due: p.due_date, deadline: p.deadline_date })) : 'no date yet'}${rule ? ' · ' + recShort(rule).toLowerCase() : ''}`);
    }
  } else if (c.kind === 'item') {
    const name = (f.name || '').trim(); if (!name) { form.querySelector('[name=name]').focus(); toast('Add a name first'); return; }
    const lk = f.list, url = safeUrl(f.url || '') || null;
    if (lk === 'gifts' && !(f.person || '').trim()) { form.querySelector('[name=person]').focus(); toast('Who is it for?'); return; }
    act((rec) => {
      if (lk === 'groceries') return W.create('groceries', { name, group_name: f.sec || guessSec(name), checked: false, sort_order: 9999 }, rec);
      if (lk === 'wish') return W.create('buy_list_items', { name, tag: TAGS[f.tag] ? f.tag : 'love', price: (f.price || '').trim(), url, notes: '', status: 'waiting', added_date: TODAY, sort_order: 9999 }, rec);
      if (lk === 'recipes') return W.create('recipes', { name, mood: (f.mood || '').trim(), url, notes: '', time: (f.time || '').trim(), ingredients: (f.ing || '').split('\n').map((x) => x.trim()).filter(Boolean), status: 'planned', cooked_at: null, session_ref: null, sort_order: 9999 }, rec);
      if (lk === 'gifts') return W.create('gift_ideas', { person: f.person.trim(), idea: name, url, status: 'idea', sort_order: 9999 }, rec);
      return W.create('list_items', { list_key: lk, title: name, author: lk === 'books' ? (f.by || '').trim() || null : null, url, notes: '', status: 'want', sort_order: 9999 }, rec);
    }, `Added to ${(listDefs().find((l) => l.key === lk) || { title: 'the list' }).title}`);
    U.list = lk; U.tab = 'lists';
  } else if (c.kind === 'goal') {
    const title = (f.title || '').trim(); if (!title) { toast('Name the goal first'); return; }
    const a = LB.autoIcon(title), cat = f.cat || 'Personal';
    act((rec) => W.create('goals', { title, category: cat, year: Math.round(+f.year) || +TODAY.slice(0, 4), status: 'active', notes: (f.notes || '').trim(), icon_key: P[a] && !['spark', 'star'].includes(a) ? a : GOAL_CAT_IC[cat] || 'star', progress_q1: '', progress_q2: '', progress_q3: '', progress_q4: '', sort_order: 9999 }, rec), 'Goal added');
    U.tab = 'grow'; U.grow = 'goals';
  } else if (c.kind === 'habit') {
    const name = (f.name || '').trim(); if (!name) { toast('Name the habit first'); return; }
    const target = Math.max(1, Math.min(14, Math.round(+f.target) || 1)), floor = Math.max(1, Math.min(target, Math.round(+f.floor) || 1));
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit';
    act((rec) => W.create('habits', { key: S.habits.some((h) => h.key === key) ? key + '-' + Date.now().toString(36) : key, name, target_per_week: target, streak_floor_per_week: floor, notes: (f.notes || '').trim(), sort_order: (S.habits.length + 1) * 10 }, rec), 'Habit added');
    U.tab = 'grow'; U.grow = 'habits';
  }
  closeSheet(); render();
}

/* =========================================================
   Render
   ========================================================= */
const main = document.getElementById('main');
/* display popover: theme + density, nothing else */
const pop = document.getElementById('pop');
let popFrom = null;
function renderPop() {
  const t = document.documentElement.dataset.theme || 'auto';
  const grp = (label, act, opts, cur) => `<p class="pop-l">${label}</p><div class="kinds" style="grid-template-columns:repeat(${opts.length},1fr)" role="group" aria-label="${label}">${opts.map(([v, l, i]) => `<button type="button" data-act="${act}" data-val="${v}" aria-pressed="${cur === v}">${i ? ic(i, 16) + ' ' : ''}${l}</button>`).join('')}</div>`;
  pop.innerHTML = grp('Theme', 'set-theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], t)
    + grp('Labs: habitat &amp; garden', 'set-labs', [['off', 'Off'], ['on', 'On']], labsOn() ? 'on' : 'off')
    + (LABS.forced && !UI.labs ? '<p class="pop-n">On for this visit (link).</p>' : '');
}
function setPop(open, btn) {
  ['themeBtn', 'barTheme'].forEach((id) => document.getElementById(id).setAttribute('aria-expanded', String(open && btn && btn.id === id)));
  if (!open) { if (pop.hidden) return; pop.hidden = true; popFrom && popFrom.focus({ preventScroll: true }); popFrom = null; return; }
  popFrom = btn; renderPop(); pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.top = Math.round(r.bottom + 6) + 'px'; pop.style.right = Math.max(12, Math.round(innerWidth - r.right)) + 'px';
  const f = pop.querySelector('[aria-pressed="true"]'); f && f.focus({ preventScroll: true });
}
function statusView(st) {
  const box = (h, p) => `<div class="card pad" style="margin-top:14px"><h2 class="ltitle" id="ltitle" style="font-size:22px;margin:0 4px 6px">${h}</h2><p class="muted" style="margin:0 4px">${p}</p></div>`;
  if (st === 'nodb') return box("Your lifeboard data can't be reached here", 'Open lifeboard from claude.ai while signed in. Nothing is shown rather than placeholder data.');
  if (st === 'error') return box('Lifeboard lost its connection to your data', 'Reload the page to reconnect. Nothing you saw before the drop was lost.');
  if (st === 'slow') return box('Still waiting for your data', 'It may be a slow connection. This page keeps trying on its own.');
  return `<p class="muted" style="padding:18px 4px" id="ltitle">Loading your lifeboard…</p>`;
}
/* db changes arrive any time (other devices too). Never redraw under someone typing or dragging; catch up after. */
let pendingRender = false, rq = 0;
function busy() { const a = document.activeElement; return !!drag || (a && main.contains(a) && a.matches('input,textarea,select')); }
function schedule() {
  pendingRender = true;
  if (rq) return;
  rq = setTimeout(() => { rq = 0; if (!busy()) render(); }, 16);
}
main.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !busy()) render(); }, 0));
function render() {
  { const ci = GROW.findIndex((x) => x[0] === 'collection'); /* with Labs on, Grow gets a third view: dioramas + pressed plants */
    if (labsOn() && ci < 0) GROW.push(['collection', 'Collection', 'star']); else if (!labsOn() && ci >= 0) { GROW.splice(ci, 1); if (U.grow === 'collection') U.grow = 'habits'; } }
  pendingRender = false;
  if (LB.todayStr() !== TODAY) TODAY = LB.todayStr();
  const a = document.activeElement, fk = a && a.dataset && a.dataset.act ? [a.dataset.act, a.dataset.id || a.dataset.val || a.dataset.key || a.dataset.d || ''] : null;
  const sy = scrollY; /* re-rendering main must not move the page (a log tap used to jump it) */
  writeHash();
  document.getElementById('tabs').innerHTML = TABS.map((t) => `<button class="tab k-${t.id === 'life' ? U.life : t.id === 'grow' ? U.grow : t.id}" data-act="tab" data-val="${t.id}" ${U.tab === t.id ? 'aria-current="page"' : ''}><span class="pill">${ic(t.icon, 23)}</span>${t.label}</button>`).join('');
  const st = LBDB.state.status, ready = st === 'ready';
  const html = ready ? { today: viewToday, plan: viewPlan, lists: viewLists, life: viewLife, grow: viewGrow }[U.tab]() : statusView(st);
  const sq = S.cond && S.cond.quote, q = sq ? [str(sq.text), str(sq.author) || 'Unknown'] : QUOTES[U.quote % QUOTES.length];
  const sk = LBDB.skipped();
  main.innerHTML = html + `<footer class="quote"><p>“${esc(q[0])}”</p><div class="by">${esc(q[1])}${sq ? '' : ' · <button class="link" style="display:inline-flex;min-height:44px" data-act="quote">Another</button>'}</div>
    ${sk.n ? `<p class="skipnote" title="${esc(Object.entries(sk.by).map(([c, n]) => `${c}: ${n}`).join(', '))}">${plural(sk.n, 'item')} skipped because the saved data didn't match the expected shape.</p>` : ''}</footer>`;
  document.body.classList.toggle('km-open', !!main.querySelector('.kmodal'));
  const fc = fabConfig();
  const fab = document.getElementById('fab');
  fab.hidden = !ready;
  fab.innerHTML = `${ic(U.tab === 'grow' && U.grow === 'habits' ? 'flame' : 'plus', 26)}<span class="lbl">${fc.label}</span>`;
  fab.setAttribute('aria-label', fc.label);
  document.getElementById('themeBtn').innerHTML = ic('sliders'); document.getElementById('barTheme').innerHTML = ic('sliders');
  if (!pop.hidden) renderPop();
  const lt = document.getElementById('ltitle'); const subName = U.tab === 'lists' ? (listDefs().find((l) => l.key === U.list) || BASE_LISTS[0]).title : U.tab === 'life' ? LIFE.find((x) => x[0] === U.life)[1] : U.tab === 'grow' ? GROW.find((x) => x[0] === U.grow)[1] : ''; document.getElementById('barT').innerHTML = !ready ? '' : U.tab === 'today' ? sumHTML(daySummary()) : esc(lt ? lt.textContent : '') + (subName ? ' · ' + esc(subName) : '');
  if (fk) { const sel = `[data-act="${fk[0]}"]` + (fk[1] ? `[data-id="${CSS.escape(fk[1])}"],[data-act="${fk[0]}"][data-val="${CSS.escape(fk[1])}"],[data-act="${fk[0]}"][data-key="${CSS.escape(fk[1])}"],[data-act="${fk[0]}"][data-d="${CSS.escape(fk[1])}"]` : ''); const el = document.querySelector(sel); if (el && el !== document.activeElement) el.focus({ preventScroll: true }); }
  labsAfterRender();
  if (scrollY !== sy) scrollTo(0, sy);
  onScroll();
}
function go(tab, anchor) {
  const [t, sub] = tab.split('/');
  U.tab = t; U.open = null;
  if (t === 'life' && sub) U.life = sub; if (t === 'grow' && sub) U.grow = sub; if (t === 'lists' && sub) U.list = sub;
  render();
  if (anchor) { const el = document.getElementById(anchor); el && el.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth' }); }
  else scrollTo({ top: 0 });
  main.focus({ preventScroll: true });
}

/* ---------- actions ---------- */
function toggleTask(id, btn) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  const d = t._d;
  const go = () => {
    if (t.done) { act((rec) => W.patch('tasks', id, { status: 'open', completed_at: null }, rec), 'Marked not done'); return; }
    const next = d.recurrence_rule && !d.recurrence_spawned ? nextDueOf(d) : null;
    labsFeed();
    act((rec) => Promise.all([W.patch('tasks', id, { status: 'done', completed_at: Date.now() }, rec), next ? spawnSuccessor(d, TODAY, rec) : null]),
      next ? `Done. Next one ${relDate(next)}` : 'Done. Nice.');
  };
  const row = btn && btn.closest('.task');
  if (row && !t.done && !reduced.matches) { row.classList.add('done'); setTimeout(() => { row.classList.add('leaving'); setTimeout(go, 180); }, 160); }
  else go();
}
function snooze(id, days) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  U.open = null;
  const base = t.due && t.due > TODAY ? t.due : TODAY;
  const nd = days === 'week' ? addDays(mondayOf(TODAY), 7) : days === 'tomorrow' ? addDays(TODAY, 1) : days === 'today' ? TODAY : days === 'weekend' ? nextWeekend() : addDays(base, 1);
  act((rec) => W.patch('tasks', id, { due_date: nd, deadline_date: t.deadline && t.deadline < nd ? null : t.deadline, urgent_sort_order: null }, rec), `Moved “${t.title}” to ${relDate(nd)}`);
}
/* Saturday ahead; on a weekend day, the next one */
function nextWeekend() { const w = dow(TODAY); return addDays(TODAY, w === 6 ? 7 : w === 0 ? 6 : 6 - w); }
function carryAll() {
  const tm = addDays(TODAY, 1), list = S.tasks.filter((t) => !t.done && eff(t) && eff(t) < TODAY);
  if (!list.length) return;
  U.open = null;
  act((rec) => Promise.all(list.map((t) => W.patch('tasks', t.id, { due_date: tm, deadline_date: t.deadline && t.deadline < tm ? null : t.deadline, urgent_sort_order: null }, rec))), `Moved ${plural(list.length, 'task')} to tomorrow`);
}
function moveTask(id, dir) {
  const t = S.tasks.find((x) => x.id === id); if (!t || t.done) return false;
  const k = bucketOf(t), list = buckets(S.tasks)[k].slice(), i = list.indexOf(t), j = i + dir;
  if (j < 0 || j >= list.length) return false;
  list.splice(i, 1); list.splice(j, 0, t);
  applyOrder(k, list.map((x) => x.id), id);
  return true;
}
function logHabit(id, date = TODAY, exception = null) {
  const h = S.habits.find((x) => x.id === id); if (!h) return;
  if (date < mondayOf(TODAY) && !validException(exception)) { toast('That week is closed. Add a reason and evidence to log it.'); return; }
  if (date >= mondayOf(TODAY)) U.pulse = { id, d: 1, w: habitStats(h, S.sessions).week + 1 };
  act((rec) => W.create('habit_sessions', exception ? { habit_id: h.key, date, exception: { ...exception, at: Date.now() } } : { habit_id: h.key, date }, rec), () => { const st = habitStats(h, S.sessions); return `Logged ${h.name}${date !== TODAY ? ' for ' + relDate(date).toLowerCase() : ''} · ${st.week}/${h.target} this week${st.week === h.target ? '. Target hit!' : ''}`; });
}
/* undo an accidental log: removes this week's most recent session of the habit */
function unlogHabit(id) {
  const h = S.habits.find((x) => x.id === id); if (!h) return;
  const wk = mondayOf(TODAY);
  const ss = S.sessions.filter((x) => (x.h === h.key || x.h === h.id) && x.date >= wk && x.date <= TODAY)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created || 0) - (a.created || 0)));
  if (!ss.length) return;
  U.pulse = { id, d: -1, w: habitStats(h, S.sessions).week - 1 };
  act((rec) => W.remove('habit_sessions', ss[0].id, rec), () => `Removed a ${h.name} session · ${habitStats(h, S.sessions).week}/${h.target} this week`);
}
/* Adjust a suggestion: Claude rewrites it from a short instruction. Without Claude in this view,
   the ask is saved on the task for the next check-in. */
async function adjustSuggestion(id, ask) {
  const t = (S.suggested || []).find((x) => x.id === id); if (!t || U.adjBusy) return;
  const d = t._d;
  let sample = null;
  try { sample = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { sample = null; }
  if (!sample) { U.adjust = null; act((rec) => W.patch('tasks', id, { adjust_request: ask }, rec), 'Saved. Claude will adjust it on the next check-in.'); return; }
  U.adjBusy = id; render();
  try {
    const cur = { title: d.title, notes: d.notes || '', due_date: d.due_date || null, deadline_date: d.deadline_date || null, category: d.category || 'Personal' };
    const r = await sample.json(`You revise one suggested to-do on a personal life dashboard. Today is ${WD[dow(TODAY)]} ${TODAY}.
Current suggestion (JSON): ${JSON.stringify(cur)}
The person asked: ${JSON.stringify(ask)}
Apply only that change and keep everything else. Keep the title short and plain; notes are one or two plain sentences.
Reply with JSON only: {"title": string, "notes": string, "due_date": "YYYY-MM-DD" or null, "deadline_date": "YYYY-MM-DD" or null, "category": one of ${JSON.stringify(GROUPS)}}`, { modelTier: 'quick' });
    const title = r && typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 200) : null;
    if (!title) throw new Error('bad reply');
    const due = isDate(r.due_date) ? r.due_date : null, dl = isDate(r.deadline_date) ? r.deadline_date : null;
    const p = { title, notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null, due_date: due, deadline_date: dl && (!due || dl >= due) ? dl : null,
      category: GROUPS.includes(r.category) ? r.category : cur.category, adjust_request: null };
    U.adjust = null;
    act((rec) => W.patch('tasks', id, p, rec), `Adjusted: “${title}”`);
  } catch (e) {
    toast(e && e.code === 'rate_limited' ? 'Claude is busy right now. Try again in a minute.' : e && e.code === 'not_granted' ? 'Claude isn\u2019t available in this view.' : 'Couldn\u2019t adjust that. Try wording it differently.');
  } finally { U.adjBusy = null; render(); }
}
const logEvent = (kind, label, value, msg) => act((rec) => W.create('logs', { kind, label, value: value ?? null, date: TODAY }, rec), msg, !!msg);
let timerI = null;
function timerTick() {
  const t = U.timer, out = document.getElementById('timerOut');
  if (!t.end) { clearInterval(timerI); timerI = null; return; }
  const left = Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
  if (out) out.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  if (left <= 0) { t.end = null; t.msg = 'Break done and logged.'; logEvent('break', `${t.len} min`, t.len, 'Break done and logged'); render(); }
}
const delDoc = (col, id, msg) => act((rec) => W.remove(col, id, rec), msg);

document.addEventListener('click', (e) => {
  if (!pop.hidden && !e.target.closest('#pop') && !e.target.closest('[data-act="menu"]')) setPop(false);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act_ = b.dataset.act, id = b.dataset.id, val = b.dataset.val;
  switch (act_) {
    case 'tab': if (U.tab === val) { scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }); } else go(val); break;
    case 'go': go(b.dataset.to, b.dataset.anchor); break;
    case 'menu': setPop(pop.hidden || popFrom !== b, b); break;
    case 'set-theme': {
      if (val === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = val;
      try { localStorage.setItem('lb-theme', val); } catch (er) { /* ignore */ }
      render(); break;
    }
    case 'set-labs': UI.labs = val === 'on'; LABS.forced = false; saveUI(); if (labsOn()) loadLabs(); render(); break;
    case 'fold': UI.fold[b.dataset.key] = b.getAttribute('aria-expanded') !== 'true'; saveUI(); render(); break;
    case 'fab': if (LBDB.state.status === 'ready') openSheet(fabConfig().sheet); break;
    case 'new-habit': openSheet({ kind: 'habit' }); break;
    case 'sheet-close': closeSheet(); break;
    case 'sheet-kind': { const f = document.querySelector('#sheet [name=quick], #sheet [name=title], #sheet [name=name]'); U.sheet = { kind: val, list: U.tab === 'lists' ? U.list : 'groceries', name: f ? f.value : '' }; renderSheet(); const n = document.querySelector('#sheet [autofocus]'); n && n.focus(); break; }
    case 'quick-date': { const i = document.getElementById('fDue'); if (i) i.value = val; if (U.sheet && U.sheet.touched) U.sheet.touched.due = true; quickSync(false); break; }
    case 'q-try': { const q = document.querySelector('#sheet [name=quick]'); if (q) { q.value = val; quickSync(true); q.focus(); } break; }
    case 'sheet-del': { const t = S.tasks.find((x) => x.id === id); closeSheet(); if (t) delDoc('tasks', id, `Deleted “${t.title}”`); break; }
    case 'log-pick': {
      const d = document.getElementById('logDate'); const date = d && isDate(d.value) && d.value <= TODAY ? d.value : TODAY;
      let ex = null;
      if (date < mondayOf(TODAY)) {
        const r = (document.getElementById('exReason') || {}).value || '', ev = (document.getElementById('exEvidence') || {}).value || '';
        ex = { reason: r.trim(), evidence: ev.trim() };
        if (!validException(ex)) { toast(ex.reason.length < 20 ? 'Write a real reason (at least a sentence).' : 'Add evidence: a link, photo or record.'); const f = document.getElementById(ex.reason.length < 20 ? 'exReason' : 'exEvidence'); f && f.focus(); break; }
      }
      closeSheet(); logHabit(id, date, ex); break; }
    case 'toggle': toggleTask(id, b); break;
    case 'expand': U.open = U.open === id ? null : id; render(); break;
    case 'snooze': snooze(id, 1); break;
    case 'snooze-week': snooze(id, 'week'); break;
    case 'resched': if (['today', 'tomorrow', 'weekend'].includes(val)) snooze(id, val); break;
    case 'carry-all': carryAll(); break;
    case 'move': moveTask(id, +b.dataset.dir); break;
    case 'edit': openSheet({ kind: 'task', id }); break;
    case 'sug-adjust': U.adjust = U.adjust === id ? null : id; render(); if (U.adjust) { const n = document.getElementById('adj-' + id); n && n.focus(); } break;
    case 'sug-keep': { const t = (S.suggested || []).find((x) => x.id === id); if (t) act((rec) => W.patch('tasks', id, { suggested: false }, rec), `Kept “${t.title}”`); break; }
    case 'sug-drop': { const t = (S.suggested || []).find((x) => x.id === id); if (t) delDoc('tasks', id, `Dismissed “${t.title}”`); break; }
    case 'del': { const t = S.tasks.find((x) => x.id === id); if (t) delDoc('tasks', id, `Deleted “${t.title}”`); break; }
    case 'tomorrow': U.showTomorrow = !U.showTomorrow; render(); break;
    case 'exp': U.exp[val] = !U.exp[val]; render(); break;
    case 'log': logHabit(id); break;
    case 'unlog': unlogHabit(id); break;
    case 'cal': { U.calMonth = addMonths(U.calMonth, +b.dataset.dir); U.calSel = U.calMonth.slice(0, 7) === TODAY.slice(0, 7) ? TODAY : U.calMonth; render(); break; }
    case 'day': U.calSel = b.dataset.d; if (U.calSel.slice(0, 7) !== U.calMonth.slice(0, 7)) U.calMonth = U.calSel.slice(0, 7) + '-01'; render(); break;
    case 'list': U.list = val; U.open = null; render(); break;
    case 'life': U.life = val; U.open = null; render(); break;
    case 'grow': U.grow = val; render(); break;
    case 'groc-toggle': { const g = S.groceries.find((x) => x.id === id); if (g) act((rec) => W.patch('groceries', id, { checked: !g.done }, rec)); break; }
    case 'groc-del': delDoc('groceries', id, 'Removed'); break;
    case 'groc-clear': act((rec) => Promise.all(S.groceries.filter((x) => x.done).map((x) => W.remove('groceries', x.id, rec))), 'Cleared the cart'); break;
    case 'li-toggle': { const x = (S.lists[U.list] || []).find((y) => y.id === id); if (x) act((rec) => W.patch('list_items', id, { status: x.done ? 'want' : 'done' }, rec)); break; }
    case 'li-del': delDoc('list_items', id, 'Removed'); break;
    case 'wish-filter': U.wishFilter = val; render(); break;
    case 'wish-bought': act((rec) => W.patch('buy_list_items', id, { status: 'bought' }, rec), 'Marked bought'); break;
    case 'wish-drop': U.open = null; act((rec) => W.patch('buy_list_items', id, { status: 'dropped' }, rec), 'Dropped'); break;
    case 'wish-back': act((rec) => W.patch('buy_list_items', id, { status: 'waiting' }, rec), 'Back on the list'); break;
    case 'wish-tag': if (TAGS[val]) act((rec) => W.patch('buy_list_items', id, { tag: val, added_date: TODAY }, rec), `Tagged ${TAGS[val].label}`); break;
    case 'wish-del': U.open = null; delDoc('buy_list_items', id, 'Deleted'); break;
    case 'recipe-add': { const r = S.recipes.find((x) => x.id === id); if (!r) break; const have = new Set(S.groceries.filter((g) => !g.done).map((g) => g.name.toLowerCase())); const miss = r.ingredients.filter((i) => !have.has(i.toLowerCase())); act((rec) => Promise.all(miss.map((n) => W.create('groceries', { name: n, group_name: guessSec(n), checked: false, sort_order: 9999 }, rec))), `Added ${plural(miss.length, 'item')} to Groceries`); break; }
    case 'recipe-cooked': { const r = S.recipes.find((x) => x.id === id); if (r) act((rec) => W.patch('recipes', id, r.cooked ? { status: 'planned' } : { status: 'archived', cooked_at: Date.now() }, rec), r.cooked ? 'Planned again' : 'Cooked, archived'); break; }
    case 'gift-toggle': { const g = S.gifts.find((x) => x.id === id); if (g) act((rec) => W.patch('gift_ideas', id, { status: g.done ? 'idea' : 'given' }, rec)); break; }
    case 'gift-del': delDoc('gift_ideas', id, 'Removed'); break;
    case 'check': { const k = b.dataset.key, wk = b.dataset.week; const c = S.checks[k]; const on = !!(c && c.value && (!wk || c.week === wk)); act((rec) => W.put('checks', k, { value: !on, updated_at: Date.now(), ...(wk ? { week: wk } : {}) }, rec)); break; }
    case 'script': U.script = !U.script; render(); break;
    case 'timer-len': U.timer.len = +val; render(); break;
    case 'timer-start': U.timer.end = Date.now() + U.timer.len * 60000; U.timer.msg = ''; render(); clearInterval(timerI); timerI = setInterval(timerTick, 1000); break;
    case 'timer-end': U.timer.end = null; U.timer.msg = 'Ended early and logged.'; logEvent('break', 'ended early', U.timer.len, 'Break logged'); render(); break;
    case 'timer-log': U.timer.msg = 'Logged.'; logEvent('break', 'logged manually', null, 'Break logged'); break;
    case 'part': logEvent('parts', val, null, 'Checked in'); break;
    case 'blend': logEvent('blended', val, null, null); break;
    case 'pet': U.petFilter = val; render(); break;
    case 'q-edit': U.editQ = id; render(); { const ta = document.querySelector('[data-form="q"] textarea'); ta && ta.focus(); } break;
    case 'q-cancel': U.editQ = null; render(); break;
    case 'keep-edit': U.editKeep = id; render(); { const i = document.querySelector('[data-form="keep"] input'); i && i.focus(); } break;
    case 'keep-cancel': U.editKeep = null; render(); break;
    case 'coll': U.coll = val; render(); break;
    case 'inspect': U.inspect = id || null; U.editKeep = null; U.kmAnim = !!U.inspect; render(); U.kmAnim = false; break;
    case 'rec': U.rec = val; render(); break;
    case 'goal-done': { const g = S.goals.find((x) => x.id === id); if (g) act((rec) => W.patch('goals', id, { status: g.done ? 'active' : 'completed' }, rec)); break; }
    case 'goal-del': { const g = S.goals.find((x) => x.id === id); if (g) delDoc('goals', id, `Deleted “${g.title}”`); break; }
    case 'quote': U.quote++; render(); break;
    default: break;
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const kind = f.dataset.form;
  if (kind === 'sheet') submitSheet(f);
  else if (kind === 'groc') { const v = f.name.value.trim(); if (!v) return; f.name.value = ''; act((rec) => W.create('groceries', { name: v, group_name: guessSec(v), checked: false, sort_order: 9999 }, rec), `Added ${v}`); const i = document.getElementById('qaG'); i && i.focus(); }
  else if (kind === 'adj') { const v = f.v.value.trim(); if (v) adjustSuggestion(f.dataset.id, v); }
  else if (kind === 'keep') labsKeepSave(f.dataset.id, f.dataset.kind, f.querySelector('[name=title]').value.trim(), f.querySelector('[name=note]').value.trim());
  else if (kind === 'q') { const v = f.querySelector('textarea').value.trim(); const id = f.dataset.id, q = +f.dataset.q; U.editQ = null; act((rec) => W.patch('goals', id, { ['progress_q' + q]: v }, rec), `Q${q} note saved`); render(); }
});
document.addEventListener('input', (e) => {
  if (!U.sheet || !e.target.closest('#sheet')) return;
  const n = e.target.name;
  if (n === 'quick') quickSync(true);
  else if (['title', 'due'].includes(n) || (n && n.startsWith('r_'))) { if (U.sheet.touched && n === 'title') U.sheet.touched.title = true; if (U.sheet.touched && n === 'due') U.sheet.touched.due = true; const form = e.target.form; if (n.startsWith('r_')) { const r = readRule(form), h = form.querySelector('#rechelp'); if (h) h.textContent = r ? LB.describeRule(r) : ''; } quickSync(false); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'logDate') { const x = document.getElementById('logEx'); if (x) x.hidden = !(isDate(e.target.value) && e.target.value < mondayOf(TODAY)); }
  if (e.target.matches('select[data-sort]')) { const k = e.target.dataset.sort; UI.sort[k] = e.target.value; saveUI(); render(); const n = document.querySelector(`select[data-sort="${CSS.escape(k)}"]`); n && n.focus(); return; }
  if (U.sheet && e.target.closest('#sheet') && e.target.name === 'rec') { if (U.sheet.touched) U.sheet.touched.rec = true; syncRec(e.target.form, ruleFor(e.target.value, e.target.form.querySelector('[name=due]').value)); quickSync(false); }
  if (U.sheet && e.target.closest('#sheet') && e.target.name === 'due') { if (U.sheet.touched) U.sheet.touched.due = true; quickSync(false); }
  if (e.target.matches('[data-act-change="sheet-list"]')) { const n = document.querySelector('#sheet [name=name]'); U.sheet = { kind: 'item', list: e.target.value, name: n ? n.value : '' }; renderSheet(); const s = document.querySelector('#sheet [name=list]'); s && s.focus(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !pop.hidden) { setPop(false); return; }
  if (e.key === 'Escape' && U.sheet) { closeSheet(); return; }
  if (U.sheet && e.key === 'Tab') { const f = [...document.querySelectorAll('#sheet button, #sheet input, #sheet select, #sheet textarea')].filter((x) => !x.disabled && x.offsetParent !== null); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  const g = e.target.closest && e.target.closest('[data-drag]');
  if (g && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); moveTask(g.dataset.drag, e.key === 'ArrowUp' ? -1 : 1); }
});

/* ---------- drag to reorder (pointer) ---------- */
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-drag]'); if (!h || e.button > 0) return;
  const li = h.closest('.task'), ul = li.parentElement;
  e.preventDefault(); try { h.setPointerCapture(e.pointerId); } catch (er) { /* synthetic or ended pointer */ }
  drag = { li, ul, h, startY: e.clientY, moved: false };
  li.classList.add('dragging');
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { li, ul } = drag, y = e.clientY;
  if (Math.abs(y - drag.startY) > 3) drag.moved = true;
  const next = li.nextElementSibling, prev = li.previousElementSibling;
  if (next) { const r = next.getBoundingClientRect(); if (y > r.top + r.height / 2) { ul.insertBefore(next, li); drag.startY += r.height; } }
  if (prev) { const r = prev.getBoundingClientRect(); if (y < r.top + r.height / 2) { ul.insertBefore(li, prev); drag.startY -= r.height; } }
  li.style.transform = `translateY(${y - drag.startY}px)`;
});
function endDrag() {
  if (!drag) return;
  const { li, ul, moved } = drag; drag = null;
  li.classList.remove('dragging'); li.style.transform = '';
  if (!moved) return;
  const k = ul.dataset.bucket, ids = [...ul.children].map((c) => c.dataset.id);
  if (['urgent', 'week', 'later', 'none'].includes(k)) applyOrder(k, ids, li.dataset.id);
  if (pendingRender) schedule();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('click', (e) => { if (e.target.closest('[data-drag]')) e.stopPropagation(); }, true);

/* ---------- collapsing header ---------- */
const bar = document.getElementById('bar');
function onScroll() { const tp = document.getElementById('top'); const th = tp ? tp.getBoundingClientRect().bottom : 0; const show = th < 6; bar.classList.toggle('show', show); bar.setAttribute('aria-hidden', String(!show)); document.getElementById('barTheme').tabIndex = show ? 0 : -1; }
addEventListener('scroll', onScroll, { passive: true });
addEventListener('hashchange', () => { readHash(); render(); });
matchMedia('(min-width:1280px)').addEventListener('change', () => render());
PHONE.addEventListener('change', () => render());
addEventListener('scroll', () => { if (!pop.hidden && popFrom && popFrom.id === 'themeBtn') setPop(false); }, { passive: true });
addEventListener('resize', () => setPop(false));
setInterval(() => { if (!U.sheet && !drag && document.visibilityState === 'visible' && U.tab === 'today' && !document.activeElement.matches('input,textarea')) render(); }, 60000);

/* ---------- Labs: habitat & garden preview (off by default; per-viewer in lb-ui) ----------
   Off: nothing below loads or runs (no three.js, no game derivation). #labs or a visitor test link
   (?visitor=<id>, #visitor=<id>, #labs-visitor-<id>) turns it on for one visit. */
const LABS = { forced: false, loading: null, ready: false, game: null, gameKey: null, metSeen: null, keeps: {} };
function labsFromUrl(href) { try { const u = new URL(href), h = u.hash.slice(1); return h === 'labs' || h === 'labs-preview' || /^labs-visitor-[\w-]+$/.test(h) || /(^|[&/])visitor=/.test(h) || u.searchParams.has('visitor'); } catch (e) { return false; } }
const labsOn = () => UI.labs === true || LABS.forced;
function loadLabs() {
  if (LABS.loading) return LABS.loading;
  const one = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  LABS.loading = Promise.all([one('garden.js'), one('habitat.js')])
    .then(() => { LABS.ready = true; schedule(); })
    .catch((e) => { console.warn('[labs] load failed', e); LABS.loading = null; });
  return LABS.loading;
}
/* pure inputs for LBGarden.deriveGame, recomputed when the data changes */
function labsGame() {
  if (!LABS.ready || LBDB.state.status !== 'ready') return null;
  if (LABS.start === undefined) { labsStart(); return null; }
  const key = S;
  if (LABS.gameKey === key && LABS.game && LABS.game.today === TODAY) return LABS.game;
  const tasks = S.tasks.map((t) => ({ eff: eff(t), done: t.done, doneDate: t.done && t.doneAt ? LB.laDateOf(t.doneAt) : null }));
  const habits = S.habits.map((h) => ({ key: h.key, name: h.name, floor: h.floor, target: h.target }));
  const sessions = S.sessions.map((x) => { const h = S.habits.find((k) => k.key === x.h || k.id === x.h); return { h: h ? h.key : x.h, date: x.date }; });
  try { LABS.game = LBGarden.deriveGame({ today: TODAY, ringGoal: RING_GOAL, tasks, habits, sessions, start: LABS.start }); } catch (e) { console.warn('[labs] derive', e); LABS.game = null; }
  LABS.gameKey = key;
  return LABS.game;
}
/* the game starts at 0 on the day Labs is first turned on: labs_state/game.started, written once, shared across devices */
let labsStartP = null;
function labsStart() {
  if (labsStartP) return labsStartP;
  labsStartP = (async () => {
    try {
      const db = await window.claude.use('db'); if (!db) throw new Error('no db');
      const col = db.collection('labs_state');
      const got = await new Promise((res) => { let off = null; off = col.onSnapshot((snap) => { const d = snap.docs.find((x) => x.id === 'game'); res(d ? (d.data ? d.data() : d) : null); off && off(); }, () => res(null)); });
      if (got && got.started) LABS.start = got.started;
      else { const body = { started: TODAY, created_at: Date.now() }; if (!LBS.validate('labs_state', body)) await col.doc('game').set(body); LABS.start = TODAY; }
    } catch (e) { LABS.start = TODAY; /* no db: start today for this page */ }
    LABS.gameKey = null; schedule();
  })();
  return labsStartP;
}
function labsGrowHTML() {
  const g = labsOn() ? labsGame() : null;
  if (g) labsKeeps();
  return growBand(g) + recordsCard() + (g ? labsLogbook(g) : '');
}
function labsCollectionHTML() {
  const g = labsOn() ? labsGame() : null;
  if (g) labsKeeps();
  return g ? LBGarden.collectionHTML(g, LABS.keeps, U.editKeep, U.inspect, U.kmAnim, U.coll) : '<div class="card pad" style="margin-top:14px"><p class="empty">Loading the collection…</p></div>';
}
/* shelf titles and notes: labs_keepsakes/<keepsake id> = { kind, title, note, updated_at }. Listens only with Labs on. */
let labsKeepsP = null;
function labsKeeps() {
  if (labsKeepsP) return labsKeepsP;
  labsKeepsP = (async () => {
    try {
      const db = await window.claude.use('db'); if (!db) return;
      db.collection('labs_keepsakes').onSnapshot((snap) => { const o = {}; snap.docs.forEach((d) => { o[d.id] = d.data ? d.data() : d; }); LABS.keeps = o; schedule(); }, () => {});
    } catch (e) { /* no db: titles stay local to this page */ }
  })();
  return labsKeepsP;
}
async function labsKeepSave(id, kind, title, note) {
  const body = { kind, title, note, updated_at: Date.now() };
  U.editKeep = null;
  LABS.keeps = { ...LABS.keeps, [id]: body }; render();
  try { if (LBS.validate('labs_keepsakes', body)) throw new Error(LBS.validate('labs_keepsakes', body)); const db = await window.claude.use('db'); await db.collection('labs_keepsakes').doc(id).set(body); toast('Saved to the shelf'); } catch (e) { toast('Could not save that note'); }
}
function labsAfterRender() {
  if (!labsOn() || !LABS.ready || !window.Habitat) return;
  const slot = document.querySelector('.labs-slot[data-labs="habitat"]');
  if (slot) Habitat.mount(slot);
  const g = labsGame();
  if (g) { Habitat.setState(g); labsVisitor(g); }
}
const labsFeed = () => { if (labsOn() && window.Habitat) Habitat.feed(6); };
/* hook for the lesson flow when it lands in app.js: call this when a lesson is answered/completed */
window.LBLabs = { feed: labsFeed, lessonDone: labsFeed, game: () => LABS.game, render: () => render() };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && U.inspect) { U.inspect = null; U.editKeep = null; render(); } });
/* "a visitor arrived": one visitors_met doc per creature per week, written only with Labs on.
   Talks to the db directly so the collection stays out of store.js's always-on listeners. */
async function labsVisitor(g) {
  if (!g.visitor || LABS.metSeen === g.visitorWeek) return;
  const who = Habitat.visitor;
  if (!who) return;
  LABS.metSeen = g.visitorWeek;
  try {
    const db = await window.claude.use('db'); if (!db) return;
    const id = (who + '-' + g.visitorWeek).replace(/[^\w-]/g, '_'), body = { creature: who, met_at: Date.now(), biome: g.reef.biome, week: g.visitorWeek, rarity: g.visitor };
    if (LBS.validate('visitors_met', body)) return;
    const col = db.collection('visitors_met');
    const seen = await new Promise((res) => { let off = null; off = col.onSnapshot((snap) => { res(snap.docs.some((d) => d.id === id)); off && off(); }, () => res(true)); });
    if (!seen) { await col.doc(id).set(body); toast(`A visitor arrived on your reef: ${who}`); }
  } catch (e) { /* preview only: never block the board */ }
}

/* ---------- boot ---------- */
try { const th = localStorage.getItem('lb-theme'); if (th === 'dark' || th === 'light') document.documentElement.dataset.theme = th; } catch (e) { /* ignore */ }
LABS.forced = labsFromUrl(location.href);
window.LB_LABS_HREF = location.href;
readHash();
if (labsOn()) loadLabs();
LBDB.start(() => { derive(); if (LBDB.state.status === 'ready') ensureRecurring(); schedule(); });
render();
