// Decision: The server's clock is the only clock; the latest sample wins because the server's time can go backwards on reset.
// Pinned by: state/chatStore.test.ts (expiry on the server clock); eslint forbids Date.now() and new Date() in src/

/**
 * The server's clock, as far as the client can know it.
 *
 * The mock's "now" starts on 2026-08-20 and has nothing to do with the
 * browser's. Expiry, "2 days ago" and "today" are all relative to it, so this
 * module is the only place in the client that knows what time it is.
 *
 * How it works: every API response carries `X-Sofra-Now`. On each one we store
 * the difference between that instant and a local monotonic timer, and `now()`
 * adds the timer back. performance.now() is used rather than Date.now() so that
 * the user changing their system clock cannot move a deadline.
 *
 * The latest sample always wins. Keeping the furthest-ahead sample would be a
 * little more accurate under latency, but the server's clock can also go
 * backwards (POST /__admin/reset returns it to the start), and a client that
 * refused to follow would show every new confirmation as already expired.
 */
export interface ServerClock {
  /** Server time in ms since the epoch, or null before the first response. */
  now(): number | null;
  /** Feed a server timestamp (ISO-8601). Unreadable values are ignored. */
  sync(serverNow: string | null | undefined): void;
}

export function createServerClock(monotonicMs: () => number = () => performance.now()): ServerClock {
  let offset: number | null = null;
  return {
    now: () => (offset === null ? null : monotonicMs() + offset),
    sync(serverNow) {
      if (typeof serverNow !== 'string') return;
      const instant = Date.parse(serverNow);
      if (Number.isFinite(instant)) offset = instant - monotonicMs();
    },
  };
}

const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The server's calendar date (YYYY-MM-DD). Calendar dates in Sofra are Europe/Istanbul dates. */
export const istanbulDate = (serverNowMs: number): string => ISTANBUL_DAY.format(serverNowMs);

/** Whole days from `fromDate` to `toDate`, both YYYY-MM-DD. null if either is unreadable. */
export function daysBetween(fromDate: string, toDate: string): number | null {
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  if (!DAY.test(fromDate) || !DAY.test(toDate)) return null;
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 86_400_000) : null;
}
