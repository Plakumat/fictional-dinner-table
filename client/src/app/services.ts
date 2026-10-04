import { QueryClient } from '@tanstack/react-query';
import { createChatApi } from '../api/chatApi';
import { createHttp } from '../api/http';
import { createServerClock } from '../core/clock/serverClock';
import { createChatStore } from '../state/chatStore';

// The app's long-lived objects, wired once. Tests and the workbench build
// their own with fakes; nothing in core/ or state/ imports this file.

export const clock = createServerClock();
export const http = createHttp(clock);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, retry: 1 } },
});

/** Wallet, cart and orders of one user share this key prefix, so one call refreshes all three. */
export const accountKey = (userId: string) => ['account', userId] as const;

// Resuming after a reload. The browser keeps a pointer (who, which
// conversation) and nothing else: turns come back from
// GET /api/conversations/:id and every prompt's state from
// GET /api/actions/status. What localStorage says about a confirmation is not
// trusted, because it is not stored.
const SESSION_KEY = 'sofra.session';

function readPointer(): { userId?: string; conversationId?: string } {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? '{}');
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

const pointer = readPointer();

/** The mock has no authentication: every request names its user. `?user=u_new` picks one at load. */
const initialUserId = new URLSearchParams(window.location.search).get('user') ?? pointer.userId ?? 'u_ok';

export const chatStore = createChatStore({
  api: createChatApi(http),
  clock,
  initialUserId,
  // "Stale is worse than slow": after an action, everything it may have
  // changed is refetched from the server. Nothing is updated optimistically,
  // because that would mean computing a balance on the client.
  onAccountChanged: (userId) => void queryClient.invalidateQueries({ queryKey: accountKey(userId) }),
});

// Validation failures are handled calmly in the product UI. For a developer
// they are also printed once per response, next to the audit inspector.
const reported = new Set<string>();
chatStore.subscribe((state) => {
  // Forget responses that left the transcript (user switch, new conversation).
  if (reported.size > state.items.length) {
    const present = new Set(state.items.map((item) => item.id));
    for (const id of reported) if (!present.has(id)) reported.delete(id);
  }
  for (const item of state.items) {
    const { phase, issues } = item.response;
    if (issues.length === 0 || phase.kind === 'connecting' || phase.kind === 'streaming' || reported.has(item.id)) continue;
    reported.add(item.id);
    console.warn(`[sofra] ${issues.length} issue(s) in a response`, issues);
  }
});

chatStore.subscribe((state, previous) => {
  if (state.userId === previous.userId && state.conversationId === previous.conversationId) return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: state.userId, conversationId: state.conversationId }));
  } catch {
    // Storage is unavailable: the app works, it just will not resume.
  }
});

if (pointer.conversationId && pointer.userId === initialUserId) void chatStore.getState().restore(pointer.conversationId);
