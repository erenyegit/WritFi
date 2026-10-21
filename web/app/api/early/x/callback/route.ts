import { NextRequest, NextResponse } from "next/server";

import { clearXAuth, readXAuth, sessionAddress } from "@/lib/early/session";
import { linkX, XLinkError } from "@/lib/early/store";
import { profileFromCode, redirectUri } from "@/lib/early/xoauth";

export const dynamic = "force-dynamic";

/**
 * X sends the browser back here. The state must match the one this browser
 * started with, for the wallet still signed in; then the account X confirms
 * is linked to that wallet, which also decides the wallet's referral. The page
 * shows the outcome from ?x=.
 */
export async function GET(req: NextRequest) {
  const finish = (x: string) => {
    const res = NextResponse.redirect(new URL(`/early?x=${x}#steps`, req.url), 303);
    clearXAuth(res);
    return res;
  };
  const params = req.nextUrl.searchParams;
  const pending = readXAuth(req);
  if (!pending || params.get("state") !== pending.state) return finish("failed");
  if (sessionAddress(req) !== pending.address) return finish("signin");
  if (params.get("error")) return finish("denied");
  const code = params.get("code");
  if (!code) return finish("failed");

  try {
    const profile = await profileFromCode(code, pending.verifier, redirectUri(req.nextUrl.origin));
    const referral = await linkX(pending.address, profile);
    return finish(referral === "too_new" ? "young" : "connected");
  } catch (err) {
    if (err instanceof XLinkError) return finish(err.reason);
    console.error("[early] Sign in with X failed:", err instanceof Error ? err.message : err);
    return finish("failed");
  }
}
