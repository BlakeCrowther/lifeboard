/* The Lists tab: groceries, wish list, recipes, gifts, and the list_items lists (books, movies…). */
import { BUY_LIST_TAGS } from '../../tasks/icons.ts';
import { GROCERY_AISLES, type BuyListItem, type GiftIdea, type Grocery, type ListItem, type Recipe } from '../board-model.ts';
import { clock } from '../shared/clock.ts';
import { escapeHtml, externalLink, plural, safeUrl } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { areaHeader, fold, sortControl, sortItems, sortOf } from '../shared/sections.ts';
import { model, viewState } from '../shared/state.ts';
import { listKindsFor, wishTimer, type ListKind } from '../list-kinds.ts';

export const boardListKinds = (): ListKind[] => listKindsFor(Object.keys(model.listItemsByKey));
const TAG_KEYS = Object.keys(BUY_LIST_TAGS);
const TAG_ENTRIES = Object.entries(BUY_LIST_TAGS);

function openCount(key: string): number {
  if (key === 'groceries') return model.groceries.filter((g) => !g.done).length;
  if (key === 'wish') return model.buyListItems.filter((w) => w.status === 'waiting').length;
  if (key === 'recipes') return model.recipes.filter((r) => !r.cooked).length;
  if (key === 'gifts') return model.giftIdeas.filter((g) => !g.done).length;
  return (model.listItemsByKey[key] ?? []).filter((x) => !x.done).length;
}
function itemRow(x: Grocery | ListItem, kind: 'groc' | 'li', def?: ListKind): string {
  const doneWord = (def?.done ?? '').toLowerCase();
  const label = kind === 'groc' ? (x.done ? 'In cart' : 'Got it') : x.done ? 'Not ' + doneWord : 'Mark ' + doneWord;
  const by = 'by' in x ? x.by : '', notes = 'notes' in x ? x.notes : '', url = 'url' in x ? x.url : undefined;
  const meta = [by ? escapeHtml(by) : '', notes ? escapeHtml(notes) : ''].filter(Boolean).join(' · ');
  return `<li class="item${x.done ? ' done' : ''}"><button class="tick" data-act="${kind}-toggle" data-id="${x.id}" aria-pressed="${String(x.done)}" aria-label="${label}: ${escapeHtml(x.name)}"><span class="ring">${icon('check', 16)}</span></button>
    <span class="tmain"><span class="ttl">${externalLink(url, escapeHtml(x.name))}</span>${meta ? `<span class="tmeta"><span class="m">${meta}</span></span>` : ''}</span>
    <button class="act" data-act="${kind}-del" data-id="${x.id}" aria-label="Remove ${escapeHtml(x.name)}">${icon('x', 18)}</button></li>`;
}

function groceriesBody(): string {
  const mode = sortOf('groceries'), open = model.groceries.filter((g) => !g.done), got = sortItems(model.groceries.filter((g) => g.done), mode, (g) => g.name);
  const groups = mode === 'aisle'
    ? GROCERY_AISLES.filter((aisle) => open.some((g) => g.aisle === aisle)).map((aisle) => `<div class="group-l">${aisle} <span class="ct num">${String(open.filter((g) => g.aisle === aisle).length)}</span></div><div class="card"><ul class="list">${open.filter((g) => g.aisle === aisle).map((g) => itemRow(g, 'groc')).join('')}</ul></div>`).join('')
    : open.length ? `<div class="card"><ul class="list">${sortItems(open, mode, (g) => g.name).map((g) => itemRow(g, 'groc')).join('')}</ul></div>` : '';
  return `<form class="qa" data-form="groc"><label class="sr" for="qaG">Add to groceries</label><input id="qaG" name="name" placeholder="Add an item, e.g. limes" autocomplete="off" enterkeyhint="done"><button class="btn primary" type="submit" aria-label="Add to groceries">${icon('plus', 20)}</button></form>
      ${model.groceries.length ? sortControl('groceries', 'groceries') : ''}
      ${groups || `<div class="card"><p class="empty">${got.length ? 'Everything is in the cart.' : 'The list is empty. Add what you need above.'}</p></div>`}
      ${got.length ? `<div class="group-l" style="justify-content:space-between">In the cart · ${String(got.length)}<button class="link" data-act="groc-clear">Clear</button></div><div class="card"><ul class="list">${got.map((g) => itemRow(g, 'groc')).join('')}</ul></div>` : ''}`;
}

