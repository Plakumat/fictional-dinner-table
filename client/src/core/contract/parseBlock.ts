// Decision: The only door from a server block to a component: valid, unknown or invalid, never anything else.
// Pinned by: core/contract/parseBlock.test.ts; ui/ui.test.tsx (an invalid prompt renders no Confirm control)

import { BLOCK_SCHEMAS, SUPPORTED_VERSION, auditSchema, formatIssue, isPlainObject, type Audit, type Block, type BlockType } from './schemas';

/**
 * The only way a server block becomes something a component may draw.
 *
 * Renderers accept `Block` (the `valid` arm) and nothing else, so drawing an
 * unvalidated block, and above all a Confirm control for one, is a type error
 * rather than a matter of discipline.
 */
export type ParsedBlock =
  | { kind: 'valid'; block: Block }
  /** A `type` outside the v1 catalog: skipped, the rest of the response renders. */
  | { kind: 'unknown'; type: string; raw: unknown }
  /** A catalog type that violates its schema: never drawn with its data. */
  | { kind: 'invalid'; type: BlockType | null; problems: string[]; raw: unknown };

export type ParsedAudit = { kind: 'valid'; audit: Audit; raw: unknown } | { kind: 'invalid'; problems: string[]; raw: unknown };

const deepFreeze = (value: unknown): void => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
};

export function parseBlock(raw: unknown): ParsedBlock {
  if (!isPlainObject(raw) || typeof raw.type !== 'string') {
    return { kind: 'invalid', type: null, problems: ['block is not an object with a string "type"'], raw };
  }
  // hasOwn, not `in`: a block with type "constructor" must not find Object.prototype.
  if (!Object.hasOwn(BLOCK_SCHEMAS, raw.type)) {
    return { kind: 'unknown', type: raw.type, raw };
  }
  const type = raw.type as BlockType;
  const result = BLOCK_SCHEMAS[type].safeParse(raw);
  if (!result.success) {
    return { kind: 'invalid', type, problems: result.error.issues.map(formatIssue), raw };
  }
  const block = result.data as Block;
  // "Send exactly what was shown": after this point nobody can edit the params
  // the token is bound to. A write throws (modules are strict mode).
  if (block.type === 'confirmation_prompt') deepFreeze(block.params);
  return { kind: 'valid', block };
}

export function parseAudit(raw: unknown): ParsedAudit {
  const result = auditSchema.safeParse(raw);
  return result.success ? { kind: 'valid', audit: result.data, raw } : { kind: 'invalid', problems: result.error.issues.map(formatIssue), raw };
}

/**
 * A whole ui_spec document, as returned by POST /api/actions/execute and by
 * GET /api/conversations/:id. Blocks are parsed one by one so that a single bad
 * block does not take the rest of the response down with it.
 */
export type ParsedDocument =
  | { kind: 'document'; blocks: ParsedBlock[]; audit: ParsedAudit }
  | { kind: 'unsupported_version'; version: string }
  | { kind: 'malformed'; problems: string[] };

export function parseDocument(raw: unknown): ParsedDocument {
  if (!isPlainObject(raw)) return { kind: 'malformed', problems: ['response is not an object'] };
  if (raw.version !== SUPPORTED_VERSION) {
    return { kind: 'unsupported_version', version: String(raw.version) };
  }
  if (!Array.isArray(raw.blocks)) return { kind: 'malformed', problems: ['blocks is not an array'] };
  return { kind: 'document', blocks: raw.blocks.map(parseBlock), audit: parseAudit(raw.audit) };
}
