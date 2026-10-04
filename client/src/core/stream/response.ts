// Decision: What the transport does not guarantee is handled here and nowhere else: duplicates, order, missing done, wrong version, events for a response that has ended.
// Pinned by: core/stream/stream.test.ts; state/chatStore.test.ts (stopped and superseded streams)

import { parseAudit, parseBlock, type ParsedAudit, type ParsedBlock, type ParsedDocument } from '../contract/parseBlock';
import { SUPPORTED_VERSION } from '../contract/schemas';
import { parseLine, type StreamEvent } from './events';

/**
 * One assistant response, built up from stream events by a pure reducer.
 *
 * Everything the transport does not guarantee is handled here and nowhere
 * else: duplicates, events for the wrong block, a missing `done`, an
 * unsupported version. The functions take a state and return a state, so each
 * of those behaviours is a plain unit test.
 */
export interface ResponseState {
  phase: Phase;
  /** Highest `seq` applied so far. `seq` is strictly increasing, so anything at or below it is a duplicate. */
  lastSeq: number;
  meta: StreamMeta | null;
  /** Position = the block's `index` in the final document. `null` = not received (yet). */
  blocks: readonly (ParsedBlock | null)[];
  audit: ParsedAudit | null;
  /** What went wrong, for the audit inspector. Never shown as raw text to the user. */
  issues: readonly Issue[];
}

export type Phase =
  /** Request sent, nothing received. */
  | { kind: 'connecting' }
  | { kind: 'streaming' }
  /** `done` arrived. The only phase in which a response may look finished. */
  | { kind: 'complete' }
  /** The stream closed, or stopped making sense, before `done`. What arrived stays on screen. */
  | { kind: 'incomplete'; reason: 'closed_without_done' | 'corrupt_stream' }
  /** The server gave up: an `error` event, or an HTTP error instead of a stream. */
  | {
      kind: 'failed';
      code: string;
      message: string;
      retryable: boolean;
      httpStatus?: number;
      /** Rate limited: no retry before this instant, on the local monotonic timer (performance.now()). */
      retryNotBeforeMs?: number;
    }
  /** Aborted on this side. Nothing that arrives later may be applied. */
  | { kind: 'stopped'; by: 'user' | 'new_message' | 'user_switch' }
  /** Not version "1": nothing is rendered at all. */
  | { kind: 'unsupported_version'; version: string };

export interface StreamMeta {
  requestId: string;
  conversationId: string;
  serverNow: string;
}

export interface Issue {
  kind: 'unknown_block' | 'invalid_block' | 'invalid_audit' | 'protocol';
  message: string;
  index?: number;
  details?: readonly string[];
}

/** A response is a handful of blocks. An index far beyond that is a bug or an attack, not a document. */
export const MAX_BLOCKS = 200;

export const initialResponse = (): ResponseState => ({
  phase: { kind: 'connecting' },
  lastSeq: 0,
  meta: null,
  blocks: [],
  audit: null,
  issues: [],
});

/** Still receiving: the only phases in which an event can change anything. */
export const isOpen = (phase: Phase): boolean => phase.kind === 'connecting' || phase.kind === 'streaming';

const withIssue = (state: ResponseState, issue: Issue): ResponseState => ({
  ...state,
  issues: [...state.issues, issue],
});

const blockIssue = (parsed: ParsedBlock, index: number): Issue | null => {
  if (parsed.kind === 'unknown') {
    return { kind: 'unknown_block', index, message: `Unknown block type "${parsed.type}" skipped` };
  }
  if (parsed.kind === 'invalid') {
    return {
      kind: 'invalid_block',
      index,
      message: `Invalid ${parsed.type ?? 'block'} not rendered`,
      details: parsed.problems,
    };
  }
  return null;
};

