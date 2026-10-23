import { NextRequest, NextResponse } from "next/server";

import { allow, clientKey } from "@/lib/desk/ratelimit";
import { errorResponse, tooMany } from "@/lib/early/errors";
import { sessionAddress } from "@/lib/early/session";
import { leaderboard } from "@/lib/early/store";
import type { Board } from "@/lib/early/types";

export const dynamic = "force-dynamic";

/**
 * Every visitor's page loads this. With no CDN in front of the app, the short
 * s-maxage below does nothing, so one database read serves every signed-out
 * visitor for ten seconds. Signed-in visitors always read fresh: the page
 * reloads the board right after their points change and marks their own row.
 * A failed read is dropped at once and the next request tries again.
 */
const FRESH_MS = 10_000;
let cached: { at: number; board: Promise<Board> } | null = null;

function currentBoard(): Promise<Board> {
  if (!cached || Date.now() - cached.at > FRESH_MS) {
    const board = leaderboard(10);
    cached = { at: Date.now(), board };
    board.catch(() => {
      if (cached?.board === board) cached = null;
    });
  }
  return cached.board;
}

/** The public top ten. Wallets are shortened before they leave the server. */
export async function GET(req: NextRequest) {
  // Generous: every open tab polls, and people behind one address share the limit.
  if (!allow(clientKey(req, "early-board"), 300)) return tooMany();
  try {
    const board = sessionAddress(req) ? await leaderboard(10) : await currentBoard();
    return NextResponse.json(board, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
