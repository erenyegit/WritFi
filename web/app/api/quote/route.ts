import { NextRequest, NextResponse } from "next/server";

import { getSpot } from "@/lib/desk/price";
import { parseQuoteParams } from "@/lib/desk/params";
import { buildSignedQuote, QuoteError } from "@/lib/desk/quote";
import { allow, clientKey } from "@/lib/desk/ratelimit";

export const dynamic = "force-dynamic";

/**
 * This app's own maker, as a quote endpoint. It is the shape an external maker
 * implements to join the RFQ; writers should call /api/rfq instead.
 * GET /api/quote?writer=0x..&isPut=true&strike=82500&qty=0.01&expiry=1790323200
 */
export async function GET(req: NextRequest) {
  if (!allow(clientKey(req, "quote"), 60)) {
    return NextResponse.json({ error: "Too many quote requests. Wait a moment." }, { status: 429 });
  }
  try {
    const params = parseQuoteParams(req.nextUrl.searchParams);
    const spot = await getSpot();
    return NextResponse.json(await buildSignedQuote(params, spot.usd), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof QuoteError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "quote failed" },
      { status: 503 },
    );
  }
}
