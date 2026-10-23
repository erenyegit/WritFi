import { NextRequest, NextResponse } from "next/server";

import { getSpot } from "@/lib/desk/price";
import { parseQuoteParams } from "@/lib/desk/params";
import { QuoteError } from "@/lib/desk/quote";
import { allow, clientKey } from "@/lib/desk/ratelimit";
import { requestForQuote } from "@/lib/desk/rfq";

export const dynamic = "force-dynamic";

/**
 * Ask every registered maker for a price and return the best valid one.
 * GET /api/rfq?writer=0x..&isPut=true&strike=82500&qty=0.01&expiry=1790323200
 */
export async function GET(req: NextRequest) {
  if (!allow(clientKey(req, "rfq"), 60)) {
    return NextResponse.json({ error: "Too many quote requests. Wait a moment." }, { status: 429 });
  }
  try {
    const params = parseQuoteParams(req.nextUrl.searchParams);
    const spot = await getSpot();
    return NextResponse.json(await requestForQuote(params, spot.usd), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof QuoteError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[rfq]", err);
    return NextResponse.json({ error: "No maker could quote this right now." }, { status: 503 });
  }
}
