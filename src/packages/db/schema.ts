// Collection names, zod schemas, the types inferred from them, and validate(collection, doc).
export {
  COLLECTION_SCHEMAS,
  LESSON_FORMATS,
  OPTIONAL_COLLECTIONS,
  RULE_KINDS,
  RULE_SCHEMAS,
  STORE_COLLECTIONS,
  recurrenceRuleSchema,
  type CollectionDoc,
  type CollectionName,
  type RecurrenceRule,
  type RuleKind,
  type StoreCollection,
} from './lib/schemas.ts';
export { ruleError, validate } from './lib/validate.ts';
