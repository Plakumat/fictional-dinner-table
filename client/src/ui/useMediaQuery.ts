import { useCallback, useSyncExternalStore } from 'react';

/** Whether a media query matches, kept in sync with the window. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below this width the rail and the panel become drawers. */
export const COMPACT = '(max-width: 1023px)';
