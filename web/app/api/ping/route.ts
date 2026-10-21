import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness only: the server is up and answering. The container's health check
 * uses this; /api/health answers the harder question of whether trading and
 * settlement work, and is for an uptime monitor.
 */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
