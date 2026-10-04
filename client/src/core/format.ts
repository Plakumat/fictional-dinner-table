// Decision: Formatting only. No function here adds, subtracts or compares money; dates are relative to the server's today.
// Pinned by: e2e sc_01, sc_17 (amounts and dates as the server sent them)

import { daysBetween } from './clock/serverClock';

// Formatting only. Nothing here adds, subtracts or compares money: amounts
// are displayed as the server sent them.

const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 390 → "₺390", 195.5 → "₺195,5". */
export const formatTry = (amount: number): string => TRY.format(amount);

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "2026-08-18" → "18 Aug 2026". Anything else is returned untouched rather than guessed at. */
export function formatDay(date: string): string {
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  return Number.isFinite(instant) ? DAY.format(instant) : date;
}

/** "today", "yesterday", "2 days ago", relative to the server's calendar date. null when unknown. */
export function relativeDay(date: string, serverToday: string | null): string | null {
  if (serverToday === null) return null;
  const days = daysBetween(date, serverToday);
  return days === null ? null : RELATIVE.format(-days, 'day');
}

/** Milliseconds left → "4:59". Never negative. */
export function formatCountdown(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
