import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ChatApi } from '../api/chatApi';
import type { ServerClock } from '../core/clock/serverClock';
import {
  beginConfirm,
  dispatch,
  expireDue,
  registerPrompt,
  restorePrompt,
  voidAll,
  type Confirmation,
  type ConfirmationEvent,
  type Registry,
} from '../core/confirmation/machine';
import { parseDocument, type ParsedDocument } from '../core/contract/parseBlock';
import type { Action } from '../core/contract/schemas';
import { createNdjsonDecoder } from '../core/stream/ndjson';
import {
  applyLine,
  closeStream,
  initialResponse,
  isOpen,
  responseFromDocument,
  stopResponse,
  type Phase,
  type ResponseState,
} from '../core/stream/response';

/** One user message and the assistant's answer to it (the latest attempt). */
export interface Turn {
  kind: 'turn';
  id: string;
  userText: string;
  response: ResponseState;
}

/** The server's answer to a confirmed action: rendered through the same pipeline as a turn. */
export interface ActionResult {
  kind: 'action_result';
  id: string;
  token: string;
  action: Action;
  /** null when the document came from GET /api/actions/status after a lost response. */
  httpStatus: number | null;
  response: ResponseState;
}

export type TranscriptItem = Turn | ActionResult;

export interface ChatState {
  userId: string;
  conversationId: string | null;
  items: readonly TranscriptItem[];
  confirmations: Registry;
  /** The turn whose stream is open, if any. */
  activeTurnId: string | null;
  /** A conversation is being restored after a reload. */
  restoring: boolean;

  send(text: string): void;
  stop(): void;
  retry(turnId: string): void;
  /** The only function that can spend money. Called by the prompt's own control and by nothing else. */
  confirm(token: string): void;
  /** Ask the server again what happened to a confirmation whose outcome is unknown. */
  recheck(token: string): void;
  switchUser(userId: string): void;
  /** Clears the screen; the next message opens a new conversation. Live prompts of the old one become void. */
  newConversation(): void;
  /** Expire prompts whose deadline has passed on the server's clock. */
  tick(): void;
  /** Brings a conversation back after a reload. Everything is read from the server. */
  restore(conversationId: string): Promise<void>;
}

export interface ChatDeps {
  api: ChatApi;
  clock: ServerClock;
  initialUserId: string;
  /** Wallet, cart and orders may have changed: whoever shows them must refetch. */
  onAccountChanged?: (userId: string) => void;
  monotonicMs?: () => number;
  wait?: (ms: number) => Promise<void>;
  newId?: () => string;
}

export type ChatStore = StoreApi<ChatState>;

/** Pauses before each GET /api/actions/status attempt while reconciling. */
const RECONCILE_DELAYS_MS = [0, 1000, 2000, 4000];

