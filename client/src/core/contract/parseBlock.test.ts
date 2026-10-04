import { describe, expect, it } from 'vitest';
import { parseBlock, parseDocument } from './parseBlock';

const prompt = (overrides: Record<string, unknown> = {}) => ({
  type: 'confirmation_prompt',
  action: 'place_order',
  summary: 'Place an order at Burger Stop: 2 × Cheeseburger. Total 390 TL (free delivery).',
  params: { restaurant_id: 'rst_04', items: [{ item_id: 'itm_010', qty: 2 }], total_try: 390 },
  confirm_token: 'ct_abc.def',
  expires_at: '2026-08-20T09:05:04.120Z',
  ...overrides,
});

describe('parseBlock', () => {
  it('accepts a valid block', () => {
    const parsed = parseBlock({ type: 'menu_item', item_id: 'itm_1', name: 'Künefe', price_try: 120, available: false, age_restricted: false });

    expect(parsed).toMatchObject({ kind: 'valid', block: { name: 'Künefe', available: false } });
  });

  it('reports a type outside the catalog as unknown, not as an error', () => {
    expect(parseBlock({ type: 'map_view', lat: 1, lng: 2 })).toMatchObject({ kind: 'unknown', type: 'map_view' });
  });

  it('does not mistake a prototype property for a catalog type', () => {
    expect(parseBlock({ type: 'constructor' })).toMatchObject({ kind: 'unknown', type: 'constructor' });
    expect(parseBlock({ type: 'toString' })).toMatchObject({ kind: 'unknown' });
  });

  it('rejects a price sent as a string', () => {
    const parsed = parseBlock({
      type: 'menu_item',
      item_id: 'itm_1',
      name: 'Cheeseburger',
      price_try: '195 TL',
      available: true,
      age_restricted: false,
    });

    expect(parsed).toMatchObject({ kind: 'invalid', type: 'menu_item' });
    expect(parsed.kind === 'invalid' && parsed.problems[0]).toMatch(/^price_try:/);
  });

  it('rejects a field the contract does not define', () => {
    const parsed = parseBlock({ type: 'error', code: 'x', message: 'y', html: '<b>hi</b>' });

    expect(parsed.kind).toBe('invalid');
  });

  it('rejects things that are not blocks at all', () => {
    for (const junk of [null, undefined, 'text', 42, [], { markdown: 'no type' }, { type: 7 }]) {
      expect(parseBlock(junk)).toMatchObject({ kind: 'invalid', type: null });
    }
  });

  describe('confirmation_prompt', () => {
    it('is invalid without expires_at (the malformed_confirmation chaos mode)', () => {
      const malformed: Record<string, unknown> = prompt();
      delete malformed.expires_at;

      expect(parseBlock(malformed)).toMatchObject({ kind: 'invalid', type: 'confirmation_prompt' });
    });

    it.each([
      ['an unreadable deadline', { expires_at: 'in five minutes' }],
      ['an empty token', { confirm_token: '' }],
      ['an action outside the catalog', { action: 'refund_everything' }],
      ['params that are not an object', { params: 'restaurant_id=rst_04' }],
      ['params sent as an array', { params: [] }],
      ['an extra field', { auto_confirm: true }],
    ])('is invalid with %s', (_label, overrides) => {
      expect(parseBlock(prompt(overrides)).kind).toBe('invalid');
    });

    it('hands params back as the very object the server sent, extra keys included', () => {
      const raw = prompt({ params: { restaurant_id: 'rst_04', items: [{ item_id: 'itm_010', qty: 2, future_field: 'kept' }], total_try: 390 } });

      const parsed = parseBlock(raw);

      if (parsed.kind !== 'valid' || parsed.block.type !== 'confirmation_prompt') throw new Error('expected a valid prompt');
      expect(parsed.block.params).toBe(raw.params);
      expect(JSON.stringify(parsed.block.params)).toBe(JSON.stringify(raw.params));
    });

    it('freezes params so nothing can edit what the token is bound to', () => {
      const parsed = parseBlock(prompt());
      if (parsed.kind !== 'valid' || parsed.block.type !== 'confirmation_prompt') throw new Error('expected a valid prompt');
      const params = parsed.block.params as { total_try: number; items: { qty: number }[] };

      expect(() => {
        params.total_try = 1;
      }).toThrow(TypeError);
      expect(() => {
        params.items[0]!.qty = 99;
      }).toThrow(TypeError);
    });
  });
});

describe('parseDocument', () => {
  const audit = { decision: 'answered', reason: 'confirmed by user' };

  it('parses blocks one by one, so one bad block does not take the others down', () => {
    const doc = parseDocument({
      version: '1',
      blocks: [
        { type: 'text', markdown: 'Your order is placed.' },
        { type: 'order_summary', order_id: 7, status: 'received' },
        { type: 'rating_widget' },
      ],
      audit,
    });

    expect(doc.kind === 'document' && doc.blocks.map((b) => b.kind)).toEqual(['valid', 'invalid', 'unknown']);
  });

  it('refuses a version it does not support', () => {
    expect(parseDocument({ version: '2', blocks: [], audit })).toEqual({ kind: 'unsupported_version', version: '2' });
  });

  it('flags an audit record with a decision outside the contract', () => {
    const doc = parseDocument({ version: '1', blocks: [{ type: 'text', markdown: 'hi' }], audit: { decision: 'approved' } });

    expect(doc.kind === 'document' && doc.audit.kind).toBe('invalid');
  });
});
