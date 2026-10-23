import { NextRequest, NextResponse } from "next/server";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { noStore, tooMany } from "@/lib/early/errors";
import { newNonce, rememberNonce } from "@/lib/early/session";

export const dynamic = "force-dynamic";

/** A fresh nonce for the Sign-In with Ethereum message. */
export async function GET(req: NextRequest) {
  if (!allow(clientKey(req, "early-nonce"), 60)) return tooMany();
  const nonce = newNonce();
  // The server's time goes along, so the message's times never depend on the device clock.
  const res = NextResponse.json({ nonce, now: Date.now() }, { headers: noStore });
  rememberNonce(res, nonce);
  return res;
}
