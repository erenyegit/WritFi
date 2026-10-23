import { NextRequest, NextResponse } from "next/server";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { EarlyError, errorResponse, forbidden, noStore, tooMany } from "@/lib/early/errors";
import { sameOrigin, sessionAddress } from "@/lib/early/session";
import { completeQuest, getAccount } from "@/lib/early/store";

export const dynamic = "force-dynamic";

/** Complete a step: follow_x, post_x ({ url }) or testnet. Answers with the updated account. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return forbidden();
  if (!allow(clientKey(req, "early-quest"), 60)) return tooMany();
  try {
    const address = sessionAddress(req);
    if (!address) throw new EarlyError("Sign in first.", 401);
    const body = ((await req.json().catch(() => null)) ?? {}) as { url?: unknown };
    await completeQuest(address, params.id, body);
    return NextResponse.json({ account: await getAccount(address) }, { headers: noStore });
  } catch (err) {
    return errorResponse(err);
  }
}
