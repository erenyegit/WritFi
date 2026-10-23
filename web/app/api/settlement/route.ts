import { NextRequest, NextResponse } from "next/server";

import { isGridExpiry } from "@/lib/expiry";
import { fetchSettlementUpdate, SettlementDataError } from "@/lib/desk/hermes";
import { allow, clientKey } from "@/lib/desk/ratelimit";

export const dynamic = "force-dynamic";

/**
 * A past fixing's update never changes, so each one is fetched from Pyth once
 * per server and kept. With no CDN in front of the app, this is what keeps the
 * paid key at one request per expiry however many people settle. The fetch
 * itself is kept, so a burst right after a fixing shares it; a failure is
 * dropped and the next request tries again.
 */
const updatesByExpiry = new Map<number, Promise<`0x${string}`[]>>();
const MAX_KEPT = 256;

function settlementUpdate(expiry: number): Promise<`0x${string}`[]> {
  let updates = updatesByExpiry.get(expiry);
  if (!updates) {
    const fetched = fetchSettlementUpdate(expiry);
    if (updatesByExpiry.size >= MAX_KEPT) updatesByExpiry.delete(updatesByExpiry.keys().next().value!);
    updatesByExpiry.set(expiry, fetched);
    fetched.catch(() => {
      if (updatesByExpiry.get(expiry) === fetched) updatesByExpiry.delete(expiry);
    });
    updates = fetched;
  }
  return updates;
}

/**
 * The signed Pyth update for one expiry, proxied so the Pyth key stays on the
 * server. Only listed fixings that have already passed are served, and answers
 * are also marked immutable for any cache in front.
 *
 * GET /api/settlement?expiry=1790236800
 */
export async function GET(req: NextRequest) {
  const expiry = Number(req.nextUrl.searchParams.get("expiry"));
  if (!Number.isInteger(expiry) || !isGridExpiry(expiry)) {
    return NextResponse.json({ error: "expiry must be a listed 08:00 UTC fixing" }, { status: 400 });
  }
  if (expiry > Math.floor(Date.now() / 1000) - 5) {
    return NextResponse.json({ error: "that expiry has not passed yet" }, { status: 425 });
  }
  if (!allow(clientKey(req, "settlement"), 30)) {
    return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });
  }
  try {
    const updates = await settlementUpdate(expiry);
    return NextResponse.json(
      { expiry, updates },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=31536000, immutable" } },
    );
  } catch (err) {
    if (err instanceof SettlementDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[settlement]", err);
    return NextResponse.json({ error: "Settlement data is unavailable right now." }, { status: 502 });
  }
}
