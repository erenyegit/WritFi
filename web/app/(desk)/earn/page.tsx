"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RateBoard, type Side } from "@/components/RateBoard";
import { Ticket } from "@/components/Ticket";
import type { Market } from "@/lib/api";
import { fmtBtc, fmtDay, fmtPct, fmtRelative, fmtUsd, fmtUsdcAmount } from "@/lib/format";
import { useMarket, useNow } from "@/lib/hooks";

interface Selection {
  expiry: number;
  strike: number;
}

/** Nearest listed expiry to three days out, and the second strike from spot. */
function defaultSelection(m: Market, side: Side): Selection | null {
  const board = m[side];
  if (!m.expiries.length || !board.strikes.length) return null;
  const target = Date.now() / 1000 + 3 * 86_400;
  const expiry = m.expiries.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  return { expiry, strike: board.strikes[Math.min(1, board.strikes.length - 1)] };
}

export default function EarnPage() {
  const { market, error } = useMarket();
  const now = useNow(1000);
  const [side, setSide] = useState<Side>("put");
  const [sel, setSel] = useState<Selection | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const fromUrl = useRef<Partial<Selection> & { side?: Side }>({});

  // Shareable state: ?side=put&expiry=1790323200&strike=82500
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("side");
    if (s === "put" || s === "call") {
      setSide(s);
      fromUrl.current.side = s;
    }
    const e = Number(q.get("expiry"));
    const k = Number(q.get("strike"));
    if (Number.isInteger(e) && e > 0) fromUrl.current.expiry = e;
    if (Number.isFinite(k) && k > 0) fromUrl.current.strike = k;
  }, []);

  // Pick a selection once data arrives, and keep it valid as spot moves: an
  // expiry that has passed or a strike that is now in the money is replaced.
  useEffect(() => {
    if (!market) return;
    const board = market[side];
    setSel((cur) => {
      const want = cur ?? {
        expiry: fromUrl.current.expiry ?? NaN,
        strike: fromUrl.current.strike ?? NaN,
      };
      const expiryOk = market.expiries.includes(want.expiry);
      const strikeOk = board.strikes.includes(want.strike);
      if (expiryOk && strikeOk) return cur ?? want;
      const fallback = defaultSelection(market, side);
      if (!fallback) return null;
      return {
        expiry: expiryOk ? want.expiry : fallback.expiry,
        strike: strikeOk ? want.strike : nearest(board.strikes, want.strike) ?? fallback.strike,
      };
    });
  }, [market, side]);

  useEffect(() => {
    if (!sel) return;
    const q = new URLSearchParams({ side, expiry: String(sel.expiry), strike: String(sel.strike) });
    window.history.replaceState(null, "", `/earn?${q}`);
  }, [side, sel]);

  const choose = useCallback((expiry: number, strike: number) => {
    setSel({ expiry, strike });
    // On a phone the ticket sits under the board; bring it into view.
    if (window.innerWidth < 1024) {
      requestAnimationFrame(() => ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, []);

  const switchSide = (s: Side) => {
    if (s === side) return;
    setSide(s);
    setSel(null);
    fromUrl.current = {};
  };

  return (
    <div className="pt-10 sm:pt-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
        <header className="max-w-2xl">
          <div className="eyebrow">Earn</div>
          <h1 className="display mt-4 text-[38px] leading-[1.06] sm:text-[52px]">Name your price. Get paid today.</h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-500">
            Choose a price you would happily {side === "put" ? "buy" : "sell"} BTC at and a date. A maker pays you
            for that promise the moment you sign. On the date it settles on Pyth&apos;s price, and you either keep
            your collateral or trade at your price.
          </p>
        </header>
        {market && <MarketStrip market={market} side={side} now={now} />}
      </div>

      <div className="mt-12">
        <div className="switch w-full max-w-xl gap-6">
          <button data-active={side === "put"} onClick={() => switchSide("put")} className="text-ink-500">
            <div className="text-[16px] font-medium">Buy BTC lower</div>
            <div className="mt-0.5 text-[13px] text-ink-400">Cash-secured put · lock USDC</div>
          </button>
          <button data-active={side === "call"} onClick={() => switchSide("call")} className="text-ink-500">
            <div className="text-[16px] font-medium">Sell BTC higher</div>
            <div className="mt-0.5 text-[13px] text-ink-400">Covered call · lock BTC</div>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <section className="min-w-0">
          <div>
            <h2 className="text-[17px] font-medium text-ink">
              At what price would you happily {side === "put" ? "buy" : "sell"} BTC?
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-500">
              Annual rate on the capital you lock. Every date is a Friday fixing at 08:00 UTC (17:00 KST).
            </p>
          </div>

          <div className="mt-4">
            {market ? (
              <RateBoard market={market} side={side} now={now} selected={sel} onSelect={choose} />
            ) : (
              <BoardPlaceholder error={error} />
            )}
          </div>

          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400">
            Rates on the board are indicative
            {market
              ? market.ivSource === "deribit"
                ? ", priced on Deribit's implied volatility"
                : ", priced on the maker's volatility model while Deribit is unreachable"
              : ""}
            . Your firm rate comes with the quote for your exact size. Only out-of-the-money prices are listed.
          </p>

          {market && <Facts market={market} side={side} strike={sel?.strike} />}
        </section>

        <aside ref={ticketRef} className="scroll-mt-24 self-start lg:sticky lg:top-24">
          {market && sel ? (
            <Ticket market={market} side={side} expiry={sel.expiry} strike={sel.strike} now={now} />
          ) : (
            <div className="sheet p-6 text-[14px] text-ink-400">Loading the ticket…</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function nearest(list: number[], v: number) {
  if (!list.length || !Number.isFinite(v)) return null;
  return list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/** The desk at a glance: spot, the best rate on the board, the nearest listed date. */
function MarketStrip({ market, side, now }: { market: Market; side: Side; now: number }) {
  const age = Math.max(0, now - Math.floor(market.spot.at / 1000));
  const source = market.spot.source === "pyth" ? "Pyth" : market.spot.source === "coinbase" ? "Coinbase" : "Kraken";
  const next = market.expiries[0];
  const rates = market[side].cells.flat().map((c) => c.aprPct);
  return (
    <div className="sheet grid grid-cols-2 overflow-hidden">
      <div className="col-span-2 border-b border-paper-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="label">BTC spot</span>
          <span className="flex items-center gap-2 text-[12px] text-ink-400">
            <span className="dot-live" />
            {source} · {age < 60 ? `${age}s ago` : fmtRelative(Math.floor(market.spot.at / 1000), now)}
          </span>
        </div>
        <div className="num mt-2.5 text-[30px] leading-none text-ink">{fmtUsd(market.spot.usd)}</div>
      </div>
      <div className="border-r border-paper-line px-5 py-4">
        <div className="label">Best rate</div>
        <div className="num mt-2.5 text-[20px] leading-none text-ink">
          {rates.length ? fmtPct(Math.max(...rates)) : "—"}
        </div>
        <div className="mt-1.5 text-[12px] text-ink-400">a year, on this board</div>
      </div>
      <div className="px-5 py-4">
        <div className="label">Nearest date</div>
        <div className="mt-2.5 text-[16px] font-medium leading-none text-ink">{next ? fmtDay(next) : "—"}</div>
        <div className="mt-1.5 text-[12px] text-ink-400">{next ? fmtRelative(next, now) : ""}</div>
      </div>
    </div>
  );
}

function Facts({ market, side, strike }: { market: Market; side: Side; strike?: number }) {
  if (!market.maker || !market.limits) return null;
  const callBtc = strike ? market.maker.callCapacityUsdc / (strike * 1.05) : null;
  const items = [
    side === "put"
      ? `The maker can back up to ${fmtBtc(Math.floor(market.maker.putCapacityBtc * 1e4) / 1e4)} BTC of puts right now.`
      : callBtc !== null
        ? `The maker can back about ${fmtBtc(Math.floor(callBtc * 1e4) / 1e4)} BTC of calls at this price right now.`
        : null,
    `Smallest position ${fmtUsdcAmount(BigInt(Math.round(market.limits.minNotionalUsdc * 1e6)))} USDC of notional; sizes in steps of 0.0001 BTC.`,
    market.limits.paused ? "New positions are paused. Open positions still settle." : null,
  ].filter(Boolean);
  return (
    <ul className="mt-6 space-y-1.5 border-t border-paper-line pt-4 text-[13.5px] text-ink-500">
      {items.map((t) => (
        <li key={t as string}>{t}</li>
      ))}
    </ul>
  );
}

function BoardPlaceholder({ error }: { error: string | null }) {
  return (
    <div className="sheet px-5 py-10 text-center text-[14px] text-ink-400">
      {error ? `Market data is unavailable right now (${error}). Retrying every 15 seconds.` : "Loading rates…"}
    </div>
  );
}
