import { COLLECTION_SCHEMAS, RULE_KINDS, RULE_SCHEMAS, type CollectionName } from './schemas.ts';

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCollection = (c: string): c is CollectionName => Object.hasOwn(COLLECTION_SCHEMAS, c);
const isRuleKind = (k: unknown): k is (typeof RULE_KINDS)[number] => typeof k === 'string' && (RULE_KINDS as readonly string[]).includes(k);

/** Why a recurrence rule is unusable, or null when it is fine. */
export function ruleError(rule: unknown): string | null {
  if (!isPlainObject(rule)) return 'recurrence_rule is not an object';
  const kind = rule['kind'];
  if (!isRuleKind(kind)) return 'unknown recurrence kind';
  const issue = RULE_SCHEMAS[kind].safeParse(rule).error?.issues[0];
  if (!issue) return null;
  const field = String(issue.path[0]);
  return field === 'every_months' || field === 'basis' ? `bad ${field}` : `recurrence ${kind} needs a valid ${field}`;
}

/** Why `doc` can't be stored in `collection`, or null when it can. Reports the first bad field in schema order. */
export function validate(collection: string, doc: unknown): string | null {
  if (!isCollection(collection)) return 'unknown collection';
  if (!isPlainObject(doc)) return 'not an object';
  const issue = COLLECTION_SCHEMAS[collection].safeParse(doc).error?.issues[0];
  if (!issue) return null;
  const field = String(issue.path[0]);
  if (doc[field] == null) return `missing ${field}`;
  return field === 'recurrence_rule' ? ruleError(doc[field]) : `bad ${field}`;
}
