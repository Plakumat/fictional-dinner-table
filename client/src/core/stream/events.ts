// Decision: A line is an event only if it has the shape the protocol promises; an unknown event name is skipped, a malformed one ends the response.
// Pinned by: core/stream/stream.test.ts (unknown event skipped; unreadable line ends the response)

import { z } from 'zod';

// Mirrors schema/stream_events.schema.json: one JSON object per line.
// Only the envelope is validated here. `block` and `audit` stay `unknown` and
// are validated by core/contract, the same code that validates the documents
// returned by POST /api/actions/execute.

const seq = z.number().int().min(1);
const index = z.number().int().min(0);

const eventSchema = z.discriminatedUnion('event', [
  z.object({
    seq,
    event: z.literal('meta'),
    version: z.string(),
    request_id: z.string(),
    conversation_id: z.string(),
    server_now: z.string(),
  }),
  z.object({ seq, event: z.literal('block'), index, block: z.unknown() }),
  z.object({ seq, event: z.literal('text_delta'), index, delta: z.string() }),
  z.object({ seq, event: z.literal('audit'), audit: z.unknown() }),
  z.object({ seq, event: z.literal('done') }),
  z.object({
    seq,
    event: z.literal('error'),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);

export type StreamEvent = z.infer<typeof eventSchema>;

const KNOWN_EVENTS: readonly string[] = ['meta', 'block', 'text_delta', 'audit', 'done', 'error'];

export type ParsedLine =
  | { kind: 'event'; event: StreamEvent }
  /** A well-formed line with an event name we do not know: skipped, not fatal. */
  | { kind: 'unknown_event'; name: string }
  /** Not JSON, or a known event with the wrong shape: the stream cannot be trusted past here. */
  | { kind: 'corrupt'; reason: string };

export function parseLine(line: string): ParsedLine {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return { kind: 'corrupt', reason: 'line is not valid JSON' };
  }
  const result = eventSchema.safeParse(json);
  if (result.success) return { kind: 'event', event: result.data };

  const name = typeof json === 'object' && json !== null ? (json as { event?: unknown }).event : undefined;
  if (typeof name === 'string' && !KNOWN_EVENTS.includes(name)) {
    return { kind: 'unknown_event', name };
  }
  return { kind: 'corrupt', reason: `malformed ${typeof name === 'string' ? name : 'event'}` };
}