export function createChatStore(deps: ChatDeps): ChatStore {
  const { api, clock } = deps;
  const monotonicMs = deps.monotonicMs ?? (() => performance.now());
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const accountChanged = deps.onAccountChanged ?? (() => {});

  /** The open stream's abort handle. Not state: nothing renders from it. */
  let active: { turnId: string; controller: AbortController } | null = null;
  /** Bumped on every user switch. Async work started before a switch checks it before touching the transcript. */
  let session = 0;

  return createStore<ChatState>()((set, get) => {
    /**
     * Applies `fn` to one turn's response, found by id. This is what keeps an
     * old stream out of a newer turn: its events are addressed to its own turn,
     * and the reducer ignores them once that turn has stopped.
     */
    const patchResponse = (turnId: string, fn: (response: ResponseState) => ResponseState): void => {
      set((state) => {
        let changed = false;
        const items = state.items.map((item) => {
          if (item.id !== turnId || item.kind !== 'turn') return item;
          const response = fn(item.response);
          if (response === item.response) return item;
          changed = true;
          return { ...item, response };
        });
        if (!changed) return state;
        const meta = items.find((item) => item.id === turnId)?.response.meta ?? null;
        // Fallback for a response without the X-Sofra-Now header.
        if (meta && clock.now() === null) clock.sync(meta.serverNow);
        return { items, conversationId: meta?.conversationId ?? state.conversationId };
      });
    };

    const responseOf = (turnId: string): ResponseState | undefined => get().items.find((item) => item.id === turnId)?.response;

    const updateConfirmation = (token: string, event: ConfirmationEvent): void => {
      set((state) => {
        const confirmations = dispatch(state.confirmations, token, event);
        return confirmations === state.confirmations ? state : { confirmations };
      });
    };

    /**
     * Prompts become confirmable only when their response has finished.
     * A prompt in a response that was cut, failed or stopped is registered as
     * unusable: we did not see the whole answer it belongs to.
     */
    const registerPromptsOf = (response: ResponseState, userId: string): void => {
      const usable = response.phase.kind === 'complete';
      set((state) => {
        let confirmations = state.confirmations;
        for (const slot of response.blocks) {
          if (slot?.kind === 'valid' && slot.block.type === 'confirmation_prompt') {
            confirmations = registerPrompt(confirmations, slot.block, userId, usable);
          }
        }
        return confirmations === state.confirmations ? state : { confirmations };
      });
    };

    /** The turn's response has reached its final phase. */
    const settle = (turnId: string): void => {
      if (active?.turnId === turnId) active = null;
      const response = responseOf(turnId);
      if (response) registerPromptsOf(response, get().userId);
      if (get().activeTurnId === turnId) set({ activeTurnId: null });
    };

    const fail = (turnId: string, phase: Extract<Phase, { kind: 'failed' }>): void =>
      patchResponse(turnId, (response) => (isOpen(response.phase) ? { ...response, phase } : response));

    const stopActive = (by: 'user' | 'new_message' | 'user_switch'): void => {
      if (!active) return;
      const { turnId, controller } = active;
      // Mark first, abort second: whatever is still in flight finds a stopped turn.
      patchResponse(turnId, (response) => stopResponse(response, by));
      controller.abort();
      settle(turnId);
    };

    const runStream = async (turnId: string, message: string): Promise<void> => {
      const controller = new AbortController();
      active = { turnId, controller };
      const { userId, conversationId } = get();

      let opened;
      try {
        opened = await api.openChat({ userId, message, conversationId }, controller.signal);
      } catch {
        fail(turnId, { kind: 'failed', code: 'network_error', message: 'Could not reach Sofra.', retryable: true });
        return settle(turnId);
      }

      if (opened.kind === 'http_error') {
        fail(turnId, {
          kind: 'failed',
          code: opened.code,
          message: opened.message,
          retryable: true,
          httpStatus: opened.status,
          ...(opened.retryAfterS === null ? {} : { retryNotBeforeMs: monotonicMs() + opened.retryAfterS * 1000 }),
        });
        return settle(turnId);
      }

      const decoder = createNdjsonDecoder();
      const reader = opened.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.push(value);
          if (lines.length > 0) patchResponse(turnId, (response) => lines.reduce(applyLine, response));
          // `done`, an error event, a corrupt line or Stop: nothing further is read.
          const phase = responseOf(turnId)?.phase;
          if (!phase || !isOpen(phase)) {
            // After `done` or `error` the server closes the stream itself; cancelling
            // it here would make DevTools show the finished response as cancelled.
            if (phase?.kind !== 'complete' && phase?.kind !== 'failed') void reader.cancel().catch(() => {});
            break;
          }
        }
      } catch {
        // The connection dropped or the request was aborted. closeStream decides what that means.
      }
      patchResponse(turnId, (response) => closeStream(response, decoder.end()));
      settle(turnId);
    };

    const appendActionResult = (c: Confirmation, httpStatus: number | null, doc: ParsedDocument, startedIn: number): void => {
      accountChanged(c.userId);
      // The user was switched while this was in flight: the result belongs to a transcript that is gone.
      if (startedIn !== session) return;
      const response = responseFromDocument(doc);
      set((state) => ({
        items: [...state.items, { kind: 'action_result', id: newId(), token: c.token, action: c.action, httpStatus, response }],
      }));
      // A 410 or a params_mismatch carries a fresh prompt. It enters the registry like any other.
      registerPromptsOf(response, c.userId);
    };

    /** The request died without an answer: find out what happened instead of guessing. */
    const reconcile = async (c: Confirmation, startedIn: number): Promise<void> => {
      for (const delay of RECONCILE_DELAYS_MS) {
        if (delay > 0) await wait(delay);
        const status = await api.tokenStatus(c.token);
        if (status.kind === 'unreachable') continue;
        updateConfirmation(c.token, { type: 'status', state: status.state });
        if (status.state === 'used' && status.result !== undefined) {
          appendActionResult(c, null, parseDocument(status.result), startedIn);
        } else {
          accountChanged(c.userId);
        }
        return;
      }
      updateConfirmation(c.token, { type: 'status_unreachable' });
    };

    const runExecute = async (c: Confirmation, startedIn: number): Promise<void> => {
      const result = await api.execute(c);
      if (result.kind === 'no_response') {
        updateConfirmation(c.token, { type: 'no_response' });
        return reconcile(c, startedIn);
      }
      const doc = parseDocument(result.document);
      const code = outcomeCode(result.status, doc);
      if (code === 'token_used') {
        // It already ran. Show the original result, not an "already used" error.
        updateConfirmation(c.token, { type: 'no_response' });
        return reconcile(c, startedIn);
      }
      updateConfirmation(c.token, result.status === 200 ? { type: 'executed' } : { type: 'rejected', code });
      appendActionResult(c, result.status, doc, startedIn);
    };

    return {
      userId: deps.initialUserId,
      conversationId: null,
      items: [],
      confirmations: {},
      activeTurnId: null,
      restoring: false,

      async restore(conversationId) {
        const startedIn = session;
        // Set at once, so a message typed while restoring continues this conversation.
        set({ conversationId, restoring: true });
        const stored = await api.conversation(conversationId);
        const state = get();
        // The user did not wait (sent a message, switched user), or it is not theirs: leave things alone.
        if (startedIn !== session || state.items.length > 0 || stored.kind !== 'found' || stored.userId !== state.userId) {
          if (startedIn === session) set({ restoring: false, ...(stored.kind === 'missing' ? { conversationId: null } : {}) });
          return;
        }

        const turns: Turn[] = [];
        let userText: string | null = null;
        for (const turn of stored.turns) {
          if (turn.role === 'user') {
            userText = typeof turn.text === 'string' ? turn.text : '';
          } else if (userText !== null) {
            const response = responseFromDocument(parseDocument(turn.response));
            turns.push({
              kind: 'turn',
              id: newId(),
              userText,
              // The server cut this stream itself; the client never saw it finish, and it does not now.
              response:
                turn.complete === false && response.phase.kind === 'complete'
                  ? { ...response, phase: { kind: 'incomplete', reason: 'closed_without_done' } }
                  : response,
            });
            userText = null;
          }
        }

        // What happened to each prompt is the server's to say. Nothing about it was stored in the browser.
        const items: TranscriptItem[] = [];
        let confirmations = state.confirmations;
        for (const turn of turns) {
          items.push(turn);
          for (const slot of turn.response.blocks) {
            if (slot?.kind !== 'valid' || slot.block.type !== 'confirmation_prompt') continue;
            const prompt = slot.block;
            const status = turn.response.phase.kind === 'complete' ? await api.tokenStatus(prompt.confirm_token) : null;
            confirmations = restorePrompt(confirmations, prompt, state.userId, status?.kind === 'state' ? status.state : null);
            if (status?.kind === 'state' && status.state === 'used' && status.result !== undefined) {
              items.push({
                kind: 'action_result',
                id: newId(),
                token: prompt.confirm_token,
                action: prompt.action,
                httpStatus: null,
                response: responseFromDocument(parseDocument(status.result)),
              });
            }
          }
        }
        if (startedIn !== session || get().items.length > 0) return void set({ restoring: false });
        set({ items, confirmations, restoring: false });
      },

      send(text) {
        const message = text.trim();
        if (message === '') return;
        stopActive('new_message');
        const id = newId();
        set((state) => ({
          items: [...state.items, { kind: 'turn', id, userText: message, response: initialResponse() }],
          activeTurnId: id,
        }));
        void runStream(id, message);
      },

      stop() {
        stopActive('user');
      },

      retry(turnId) {
        const state = get();
        const last = state.items.at(-1);
        if (state.activeTurnId !== null || last?.kind !== 'turn' || last.id !== turnId) return;
        const { phase } = last.response;
        if (isOpen(phase) || phase.kind === 'complete') return;
        // Rate limited: no retry before the server's Retry-After window has passed.
        if (phase.kind === 'failed' && phase.retryNotBeforeMs !== undefined && monotonicMs() < phase.retryNotBeforeMs) return;
        set({
          items: state.items.map((item) => (item.id === turnId ? { ...last, response: initialResponse() } : item)),
          activeTurnId: turnId,
        });
        void runStream(turnId, last.userText);
      },

      confirm(token) {
        const state = get();
        // An answer in flight may be replacing this very prompt. Wait for it.
        if (state.activeTurnId !== null) return;
        if (state.confirmations[token]?.userId !== state.userId) return;
        const { registry, started } = beginConfirm(state.confirmations, token, clock.now());
        // Applied synchronously, before anything is sent: a second click finds `confirming`.
        if (registry !== state.confirmations) set({ confirmations: registry });
        if (started) void runExecute(started, session);
      },

      recheck(token) {
        const c = get().confirmations[token];
        if (c?.status.kind !== 'unresolved') return;
        updateConfirmation(token, { type: 'recheck' });
        void reconcile(c, session);
      },

      switchUser(userId) {
        if (userId === get().userId) return;
        stopActive('user_switch');
        session += 1;
        // A conversation and its confirmations belong to one user. The next
        // message starts a new conversation, and nothing issued to the previous
        // user stays confirmable.
        set((state) => ({
          userId,
          conversationId: null,
          items: [],
          activeTurnId: null,
          confirmations: voidAll(state.confirmations, 'user_switched'),
        }));
      },

      newConversation() {
        if (get().items.length === 0 && get().conversationId === null) return;
        stopActive('user');
        session += 1;
        set((state) => ({
          conversationId: null,
          items: [],
          activeTurnId: null,
          confirmations: voidAll(state.confirmations, 'conversation_reset'),
        }));
      },

      tick() {
        const now = clock.now();
        if (now === null) return;
        set((state) => {
          const confirmations = expireDue(state.confirmations, now);
          return confirmations === state.confirmations ? state : { confirmations };
        });
      },
    };
  });
}

/** Why the server refused an execute request, as a stable code. */
function outcomeCode(status: number, doc: ParsedDocument): string {
  if (status === 200) return 'executed';
  if (status === 422) return 'gate_closed';
  if (doc.kind === 'document') {
    for (const slot of doc.blocks) {
      if (slot.kind === 'valid' && slot.block.type === 'error') return slot.block.code;
    }
  }
  return `http_${status}`;
}
