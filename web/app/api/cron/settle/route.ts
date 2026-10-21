import { NextRequest, NextResponse } from "next/server";

import { runKeeper } from "@/lib/desk/keeper";

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
  try {
    const report = await runKeeper({ dryRun });
    const status = report.failed.length > 0 ? 500 : 200;
    return NextResponse.json(report, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "keeper failed" },
      { status: 500 },
    );
  }
}
