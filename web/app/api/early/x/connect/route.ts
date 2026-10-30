import { NextRequest, NextResponse } from "next/server";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { publicOrigin, rememberXAuth, sessionAddress } from "@/lib/early/session";
import { authorizeUrl, newState, newVerifier, redirectUri, xConnectReady } from "@/lib/early/xoauth";

export const dynamic = "force-dynamic";

/**
 * Starts Sign in with X for the signed-in wallet: remembers who asked, then
 * sends the browser to X. X sends it back to /api/early/x/callback. With
 * ?check=like it checks the like step instead of linking an account.
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const back = (x: string) => NextResponse.redirect(new URL(`/early?x=${x}#steps`, origin), 303);
  if (!allow(clientKey(req, "early-x"), 60)) return back("busy");
  if (!xConnectReady()) return back("off");
  const address = sessionAddress(req);
  if (!address) return back("signin");

  const state = newState();
  const verifier = newVerifier();
  const check = req.nextUrl.searchParams.get("check") === "like" ? "like" : undefined;
  const res = NextResponse.redirect(authorizeUrl(state, verifier, redirectUri(origin), check), 303);
  rememberXAuth(res, { state, verifier, address, check });
  return res;
}
