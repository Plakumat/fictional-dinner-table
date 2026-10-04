import { describe, expect, it } from 'vitest';
import { createNdjsonDecoder } from './ndjson';
import { applyLine, closeStream, initialResponse, stopResponse, type ResponseState } from './response';

const META = { seq: 1, event: 'meta', version: '1', request_id: 'rq_1', conversation_id: 'cv_1', server_now: '2026-08-20T09:00:04.120Z' };
const TEXT_BLOCK = { seq: 2, event: 'block', index: 0, block: { type: 'text', markdown: '' } };
const delta = (seq: number, text: string) => ({ seq, event: 'text_delta', index: 0, delta: text });
const DONE = (seq: number) => ({ seq, event: 'done' });

const encode = (events: object[]): Uint8Array => new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n');

/** Splits `bytes` at the given offsets, the way a network would. */
const chunksAt = (bytes: Uint8Array, cuts: number[]): Uint8Array[] => {
  const out: Uint8Array[] = [];
  let from = 0;
  for (const cut of [...cuts, bytes.length]) {
    out.push(bytes.subarray(from, cut));
    from = cut;
  }
  return out;
};

/** Runs chunks through the decoder and the reducer, exactly as the client does. */
const receive = (chunks: Uint8Array[], { close = true } = {}): ResponseState => {
  const decoder = createNdjsonDecoder();
  let state = initialResponse();
  for (const chunk of chunks) {
    for (const line of decoder.push(chunk)) state = applyLine(state, line);
  }
  return close ? closeStream(state, decoder.end()) : state;
};

const markdownOf = (state: ResponseState, index = 0): string | undefined => {
  const slot = state.blocks[index];
  return slot?.kind === 'valid' && slot.block.type === 'text' ? slot.block.markdown : undefined;
};

describe('ndjson decoder', () => {
  it('decodes a UTF-8 character split across two chunks intact', () => {
    const bytes = encode([META, TEXT_BLOCK, delta(3, 'Kadıköy'), DONE(4)]);
    // "ı" is two bytes (0xC4 0xB1). Cut between them.
    const lead = bytes.indexOf(0xc4);
    expect(bytes[lead + 1]).toBe(0xb1);

    const state = receive(chunksAt(bytes, [lead + 1]));

    expect(markdownOf(state)).toBe('Kadıköy');
    expect(state.phase.kind).toBe('complete');
  });

  it('survives being fed one byte at a time', () => {
    const bytes = encode([META, TEXT_BLOCK, delta(3, 'Şişli, Üsküdar, '), delta(4, 'Patates Kızartması'), DONE(5)]);
    const everyByte = Array.from({ length: bytes.length - 1 }, (_, i) => i + 1);

    const state = receive(chunksAt(bytes, everyByte));

    expect(markdownOf(state)).toBe('Şişli, Üsküdar, Patates Kızartması');
    expect(state.phase.kind).toBe('complete');
  });

  it('parses a line split across two chunks once', () => {
    const bytes = encode([META, TEXT_BLOCK, delta(3, 'Here is your cart'), DONE(4)]);
    const text = new TextDecoder().decode(bytes);
    const insideDelta = text.indexOf('your');

    const decoder = createNdjsonDecoder();
    const [first, second] = chunksAt(bytes, [insideDelta]);
    const linesFromFirst = decoder.push(first!);
    const linesFromSecond = decoder.push(second!);

    // The half line is held back, not emitted as a broken line and again as a whole one.
    expect(linesFromFirst).toHaveLength(2);
    expect(linesFromSecond).toHaveLength(2);
    expect(markdownOf(receive([first!, second!]))).toBe('Here is your cart');
  });
});