function wishBody(): string {
  const mode = sortOf('wish'), today = clock.today;
  const price = (w: BuyListItem): number => { const n = parseFloat((w.price || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 1e12 : n; };
  const readyFirst = (a: BuyListItem, b: BuyListItem): number => { const x = wishTimer(a, today), y = wishTimer(b, today); return (Number(y.isReady) - Number(x.isReady)) || ((x.left ?? 1e9) - (y.left ?? 1e9)); };
  const waiting = model.buyListItems.filter((w) => w.status === 'waiting');
  const filtered = waiting.filter((w) => viewState.wishFilter === 'all' || w.tag === viewState.wishFilter);
  const items = mode === 'new' ? filtered.slice().reverse()
    : mode === 'tag' ? filtered.slice().sort((a, b) => TAG_KEYS.indexOf(a.tag) - TAG_KEYS.indexOf(b.tag) || readyFirst(a, b))
    : mode === 'price' ? filtered.slice().sort((a, b) => price(a) - price(b) || readyFirst(a, b))
    : filtered.slice().sort(readyFirst);
  const finished = (status: BuyListItem['status'], label: string): string => {
    const l = model.buyListItems.filter((w) => w.status === status);
    return l.length ? fold('wish-' + status, label, { openByDefault: false, count: l.length, summary: l.slice(0, 3).map((w) => escapeHtml(w.name)).join(', '),
      body: `<div class="card"><ul class="list">${l.map((w) => `<li class="item done" style="grid-template-columns:1fr auto"><span class="tmain" style="padding-left:4px"><span class="ttl">${externalLink(w.url, escapeHtml(w.name))}</span></span><button class="btn sm ghost" data-act="wish-back" data-id="${w.id}">Put back</button></li>`).join('')}</ul></div>` }) : '';
  };
  const row = (w: BuyListItem): string => {
    const c = wishTimer(w, today), open = viewState.expandedId === w.id;
    return `<li class="item" style="grid-template-columns:1fr auto">
        <button class="tmain" data-act="expand" data-id="${w.id}" aria-expanded="${String(open)}" style="padding-left:4px"><span class="ttl">${escapeHtml(w.name)}</span><span class="tmeta"><span class="chip${c.isReady ? ' hot' : ''}">${BUY_LIST_TAGS[w.tag].label}</span>${w.price ? `<span class="m num">${escapeHtml(w.price)}</span>` : ''}<span class="m${c.isReady ? ' hot' : ''}">${c.days == null ? 'No timer' : c.isReady ? 'Ready' : `${plural(c.left ?? 0, 'day')} to settle`}</span></span>${c.days ? `<span class="timer-bar" aria-hidden="true"><i style="width:${String(Math.round(c.pct * 100))}%"></i></span>` : ''}</button>
        <button class="btn sm" data-act="wish-bought" data-id="${w.id}">Bought</button>
        ${open ? `<div class="tray" style="grid-column:1/-1">${w.notes ? `<p class="small muted" style="width:100%;margin:0">${escapeHtml(w.notes)}</p>` : ''}${safeUrl(w.url) ? `<p class="small" style="width:100%;margin:0">${externalLink(w.url, 'Open link')}</p>` : ''}<span class="small muted" style="width:100%">Change tag (restarts the timer):</span>${TAG_ENTRIES.map(([k, t]) => `<button class="seg" data-act="wish-tag" data-id="${w.id}" data-val="${k}" aria-pressed="${String(w.tag === k)}">${t.label}</button>`).join('')}<button class="btn sm" data-act="wish-drop" data-id="${w.id}">Drop it</button><button class="btn sm ghost" data-act="wish-del" data-id="${w.id}">${icon('trash', 18)}Delete</button></div>` : ''}
      </li>`;
  };
  const filters: [string, string][] = [['all', 'All'], ...TAG_ENTRIES.map(([k, t]): [string, string] => [k, t.label])];
  return `<p class="small muted" style="margin:0 4px 10px">A cooling-off timer for wants. <b>Need</b> is ready now, <b>Love</b> waits 7 days, <b>Like</b> 30, <b>One day</b> has no timer. Ready means it has settled, not that it's approved.</p>
      ${waiting.length ? `<div class="scroller" role="group" aria-label="Filter by tag">${filters.map(([k, l]) => `<button class="seg" data-act="wish-filter" data-val="${k}" aria-pressed="${String(viewState.wishFilter === k)}">${l}</button>`).join('')}</div>
      <div style="margin-top:6px">${sortControl('wish', 'wish list')}</div>` : ''}
      <div class="card">${items.length ? `<ul class="list">${items.map(row).join('')}</ul>` : `<p class="empty">${waiting.length ? 'Nothing with that tag.' : 'Nothing waiting. The + button adds a want with a tag.'}</p>`}</div>
      ${finished('bought', 'Bought')}${finished('dropped', 'Dropped')}`;
}

function recipesBody(): string {
  const have = new Set(model.groceries.filter((g) => !g.done).map((g) => g.name.toLowerCase()));
  const planned = sortItems(model.recipes.filter((r) => !r.cooked), sortOf('recipes'), (r) => r.name), cooked = model.recipes.filter((r) => r.cooked).sort((a, b) => (b.cookedAt || 0) - (a.cookedAt || 0));
  const card = (r: Recipe): string => {
    const missing = r.ingredients.filter((i) => !have.has(i.toLowerCase()));
    const meta = [r.time, r.mood, r.ingredients.join(', ')].filter(Boolean).map(escapeHtml).join(' · ');
    return `<div class="recipe">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h4>${externalLink(r.url, escapeHtml(r.name))}</h4>${meta ? `<p class="small muted" style="margin:2px 0 0">${meta}</p>` : ''}${r.notes ? `<p class="small" style="margin:2px 0 0">${escapeHtml(r.notes)}</p>` : ''}</div>
      <button class="tick" data-act="recipe-cooked" data-id="${r.id}" aria-pressed="${String(r.cooked)}" aria-label="${r.cooked ? 'Plan again' : 'Cooked, archive'}: ${escapeHtml(r.name)}"><span class="ring">${icon('check', 16)}</span></button></div>
      ${!r.cooked && r.ingredients.length ? `<button class="btn sm" style="margin-top:8px" data-act="recipe-add" data-id="${r.id}" ${missing.length ? '' : 'disabled'}>${icon('cart', 18)}${missing.length ? `Add ${plural(missing.length, 'ingredient')} to groceries` : 'All on the grocery list'}</button>` : ''}</div>`;
  };
  return `<p class="small muted" style="margin:0 4px 10px">This week's cooking. Tick one when it's cooked and it moves to the archive.</p>${planned.length > 1 ? sortControl('recipes', 'recipes') : ''}
      <div class="card">${planned.length ? planned.map(card).join('') : '<p class="empty">No recipes planned. The + button adds one.</p>'}</div>
      ${cooked.length ? fold('cooked', 'Cooked', { openByDefault: false, count: cooked.length, summary: cooked.slice(0, 3).map((r) => escapeHtml(r.name)).join(', '), body: `<div class="card">${cooked.map(card).join('')}</div>` }) : ''}`;
}

function giftsBody(): string {
  const people = [...new Set(model.giftIdeas.map((g) => g.person))].sort(), mode = sortOf('gifts');
  const row = (g: GiftIdea, who: boolean): string => `<li class="item${g.done ? ' done' : ''}"><button class="tick" data-act="gift-toggle" data-id="${g.id}" aria-pressed="${String(g.done)}" aria-label="${g.done ? 'Given' : 'Mark given'}: ${escapeHtml(g.idea || g.person)}"><span class="ring">${icon('check', 16)}</span></button><span class="tmain"><span class="ttl">${externalLink(g.url, escapeHtml(g.idea || '(no idea yet)'))}</span>${who ? `<span class="tmeta"><span class="m">${escapeHtml(g.person)}</span></span>` : ''}</span><button class="act" data-act="gift-del" data-id="${g.id}" aria-label="Remove ${escapeHtml(g.idea || g.person)}">${icon('x', 18)}</button></li>`;
  if (!model.giftIdeas.length) return '<div class="card"><p class="empty">No gift ideas yet. The + button adds one for someone.</p></div>';
  return sortControl('gifts', 'gifts') + (mode === 'new'
    ? `<div class="card"><ul class="list">${model.giftIdeas.slice().reverse().map((g) => row(g, true)).join('')}</ul></div>`
    : people.map((p) => `<div class="group-l">${escapeHtml(p)}</div><div class="card"><ul class="list">${model.giftIdeas.filter((g) => g.person === p).map((g) => row(g, false)).join('')}</ul></div>`).join(''));
}

function listItemsBody(def: ListKind): string {
  const items = model.listItemsByKey[def.key] ?? [], mode = sortOf(def.key);
  const open = sortItems(items.filter((x) => !x.done), mode, (x) => x.name), done = sortItems(items.filter((x) => x.done), mode, (x) => x.name);
  return `${items.length ? sortControl(def.key, def.title.toLowerCase()) : ''}<div class="card">${open.length ? `<ul class="list">${open.map((x) => itemRow(x, 'li', def)).join('')}</ul>` : `<p class="empty">${items.length ? 'All caught up.' : 'Nothing here yet. The + button adds one.'}</p>`}</div>
      ${done.length ? `<div class="group-l">${escapeHtml(def.done)} · ${String(done.length)}</div><div class="card"><ul class="list">${done.map((x) => itemRow(x, 'li', def)).join('')}</ul></div>` : ''}`;
}

export function viewLists(): string {
  const defs = boardListKinds();
  if (!defs.some((l) => l.key === viewState.listKey)) viewState.listKey = 'groceries';
  const def = defs.find((l) => l.key === viewState.listKey) ?? defs[0];
  if (!def) return '';
  const key = def.key;
  const body = key === 'groceries' ? groceriesBody() : key === 'wish' ? wishBody() : key === 'recipes' ? recipesBody() : key === 'gifts' ? giftsBody() : listItemsBody(def);
  return `${areaHeader('lists', def.icon, 'Lists', 'Shopping, wants, food, gifts and everything to read or watch.')}
    <div class="lsplit"><div class="scroller" role="tablist" aria-label="Lists">${defs.map((l) => `<button class="seg sub k-lists" role="tab" data-act="list" data-val="${escapeHtml(l.key)}" aria-selected="${String(viewState.listKey === l.key)}">${icon(l.icon, 17)}${escapeHtml(l.title)} <span class="ct num">${String(openCount(l.key))}</span></button>`).join('')}</div>
    <section class="sec flow" style="margin-top:8px" role="tabpanel" aria-label="${escapeHtml(def.title)}">${body}</section></div>`;
}
