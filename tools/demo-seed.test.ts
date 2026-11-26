import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, batches, buildDocs, invalidDocs, isRealDate, reconcile, todayIn } from './demo-seed.ts';

const seed = JSON.parse(readFileSync(new URL('../demo/seed.json', import.meta.url), 'utf8')) as Parameters<typeof buildDocs>[0];

describe('demo seed', () => {
  const ops = buildDocs(seed, '2026-11-25');

  it('makes only documents the db schemas accept', () => {
    expect(invalidDocs(ops)).toEqual([]);
  });

  it('is marked as a demo and resolves offsets against today', () => {
    expect(ops.find((o) => o.collection === 'checks')?.data['value']).toMatchObject({ demo: true });
    expect(ops.find((o) => o.doc_id === 'task-groceries')?.data['due_date']).toBe('2026-11-25');
    expect(ops.find((o) => o.doc_id === 'task-filter')?.data['due_date']).toBe('2026-11-24');
    expect(ops.find((o) => o.doc_id === 'task-trail')?.data['due_date']).toBeNull();
  });

  it('has unique doc ids per collection and batches within the size limit', () => {
    expect(new Set(ops.map((o) => `${o.collection}/${o.doc_id}`)).size).toBe(ops.length);
    expect(batches(ops).every((b) => b.length <= BATCH_SIZE)).toBe(true);
  });

  it('flags a doc the schemas reject', () => {
    expect(invalidDocs([{ op: 'set', collection: 'tasks', doc_id: 'x', data: { status: 'open' } }])).toHaveLength(1);
  });

  it('seeds checks/starter so the page adds no starter tasks', () => {
    expect(ops.some((o) => o.collection === 'checks' && o.doc_id === 'starter')).toBe(true);
  });

  it('names sessions by offset so a reseed on another day replaces them', () => {
    const ids = (today: string): string[] => buildDocs(seed, today).filter((o) => o.collection === 'habit_sessions').map((o) => o.doc_id);
    expect(ids('2026-11-25')).toEqual(ids('2026-12-03'));
  });

  it('reseeds an existing board: if_version on existing docs, pinned deletes for the rest', () => {
    const existing = new Map([
      ['tasks', new Map([['task-walk', 4], ['starter-1', 2], ['starter-7', 9]])],
      ['checks', new Map([['profile', 3]])],
      ['groceries', new Map([['g1', 1]])],
    ]);
    const out = reconcile(ops, existing);
    expect(out.find((o) => o.doc_id === 'task-walk')).toMatchObject({ op: 'set', if_version: 4 });
    expect(out.find((o) => o.doc_id === 'task-dentist')).not.toHaveProperty('if_version');
    expect(out.filter((o) => o.op === 'delete')).toEqual([
      { op: 'delete', collection: 'tasks', doc_id: 'starter-1', if_version: 2 },
      { op: 'delete', collection: 'tasks', doc_id: 'starter-7', if_version: 9 },
    ]);
  });
});

describe('demo seed dates', () => {
  it('rejects dates that are not real', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '26-11-25', 'today']) expect(isRealDate(bad)).toBe(false);
  });

  it('takes today in the given time zone, not UTC', () => {
    const instant = new Date('2026-11-25T02:00:00Z');
    expect(todayIn('America/New_York', instant)).toBe('2026-11-24');
    expect(todayIn('UTC', instant)).toBe('2026-11-25');
  });
});
