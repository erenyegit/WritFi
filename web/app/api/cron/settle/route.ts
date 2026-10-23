import { NextRequest, NextResponse } from "next/server";

import { runKeeper } from "@/lib/desk/keeper";
import { allow, clientKey } from "@/lib/desk/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Settles every expired position. Vercel Cron calls this once a day just after
 * the 08:00 UTC fixing (see vercel.json); anyone else may call it too, because
 * settlement is permissionless and only ever pays out at Pyth's expiry price.
 * When CRON_SECRET is set, Vercel sends it and other callers get a dry run.
 *
 * GET /api/cron/settle          settle what is due
 * GET /api/cron/settle?dry=1    report what is due without sending anything
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = !secret || req.headers.get("authorization") === `Bearer ${secret}`;
  const dryRun = !authorized || req.nextUrl.searchParams.has("dry");
  // A dry run still pages through every position on chain.
  if (!authorized && !allow(clientKey(req, "keeper"), 10)) {
    return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });
  }
  try {
    const report = await runKeeper({ dryRun });
    if (report.failed.length > 0) console.error("[keeper] failed", report.failed);
    const status = report.failed.length > 0 ? 500 : 200;
    return NextResponse.json(report, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[keeper]", err);
    // The scheduled task prints this body (curl --fail-with-body); anyone else gets no internals.
    const detail = authorized && err instanceof Error ? err.message.split("\n")[0] : "keeper failed";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