describe('response reducer', () => {
  it('applies a duplicated seq once', () => {
    const events = [META, TEXT_BLOCK, delta(3, 'one '), delta(4, 'two'), delta(3, 'one '), delta(4, 'two'), TEXT_BLOCK, DONE(5)];

    const state = receive([encode(events)]);

    expect(markdownOf(state)).toBe('one two');
    expect(state.blocks).toHaveLength(1);
    expect(state.issues).toEqual([]);
  });

  it('marks a stream that ends without done as incomplete, and keeps what arrived', () => {
    const state = receive([encode([META, TEXT_BLOCK, delta(3, 'Here is your c')])]);

    expect(state.phase).toEqual({ kind: 'incomplete', reason: 'closed_without_done' });
    expect(markdownOf(state)).toBe('Here is your c');
  });

  it('drops a line the connection cut in half, and stays incomplete', () => {
    const bytes = encode([META, TEXT_BLOCK, delta(3, 'whole'), delta(4, 'never finished')]);
    const cut = bytes.length - 12;

    const state = receive([bytes.subarray(0, cut)]);

    expect(markdownOf(state)).toBe('whole');
    expect(state.phase).toEqual({ kind: 'incomplete', reason: 'closed_without_done' });
    expect(state.issues.map((i) => i.message)).toContain('The stream was cut in the middle of a line');
  });

  it('accepts a final done whose newline was omitted', () => {
    const bytes = encode([META, TEXT_BLOCK, delta(3, 'hi'), DONE(4)]);

    const state = receive([bytes.subarray(0, bytes.length - 1)]);

    expect(state.phase.kind).toBe('complete');
  });

  it('ends the turn on an error event and exposes retryable', () => {
    const error = { seq: 4, event: 'error', code: 'upstream_timeout', message: 'The assistant took too long to respond.', retryable: true };

    const state = receive([encode([META, TEXT_BLOCK, delta(3, 'Here'), error, delta(5, ' is more')])]);

    expect(state.phase).toEqual({ kind: 'failed', code: 'upstream_timeout', message: 'The assistant took too long to respond.', retryable: true });
    // Nothing after the error is applied.
    expect(markdownOf(state)).toBe('Here');
  });

  it('applies nothing to a response that was stopped', () => {
    const decoder = createNdjsonDecoder();
    let state = initialResponse();
    for (const line of decoder.push(encode([META, TEXT_BLOCK, delta(3, 'first ')]))) state = applyLine(state, line);

    state = stopResponse(state, 'user');
    // Chunks that were already in flight when the user pressed Stop.
    for (const line of decoder.push(encode([delta(4, 'late'), DONE(5)]))) state = applyLine(state, line);
    state = closeStream(state, decoder.end());

    expect(state.phase).toEqual({ kind: 'stopped', by: 'user' });
    expect(markdownOf(state)).toBe('first ');
  });

  it('renders nothing from a version it does not support', () => {
    const state = receive([encode([{ ...META, version: '2' }, TEXT_BLOCK, delta(3, 'from the future'), DONE(4)])]);

    expect(state.phase).toEqual({ kind: 'unsupported_version', version: '2' });
    expect(state.blocks).toEqual([]);
    expect(state.meta).toBeNull();
  });

  it('skips an unknown block type and keeps the rest of the response', () => {
    const events = [
      META,
      TEXT_BLOCK,
      delta(3, 'Napoli Fırın is in Kadıköy.'),
      { seq: 4, event: 'block', index: 1, block: { type: 'map_view', lat: 40.99, lng: 29.02 } },
      { seq: 5, event: 'block', index: 2, block: { type: 'restaurant_card', restaurant_id: 'rst_01', name: 'Napoli Fırın' } },
      DONE(6),
    ];

    const state = receive([encode(events)]);

    expect(state.blocks.map((b) => b?.kind)).toEqual(['valid', 'unknown', 'valid']);
    expect(state.issues).toEqual([{ kind: 'unknown_block', index: 1, message: 'Unknown block type "map_view" skipped' }]);
    expect(state.phase.kind).toBe('complete');
  });

  it('isolates an invalid block: it is kept as invalid, never as data', () => {
    const bad = { type: 'menu_item', item_id: 'itm_1', name: 'Cheeseburger', price_try: '195 TL', available: true, age_restricted: false };
    const good = { type: 'menu_item', item_id: 'itm_2', name: 'Ayran', price_try: 30, available: true, age_restricted: false };

    const state = receive([
      encode([META, { seq: 2, event: 'block', index: 0, block: bad }, { seq: 3, event: 'block', index: 1, block: good }, DONE(4)]),
    ]);

    expect(state.blocks[0]).toMatchObject({ kind: 'invalid', type: 'menu_item' });
    expect(state.blocks[1]).toMatchObject({ kind: 'valid', block: { name: 'Ayran', price_try: 30 } });
    expect(state.issues[0]).toMatchObject({ kind: 'invalid_block', index: 0 });
  });

  it('ignores a text_delta aimed at a block that is not text', () => {
    const card = { seq: 2, event: 'block', index: 0, block: { type: 'restaurant_card', restaurant_id: 'rst_01', name: 'Napoli Fırın' } };

    const state = receive([encode([META, card, delta(3, '<script>'), DONE(4)])]);

    expect(state.blocks[0]).toMatchObject({ kind: 'valid', block: { type: 'restaurant_card', name: 'Napoli Fırın' } });
    expect(state.issues).toHaveLength(1);
  });

  it('refuses a block index far outside a document', () => {
    const state = receive([encode([META, { seq: 2, event: 'block', index: 5_000_000, block: { type: 'text', markdown: '' } }, DONE(3)])]);

    expect(state.blocks).toEqual([]);
    expect(state.phase.kind).toBe('complete');
  });

  it('ends the response, unfinished, at a line it cannot read', () => {
    const bytes = new TextEncoder().encode(
      [
        JSON.stringify(META),
        JSON.stringify(TEXT_BLOCK),
        JSON.stringify(delta(3, 'a')),
        '{"seq":4,"event":"text_delta"',
        JSON.stringify(delta(5, 'c')),
        JSON.stringify(DONE(6)),
      ].join('\n') + '\n',
    );

    const state = receive([bytes]);

    expect(state.phase).toEqual({ kind: 'incomplete', reason: 'corrupt_stream' });
    expect(markdownOf(state)).toBe('a');
  });

  it('skips an event name it does not know without ending the response', () => {
    const state = receive([encode([META, { seq: 2, event: 'ping' }, TEXT_BLOCK, delta(4, 'ok'), DONE(5)])]);

    // TEXT_BLOCK carries seq 2 as well; the unknown event did not consume it.
    expect(markdownOf(state)).toBe('ok');
    expect(state.phase.kind).toBe('complete');
  });
});
