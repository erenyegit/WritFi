"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEventLog, erc20Abi } from "viem";
import { useConnect, useSwitchChain } from "wagmi";

import { coreAbi, faucetAbi } from "@/lib/abi";
import { BTC_ADDRESS, CORE_ADDRESS, GAS_FAUCET_URL, USDC_ADDRESS, txUrl } from "@/lib/addresses";
import { getQuote, type Market, type SignedQuote } from "@/lib/api";
import { giwaSepolia } from "@/lib/chain";
import {
  fmtBtc,
  fmtDay,
  fmtPct,
  fmtTimeKst,
  fmtTimeUtc,
  fmtUsd,
  fmtUsd0,
  fmtUsdcAmount,
} from "@/lib/format";
import { txLine, useTx, useWallet } from "@/lib/hooks";

import type { Side } from "./RateBoard";

const SIZES = ["0.001", "0.005", "0.01", "0.05"];
const LOT = 0.0001;
/** A re-quote this much worse than what was on screen needs a second look. */
const DRIFT = 0.005;

const floorLot = (v: number) => Math.floor(v / LOT + 1e-9) * LOT;
const ceilLot = (v: number) => Math.ceil(v / LOT - 1e-9) * LOT;
const toSats = (btc: number) => BigInt(Math.round(btc * 1e8));
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export function Ticket({
  market,
  side,
  expiry,
  strike,
  now,
}: {
  market: Market;
  side: Side;
  expiry: number;
  strike: number;
  now: number;
}) {
  const isPut = side === "put";
  const token = isPut ? "USDC" : "BTC";
  const wallet = useWallet();
  const tx = useTx();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain } = useSwitchChain();

  // ---------------------------------------------------------------- size
  const [size, setSize] = useState("0.01");
  const qty = Number(size);
  const qtyValid = Number.isFinite(qty) && qty > 0 && Math.abs(qty / LOT - Math.round(qty / LOT)) < 1e-6;

  const limits = market.limits;
  const minQty = limits ? Math.max(LOT, ceilLot(limits.minNotionalUsdc / strike)) : LOT;
  const makerMax = market.maker
    ? isPut
      ? market.maker.putCapacityBtc
      : // The maker reserves the strike in cash and also pays the premium from it.
        market.maker.callCapacityUsdc / (strike * 1.05)
    : Infinity;
  const walletMax = isPut
    ? wallet.usdc !== undefined
      ? Number(wallet.usdc) / 1e6 / strike
      : Infinity
    : wallet.btc !== undefined
      ? Number(wallet.btc) / 1e8
      : Infinity;
  const notionalMax = limits ? limits.maxNotionalUsdc / strike : Infinity;
  const maxQty = floorLot(Math.min(makerMax, walletMax, notionalMax));

  const makerRoom = floorLot(Math.min(makerMax, notionalMax));
  const sizeProblem = makerRoom < minQty
    ? `The maker has no room for ${isPut ? "puts" : "calls"} at this price right now. Try the other side or check back soon.`
    : !qtyValid
    ? size.trim() === ""
      ? "Enter a size."
      : "Sizes go in steps of 0.0001 BTC."
    : qty < minQty - 1e-12
      ? `The smallest size at this strike is ${fmtBtc(minQty)} BTC.`
      : qty > makerRoom + 1e-12
        ? `The maker can take up to ${fmtBtc(makerRoom)} BTC here right now.`
        : null;

  // ---------------------------------------------------------------- amounts
  const qtySats = qtyValid ? toSats(qty) : 0n;
  const strike8 = BigInt(strike) * 100_000_000n;
  /** USDC (1e6) for a put, BTC (1e8) for a covered call. Mirrors the contract. */
  const collateral = isPut ? ceilDiv(strike8 * qtySats, 10n ** 10n) : qtySats;
  const notionalUsdc = ceilDiv(strike8 * qtySats, 10n ** 10n);

  const ei = market.expiries.indexOf(expiry);
  const si = market[side].strikes.indexOf(strike);
  const cell = ei >= 0 && si >= 0 ? market[side].cells[ei][si] : null;

  // ---------------------------------------------------------------- quote
  const [quote, setQuote] = useState<SignedQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<"edit" | "review" | "done">("edit");
  const [drift, setDrift] = useState<{ from: bigint; to: bigint } | null>(null);
  const [opened, setOpened] = useState<{ id: bigint | null; hash: `0x${string}`; premium: bigint } | null>(null);
  const requestId = useRef(0);

  const canQuote = !!wallet.address && !wallet.wrongChain && qtyValid && !sizeProblem;
  const key = `${wallet.address}|${side}|${strike}|${expiry}|${size}`;

  const fetchQuote = useCallback(async () => {
    if (!wallet.address || !canQuote) return null;
    const id = ++requestId.current;
    setQuoting(true);
    try {
      const q = await getQuote({ writer: wallet.address, isPut, strike, qty, expiry });
      if (id !== requestId.current) return null;
      setQuote(q);
      setQuoteError(null);
      return q;
    } catch (e) {
      if (id !== requestId.current) return null;
      setQuote(null);
      setQuoteError((e as Error).message);
      return null;
    } finally {
      if (id === requestId.current) setQuoting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canQuote]);

  // A new question gets a new quote, a moment after the last keystroke.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    setDrift(null);
    if (stage !== "done") setStage("edit");
    if (!canQuote) return;
    const t = setTimeout(fetchQuote, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canQuote]);

  // Keep the quote fresh while the writer is still choosing. During review it
  // is frozen, so the panel they are reading does not change under them.
  const deadline = quote ? Number(quote.quote.quoteDeadline) : 0;
  const left = deadline - now;
  useEffect(() => {
    if (!quote || stage !== "edit" || tx.busy || quoting) return;
    if (left <= 4) fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // ---------------------------------------------------------------- actions
  const balance = isPut ? wallet.usdc : wallet.btc;
  const allowance = isPut ? wallet.usdcAllowance : wallet.btcAllowance;
  const tokenAddress = isPut ? USDC_ADDRESS : BTC_ADDRESS;
  const short = balance !== undefined && qtyValid && balance < collateral;
  const needsApproval = allowance !== undefined && qtyValid && allowance < collateral;
  const noGas = wallet.eth !== undefined && wallet.eth === 0n;

  const claim = async () => {
    const ok = await tx.send(`Claim test ${token}`, { abi: faucetAbi, address: tokenAddress, functionName: "faucet" });
    if (ok) wallet.refetch();
  };

  const approve = async () => {
    const ok = await tx.send(`Approve ${token}`, {
      abi: erc20Abi,
      address: tokenAddress,
      functionName: "approve",
      // Exactly what this trade locks. An unlimited approval on an unaudited
      // contract is a risk nobody needs to take for one position.
      args: [CORE_ADDRESS, collateral],
    });
    if (ok) wallet.refetch();
  };

  const sign = async () => {
    let q = quote;
    // The quote may have run out while the writer was reading. Re-quote, and
    // if the new price is materially worse, stop and show both numbers.
    if (!q || Number(q.quote.quoteDeadline) - Math.floor(Date.now() / 1000) < 3) {
      const before = q ? BigInt(q.quote.premium) : null;
      q = await fetchQuote();
      if (!q) return;
      const after = BigInt(q.quote.premium);
      if (before !== null && Number(after) < Number(before) * (1 - DRIFT)) {
        setDrift({ from: before, to: after });
        return;
      }
    }
    setDrift(null);
    const w = q.quote;
    const receipt = await tx.send("Write option", {
      abi: coreAbi,
      address: CORE_ADDRESS,
      functionName: "writeOption",
      args: [
        {
          writer: w.writer,
          maker: w.maker,
          isPut: w.isPut,
          strike: BigInt(w.strike),
          qty: BigInt(w.qty),
          expiry: BigInt(w.expiry),
          premium: BigInt(w.premium),
          quoteDeadline: BigInt(w.quoteDeadline),
          nonce: BigInt(w.nonce),
        },
        q.signature,
      ],
    });
    if (!receipt) return;
    let id: bigint | null = null;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: coreAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "OptionWritten") id = ev.args.id;
      } catch {
        // not ours
      }
    }
    setOpened({ id, hash: receipt.transactionHash, premium: BigInt(w.premium) });
    setStage("done");
    wallet.refetch();
  };

  // ---------------------------------------------------------------- CTA
  const namedConnectors = connectors.filter((c) => c.id !== "injected");
  const cta = ((): { label: string; onClick?: () => void; href?: string; disabled?: boolean } => {
    if (limits?.paused) return { label: "New positions are paused", disabled: true };
    if (!wallet.isConnected) {
      return {
        label: connecting ? "Connecting…" : "Connect a wallet",
        onClick: () => {
          const c = namedConnectors[0] ?? connectors[0];
          if (c) connect({ connector: c, chainId: giwaSepolia.id });
        },
      };
    }
    if (wallet.wrongChain) return { label: "Switch to GIWA Sepolia", onClick: () => switchChain({ chainId: giwaSepolia.id }) };
    if (sizeProblem) return { label: "Adjust the size", disabled: true };
    if (noGas) return { label: "Get test ETH for gas ↗", href: GAS_FAUCET_URL };
    if (short) return { label: `Claim test ${token}`, onClick: claim };
    if (needsApproval) return { label: `Approve ${isPut ? fmtUsdcAmount(collateral) : fmtBtc(qty)} ${token}`, onClick: approve };
    if (quoting && !quote) return { label: "Asking makers…", disabled: true };
    if (!quote) return { label: quoteError ? "No quote" : "Waiting for a quote", disabled: true };
    if (stage === "edit") return { label: "Review", onClick: () => setStage("review") };
    return {
      label: `Sign and receive ${fmtUsdcAmount(BigInt(quote.quote.premium))} USDC`,
      onClick: sign,
    };
  })();

  // ---------------------------------------------------------------- render
  const premium = quote ? BigInt(quote.quote.premium) : cell && qtyValid ? BigInt(Math.floor(cell.premiumPerBtc * qty * 1e6)) : null;
  const firm = !!quote;
  const apr = quote ? quote.meta.aprPct : cell?.aprPct;
  const prob = quote ? quote.meta.probAssigned : cell?.probAssigned;
  const premiumPerBtc = premium !== null && qtyValid ? Number(premium) / 1e6 / qty : null;
  const effective = premiumPerBtc === null ? null : isPut ? strike - premiumPerBtc : strike + premiumPerBtc;

  if (stage === "done" && opened) {
    return (
      <div className="sheet p-6">
        <div className="label">Position opened{opened.id !== null ? ` · #${opened.id}` : ""}</div>
        <p className="display mt-3 text-[28px] leading-tight">
          {fmtUsdcAmount(opened.premium)} USDC is in your wallet.
        </p>
        <p className="mt-3 text-[14.5px] text-ink-500">
          {isPut
            ? `At ${fmtTimeUtc(expiry)} on ${fmtDay(expiry)}, if BTC is below ${fmtUsd0(strike)} you buy ${fmtBtc(qty)} BTC at that price; otherwise your ${fmtUsdcAmount(collateral)} USDC comes back.`
            : `At ${fmtTimeUtc(expiry)} on ${fmtDay(expiry)}, if BTC is above ${fmtUsd0(strike)} you sell ${fmtBtc(qty)} BTC at that price; otherwise your BTC comes back.`}{" "}
          Settlement happens by itself shortly after the fixing.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/positions" className="btn-ink btn-sm">
            View in portfolio
          </Link>
          <a href={txUrl(opened.hash)} target="_blank" rel="noreferrer" className="btn-quiet btn-sm">
            Transaction ↗
          </a>
          <button
            className="btn-quiet btn-sm"
            onClick={() => {
              setOpened(null);
              setStage("edit");
              tx.reset();
              fetchQuote();
            }}
          >
            Write another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet">
      {/* ------------------------------------------------ the question */}
      <div className="border-b border-paper-line px-5 pb-4 pt-5">
        <div className="label">{isPut ? "Cash-secured put" : "Covered call"}</div>
        <h2 className="display mt-2 text-[22px] leading-snug">
          {isPut ? "Buy" : "Sell"} BTC at {fmtUsd0(strike)} on {fmtDay(expiry)}
        </h2>
        <p className="mt-1 text-[13px] text-ink-500">
          Fixing at {fmtTimeUtc(expiry)} · {fmtTimeKst(expiry)}
        </p>
      </div>

      {/* ------------------------------------------------ size */}
      <div className="border-b border-paper-line px-5 py-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="size" className="label">
            Size
          </label>
          {wallet.isConnected && balance !== undefined && (
            <span className="text-[12.5px] text-ink-400">
              You have {isPut ? `${fmtUsdcAmount(balance)} USDC` : `${fmtBtc(Number(balance) / 1e8)} BTC`}
            </span>
          )}
        </div>
        <div className="relative mt-2">
          <input
            id="size"
            className="field pr-14"
            inputMode="decimal"
            autoComplete="off"
            value={size}
            disabled={stage !== "edit" || tx.busy}
            onChange={(e) => setSize(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-[14px] text-ink-400">
            BTC
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              className="chip"
              data-active={size === s}
              disabled={stage !== "edit" || tx.busy}
              onClick={() => setSize(s)}
            >
              {s}
            </button>
          ))}
          {wallet.isConnected && Number.isFinite(maxQty) && maxQty >= minQty && (
            <button
              className="chip"
              disabled={stage !== "edit" || tx.busy}
              onClick={() => setSize(maxQty.toFixed(4).replace(/0+$/, "").replace(/\.$/, ""))}
            >
              Max
            </button>
          )}
        </div>
        <p className={`mt-2 text-[13px] ${sizeProblem && size !== "" ? "text-bad" : "text-ink-500"}`}>
          {sizeProblem && size !== ""
            ? sizeProblem
            : qtyValid
              ? isPut
                ? `Locks ${fmtUsdcAmount(collateral)} USDC until the fixing.`
                : `Locks ${fmtBtc(qty)} BTC until the fixing.`
              : " "}
        </p>
      </div>

      {/* ------------------------------------------------ what you get now */}
      <div className="border-b border-paper-line px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="label">Paid to you when you sign</span>
          <span className="text-[12px] text-ink-400">
            {firm
              ? `Best of ${quote?.competingBids ?? 1} maker${(quote?.competingBids ?? 1) === 1 ? "" : "s"}`
              : wallet.isConnected
                ? quoting
                  ? "Asking makers…"
                  : "Indicative"
                : "Indicative, connect for a firm price"}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`display text-[40px] leading-none ${firm ? "" : "text-ink-400"}`}>
            {premium === null ? "—" : fmtUsdcAmount(premium)}
          </span>
          <span className="font-mono text-[14px] text-ink-500">USDC</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px]">
          <dt className="text-ink-500">Annual rate</dt>
          <dd className="num text-right text-ink">{apr === undefined ? "—" : fmtPct(apr)}</dd>
          <dt className="text-ink-500">{isPut ? "Your buy price, net" : "Your sell price, net"}</dt>
          <dd className="num text-right text-ink">{effective === null ? "—" : fmtUsd(effective)}</dd>
          <dt className="text-ink-500">Chance of assignment</dt>
          <dd className="num text-right text-ink">
            {prob === undefined ? "—" : `${Math.round(prob * 100)}%`}
            <span className="ml-1 font-sans text-[11.5px] text-ink-400">model</span>
          </dd>
        </dl>
        {firm && stage === "edit" && (
          <div className="mt-4">
            <div className="h-[2px] w-full bg-paper-line">
              <div
                key={quote?.quote.nonce}
                className="quote-timer"
                style={{
                  animation: `quote-drain ${Math.max(0, deadline - Math.floor(Date.now() / 1000))}s linear forwards`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-ink-400">
              {left > 0 ? `Quote holds for ${left}s, then refreshes.` : "Refreshing…"}
            </p>
          </div>
        )}
        {quoteError && <p className="mt-3 text-[13.5px] text-bad">{quoteError}</p>}
      </div>

      {/* ------------------------------------------------ at expiry */}
      <div className="border-b border-paper-line px-5 py-5">
        <div className="label">
          At the fixing, {fmtTimeUtc(expiry)} on {fmtDay(expiry)}
        </div>
        <ul className="mt-3 space-y-3 text-[14px]">
          <Outcome
            when={isPut ? `BTC at or above ${fmtUsd0(strike)}` : `BTC at or below ${fmtUsd0(strike)}`}
            then={
              isPut
                ? `Your ${qtyValid ? fmtUsdcAmount(collateral) : "—"} USDC comes back.`
                : `Your ${qtyValid ? fmtBtc(qty) : "—"} BTC comes back.`
            }
          />
          <Outcome
            when={isPut ? `BTC below ${fmtUsd0(strike)}` : `BTC above ${fmtUsd0(strike)}`}
            then={
              isPut
                ? `You buy ${qtyValid ? fmtBtc(qty) : "—"} BTC at ${fmtUsd0(strike)}. Your USDC pays for it and the BTC arrives in your wallet.`
                : `You sell ${qtyValid ? fmtBtc(qty) : "—"} BTC at ${fmtUsd0(strike)} and receive ${qtyValid ? fmtUsdcAmount(notionalUsdc) : "—"} USDC.`
            }
          />
        </ul>
        <p className="mt-3 text-[13px] text-ink-500">Either way, the premium is yours to keep.</p>
      </div>

      {/* ------------------------------------------------ review */}
      {stage === "review" && quote && (
        <div className="border-b border-paper-line bg-paper-sunk px-5 py-5">
          <div className="label">Check before you sign</div>
          <div className="mt-3 space-y-1.5 text-[14px]">
            <Leader label="You lock" value={isPut ? `${fmtUsdcAmount(collateral)} USDC` : `${fmtBtc(qty)} BTC`} />
            <Leader label="You receive now" value={`${fmtUsdcAmount(BigInt(quote.quote.premium))} USDC`} />
            <Leader label={isPut ? "You may buy" : "You may sell"} value={`${fmtBtc(qty)} BTC at ${fmtUsd0(strike)}`} />
            <Leader label="Fixing" value={`${fmtDay(expiry)}, ${fmtTimeUtc(expiry)}`} />
            <Leader label="Price source" value="Pyth BTC/USD" />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">
            Your collateral stays locked until the fixing; positions cannot be closed early. Testnet contracts,
            unaudited.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ action */}
      <div className="px-5 py-5">
        {drift && (
          <p className="mb-3 text-[13.5px] text-warn">
            The price moved from {fmtUsdcAmount(drift.from)} to {fmtUsdcAmount(drift.to)} USDC while you were
            reading. Nothing was sent. Sign again to accept the new price.
          </p>
        )}
        {cta.href ? (
          <a className="btn-primary h-12 w-full" href={cta.href} target="_blank" rel="noreferrer">
            {cta.label}
          </a>
        ) : (
          <button
            className="btn-primary h-12 w-full"
            disabled={cta.disabled || tx.busy}
            onClick={cta.onClick}
          >
            {tx.busy ? txLine(tx.state) : cta.label}
          </button>
        )}
        {stage === "review" && !tx.busy && (
          <button className="mt-2 w-full py-2 text-[13.5px] text-ink-500 hover:text-ink" onClick={() => setStage("edit")}>
            Back
          </button>
        )}
        {tx.state.status === "error" && <p className="mt-3 text-[13.5px] text-bad">{tx.state.error}</p>}
        {tx.state.status === "done" && tx.state.label !== "Write option" && (
          <p className="mt-3 text-[13.5px] text-good">{tx.state.label}: done.</p>
        )}
        {short && wallet.isConnected && !tx.busy && (
          <p className="mt-3 text-[12.5px] text-ink-500">
            This needs {isPut ? `${fmtUsdcAmount(collateral)} USDC` : `${fmtBtc(qty)} BTC`}. The test faucet gives{" "}
            {isPut ? "2,000 USDC" : "1 BTC"} every 8 hours.
          </p>
        )}
      </div>
    </div>
  );
}

function Outcome({ when, then }: { when: string; then: string }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3">
      <span className="mt-[7px] h-[7px] w-[7px] rounded-full border border-ink-400" aria-hidden="true" />
      <div>
        <div className="text-[13px] text-ink-500">If {when}</div>
        <div className="text-ink">{then}</div>
      </div>
    </li>
  );
}

function Leader({ label, value }: { label: string; value: string }) {
  return (
    <div className="dotted-row">
      <span className="text-ink-500">{label}</span>
      <span className="leader" />
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}
