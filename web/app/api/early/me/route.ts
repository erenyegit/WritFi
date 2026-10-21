import { NextRequest, NextResponse } from "next/server";

import { errorResponse, noStore } from "@/lib/early/errors";
import { sessionAddress } from "@/lib/early/session";
import { followQuestOpen, getAccount, postQuestOpen, testnetQuestOpen, xConnectOpen } from "@/lib/early/store";

export const dynamic = "force-dynamic";

/** The signed-in account, or { account: null }. */
export async function GET(req: NextRequest) {
  try {
    const address = sessionAddress(req);
    const account = address ? await getAccount(address) : null;
    return NextResponse.json(
      {
        account,
        testnetOpen: testnetQuestOpen(),
        followOpen: followQuestOpen(),
        postOpen: postQuestOpen(),
        xConnect: xConnectOpen(),
      },
      { headers: noStore },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