export function applyEvent(state: ResponseState, event: StreamEvent): ResponseState {
  // Stopped, failed, complete: nothing lands in a response that has ended.
  if (!isOpen(state.phase)) return state;
  // At-least-once delivery: this event was already applied.
  if (event.seq <= state.lastSeq) return state;

  const next: ResponseState = { ...state, lastSeq: event.seq };

  if (next.meta === null) {
    // `meta` is always first, and it carries the version. Until we have seen
    // it we do not know whether we can read what follows.
    if (event.event !== 'meta') {
      return withIssue(next, { kind: 'protocol', message: `"${event.event}" arrived before meta and was ignored` });
    }
    if (event.version !== SUPPORTED_VERSION) {
      return { ...next, phase: { kind: 'unsupported_version', version: event.version } };
    }
    return {
      ...next,
      phase: { kind: 'streaming' },
      meta: { requestId: event.request_id, conversationId: event.conversation_id, serverNow: event.server_now },
    };
  }

  switch (event.event) {
    case 'meta':
      return withIssue(next, { kind: 'protocol', message: 'A second meta event was ignored' });

    case 'block': {
      if (event.index >= MAX_BLOCKS) {
        return withIssue(next, { kind: 'protocol', index: event.index, message: 'Block index out of range, ignored' });
      }
      if (next.blocks[event.index] != null) {
        return withIssue(next, { kind: 'protocol', index: event.index, message: 'A second block for the same index was ignored' });
      }
      const parsed = parseBlock(event.block);
      const blocks = next.blocks.slice();
      while (blocks.length < event.index) blocks.push(null);
      blocks[event.index] = parsed;
      const issue = blockIssue(parsed, event.index);
      return issue ? withIssue({ ...next, blocks }, issue) : { ...next, blocks };
    }

    case 'text_delta': {
      const slot = next.blocks[event.index];
      // A delta only ever extends a block that was validated as text.
      if (slot?.kind !== 'valid' || slot.block.type !== 'text') {
        return withIssue(next, { kind: 'protocol', index: event.index, message: 'text_delta for a block that is not text, ignored' });
      }
      const blocks = next.blocks.slice();
      blocks[event.index] = { kind: 'valid', block: { type: 'text', markdown: slot.block.markdown + event.delta } };
      return { ...next, blocks };
    }

    case 'audit': {
      const audit = parseAudit(event.audit);
      const withAudit = { ...next, audit };
      return audit.kind === 'invalid'
        ? withIssue(withAudit, { kind: 'invalid_audit', message: 'Audit record failed validation', details: audit.problems })
        : withAudit;
    }

    case 'done':
      return { ...next, phase: { kind: 'complete' } };

    case 'error':
      return { ...next, phase: { kind: 'failed', code: event.code, message: event.message, retryable: event.retryable } };
  }
}

/** One line of the NDJSON stream. */
export function applyLine(state: ResponseState, line: string): ResponseState {
  if (!isOpen(state.phase)) return state;
  const parsed = parseLine(line);
  switch (parsed.kind) {
    case 'event':
      return applyEvent(state, parsed.event);
    case 'unknown_event':
      return withIssue(state, { kind: 'protocol', message: `Unknown stream event "${parsed.name}" skipped` });
    case 'corrupt':
      // Deltas are appended in order. After a line we cannot read, carrying on
      // could silently produce text with a hole in it, so the response ends
      // here, visibly unfinished.
      return withIssue(
        { ...state, phase: { kind: 'incomplete', reason: 'corrupt_stream' } },
        { kind: 'protocol', message: `Unreadable stream line: ${parsed.reason}` },
      );
  }
}

/**
 * The connection closed. `tail` is whatever the decoder still held without a
 * newline. A response is complete only if `done` arrived: the amount of content
 * received says nothing.
 */
export function closeStream(state: ResponseState, tail: string | null): ResponseState {
  let next = state;
  if (tail !== null && isOpen(next.phase)) {
    // A complete JSON object is self-delimiting, so a final line that parses is
    // a real event whose newline was omitted. One that does not parse is the
    // head of a line the connection cut: dropped, and noted.
    next =
      parseLine(tail).kind === 'corrupt'
        ? withIssue(next, { kind: 'protocol', message: 'The stream was cut in the middle of a line' })
        : applyLine(next, tail);
  }
  return isOpen(next.phase) ? { ...next, phase: { kind: 'incomplete', reason: 'closed_without_done' } } : next;
}

/** Ends an open response from this side (Stop, a newer message, a user switch). */
export function stopResponse(state: ResponseState, by: 'user' | 'new_message' | 'user_switch'): ResponseState {
  return isOpen(state.phase) ? { ...state, phase: { kind: 'stopped', by } } : state;
}

/**
 * A whole document received at once (execute responses, restored turns) enters
 * the same state shape as a streamed one, so there is one renderer and one
 * inspector for both.
 */
export function responseFromDocument(doc: ParsedDocument): ResponseState {
  const base = initialResponse();
  if (doc.kind === 'unsupported_version') {
    return { ...base, phase: { kind: 'unsupported_version', version: doc.version } };
  }
  if (doc.kind === 'malformed') {
    return {
      ...base,
      phase: { kind: 'incomplete', reason: 'corrupt_stream' },
      issues: [{ kind: 'protocol', message: 'Unreadable response', details: doc.problems }],
    };
  }
  const issues: Issue[] = [];
  doc.blocks.forEach((block, index) => {
    const issue = blockIssue(block, index);
    if (issue) issues.push(issue);
  });
  if (doc.audit.kind === 'invalid') {
    issues.push({ kind: 'invalid_audit', message: 'Audit record failed validation', details: doc.audit.problems });
  }
  return { ...base, phase: { kind: 'complete' }, blocks: doc.blocks, audit: doc.audit, issues };
}
