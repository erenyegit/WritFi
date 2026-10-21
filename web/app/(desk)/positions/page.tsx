"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeAbiParameters, isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { ChartIcon, WalletIcon } from "@/components/Icons";
import { WalletButton } from "@/components/WalletButton";
import { coreAbi, PositionState, type OnchainPosition } from "@/lib/abi";
import { CORE_ADDRESS, txUrl } from "@/lib/addresses";
import { getSettlementUpdate } from "@/lib/api";
import { giwaSepolia } from "@/lib/chain";
import {
  fmtBtc8,
  fmtDay,
  fmtPrice8,
  fmtRelative,
  fmtTimeUtc,
  fmtUsdcAmount,
  shortAddr,
} from "@/lib/format";
import { txLine, useMarket, useNow, useTx } from "@/lib/hooks";

type Row = { id: bigint; pos: OnchainPosition };

/** Pyth publishes the fixing tick within seconds; the settle route waits a little longer. */
const SETTLE_AFTER_SEC = 60;

export default function PortfolioPage() {
  const { address } = useAccount();
  const [addrParam, setAddrParam] = useState<`0x${string}` | null>(null);
  const [lookup, setLookup] = useState("");
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("addr");
    if (a && isAddress(a)) setAddrParam(a);
  }, []);
  const viewAddr = addrParam ?? address ?? null;
  const now = useNow(1000);
  const { market } = useMarket(30_000);

  const viewing = (a: `0x${string}` | null) => {
    setAddrParam(a);
    window.history.replaceState(null, "", a ? `/positions?addr=${a}` : "/positions");
  };

  return (
    <div className="space-y-14 pt-10 sm:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Portfolio</div>
          <h1 className="display mt-3 text-[36px] leading-[1.08] sm:text-[44px]">
            {addrParam && addrParam !== address ? `Positions of ${shortAddr(addrParam)}` : "Your positions"}
          </h1>
        </div>
        <form
          className="flex w-full max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAddress(lookup.trim())) viewing(lookup.trim() as `0x${string}`);
          }}
        >
          <input
            className="field h-10 text-[13.5px]"
            placeholder="Look up any address, 0x…"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            aria-label="Address to look up"
          />
          <button className="btn-quiet btn-sm h-10" type="submit" disabled={!isAddress(lookup.trim())}>
            View
          </button>
        </form>
      </header>

      {addrParam && addrParam !== address && (
        <p className="-mt-8 text-[13.5px] text-ink-500">
          Read-only view.{" "}
          <button className="link" onClick={() => viewing(null)}>
            Back to your own positions
          </button>
        </p>
      )}

      {viewAddr ? (
        <Book addr={viewAddr} now={now} spot={market?.spot.usd} canAct={viewAddr === address} />
      ) : (
        <div className="sheet flex flex-col items-center px-6 py-14 text-center">
          <span className="icon-tile h-12 w-12 rounded-xl">
            <WalletIcon className="h-6 w-6" />
          </span>
          <p className="mt-5 text-[17px] font-medium text-ink">Connect a wallet to see your positions.</p>
          <p className="mt-2 max-w-md text-[14px] text-ink-500">
            Positions are read straight from the contract; nothing is stored anywhere else.
          </p>
          <div className="mt-6">
            <WalletButton connectClassName="btn-primary" align="center" />
          </div>
        </div>
      )}

      <SettlementQueue now={now} />
    </div>
  );
}

/* ------------------------------------------------------------------ book */

