import { NextRequest, NextResponse } from "next/server";

import { isGridExpiry } from "@/lib/expiry";
import { fetchSettlementUpdate, SettlementDataError } from "@/lib/desk/hermes";
import { allow, clientKey } from "@/lib/desk/ratelimit";

export const dynamic = "force-dynamic";

/**
 * The signed Pyth update for one expiry, proxied so the Pyth key stays on the
 * server. Only listed fixings that have already passed are served, and a past
 * fixing's update never changes, so answers are cached at the edge for good:
 * each expiry costs Pyth one request no matter how many people settle.
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
    const updates = await fetchSettlementUpdate(expiry);
    return NextResponse.json(
      { expiry, updates },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=31536000, immutable" } },
    );
  } catch (err) {
    const status = err instanceof SettlementDataError ? err.status : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "settlement data unavailable" },
      { status },
    );
  }
}
