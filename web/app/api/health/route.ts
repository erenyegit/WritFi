import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { deployment } from "@/lib/deployments";
import { readBook } from "@/lib/desk/book";
import { publicClient } from "@/lib/desk/client";
import { deskConfig, resolveKeeperKey, usingDevKey } from "@/lib/desk/config";
import { findDue } from "@/lib/desk/keeper";
import { getVolSurface, marketVolError } from "@/lib/desk/marketVol";
import { getSpot, pythSpotError } from "@/lib/desk/price";
import { quoterAddress } from "@/lib/desk/quote";

export const dynamic = "force-dynamic";

const settle = <T,>(p: Promise<T>) =>
  p.then((value) => ({ ok: true as const, value })).catch((e: unknown) => ({
    ok: false as const,
    error: e instanceof Error ? e.message.split("\n")[0] : String(e),
  }));

/**
 * One call that answers "can people trade and will positions settle?". It
 * returns 503 when the answer is no, so an uptime monitor can alert on status
 * alone. Each check reports on its own, and one failing never hides the rest.
 */
export async function GET() {
  const keeperKey = resolveKeeperKey();
  const keeper = keeperKey ? privateKeyToAccount(keeperKey).address : null;

  const [spot, book, block, due, keeperBalance, quoter, surface] = await Promise.all([
    settle(getSpot()),
    settle(readBook()),
    settle(publicClient.getBlockNumber()),
    settle(findDue()),
    keeper ? settle(publicClient.getBalance({ address: keeper })) : Promise.resolve(null),
    settle(Promise.resolve().then(() => quoterAddress())),
    getVolSurface(),
  ]);

  const maker = book.ok ? book.value.maker : null;
  const paused = book.ok ? book.value.limits.paused : null;
  const signerMatches = !!(maker && quoter.ok && maker.signer.toLowerCase() === quoter.value.toLowerCase());
  const overdue = due.ok ? due.value.groups.reduce((n, g) => n + g.ids.length, 0) : null;

  const checks = {
    price: spot.ok
      ? { ok: true, source: spot.value.source, usd: Math.round(spot.value.usd) }
      : { ok: false, error: spot.error },
    // Rates still quote on the model when Deribit is unreachable; this says which.
    vol: { ok: true, source: surface.source, error: marketVolError() },
    // Settlement reads Pyth even when spot falls back to another source.
    pyth: { ok: pythSpotError() === null, error: pythSpotError() },
    chain: block.ok ? { ok: true, block: block.value.toString() } : { ok: false, error: block.error },
    quoter: quoter.ok
      ? { ok: !usingDevKey() || process.env.NODE_ENV !== "production", address: quoter.value, devKey: usingDevKey() }
      : { ok: false, error: quoter.error },
    maker: maker
      ? {
          ok: maker.active && signerMatches && paused === false,
          active: maker.active,
          signerMatches,
          paused,
          usdcFree: (Number(maker.usdcFree) / 1e6).toFixed(2),
          btcFree: (Number(maker.btcFree) / 1e8).toFixed(8),
          lowUsdc: maker.usdcFree < deskConfig.lowUsdc,
          lowBtc: maker.btcFree < deskConfig.lowBtc,
        }
      : { ok: false, error: book.ok ? "no maker" : book.error },
    settlement: {
      ok: overdue === 0,
      overdue,
      keeper,
      keeperEth: keeperBalance && keeperBalance.ok ? formatEther(keeperBalance.value) : null,
      ...(due.ok ? {} : { error: due.error }),
    },
  };

  const ok = checks.price.ok && checks.chain.ok && checks.quoter.ok && checks.maker.ok;
  return NextResponse.json(
    {
      ok,
      checks,
      deployment: { chainId: deployment.chainId, core: deployment.core, oracle: deployment.oracle, maker: deployment.maker },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
