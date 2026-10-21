import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/early/errors";
import { leaderboard } from "@/lib/early/store";

export const dynamic = "force-dynamic";

/** The public top ten. Wallets are shortened before they leave the server. */
export async function GET() {
  try {
    return NextResponse.json(await leaderboard(10), {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
