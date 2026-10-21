/**
 * A small fixed-window limiter, per server instance.
 *
 * Serverless instances do not share memory, so this is not a hard global cap;
 * it stops one client from hammering one instance, which is the common case
 * (a stuck polling loop, a script). The routes it guards sign quotes and spend
 * the paid Pyth key, so even that much is worth having.
 */

import type { NextRequest } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: NextRequest, scope: string) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${scope}:${ip}`;
}

/** True when this request is within `limit` per `windowMs` for its key. */
export function allow(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
