import { describe, expect, it } from 'vitest';
import { beginConfirm, canConfirm, expireDue, registerPrompt, restorePrompt, transition, voidAll, type Confirmation, type Prompt } from './machine';

// The store tests drive the machine through real flows. These pin the rules
// of the machine itself: which transitions exist, and that nothing else does.

const T0 = Date.parse('2026-08-20T09:00:00.000Z');

const prompt = (token: string, overrides: Partial<Prompt> = {}): Prompt => ({
  type: 'confirmation_prompt',
  action: 'place_order',
  summary: 'Place an order at Burger Stop.',
  params: { restaurant_id: 'rst_04' },
  confirm_token: token,
  expires_at: new Date(T0 + 300_000).toISOString(),
  ...overrides,
});

const live = (token = 'ct_1'): Confirmation => registerPrompt({}, prompt(token), 'u_ok')[token]!;
const at = (c: Confirmation, status: Confirmation['status']): Confirmation => ({ ...c, status });

describe('transition', () => {
  it('only leaves `confirming` or `reconciling` on a server answer', () => {
    const c = live();
    expect(transition(c, { type: 'executed' })).toBe(c);
    expect(transition(c, { type: 'rejected', code: 'token_void' })).toBe(c);
    expect(transition(at(c, { kind: 'confirming' }), { type: 'executed' }).status).toEqual({ kind: 'confirmed' });
    expect(transition(at(c, { kind: 'reconciling' }), { type: 'rejected', code: 'token_expired' }).status).toEqual({ kind: 'expired' });
  });

  it('maps every refusal code to a state', () => {
    const confirming = at(live(), { kind: 'confirming' });
    expect(transition(confirming, { type: 'rejected', code: 'token_expired' }).status).toEqual({ kind: 'expired' });
    expect(transition(confirming, { type: 'rejected', code: 'token_superseded' }).status).toEqual({ kind: 'superseded' });
    expect(transition(confirming, { type: 'rejected', code: 'gate_closed' }).status).toEqual({ kind: 'rejected', code: 'gate_closed' });
  });

  it('is a no-op for events that do not apply to the current state', () => {
    const confirmed = at(live(), { kind: 'confirmed' });
    for (const event of [
      { type: 'no_response' },
      { type: 'superseded' },
      { type: 'voided', reason: 'user_switched' },
      { type: 'status', state: 'live' },
      { type: 'recheck' },
    ] as const) {
      expect(transition(confirmed, event)).toBe(confirmed);
    }
  });

  it('reads the status endpoint only while reconciling, and `live` means nothing ran', () => {
    const reconciling = at(live(), { kind: 'reconciling' });
    expect(transition(reconciling, { type: 'status', state: 'used' }).status).toEqual({ kind: 'confirmed' });
    expect(transition(reconciling, { type: 'status', state: 'live' })).toMatchObject({ status: { kind: 'live' }, notDelivered: true });
    expect(transition(reconciling, { type: 'status', state: 'invalid' }).status).toEqual({ kind: 'rejected', code: 'token_invalid' });
    expect(transition(reconciling, { type: 'status_unreachable' }).status).toEqual({ kind: 'unresolved' });
  });
});

describe('beginConfirm', () => {
  it('takes the lock once and refuses everything after', () => {
    const registry = registerPrompt({}, prompt('ct_1'), 'u_ok');
    const first = beginConfirm(registry, 'ct_1', T0 + 1000);
    expect(first.started?.status).toEqual({ kind: 'confirming' });
    const second = beginConfirm(first.registry, 'ct_1', T0 + 1001);
    expect(second.started).toBeNull();
    expect(second.registry).toBe(first.registry);
  });

  it('fails closed without a server clock and after the deadline', () => {
    const registry = registerPrompt({}, prompt('ct_1'), 'u_ok');
    expect(beginConfirm(registry, 'ct_1', null).started).toBeNull();
    const late = beginConfirm(registry, 'ct_1', T0 + 300_000);
    expect(late.started).toBeNull();
    expect(late.registry['ct_1']!.status).toEqual({ kind: 'expired' });
    expect(beginConfirm(registry, 'ct_unknown', T0).started).toBeNull();
  });

  it('canConfirm agrees with beginConfirm', () => {
    const registry = registerPrompt({}, prompt('ct_1'), 'u_ok');
    expect(canConfirm(registry['ct_1'], T0)).toBe(true);
    expect(canConfirm(registry['ct_1'], T0 + 300_000)).toBe(false);
    expect(canConfirm(registry['ct_1'], null)).toBe(false);
    expect(canConfirm(undefined, T0)).toBe(false);
  });
});

describe('registry', () => {
  it('supersedes only live prompts of the same user and action', () => {
    let registry = registerPrompt({}, prompt('ct_order'), 'u_ok');
    registry = registerPrompt(registry, prompt('ct_tip', { action: 'add_tip' }), 'u_ok');
    registry = registerPrompt(registry, prompt('ct_other_user'), 'u_new');
    registry = registerPrompt(registry, prompt('ct_order_2'), 'u_ok');

    expect(registry['ct_order']!.status.kind).toBe('superseded');
    expect(registry['ct_tip']!.status.kind).toBe('live');
    expect(registry['ct_other_user']!.status.kind).toBe('live');
    expect(registry['ct_order_2']!.status.kind).toBe('live');
  });

  it('registers a prompt from an unfinished response as unusable without superseding anything', () => {
    let registry = registerPrompt({}, prompt('ct_live'), 'u_ok');
    registry = registerPrompt(registry, prompt('ct_cut'), 'u_ok', false);
    expect(registry['ct_live']!.status.kind).toBe('live');
    expect(registry['ct_cut']!.status).toEqual({ kind: 'void', reason: 'response_unfinished' });
  });

  it('keeps an already registered token as it is', () => {
    const registry = registerPrompt({}, prompt('ct_1'), 'u_ok');
    const locked = beginConfirm(registry, 'ct_1', T0).registry;
    expect(registerPrompt(locked, prompt('ct_1'), 'u_ok')).toBe(locked);
  });

  it('expires due prompts and returns the same registry when nothing is due', () => {
    const registry = registerPrompt({}, prompt('ct_1'), 'u_ok');
    expect(expireDue(registry, T0 + 299_999)).toBe(registry);
    expect(expireDue(registry, T0 + 300_000)['ct_1']!.status).toEqual({ kind: 'expired' });
  });

  it('voids live prompts and leaves settled ones alone', () => {
    let registry = registerPrompt({}, prompt('ct_live'), 'u_ok');
    registry = { ...registry, ct_done: at(live('ct_done'), { kind: 'confirmed' }) };
    const voided = voidAll(registry, 'conversation_reset');
    expect(voided['ct_live']!.status).toEqual({ kind: 'void', reason: 'conversation_reset' });
    expect(voided['ct_done']!.status).toEqual({ kind: 'confirmed' });
  });

  it('restores a prompt in the state the server reports, never trusting the client', () => {
    const states = { live: 'live', used: 'confirmed', expired: 'expired', superseded: 'superseded', void: 'rejected', invalid: 'rejected' } as const;
    for (const [server, expected] of Object.entries(states)) {
      const registry = restorePrompt({}, prompt(`ct_${server}`), 'u_ok', server as keyof typeof states);
      expect(registry[`ct_${server}`]!.status.kind).toBe(expected);
    }
    expect(restorePrompt({}, prompt('ct_x'), 'u_ok', null)['ct_x']!.status).toEqual({ kind: 'void', reason: 'unverified' });
  });
});
