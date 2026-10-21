import { NextRequest, NextResponse } from "next/server";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { errorResponse, noStore, tooMany } from "@/lib/early/errors";
import { isAdmin } from "@/lib/early/session";
import { exportAll } from "@/lib/early/store";

export const dynamic = "force-dynamic";

/** Everyone on the list with full wallets and X handles. Authorization: Bearer EARLY_ADMIN_TOKEN. */
export async function GET(req: NextRequest) {
  if (!allow(clientKey(req, "early-export"), 10)) return tooMany();
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: "Wrong token." }, { status: 401, headers: noStore });
    return NextResponse.json({ rows: await exportAll() }, { headers: noStore });
  } catch (err) {
    return errorResponse(err);
  }
}
