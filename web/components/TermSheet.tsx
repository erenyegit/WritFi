"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Side } from "./RateBoard";
import { fmtBtc, fmtDay, fmtPct, fmtTimeUtc, fmtUsd, fmtUsd0 } from "@/lib/format";
import { useMarket } from "@/lib/hooks";

const SIZE = 0.05;

/**
 * A live example of the promise being sold, written out like the document it
 * is: what you lock, the price you name, when it fixes, what you are paid now.
 * Numbers come from the same indicative board the desk shows.
 */
export function TermSheet() {
  const { market, error } = useMarket(20_000);
  const [side, setSide] = useState<Side>("put");

  const pick = useMemo(() => {
    if (!market) return null;
    const board = market[side];
    if (!market.expiries.length || !board.strikes.length) return null;
    const target = Date.now() / 1000 + 7 * 86_400;
    const ei = market.expiries.reduce((best, e, i) =>
      Math.abs(e - target) < Math.abs(market.expiries[best] - target) ? i : best, 0);
    const si = Math.min(2, board.strikes.length - 1);
    return { expiry: market.expiries[ei], strike: board.strikes[si], cell: board.cells[ei][si] };
  }, [market, side]);

  const premium = pick ? pick.cell.premiumPerBtc * SIZE : null;
  const locked = pick ? (side === "put" ? `${(pick.strike * SIZE).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : `${fmtBtc(SIZE)} BTC`) : "—";

  return (
    <div className="sheet relative">
      <div className="flex items-center justify-between border-b border-paper-line px-5 py-3">
        <span className="label">Term sheet · indicative</span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-400">
          <span className={`dot ${market ? "bg-good" : "bg-ink-300"}`} />
          {market ? "live" : error ? "offline" : "loading"}
        </span>
      </div>

      <div className="flex gap-1.5 px-5 pt-4">
        <button className="chip" data-active={side === "put"} onClick={() => setSide("put")}>
          Buy lower
        </button>
        <button className="chip" data-active={side === "call"} onClick={() => setSide("call")}>
          Sell higher
        </button>
      </div>

      <div className="space-y-2.5 px-5 py-5 text-[14.5px]">
        <Line label="Product" value={side === "put" ? "Cash-secured put" : "Covered call"} />
        <Line label="You lock" value={locked} />
        <Line label={side === "put" ? "You may buy" : "You may sell"} value={pick ? `${fmtBtc(SIZE)} BTC at ${fmtUsd0(pick.strike)}` : "—"} />
        <Line label="Fixing" value={pick ? `${fmtDay(pick.expiry)}, ${fmtTimeUtc(pick.expiry)}` : "—"} />
        <Line label="Price source" value="Pyth BTC/USD" />
      </div>

      <div className="border-t border-paper-line px-5 py-5">
        <div className="label">Paid to you when you sign</div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="display text-[40px] leading-none">{premium === null ? "—" : fmtUsd(premium)}</span>
          <span className="num text-[14px] text-ink-500">{pick ? `${fmtPct(pick.cell.aprPct)} a year` : ""}</span>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-500">
          {pick
            ? side === "put"
              ? `If BTC fixes below ${fmtUsd0(pick.strike)}, you buy it there. Otherwise your USDC comes back. The premium is yours either way.`
              : `If BTC fixes above ${fmtUsd0(pick.strike)}, you sell it there. Otherwise your BTC comes back. The premium is yours either way.`
            : " "}
        </p>
      </div>

      <div className="px-5 pb-5">
        <Link
          href={pick ? `/earn?side=${side}&expiry=${pick.expiry}&strike=${pick.strike}` : "/earn"}
          className="btn-primary w-full"
        >
          Open this on the desk
        </Link>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="dotted-row">
      <span className="text-ink-500">{label}</span>
      <span className="leader" />
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}
