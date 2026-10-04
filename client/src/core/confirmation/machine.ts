// Decision: Money moves exactly once per deliberate action: the lock is a state transition, superseding is a registry rule, expiry follows the server clock.
// Pinned by: state/chatStore.test.ts (double click, held Enter, expiry, supersede, reconcile, user switch, restore)

import type { Action, BlockOf } from '../contract/schemas';

/**
 * The lifecycle of a confirmation_prompt.
 *
 *   live ──confirm──► confirming ──200──────────────► confirmed
 *    │                    │──409/410/422/403────────► expired | superseded | rejected
 *    │                    └──no response──► reconciling ──status──► confirmed | expired | …
 *    │                                         │                     └─ live (the request never arrived)
 *    │                                         └──status unreachable──► unresolved ──recheck──► reconciling
 *    ├──deadline passed (server clock)──► expired
 *    ├──newer prompt for the same action──► superseded
 *    └──user switched──► void
 *
 * The state lives here, keyed by confirm token, and not in the component that
 * draws the card, for three reasons:
 *
 * - "Exactly one request" needs a lock that is taken synchronously. A
 *   `disabled` attribute arrives one render late; two clicks in the same tick
 *   would both get through. Here the lock *is* the transition out of `live`.
 * - A newer prompt has to make an older one inert, and the older one is in
 *   another turn that knows nothing about it.
 * - Switching user has to void every live prompt at once.
 *
 * Everything is a pure function of (registry, event), so each rule is a unit
 * test with no DOM and no network.
 */
export type Prompt = BlockOf<'confirmation_prompt'>;

export type ConfirmationStatus =
  /** Can be confirmed, until the deadline. */
  | { kind: 'live' }
  /** One execute request is in flight. */
  | { kind: 'confirming' }
  /** The execute request died without an answer. The action may have run; we are asking. */
  | { kind: 'reconciling' }
  /** We could not reach the server to ask. Still unknown; the user can ask again, not approve again. */
  | { kind: 'unresolved' }
  | { kind: 'confirmed' }
  | { kind: 'expired' }
  | { kind: 'superseded' }
  /** The server refused it for another reason (a closed gate, an invalid token…). */
  | { kind: 'rejected'; code: string }
  /** No longer usable in this session. */
  | { kind: 'void'; reason: 'user_switched' | 'response_unfinished' | 'unverified' | 'conversation_reset' };

export interface Confirmation {
  readonly token: string;
  readonly action: Action;
  /** The object the server sent, frozen. It goes back as is. */
  readonly params: Prompt['params'];
  readonly expiresAtMs: number;
  readonly userId: string;
  readonly status: ConfirmationStatus;
  /** Set when a request provably never reached the server, so the card can say that nothing ran. */
  readonly notDelivered?: boolean;
}

export type Registry = Readonly<Record<string, Confirmation>>;

/** What GET /api/actions/status can say about a token. */
export type ServerTokenState = 'live' | 'expired' | 'used' | 'superseded' | 'void' | 'invalid';

export type ConfirmationEvent =
  | { type: 'executed' }
  | { type: 'rejected'; code: string }
  | { type: 'no_response' }
  | { type: 'status'; state: ServerTokenState }
  | { type: 'status_unreachable' }
  | { type: 'recheck' }
  | { type: 'superseded' }
  | { type: 'voided'; reason: 'user_switched' | 'response_unfinished' | 'conversation_reset' };

const awaitingServer = (c: Confirmation): boolean => c.status.kind === 'confirming' || c.status.kind === 'reconciling';

const to = (c: Confirmation, status: ConfirmationStatus, notDelivered = false): Confirmation => ({
  ...c,
  status,
  notDelivered,
});

/** A refusal from POST /api/actions/execute, mapped to where the prompt ends up. */
const refusal = (code: string): ConfirmationStatus => {
  if (code === 'token_expired') return { kind: 'expired' };
  if (code === 'token_superseded') return { kind: 'superseded' };
  return { kind: 'rejected', code };
};

const fromServerState = (c: Confirmation, state: ServerTokenState): Confirmation => {
  switch (state) {
    case 'used':
      return to(c, { kind: 'confirmed' });
    case 'live':
      // The server never saw the request, so nothing ran. The prompt is live
      // again and says so; whether to try again is the user's decision.
      return to(c, { kind: 'live' }, true);
    case 'expired':
      return to(c, { kind: 'expired' });
    case 'superseded':
      return to(c, { kind: 'superseded' });
    case 'void':
      return to(c, { kind: 'rejected', code: 'token_void' });
    case 'invalid':
      return to(c, { kind: 'rejected', code: 'token_invalid' });
  }
};

