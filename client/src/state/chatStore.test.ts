import { describe, expect, it, vi } from 'vitest';
import type { ChatApi, ChatRequest, ExecuteResult, StoredConversation, TokenStatus } from '../api/chatApi';
import { createServerClock } from '../core/clock/serverClock';
import type { Confirmation } from '../core/confirmation/machine';
import { createChatStore, type Turn } from './chatStore';

const T0 = Date.parse('2026-08-20T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------- fakes ---

/** A response body the test feeds by hand, like a network that delivers when it pleases. */
function fakeStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const encoder = new TextEncoder();
  return {
    body,
    push: (...events: object[]) => controller.enqueue(encoder.encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n')),
    close: () => controller.close(),
  };
}

function setup() {
  let mono = 0;
  const clock = createServerClock(() => mono);
  clock.sync(iso(T0));

  const chats: { request: ChatRequest; signal: AbortSignal; stream: ReturnType<typeof fakeStream> }[] = [];
  const executes: Confirmation[] = [];
  const statusCalls: string[] = [];
  const behaviour = {
    execute: (async () => ({ kind: 'no_response' })) as (c: Confirmation) => Promise<ExecuteResult>,
    status: (async () => ({ kind: 'unreachable' })) as (token: string) => Promise<TokenStatus>,
    conversation: (async () => ({ kind: 'missing' })) as (id: string) => Promise<StoredConversation>,
  };

  const api: ChatApi = {
    // Deliberately ignores the abort signal: the worst transport is one that
    // keeps delivering after we asked it to stop.
    async openChat(request, signal) {
      const stream = fakeStream();
      chats.push({ request, signal, stream });
      return { kind: 'stream', body: stream.body };
    },
    execute(c) {
      executes.push(c);
      return behaviour.execute(c);
    },
    tokenStatus(token) {
      statusCalls.push(token);
      return behaviour.status(token);
    },
    conversation: (id) => behaviour.conversation(id),
  };

  const onAccountChanged = vi.fn();
  let nextId = 0;
  const store = createChatStore({
    api,
    clock,
    initialUserId: 'u_ok',
    onAccountChanged,
    monotonicMs: () => mono,
    wait: async () => {},
    newId: () => `id_${++nextId}`,
  });

  return {
    store,
    chats,
    executes,
    statusCalls,
    behaviour,
    onAccountChanged,
    advance: (ms: number) => void (mono += ms),
    state: () => store.getState(),
    turn: (i: number) => store.getState().items.filter((item): item is Turn => item.kind === 'turn')[i]!,
  };
}

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const meta = (conversationId = 'cv_1') => ({
  seq: 1,
  event: 'meta',
  version: '1',
  request_id: 'rq',
  conversation_id: conversationId,
  server_now: iso(T0),
});
const textBlock = { seq: 2, event: 'block', index: 0, block: { type: 'text', markdown: '' } };
const delta = (seq: number, text: string) => ({ seq, event: 'text_delta', index: 0, delta: text });
const audit = (seq: number, decision = 'answered') => ({ seq, event: 'audit', audit: { decision, reason: 'test' } });
const done = (seq: number) => ({ seq, event: 'done' });

const promptBlock = (token: string, overrides: Record<string, unknown> = {}) => ({
  type: 'confirmation_prompt',
  action: 'place_order',
  summary: 'Place an order at Burger Stop: 2 × Cheeseburger. Total 390 TL.',
  params: { restaurant_id: 'rst_04', items: [{ item_id: 'itm_010', qty: 2 }], total_try: 390 },
  confirm_token: token,
  expires_at: iso(T0 + 300_000),
  ...overrides,
});

const markdownOf = (t: Turn): string => {
  const slot = t.response.blocks[0];
  return slot?.kind === 'valid' && slot.block.type === 'text' ? slot.block.markdown : '';
};

/** Sends a message and streams back a finished response containing `block`. */
async function receivePrompt(ctx: ReturnType<typeof setup>, message: string, block: object) {
  ctx.store.getState().send(message);
  await settled();
  const chat = ctx.chats.at(-1)!;
  chat.stream.push(meta(), { seq: 2, event: 'block', index: 0, block }, audit(3, 'needs_confirmation'), done(4));
  await settled();
}

const executedDocument = {
  version: '1',
  blocks: [
    { type: 'text', markdown: 'Your order is placed.' },
    { type: 'order_summary', order_id: 'u_ok_o101', status: 'received', total_try: 390 },
  ],
  audit: { decision: 'answered', reason: 'confirmed by user' },
};

// ---------------------------------------------------------------- tests ---

describe('streams and turns', () => {
  it('renders nothing from a stream the user stopped into a later turn', async () => {
    const ctx = setup();
    ctx.store.getState().send('/chaos slow What is in my cart?');
    await settled();
    ctx.chats[0]!.stream.push(meta(), textBlock, delta(3, 'Here is your c'));
    await settled();

    ctx.store.getState().stop();
    ctx.store.getState().send('Show my recent orders');
    await settled();

    // The first stream keeps delivering, as if the abort had not reached it yet.
    ctx.chats[0]!.stream.push(delta(4, 'art from Burger Stop'), done(5));
    ctx.chats[1]!.stream.push(meta(), textBlock, delta(3, 'Here are your orders.'), done(4));
    await settled();

    expect(ctx.chats[0]!.signal.aborted).toBe(true);
    expect(ctx.turn(0).response.phase).toEqual({ kind: 'stopped', by: 'user' });
    expect(markdownOf(ctx.turn(0))).toBe('Here is your c');
    expect(markdownOf(ctx.turn(1))).toBe('Here are your orders.');
    expect(ctx.turn(1).response.phase.kind).toBe('complete');
  });

  it('renders nothing from a stream superseded by a new message into the new turn', async () => {
    const ctx = setup();
    ctx.store.getState().send('first');
    await settled();
    ctx.chats[0]!.stream.push(meta(), textBlock, delta(3, 'old '));
    await settled();

    ctx.store.getState().send('second');
    await settled();
    ctx.chats[0]!.stream.push(delta(4, 'OLD TEXT'), { seq: 5, event: 'block', index: 1, block: promptBlock('ct_old.sig') }, done(6));
    ctx.chats[1]!.stream.push(meta(), textBlock, delta(3, 'new'), done(4));
    await settled();

    expect(ctx.turn(0).response.phase).toEqual({ kind: 'stopped', by: 'new_message' });
    expect(markdownOf(ctx.turn(0))).toBe('old ');
    expect(ctx.turn(1).response.blocks).toHaveLength(1);
    expect(markdownOf(ctx.turn(1))).toBe('new');
    // And the prompt that arrived late on the dead stream never became confirmable.
    expect(ctx.state().confirmations['ct_old.sig']).toBeUndefined();
  });

  it('sends the conversation_id from meta back on every later turn', async () => {
    const ctx = setup();
    ctx.store.getState().send('Order 2 cheeseburgers from Burger Stop');
    await settled();
    expect(ctx.chats[0]!.request.conversationId).toBeNull();
    ctx.chats[0]!.stream.push(meta('cv_abc'), done(2));
    await settled();

    ctx.store.getState().send('make it 5 cheeseburgers');
    await settled();

    expect(ctx.chats[1]!.request.conversationId).toBe('cv_abc');
  });

  it('does not allow a retry before the Retry-After window has passed', async () => {
    let now = 0;
    const store = createChatStore({
      api: {
        openChat: async () => ({ kind: 'http_error', status: 429, code: 'rate_limited', message: 'Too many requests.', retryAfterS: 3 }),
        execute: async () => ({ kind: 'no_response' }),
        tokenStatus: async () => ({ kind: 'unreachable' }),
        conversation: async () => ({ kind: 'missing' }),
      },
      clock: createServerClock(() => 0),
      initialUserId: 'u_ok',
      monotonicMs: () => now,
      newId: () => 'turn_1',
    });

    store.getState().send('/chaos http_429 What is in my cart?');
    await settled();
    const phase = store.getState().items[0]!.response.phase;
    expect(phase).toMatchObject({ kind: 'failed', code: 'rate_limited', httpStatus: 429, retryNotBeforeMs: 3000 });

    now = 2999;
    store.getState().retry('turn_1');
    expect(store.getState().activeTurnId).toBeNull();

    now = 3000;
    store.getState().retry('turn_1');
    expect(store.getState().activeTurnId).toBe('turn_1');
  });
});

describe('confirmation lifecycle', () => {
  it('sends exactly one request for a double click or a held Enter', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order 2 cheeseburgers from Burger Stop', promptBlock('ct_1.sig'));
    let release!: (r: ExecuteResult) => void;
    ctx.behaviour.execute = () => new Promise((resolve) => (release = resolve));

    // A triple click, then key repeat while the request is in flight.
    ctx.store.getState().confirm('ct_1.sig');
    ctx.store.getState().confirm('ct_1.sig');
    ctx.store.getState().confirm('ct_1.sig');
    await settled();
    for (let i = 0; i < 20; i++) ctx.store.getState().confirm('ct_1.sig');

    expect(ctx.executes).toHaveLength(1);
    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('confirming');

    release({ kind: 'answered', status: 200, document: executedDocument });
    await settled();
    // And clicking again after the success sends nothing either.
    ctx.store.getState().confirm('ct_1.sig');

    expect(ctx.executes).toHaveLength(1);
    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('confirmed');
    expect(ctx.state().items.at(-1)).toMatchObject({ kind: 'action_result', token: 'ct_1.sig', httpStatus: 200 });
    expect(ctx.onAccountChanged).toHaveBeenCalledWith('u_ok');
  });

  it('sends params back as the very object that was parsed', async () => {
    const ctx = setup();
    const block = promptBlock('ct_1.sig');
    await receivePrompt(ctx, 'Order 2 cheeseburgers from Burger Stop', block);

    ctx.store.getState().confirm('ct_1.sig');

    expect(JSON.stringify(ctx.executes[0]!.params)).toBe(JSON.stringify(block.params));
    expect(ctx.executes[0]).toMatchObject({ token: 'ct_1.sig', action: 'place_order', userId: 'u_ok' });
  });

  it('cannot confirm a prompt past expires_at on the server clock', async () => {
    const ctx = setup();
    await receivePrompt(ctx, '/chaos short_ttl Order 1 cheeseburger from Burger Stop', promptBlock('ct_1.sig', { expires_at: iso(T0 + 20_000) }));

    ctx.advance(20_000);
    ctx.store.getState().confirm('ct_1.sig');

    expect(ctx.executes).toHaveLength(0);
    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('expired');
  });

  it('expires live prompts on tick, without a click', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order', promptBlock('ct_1.sig', { expires_at: iso(T0 + 20_000) }));

    ctx.advance(19_999);
    ctx.store.getState().tick();
    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('live');

    ctx.advance(1);
    ctx.store.getState().tick();
    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('expired');
  });

  it('makes the older prompt inert when a newer one arrives for the same action', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order 2 cheeseburgers from Burger Stop', promptBlock('ct_old.sig'));
    await receivePrompt(ctx, 'make it 5 cheeseburgers', promptBlock('ct_new.sig', { summary: '5 × Cheeseburger. Total 975 TL.' }));

    ctx.store.getState().confirm('ct_old.sig');

    expect(ctx.executes).toHaveLength(0);
    expect(ctx.state().confirmations['ct_old.sig']!.status.kind).toBe('superseded');
    expect(ctx.state().confirmations['ct_new.sig']!.status.kind).toBe('live');
  });

  it('leaves a prompt for a different action alone', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order 2 cheeseburgers from Burger Stop', promptBlock('ct_order.sig'));
    await receivePrompt(
      ctx,
      'Leave a 20 TL tip on my last order',
      promptBlock('ct_tip.sig', { action: 'add_tip', params: { order_id: 'u_ok_o9', amount_try: 20 } }),
    );

    expect(ctx.state().confirmations['ct_order.sig']!.status.kind).toBe('live');
    expect(ctx.state().confirmations['ct_tip.sig']!.status.kind).toBe('live');
  });

  it('cannot confirm while a newer answer is still streaming', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order 2 cheeseburgers from Burger Stop', promptBlock('ct_old.sig'));
    ctx.store.getState().send('make it 5 cheeseburgers');
    await settled();
    ctx.chats[1]!.stream.push(meta(), textBlock, delta(3, 'Updated: 5 × '));
    await settled();

    // The server has already replaced the token; the client has not seen the new prompt yet.
    ctx.store.getState().confirm('ct_old.sig');

    expect(ctx.executes).toHaveLength(0);
  });

  it('reconciles through the status endpoint when execute dies, and never asks for a second approval', async () => {
    const ctx = setup();
    await receivePrompt(
      ctx,
      '/chaos drop_execute_response Leave a 20 TL tip on my last order',
      promptBlock('ct_tip.sig', { action: 'add_tip', params: { order_id: 'u_ok_o9', amount_try: 20 } }),
    );
    const tipped = {
      version: '1',
      blocks: [{ type: 'text', markdown: 'You tipped the courier 20 TL on order u_ok_o9.' }],
      audit: { decision: 'answered', reason: 'confirmed by user' },
    };
    ctx.behaviour.execute = async () => ({ kind: 'no_response' });
    ctx.behaviour.status = async () => ({ kind: 'state', state: 'used', result: tipped });

    ctx.store.getState().confirm('ct_tip.sig');
    // While the outcome is unknown the prompt is neither live nor failed.
    expect(ctx.state().confirmations['ct_tip.sig']!.status.kind).toBe('confirming');
    await settled();
    ctx.store.getState().confirm('ct_tip.sig');

    expect(ctx.executes).toHaveLength(1);
    expect(ctx.statusCalls).toEqual(['ct_tip.sig']);
    expect(ctx.state().confirmations['ct_tip.sig']!.status.kind).toBe('confirmed');
    const result = ctx.state().items.at(-1)!;
    expect(result).toMatchObject({ kind: 'action_result', token: 'ct_tip.sig', httpStatus: null });
    expect(result.response.blocks[0]).toMatchObject({ kind: 'valid', block: { markdown: 'You tipped the courier 20 TL on order u_ok_o9.' } });
    expect(ctx.onAccountChanged).toHaveBeenCalledWith('u_ok');
  });

  it('stays unresolved, not failed and not confirmable, when the status endpoint cannot be reached', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order', promptBlock('ct_1.sig'));

    ctx.store.getState().confirm('ct_1.sig');
    await settled();

    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('unresolved');
    ctx.store.getState().confirm('ct_1.sig');
    expect(ctx.executes).toHaveLength(1);

    // "Check again" asks the server; it does not send a second execute.
    ctx.behaviour.status = async () => ({ kind: 'state', state: 'used', result: executedDocument });
    ctx.store.getState().recheck('ct_1.sig');
    await settled();

    expect(ctx.executes).toHaveLength(1);
    expect(ctx.state().confirmations['ct_1.sig']!.status.kind).toBe('confirmed');
  });

  it('returns to live, saying nothing ran, when the server never saw the request', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order', promptBlock('ct_1.sig'));
    ctx.behaviour.status = async () => ({ kind: 'state', state: 'live' });

    ctx.store.getState().confirm('ct_1.sig');
    await settled();

    expect(ctx.state().confirmations['ct_1.sig']).toMatchObject({ status: { kind: 'live' }, notDelivered: true });
    expect(ctx.executes).toHaveLength(1);
  });

  it('never makes a malformed prompt confirmable', async () => {
    const ctx = setup();
    const malformed: Record<string, unknown> = promptBlock('ct_bait.sig');
    delete malformed.expires_at;
    await receivePrompt(ctx, '/chaos malformed_confirmation Order 2 cheeseburgers from Burger Stop', malformed);

    ctx.store.getState().confirm('ct_bait.sig');

    expect(ctx.turn(0).response.blocks[0]).toMatchObject({ kind: 'invalid', type: 'confirmation_prompt' });
    expect(ctx.state().confirmations['ct_bait.sig']).toBeUndefined();
    expect(ctx.executes).toHaveLength(0);
  });

  it('does not make a prompt confirmable when its response never finished', async () => {
    const ctx = setup();
    ctx.store.getState().send('Order 2 cheeseburgers from Burger Stop');
    await settled();
    ctx.chats[0]!.stream.push(meta(), { seq: 2, event: 'block', index: 0, block: promptBlock('ct_1.sig') });
    ctx.chats[0]!.stream.close();
    await settled();

    ctx.store.getState().confirm('ct_1.sig');

    expect(ctx.turn(0).response.phase.kind).toBe('incomplete');
    expect(ctx.state().confirmations['ct_1.sig']!.status).toEqual({ kind: 'void', reason: 'response_unfinished' });
    expect(ctx.executes).toHaveLength(0);
  });

  it('renders the fresh prompt a 410 carries, and retires the expired one', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order', promptBlock('ct_old.sig'));
    ctx.behaviour.execute = async () => ({
      kind: 'answered',
      status: 410,
      document: {
        version: '1',
        blocks: [{ type: 'error', code: 'token_expired', message: 'This confirmation expired. Nothing was executed.' }, promptBlock('ct_fresh.sig')],
        audit: { decision: 'needs_confirmation', reason: 'token_expired' },
      },
    });

    ctx.store.getState().confirm('ct_old.sig');
    await settled();

    expect(ctx.state().confirmations['ct_old.sig']!.status.kind).toBe('expired');
    expect(ctx.state().confirmations['ct_fresh.sig']!.status.kind).toBe('live');
    expect(ctx.state().items.at(-1)).toMatchObject({ kind: 'action_result', httpStatus: 410 });
  });

  it("voids the previous user's prompt on a user switch and starts a new conversation", async () => {
    const ctx = setup();
    ctx.store.getState().send('Order 2 cheeseburgers from Burger Stop');
    await settled();
    ctx.chats[0]!.stream.push(meta('cv_ok'), { seq: 2, event: 'block', index: 0, block: promptBlock('ct_ok.sig') }, done(3));
    await settled();

    ctx.store.getState().switchUser('u_new');
    ctx.store.getState().confirm('ct_ok.sig');
    ctx.store.getState().send('What is in my cart?');
    await settled();

    expect(ctx.executes).toHaveLength(0);
    expect(ctx.state().confirmations['ct_ok.sig']!.status).toEqual({ kind: 'void', reason: 'user_switched' });
    expect(ctx.chats[1]!.request).toEqual({ userId: 'u_new', message: 'What is in my cart?', conversationId: null });
    expect(ctx.state().items).toHaveLength(1);
  });
});

