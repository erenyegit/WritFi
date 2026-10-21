import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { errorResponse, forbidden, noStore, tooMany } from "@/lib/early/errors";
import {
  clearNonce,
  clearRef,
  endSession,
  readNonce,
  readRef,
  sameOrigin,
  startSession,
} from "@/lib/early/session";
import { verifySignIn } from "@/lib/early/signin";
import { getAccount, signIn } from "@/lib/early/store";

export const dynamic = "force-dynamic";

/**
 * Sign in: { message, signature, ref? }. The first sign-in creates the
 * account. The nonce is single use, so it is cleared whatever the outcome.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  if (!allow(clientKey(req, "early-session"), 20)) return tooMany();

  const body = (await req.json().catch(() => null)) as { message?: unknown; signature?: unknown; ref?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  const signature =
    typeof body?.signature === "string" && /^0x[0-9a-fA-F]{2,}$/.test(body.signature) ? (body.signature as Hex) : null;
  const nonce = readNonce(req);

  try {
    const address =
      signature && nonce
        ? await verifySignIn(message, signature, { domain: req.headers.get("host") ?? "", nonce })
        : null;
    if (!address) {
      return clearNonce(
        NextResponse.json({ error: "The signature did not check out. Try signing in again." }, { status: 401, headers: noStore }),
      );
    }

    const ref = typeof body?.ref === "string" && body.ref ? body.ref : readRef(req);
    await signIn(address, ref);
    const res = NextResponse.json({ account: await getAccount(address) }, { headers: noStore });
    startSession(res, address);
    clearRef(res);
    return clearNonce(res);
  } catch (err) {
    return clearNonce(errorResponse(err));
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  endSession(res);
  return res;
}
