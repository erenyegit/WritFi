"use client";

import type { Market } from "@/lib/api";
import { fmtDay, fmtDistance, fmtPct, fmtRelative, fmtUsd0 } from "@/lib/format";

export type Side = "put" | "call";

/**
 * Every listed expiry against every listed strike, with the indicative annual
 * rate in each cell. One screen shows how the rate moves with distance and with
 * time, which a single-expiry strike picker hides.
 *
 * Shading is a single hue by rank, never red and green: on Upbit red means the
 * price went up, so a traffic-light scale would read backwards to half the
 * people using this.
 */
export function RateBoard({
  market,
  side,
  now,
  selected,
  onSelect,
  rows,
}: {
  market: Market;
  side: Side;
  now: number;
  selected?: { expiry: number; strike: number } | null;
  onSelect?: (expiry: number, strike: number) => void;
  /** Show only the first N expiries (landing page). */
  rows?: number;
}) {
  const board = market[side];
  const expiries = market.expiries.slice(0, rows ?? market.expiries.length);
  const all = board.cells.slice(0, expiries.length).flat().map((c) => c.aprPct);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const shade = (apr: number) => {
    const t = hi > lo ? (apr - lo) / (hi - lo) : 0.5;
    return `color-mix(in srgb, rgb(var(--heat)) ${Math.round(6 + t * 50)}%, rgb(var(--paper-sheet)))`;
  };

  return (
    <div className="sheet overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="table-head">
              <th className="sticky left-0 z-10 w-[168px] bg-paper-sunk px-4 py-3 font-medium">
                {side === "put" ? "Buy at" : "Sell at"} →
              </th>
              {board.strikes.map((k) => (
                <th key={k} className="px-3 py-3 text-right font-medium">
                  <div className="num text-[13px] normal-case tracking-normal text-ink">{fmtUsd0(k)}</div>
                  <div className="num mt-0.5 text-[11.5px] normal-case tracking-normal text-ink-400">
                    {fmtDistance(k, market.spot.usd)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expiries.map((e, i) => (
              <tr key={e} className="border-b border-paper-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 bg-paper-sheet px-4 py-2.5 text-left font-normal">
                  <div className="text-[14px] font-medium text-ink">{fmtDay(e)}</div>
                  <div className="text-[12px] text-ink-400">{fmtRelative(e, now)}</div>
                </th>
                {board.cells[i].map((cell, j) => {
                  const k = board.strikes[j];
                  const isSel = selected?.expiry === e && selected?.strike === k;
                  return (
                    <td key={k} className="p-1">
                      <button
                        type="button"
                        onClick={() => onSelect?.(e, k)}
                        disabled={!onSelect}
                        aria-pressed={isSel}
                        aria-label={`${fmtPct(cell.aprPct)} a year, ${fmtUsd0(k)} on ${fmtDay(e)}`}
                        title={`${fmtUsd0(cell.premiumPerBtc)} per BTC · ${Math.round(cell.probAssigned * 100)}% model chance of assignment`}
                        className={`num block w-full rounded-md px-2 py-2.5 text-right text-[14px] transition ${
                          isSel
                            ? "bg-ink font-medium text-paper"
                            : "text-ink enabled:hover:outline enabled:hover:outline-1 enabled:hover:outline-ink-400"
                        }`}
                        style={isSel ? undefined : { background: shade(cell.aprPct) }}
                      >
                        {fmtPct(cell.aprPct)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