describe('new conversation', () => {
  it('clears the screen, voids live prompts and lets the next message open a new conversation', async () => {
    const ctx = setup();
    await receivePrompt(ctx, 'Order 2 cheeseburgers from Burger Stop', promptBlock('ct_1.sig'));
    expect(ctx.state().conversationId).toBe('cv_1');

    ctx.store.getState().newConversation();
    ctx.store.getState().confirm('ct_1.sig');
    ctx.store.getState().send('What is in my cart?');
    await settled();

    expect(ctx.state().items).toHaveLength(1);
    expect(ctx.state().confirmations['ct_1.sig']!.status).toEqual({ kind: 'void', reason: 'conversation_reset' });
    expect(ctx.executes).toHaveLength(0);
    expect(ctx.chats[1]!.request.conversationId).toBeNull();
  });
});

describe('resuming after a reload', () => {
  const doc = (blocks: object[], decision = 'answered') => ({ version: '1', blocks, audit: { decision, reason: 'test' } });
  const stored = (turns: object[]): StoredConversation => ({ kind: 'found', userId: 'u_ok', turns: turns as never });

  it('brings prompts back in the state the server reports, not as live', async () => {
    const ctx = setup();
    ctx.behaviour.conversation = async () =>
      stored([
        { role: 'user', text: 'Order 2 cheeseburgers from Burger Stop' },
        { role: 'assistant', response: doc([promptBlock('ct_old.sig')], 'needs_confirmation'), complete: true },
        { role: 'user', text: 'make it 5 cheeseburgers' },
        { role: 'assistant', response: doc([promptBlock('ct_used.sig')], 'needs_confirmation'), complete: true },
        { role: 'user', text: 'Leave a 20 TL tip on my last order' },
        {
          role: 'assistant',
          response: doc([promptBlock('ct_live.sig', { action: 'add_tip', params: { order_id: 'u_ok_o101', amount_try: 20 } })], 'needs_confirmation'),
          complete: true,
        },
      ]);
    ctx.behaviour.status = async (token) =>
      token === 'ct_old.sig'
        ? { kind: 'state', state: 'superseded' }
        : token === 'ct_used.sig'
          ? { kind: 'state', state: 'used', result: executedDocument }
          : { kind: 'state', state: 'live' };

    await ctx.store.getState().restore('cv_1');

    const { confirmations, items, conversationId } = ctx.state();
    expect(conversationId).toBe('cv_1');
    expect(confirmations['ct_old.sig']!.status.kind).toBe('superseded');
    expect(confirmations['ct_used.sig']!.status.kind).toBe('confirmed');
    expect(confirmations['ct_live.sig']!.status.kind).toBe('live');
    // The result of the executed prompt comes back right after the turn that asked for it.
    expect(items.map((item) => item.kind)).toEqual(['turn', 'turn', 'action_result', 'turn']);
    expect(ctx.statusCalls).toEqual(['ct_old.sig', 'ct_used.sig', 'ct_live.sig']);
    expect(ctx.executes).toHaveLength(0);
  });

  it('does not make a prompt usable when the server cannot be asked', async () => {
    const ctx = setup();
    ctx.behaviour.conversation = async () =>
      stored([
        { role: 'user', text: 'Order' },
        { role: 'assistant', response: doc([promptBlock('ct_1.sig')]), complete: true },
      ]);

    await ctx.store.getState().restore('cv_1');
    ctx.store.getState().confirm('ct_1.sig');

    expect(ctx.state().confirmations['ct_1.sig']!.status).toEqual({ kind: 'void', reason: 'unverified' });
    expect(ctx.executes).toHaveLength(0);
  });

  it('shows a turn the server cut as incomplete, and a stopped one as the whole answer', async () => {
    const ctx = setup();
    ctx.behaviour.conversation = async () =>
      stored([
        { role: 'user', text: '/chaos drop_mid_stream What is in my cart?' },
        { role: 'assistant', response: doc([{ type: 'text', markdown: 'Here is your cart.' }]), complete: false },
        { role: 'user', text: '/chaos slow What is in my cart?' },
        { role: 'assistant', response: doc([{ type: 'text', markdown: 'Here is your cart.' }]), complete: true },
      ]);

    await ctx.store.getState().restore('cv_1');

    expect(ctx.turn(0).response.phase).toEqual({ kind: 'incomplete', reason: 'closed_without_done' });
    expect(ctx.turn(1).response.phase.kind).toBe('complete');
  });

  it("ignores a conversation that is gone or another user's", async () => {
    const ctx = setup();
    await ctx.store.getState().restore('cv_gone');
    expect(ctx.state()).toMatchObject({ conversationId: null, items: [], restoring: false });

    ctx.behaviour.conversation = async () => ({
      kind: 'found',
      userId: 'u_new',
      turns: [
        { role: 'user', text: 'hi' },
        { role: 'assistant', response: doc([{ type: 'text', markdown: 'hello' }]), complete: true },
      ],
    });
    await ctx.store.getState().restore('cv_other');
    expect(ctx.state().items).toEqual([]);
  });
});
