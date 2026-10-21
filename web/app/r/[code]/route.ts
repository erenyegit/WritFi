import { NextRequest, NextResponse } from "next/server";

import { isCode } from "@/lib/early/quests";
import { publicOrigin, readRef, rememberRef } from "@/lib/early/session";

export const dynamic = "force-dynamic";

/**
 * Invite links: writ.fi/r/<code> remembers the inviter and opens the early
 * access page. The first invite a visitor arrives with is the one that counts;
 * a later link does not replace it.
 */
export function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const kept = readRef(req)?.toUpperCase() ?? "";
  const code = isCode(kept) ? kept : params.code.toUpperCase();
  const valid = isCode(code);
  const to = new URL("/early", publicOrigin(req));
  if (valid) to.searchParams.set("ref", code);
  const res = NextResponse.redirect(to, 307);
  if (valid && code !== kept) rememberRef(res, code);
  return res;
}