/** Every transition except taking the lock (see `beginConfirm`). Returns `c` itself when the event does not apply. */
export function transition(c: Confirmation, event: ConfirmationEvent): Confirmation {
  switch (event.type) {
    case 'executed':
      return awaitingServer(c) ? to(c, { kind: 'confirmed' }) : c;
    case 'rejected':
      return awaitingServer(c) ? to(c, refusal(event.code)) : c;
    case 'no_response':
      return c.status.kind === 'confirming' ? to(c, { kind: 'reconciling' }) : c;
    case 'status':
      return c.status.kind === 'reconciling' ? fromServerState(c, event.state) : c;
    case 'status_unreachable':
      return c.status.kind === 'reconciling' ? to(c, { kind: 'unresolved' }) : c;
    case 'recheck':
      return c.status.kind === 'unresolved' ? to(c, { kind: 'reconciling' }) : c;
    case 'superseded':
      return c.status.kind === 'live' ? to(c, { kind: 'superseded' }) : c;
    case 'voided':
      return c.status.kind === 'live' ? to(c, { kind: 'void', reason: event.reason }) : c;
  }
}

export const isExpired = (c: Confirmation, nowMs: number): boolean => nowMs >= c.expiresAtMs;

/** The single question "may this be confirmed right now?". `nowMs` is the server's clock. */
export const canConfirm = (c: Confirmation | undefined, nowMs: number | null): boolean =>
  c !== undefined && c.status.kind === 'live' && nowMs !== null && !isExpired(c, nowMs);

export function dispatch(registry: Registry, token: string, event: ConfirmationEvent): Registry {
  const current = registry[token];
  if (!current) return registry;
  const next = transition(current, event);
  return next === current ? registry : { ...registry, [token]: next };
}

/**
 * A validated prompt from a finished response becomes confirmable.
 * At most one prompt per action is live: registering a newer one makes the
 * older ones inert, which mirrors what the server did when it issued the token.
 */
export function registerPrompt(registry: Registry, prompt: Prompt, userId: string, usable = true): Registry {
  if (registry[prompt.confirm_token]) return registry;
  const next: Record<string, Confirmation> = {};
  for (const [token, c] of Object.entries(registry)) {
    next[token] = usable && c.userId === userId && c.action === prompt.action ? transition(c, { type: 'superseded' }) : c;
  }
  next[prompt.confirm_token] = {
    token: prompt.confirm_token,
    action: prompt.action,
    params: prompt.params,
    expiresAtMs: Date.parse(prompt.expires_at),
    userId,
    status: usable ? { kind: 'live' } : { kind: 'void', reason: 'response_unfinished' },
  };
  return next;
}

/**
 * A prompt from a conversation restored after a reload. Its state is whatever
 * GET /api/actions/status says, never what the browser remembered: the token
 * may have been used, replaced or expired in the meantime. `null` means the
 * server could not be asked, and then the prompt is not usable.
 */
export function restorePrompt(registry: Registry, prompt: Prompt, userId: string, serverState: ServerTokenState | null): Registry {
  if (registry[prompt.confirm_token]) return registry;
  const status: ConfirmationStatus =
    serverState === null
      ? { kind: 'void', reason: 'unverified' }
      : serverState === 'live'
        ? { kind: 'live' }
        : serverState === 'used'
          ? { kind: 'confirmed' }
          : serverState === 'expired'
            ? { kind: 'expired' }
            : serverState === 'superseded'
              ? { kind: 'superseded' }
              : { kind: 'rejected', code: `token_${serverState}` };
  return {
    ...registry,
    [prompt.confirm_token]: {
      token: prompt.confirm_token,
      action: prompt.action,
      params: prompt.params,
      expiresAtMs: Date.parse(prompt.expires_at),
      userId,
      status,
    },
  };
}

/**
 * Takes the lock. `started` is the confirmation to execute, or null if this
 * call must not send anything: the prompt is not live (a second click, a held
 * Enter, a replaced or foreign prompt) or its deadline has passed.
 *
 * Callers must apply the returned registry before doing anything
 * asynchronous. That is what makes the second call see `confirming`.
 */
export function beginConfirm(registry: Registry, token: string, nowMs: number | null): { registry: Registry; started: Confirmation | null } {
  const current = registry[token];
  if (!current || current.status.kind !== 'live') return { registry, started: null };
  // Without a server clock we cannot tell whether the deadline has passed. Fail closed.
  if (nowMs === null) return { registry, started: null };
  if (isExpired(current, nowMs)) {
    return { registry: { ...registry, [token]: to(current, { kind: 'expired' }) }, started: null };
  }
  const started = to(current, { kind: 'confirming' });
  return { registry: { ...registry, [token]: started }, started };
}

/** Live prompts whose deadline has passed become expired. Returns the same registry if none did. */
export function expireDue(registry: Registry, nowMs: number): Registry {
  let next: Record<string, Confirmation> | null = null;
  for (const [token, c] of Object.entries(registry)) {
    if (c.status.kind === 'live' && isExpired(c, nowMs)) {
      next ??= { ...registry };
      next[token] = to(c, { kind: 'expired' });
    }
  }
  return next ?? registry;
}

/** Every live prompt becomes void (the user was switched). */
export function voidAll(registry: Registry, reason: 'user_switched' | 'conversation_reset'): Registry {
  const next: Record<string, Confirmation> = {};
  for (const [token, c] of Object.entries(registry)) next[token] = transition(c, { type: 'voided', reason });
  return next;
}
