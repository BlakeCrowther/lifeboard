/* The task sheet's repeat fields (names start r_ under the Repeats select) and the quick field's live preview. */
import { MONTH_NAMES } from '../../dates/index.ts';
import type { RecurrenceRule } from '../../db/schema.ts';
import { clock, relativeDay, weekdayName } from '../shared/clock.ts';
import { clockLabel, escapeHtml } from '../shared/format.ts';
import { icon } from '../shared/icons.ts';
import { viewState } from '../shared/state.ts';
import { ruleDescription, ruleShortLabel } from '../shared/writes.ts';
import { parseQuickAdd, ruleOfRepeat } from '../quick-add.ts';
import { presetOf, ruleForPreset } from '../repeat-presets.ts';

type Option = readonly [value: string | number, label: string];
const ORDINALS: readonly Option[] = [[1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [-1, 'Last']];
const WEEKDAYS: readonly Option[] = [0, 1, 2, 3, 4, 5, 6].map((i) => [i, weekdayName(i)] as const);
const MONTHS: readonly Option[] = MONTH_NAMES.map((m, i) => [i + 1, m] as const);

export function repeatFields(r: RecurrenceRule | null): string {
  if (!r) return '';
  const field = (k: string): unknown => (r as Record<string, unknown>)[k];
  const num = (k: string, label: string, min: number, max: number): string => `<label class="fld"><span>${label}</span><input type="number" name="r_${k}" min="${String(min)}" max="${String(max)}" inputmode="numeric" value="${escapeHtml(field(k) ?? min)}"></label>`;
  const sel = (k: string, label: string, opts: readonly Option[]): string => `<label class="fld"><span>${label}</span><select name="r_${k}">${opts.map(([v, t]) => `<option value="${String(v)}" ${String(field(k)) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const p = presetOf(r), k = r.kind;
  let f = '';
  if (p === 'interval') f = num('every', 'Every', 1, 366) + sel('unit', 'Unit', [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months'], ['year', 'Years']]) + sel('basis', 'Counted from', [['completion', 'The day I finish it'], ['schedule', 'Its do date']]);
  else if (k === 'monthly_day' && p !== 'monthly_first') f = num('day', 'Day of month', 1, 31) + num('every_months', 'Every N months', 1, 24);
  else if (p === 'monthly_first' || k === 'monthly_last_day') f = num('every_months', 'Every N months', 1, 24);
  else if (k === 'monthly_weekday') f = sel('ordinal', 'Which', ORDINALS) + sel('weekday', 'Weekday', WEEKDAYS) + num('every_months', 'Every N months', 1, 24);
  else if (k === 'yearly_day') f = sel('month', 'Month', MONTHS) + num('day', 'Day', 1, 31);
  else if (k === 'yearly_first_day' || k === 'yearly_last_day') f = sel('month', 'Month', MONTHS);
  else if (k === 'yearly_weekday') f = sel('ordinal', 'Which', ORDINALS) + sel('weekday', 'Weekday', WEEKDAYS) + sel('month', 'Month', MONTHS);
  return f ? `<div class="three">${f}</div>` : '';
}

const valueOf = (form: ParentNode, name: string): string | null => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? null;
const RULE_FIELDS = ['every', 'unit', 'basis', 'day', 'every_months', 'ordinal', 'weekday', 'month'] as const;
const NUMBER_FIELDS: readonly string[] = ['every', 'day', 'every_months', 'ordinal', 'weekday', 'month'];
/** The rule the form shows: the preset gives the kind, r_ fields the numbers. */
export function readRule(form: ParentNode): RecurrenceRule | null {
  const rule = ruleForPreset(valueOf(form, 'rec') || 'none', valueOf(form, 'due'), clock.today);
  if (!rule) return null;
  const fields = rule as Record<string, unknown>;
  for (const k of RULE_FIELDS) {
    const x = valueOf(form, 'r_' + k);
    if (x == null || x === '' || !(k in fields)) continue;
    fields[k] = NUMBER_FIELDS.includes(k) ? Math.round(Number(x)) : x;
  }
  return rule;
}
export function syncRepeatFields(form: ParentNode, rule: RecurrenceRule | null): void {
  const box = form.querySelector('#recx'), help = form.querySelector('#rechelp');
  if (box) box.innerHTML = repeatFields(rule);
  if (help) help.textContent = rule ? ruleDescription(rule) + (rule.kind !== 'interval' ? ' Set the do date on a matching day so the chain stays anchored.' : '') : '';
}

/** Reads the quick field into the full form (fields the person hasn't touched), then draws chips from the form itself. */
export function quickSync(fromParse: boolean): void {
  const sh = document.getElementById('sheet'), c = viewState.sheet;
  if (!sh || !c || c.kind !== 'task' || c.id) return;
  const q = sh.querySelector<HTMLInputElement>('[name=quick]');
  if (!q) return;
  const form = sh.querySelector('form');
  const input = (n: string): HTMLInputElement | HTMLSelectElement | null => sh.querySelector(`[name=${n}]`);
  const touched = (c.touched ??= {});
  const p = parseQuickAdd(q.value, clock.today);
  c.time = p.time;
  const title = input('title'), due = input('due'), rec = input('rec');
  if (fromParse && form) {
    if (!touched.title && title) title.value = p.title;
    if (!touched.due && due) due.value = p.date || (p.repeat ? clock.today : c.baseDue ?? '');
    if (!touched.rec && rec) { const r = ruleOfRepeat(p.repeat); rec.value = presetOf(r); syncRepeatFields(form, r); }
  }
  const dueValue = due?.value ?? '', rule = form ? readRule(form) : null, has = q.value.trim() || title?.value.trim();
  const chips = has ? [
    `<span class="chip">${icon('calendar', 14)}${dueValue ? relativeDay(dueValue) : 'No date yet'}</span>`,
    rule ? `<span class="chip">${icon('repeat', 14)}${escapeHtml(ruleShortLabel(rule))}</span>` : '',
    p.time != null ? `<span class="chip num">${icon('clock', 14)}${clockLabel(p.time)} · goes in notes</span>` : '',
  ].join('') : '';
  const box = sh.querySelector('#pchips');
  if (box) box.innerHTML = chips;
}
