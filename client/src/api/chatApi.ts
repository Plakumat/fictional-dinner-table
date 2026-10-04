import type { Confirmation, ServerTokenState } from '../core/confirmation/machine';
import { readApiError, type Http } from './http';

export interface ChatRequest {
  userId: string;
  message: string;
  conversationId: string | null;
}

export type ChatOpen =
  | { kind: 'stream'; body: ReadableStream<Uint8Array> }
  | { kind: 'http_error'; status: number; code: string; message: string; retryAfterS: number | null };

/**
 * `answered`: the server replied, whatever the status; `document` is the
 * ui_spec body. `no_response`: the request died, timed out, or came back
 * unreadable. In that case the action MAY HAVE RUN and nobody may assume
 * either way.
 */
export type ExecuteResult = { kind: 'answered'; status: number; document: unknown } | { kind: 'no_response' };

export type TokenStatus = { kind: 'state'; state: ServerTokenState; result?: unknown } | { kind: 'unreachable' };

export interface StoredTurn {
  role: 'user' | 'assistant';
  text?: string;
  /** The full ui_spec document the server generated for an assistant turn. */
  response?: unknown;
  /** false: the server itself cut or errored the stream. A stream the user stopped is complete. */
  complete?: boolean;
}

export type StoredConversation = { kind: 'found'; userId: string; turns: StoredTurn[] } | { kind: 'missing' } | { kind: 'unreachable' };

/** Everything the chat store needs from the network. Tests pass a fake. */
export interface ChatApi {
  /** Rejects on a network failure or an abort. */
  openChat(request: ChatRequest, signal: AbortSignal): Promise<ChatOpen>;
  /** Never rejects. */
  execute(confirmation: Confirmation): Promise<ExecuteResult>;
  /** Never rejects. */
  tokenStatus(token: string): Promise<TokenStatus>;
  /** Never rejects. */
  conversation(conversationId: string): Promise<StoredConversation>;
}

const EXECUTE_TIMEOUT_MS = 15_000;
const TOKEN_STATES: readonly string[] = ['live', 'expired', 'used', 'superseded', 'void', 'invalid'];

export function createChatApi(http: Http): ChatApi {
  return {
    async openChat({ userId, message, conversationId }, signal) {
      const response = await http.post(
        '/api/chat',
        { user_id: userId, message, ...(conversationId ? { conversation_id: conversationId } : {}) },
        signal,
      );
      if (response.ok && response.body) return { kind: 'stream', body: response.body };
      const { code, message: text } = await readApiError(response);
      const retryAfter = Number(response.headers.get('Retry-After'));
      return {
        kind: 'http_error',
        status: response.status,
        code,
        message: text,
        retryAfterS: response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      };
    },

    async execute(confirmation) {
      try {
        const response = await http.post(
          '/api/actions/execute',
          {
            user_id: confirmation.userId,
            action: confirmation.action,
            // The frozen object the server sent, serialised as is.
            params: confirmation.params,
            confirm_token: confirmation.token,
          },
          AbortSignal.timeout(EXECUTE_TIMEOUT_MS),
        );
        return { kind: 'answered', status: response.status, document: await response.json() };
      } catch {
        return { kind: 'no_response' };
      }
    },

    async tokenStatus(token) {
      try {
        const response = await http.get(`/api/actions/status?confirm_token=${encodeURIComponent(token)}`);
        if (!response.ok) return { kind: 'unreachable' };
        const body = (await response.json()) as { state?: unknown; result?: unknown } | null;
        if (typeof body?.state !== 'string' || !TOKEN_STATES.includes(body.state)) return { kind: 'unreachable' };
        return { kind: 'state', state: body.state as ServerTokenState, result: body.result };
      } catch {
        return { kind: 'unreachable' };
      }
    },

    async conversation(conversationId) {
      try {
        const response = await http.get(`/api/conversations/${encodeURIComponent(conversationId)}`);
        if (response.status === 404) return { kind: 'missing' };
        if (!response.ok) return { kind: 'unreachable' };
        const body = (await response.json()) as { user_id?: unknown; turns?: unknown } | null;
        if (typeof body?.user_id !== 'string' || !Array.isArray(body.turns)) return { kind: 'unreachable' };
        const turns = body.turns.filter(
          (turn): turn is StoredTurn => typeof turn === 'object' && turn !== null && (turn.role === 'user' || turn.role === 'assistant'),
        );
        return { kind: 'found', userId: body.user_id, turns };
      } catch {
        return { kind: 'unreachable' };
      }
    },
  };
}
