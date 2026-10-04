import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { istanbulDate, type ServerClock } from '../core/clock/serverClock';
import type { ChatState, ChatStore } from '../state/chatStore';

const StoreContext = createContext<ChatStore | null>(null);
const ServerNowContext = createContext<number | null>(null);

const TICK_MS = 500;

/**
 * Provides the chat store and the server's time. One interval drives both the
 * countdowns on screen and the expiry of prompts in the store, so what the user
 * sees and what `confirm` allows cannot disagree by more than a tick.
 */
export function AppProviders({ store, clock, children }: { store: ChatStore; clock: ServerClock; children: ReactNode }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      store.getState().tick();
      setNow(clock.now());
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [store, clock]);

  return (
    <StoreContext.Provider value={store}>
      <ServerNowContext.Provider value={now}>{children}</ServerNowContext.Provider>
    </StoreContext.Provider>
  );
}

export function useChatStore(): ChatStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useChatStore must be used inside <AppProviders>');
  return store;
}

/** Subscribes to one slice of the chat state. The selector must return a stable value. */
export function useChat<T>(selector: (state: ChatState) => T): T {
  return useStore(useChatStore(), selector);
}

/** The server's time in ms, refreshed twice a second. null until the first response. */
export const useServerNow = (): number | null => useContext(ServerNowContext);

/** The server's calendar date (Europe/Istanbul), or null until the first response. */
export function useServerToday(): string | null {
  const now = useServerNow();
  return now === null ? null : istanbulDate(now);
}
