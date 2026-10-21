import { NextResponse } from "next/server";

import { upcomingExpiries } from "@/lib/expiry";
import { readBook } from "@/lib/desk/book";
import { getSpot } from "@/lib/desk/price";
import { getVolSurface } from "@/lib/desk/marketVol";
import { priceOption, strikeLadder, YEAR_SEC } from "@/lib/desk/pricing";

export const dynamic = "force-dynamic";

/**
 * Everything a writer needs before asking for a firm price: spot, the listed
 * expiries and strikes, an indicative rate for every cell, and how much the
 * maker can currently back. Indicative means unsigned: the firm number comes
 * from /api/rfq for the exact size.
 */
export async function GET() {
  try {
    const [spot, book, surface] = await Promise.all([getSpot(), readBook().catch(() => null), getVolSurface()]);
    const now = Math.floor(Date.now() / 1000);
    const expiries = upcomingExpiries(now);

    const side = (isPut: boolean) => {
      const strikes = strikeLadder(isPut, spot.usd);
      const cells = expiries.map((e) =>
        strikes.map((k) => {
          const p = priceOption(isPut, spot.usd, k, (e - now) / YEAR_SEC, surface.iv(e, k, spot.usd, now));
          return {
            aprPct: round(p.aprPct, 2),
            premiumPerBtc: round(p.bidPerBtc, 2),
            probAssigned: round(p.probAssigned, 4),
            iv: round(p.iv, 4),
          };
        }),
      );
      return { strikes, cells };
    };

    const maker = book?.maker;
    const limits = book?.limits;
    return NextResponse.json(
      {
        spot: { usd: spot.usd, source: spot.source, at: spot.at },
        expiries,
        ivSource: surface.source,
        put: side(true),
        call: side(false),
        // What the maker can back right now, in BTC of size. A put reserves one
        // BTC per BTC; a covered call reserves the strike in USDC, so its limit
        // depends on the strike and is sent as cash for the client to divide.
        maker: maker
          ? {
              active: maker.active,
              putCapacityBtc: Number(maker.btcFree) / 1e8,
              callCapacityUsdc: Number(maker.usdcFree) / 1e6,
              maxPremiumPerBtc: Number(maker.maxPremiumPerBtc) / 1e6,
            }
          : null,
        limits: limits
          ? {
              paused: limits.paused,
              minNotionalUsdc: Number(limits.minPositionNotional) / 1e6,
              maxNotionalUsdc: Number(limits.maxPositionNotional) / 1e6,
              openNotionalUsdc: Number(limits.totalOpenNotional) / 1e6,
              maxTotalNotionalUsdc: Number(limits.maxTotalNotional) / 1e6,
              lotBtc: 0.0001,
            }
          : null,
      },
      { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "market data unavailable" },
      { status: 502 },
    );
  }
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
