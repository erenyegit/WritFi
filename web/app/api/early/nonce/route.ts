import { NextRequest, NextResponse } from "next/server";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { noStore, tooMany } from "@/lib/early/errors";
import { newNonce, rememberNonce } from "@/lib/early/session";

export const dynamic = "force-dynamic";

/** A fresh nonce for the Sign-In with Ethereum message. */
export async function GET(req: NextRequest) {
  if (!allow(clientKey(req, "early-nonce"), 30)) return tooMany();
  const nonce = newNonce();
  const res = NextResponse.json({ nonce }, { headers: noStore });
  rememberNonce(res, nonce);
  return res;
}
