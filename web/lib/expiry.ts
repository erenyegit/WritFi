/**
 * The expiry grid: Fridays at 08:00 UTC, the weekly fixing Deribit uses for
 * BTC options, so a maker can hedge a Writ position with a listed one.
 *
 * Weekly rather than daily on purpose. A premium annualizes with the square
 * root of time, so a one-day option shows a rate in the hundreds of percent
 * while paying a few dollars. That number is true and useless, and it reads
 * like a promise the product does not make.
 *
 * Shared by the server (what may be quoted) and the browser (what is shown),
 * so both agree on exactly which timestamps exist.
 */

export const DAY = 86_400;
export const WEEK = 7 * DAY;
export const FIX_HOUR_UTC = 8;
/** The Unix epoch was a Thursday; Friday 08:00 UTC is this far into each week. */
const FRIDAY_OFFSET = 1 * DAY + FIX_HOUR_UTC * 3600;
/** The nearest listed Friday is at least this far away. */
export const MIN_LEAD_SEC = 3 * DAY;
/** And the furthest stays inside the contract's 30-day maximum tenor. */
export const MAX_LEAD_SEC = 29 * DAY;
export const EXPIRY_COUNT = 4;

export const isGridExpiry = (t: number) => Number.isInteger(t) && (t - FRIDAY_OFFSET) % WEEK === 0;

/** Up to `count` Friday fixings between MIN_LEAD_SEC and MAX_LEAD_SEC after `now` (seconds). */
export function upcomingExpiries(now: number, count = EXPIRY_COUNT): number[] {
  let t = Math.floor((now - FRIDAY_OFFSET) / WEEK) * WEEK + FRIDAY_OFFSET;
  const out: number[] = [];
  while (out.length < count && t <= now + MAX_LEAD_SEC) {
    if (t >= now + MIN_LEAD_SEC) out.push(t);
    t += WEEK;
  }
  return out;
}

/** The most recent Friday fixing at or before `now`. */
export function lastExpiry(now: number): number {
  return Math.floor((now - FRIDAY_OFFSET) / WEEK) * WEEK + FRIDAY_OFFSET;
}