function usePositions(ids: readonly bigint[] | undefined) {
  const client = usePublicClient({ chainId: giwaSepolia.id });
  const [rows, setRows] = useState<Row[] | null>(null);
  const key = ids?.map(String).join(",") ?? "";

  const load = useCallback(async () => {
    if (!client || !ids) return;
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    const res = await client.multicall({
      allowFailure: true,
      contracts: ids.map((id) => ({
        abi: coreAbi,
        address: CORE_ADDRESS,
        functionName: "getPosition" as const,
        args: [id],
      })),
    });
    // Keep the last good read if a burst fails; the next poll retries.
    if (res.every((r) => r.status === "failure")) return;
    setRows(
      ids
        .map((id, i) => ({ id, pos: res[i].status === "success" ? (res[i].result as OnchainPosition) : null }))
        .filter((r): r is Row => r.pos !== null)
        .reverse(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  return { rows, reload: load };
}

function Book({
  addr,
  now,
  spot,
  canAct,
}: {
  addr: `0x${string}`;
  now: number;
  spot?: number;
  canAct: boolean;
}) {
  const client = usePublicClient({ chainId: giwaSepolia.id });
  const [ids, setIds] = useState<readonly bigint[] | undefined>(undefined);
  const loadIds = useCallback(() => {
    client
      ?.readContract({ abi: coreAbi, address: CORE_ADDRESS, functionName: "getWriterPositionIds", args: [addr] })
      .then(setIds)
      .catch(() => {});
  }, [client, addr]);
  useEffect(() => {
    setIds(undefined);
    loadIds();
    const t = setInterval(loadIds, 15_000);
    return () => clearInterval(t);
  }, [loadIds]);

  const { rows, reload } = usePositions(ids);
  const [tab, setTab] = useState<"open" | "settled">("open");

  const summary = useMemo(() => {
    const open = (rows ?? []).filter((r) => r.pos.state === PositionState.Open);
    return {
      open: open.length,
      settled: (rows ?? []).length - open.length,
      usdcLocked: open.filter((r) => r.pos.isPut).reduce((s, r) => s + r.pos.collateral, 0n),
      btcLocked: open.filter((r) => !r.pos.isPut).reduce((s, r) => s + r.pos.collateral, 0n),
      premium: (rows ?? []).reduce((s, r) => s + r.pos.premium, 0n),
    };
  }, [rows]);

  if (ids === undefined || rows === null) {
    return <div className="sheet px-6 py-10 text-center text-[14px] text-ink-400">Reading positions…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="sheet flex flex-col items-center px-6 py-14 text-center">
        <span className="icon-tile h-12 w-12 rounded-xl">
          <ChartIcon className="h-6 w-6" />
        </span>
        <p className="mt-5 text-[17px] font-medium text-ink">No positions yet.</p>
        <p className="mt-2 max-w-md text-[14px] text-ink-500">
          {canAct
            ? "Pick a price and a date on the desk. The premium reaches your wallet when you sign."
            : "This address has not written any options on this deployment."}
        </p>
        {canAct && (
          <Link href="/earn" className="btn-primary mt-6">
            Open the desk
          </Link>
        )}
      </div>
    );
  }

  const shown = rows.filter((r) => (tab === "open" ? r.pos.state === PositionState.Open : r.pos.state !== PositionState.Open));

  return (
    <section className="space-y-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-paper-line bg-paper-line md:grid-cols-4">
        <Stat label="Open positions" value={String(summary.open)} />
        <Stat label="USDC locked" value={fmtUsdcAmount(summary.usdcLocked)} />
        <Stat label="BTC locked" value={fmtBtc8(summary.btcLocked)} />
        <Stat label="Premium received" value={`${fmtUsdcAmount(summary.premium)} USDC`} note="Yours in every outcome" />
      </dl>

      <div className="flex gap-6 border-b border-paper-line">
        {(["open", "settled"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-3 text-[15px] transition ${
              tab === t ? "border-ink text-ink" : "border-transparent text-ink-500 hover:text-ink"
            }`}
          >
            {t === "open" ? `Open (${summary.open})` : `Settled (${summary.settled})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-[14px] text-ink-500">
          {tab === "open" ? "Nothing open right now." : "Nothing has settled yet."}
        </p>
      ) : (
        <div className="sheet divide-y divide-paper-line">
          {shown.map((r) => (
            <PositionRow key={String(r.id)} row={r} now={now} spot={spot} onSettled={reload} />
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-paper-sheet px-4 py-4">
      <dt className="label">{label}</dt>
      <dd className="num mt-2 text-[20px] text-ink">{value}</dd>
      {note && <dd className="mt-0.5 text-[12px] text-ink-400">{note}</dd>}
    </div>
  );
}

function PositionRow({ row, now, spot, onSettled }: { row: Row; now: number; spot?: number; onSettled: () => void }) {
  const { id, pos } = row;
  const tx = useTx();
  const expiry = Number(pos.expiry);
  const expired = now >= expiry;
  const strike = Number(pos.strike) / 1e8;
  const qty = fmtBtc8(pos.qty);
  const open = pos.state === PositionState.Open;
  const [dataError, setDataError] = useState<string | null>(null);

  const settle = async () => {
    setDataError(null);
    try {
      const updates = await getSettlementUpdate(expiry);
      const ok = await tx.send("Settle", {
        abi: coreAbi,
        address: CORE_ADDRESS,
        functionName: "settle",
        args: [id, encodeAbiParameters([{ type: "bytes[]" }], [updates])],
      });
      if (ok) onSettled();
    } catch (e) {
      setDataError((e as Error).message);
    }
  };

  let status: React.ReactNode;
  if (!open) {
    const fixed = fmtPrice8(pos.settlementPrice, 2);
    status = pos.isPut ? (
      pos.assigned ? (
        <>Fixed at {fixed}. You bought {qty} BTC at {fmtPrice8(pos.strike)}; it is in your wallet.</>
      ) : (
        <>Fixed at {fixed}. Your {fmtUsdcAmount(pos.collateral)} USDC came back.</>
      )
    ) : pos.assigned ? (
      <>
        Fixed at {fixed}. You sold {qty} BTC at {fmtPrice8(pos.strike)} for{" "}
        {fmtUsdcAmount((pos.strike * pos.qty + 10n ** 10n - 1n) / 10n ** 10n)} USDC.
      </>
    ) : (
      <>Fixed at {fixed}. Your {qty} BTC came back.</>
    );
  } else if (expired) {
    status = <>Fixed at {fmtTimeUtc(expiry)}. Waiting for settlement, which pays out at Pyth&apos;s price.</>;
  } else if (spot) {
    const itm = pos.isPut ? spot < strike : spot > strike;
    status = itm ? (
      <>If it fixed now, you would {pos.isPut ? "buy" : "sell"} {qty} BTC at {fmtPrice8(pos.strike)}.</>
    ) : (
      <>If it fixed now, your {pos.isPut ? "USDC" : "BTC"} would come back.</>
    );
  } else {
    status = <>Open.</>;
  }

  return (
    <div className="grid gap-x-6 gap-y-2 px-5 py-4 md:grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] md:items-center">
      <div className="num text-[13px] text-ink-400">#{String(id)}</div>
      <div>
        <div className="text-[15px] font-medium text-ink">
          {pos.isPut ? "Buy" : "Sell"} {qty} BTC at {fmtPrice8(pos.strike)}
        </div>
        <div className="text-[13px] text-ink-500">{pos.isPut ? "Cash-secured put" : "Covered call"}</div>
      </div>
      <div className="text-[13.5px]">
        <div className="text-ink">{fmtDay(expiry)}</div>
        <div className="text-ink-400">{open ? fmtRelative(expiry, now) : fmtTimeUtc(expiry)}</div>
      </div>
      <div className="text-[13.5px] leading-snug text-ink-700">
        <span className="num text-ink">+{fmtUsdcAmount(pos.premium)} USDC</span>
        <span className="text-ink-400"> received · </span>
        {status}
      </div>
      <div className="md:text-right">
        {open && expired && now - expiry >= SETTLE_AFTER_SEC && (
          <button className="btn-quiet btn-sm" disabled={tx.busy} onClick={settle}>
            {tx.busy ? "Settling…" : "Settle now"}
          </button>
        )}
        {(dataError || tx.state.status === "error") && (
          <p className="mt-1 text-[12.5px] text-bad">{dataError ?? tx.state.error}</p>
        )}
        {tx.state.hash && tx.state.status === "done" && (
          <a className="link text-[12.5px]" href={txUrl(tx.state.hash)} target="_blank" rel="noreferrer">
            Settled ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ queue */

/**
 * Every expired position, anyone's, still waiting to settle. The keeper runs
 * once a day shortly after 08:00 UTC; this is the manual lever for everything
 * in between. Settlement is permissionless and pays out only at Pyth's price,
 * so pressing it for someone else cannot hurt them.
 */
function SettlementQueue({ now }: { now: number }) {
  const client = usePublicClient({ chainId: giwaSepolia.id });
  const [groups, setGroups] = useState<{ expiry: number; ids: bigint[] }[] | null>(null);
  const tx = useTx();
  const [busyExpiry, setBusyExpiry] = useState<number | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const next = await client.readContract({ abi: coreAbi, address: CORE_ADDRESS, functionName: "nextPositionId" });
      const byExpiry = new Map<number, bigint[]>();
      const t = Math.floor(Date.now() / 1000);
      for (let from = 1n; from < next; from += 200n) {
        const page = await client.readContract({
          abi: coreAbi,
          address: CORE_ADDRESS,
          functionName: "getPositions",
          args: [from, 200n],
        });
        page.forEach((p, i) => {
          const e = Number(p.expiry);
          if (p.state === PositionState.Open && e + SETTLE_AFTER_SEC <= t) {
            byExpiry.set(e, [...(byExpiry.get(e) ?? []), from + BigInt(i)]);
          }
        });
      }
      setGroups([...byExpiry.entries()].sort(([a], [b]) => a - b).map(([expiry, ids]) => ({ expiry, ids })));
    } catch {
      // keep the last good read
    }
  }, [client]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const settleAll = async (g: { expiry: number; ids: bigint[] }) => {
    setBusyExpiry(g.expiry);
    setDataError(null);
    try {
      const updates = await getSettlementUpdate(g.expiry);
      const ok = await tx.send("Settle expiry", {
        abi: coreAbi,
        address: CORE_ADDRESS,
        functionName: "settleMany",
        args: [g.ids, encodeAbiParameters([{ type: "bytes[]" }], [updates])],
      });
      if (ok) load();
    } catch (e) {
      setDataError((e as Error).message);
    } finally {
      setBusyExpiry(null);
    }
  };

  return (
    <section className="border-t border-paper-line pt-10">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <div className="eyebrow">Settlement</div>
          <h2 className="display mt-3 text-[26px] leading-tight">Every expiry settles on Pyth&apos;s price.</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-500">
            A keeper settles each fixing automatically shortly after 08:00 UTC. The contract checks Pyth&apos;s
            signatures and takes the first price at or after the fixing, so it makes no difference who presses the
            button or when. Anyone can settle an expired position sooner; it only costs a little gas.
          </p>
        </div>
        <div className="sheet self-start">
          <div className="table-head px-4 py-3">Waiting to settle</div>
          {groups === null ? (
            <p className="px-4 py-5 text-[14px] text-ink-400">Reading the book…</p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-500">Nothing is waiting. Every expired position has settled.</p>
          ) : (
            <ul className="divide-y divide-paper-line">
              {groups.map((g) => (
                <li key={g.expiry} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="text-[14px]">
                    <div className="text-ink">
                      {fmtDay(g.expiry)}, {fmtTimeUtc(g.expiry)}
                    </div>
                    <div className="text-[12.5px] text-ink-500">
                      {g.ids.length} position{g.ids.length === 1 ? "" : "s"} · fixed {fmtRelative(g.expiry, now)}
                    </div>
                  </div>
                  <button
                    className="btn-quiet btn-sm"
                    disabled={tx.busy}
                    onClick={() => settleAll(g)}
                  >
                    {busyExpiry === g.expiry && tx.busy ? txLine(tx.state) : "Settle all"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(dataError || tx.state.status === "error") && (
            <p className="px-4 pb-4 text-[13px] text-bad">{dataError ?? tx.state.error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
