import { NextRequest, NextResponse } from "next/server";

import { clearXAuth, publicOrigin, readXAuth, sessionAddress } from "@/lib/early/session";
import { confirmLike, linkX, XLinkError } from "@/lib/early/store";
import { profileFromCode, redirectUri } from "@/lib/early/xoauth";

export const dynamic = "force-dynamic";

/**
 * X sends the browser back here. The state must match the one this browser
 * started with, for the wallet still signed in; then the account X confirms
 * is linked to that wallet, which also decides the wallet's referral. A sign-in
 * for the like step links nothing and only reads the like. The page shows the
 * outcome from ?x=.
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const finish = (x: string) => {
    const res = NextResponse.redirect(new URL(`/early?x=${x}#steps`, origin), 303);
    clearXAuth(res);
    return res;
  };
  const params = req.nextUrl.searchParams;
  const pending = readXAuth(req);
  // No matching start in this browser. Without a wallet session either, X came
  // back to a different browser or app than the one it started in (common on
  // phones); with one, the start is over ten minutes old. The page says which.
  if (!pending || params.get("state") !== pending.state) return finish(sessionAddress(req) ? "expired" : "elsewhere");
  if (sessionAddress(req) !== pending.address) return finish("signin");
  if (params.get("error")) return finish("denied");
  const code = params.get("code");
  if (!code) return finish("failed");

  try {
    if (pending.check === "like") {
      return finish(await confirmLike(pending.address, code, pending.verifier, redirectUri(origin)));
    }
    const profile = await profileFromCode(code, pending.verifier, redirectUri(origin));
    const referral = await linkX(pending.address, profile);
    return finish(referral === "too_new" ? "young" : "connected");
  } catch (err) {
    if (err instanceof XLinkError) return finish(err.reason);
    console.error("[early] Sign in with X failed:", err instanceof Error ? err.message : err);
    return finish("failed");
  }
}
