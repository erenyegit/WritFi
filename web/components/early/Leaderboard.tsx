"use client";

import { useRef } from "react";

import { useSeen } from "@/components/motion/useMotion";
import type { Account, Board, BoardRow } from "@/lib/early/types";

import { shortWallet, WalletAvatar } from "./WalletAvatar";

const fmt = (n: number) => n.toLocaleString("en-US");
const COLS = "grid grid-cols-[34px_minmax(0,1fr)_52px_76px] gap-2.5 sm:grid-cols-[56px_minmax(0,1fr)_88px_236px] sm:gap-4";

/**
 * The top of the line. Next to each score, a bar against the leader's, so the
 * gaps between places read at a glance.
 */
export function Leaderboard({ board, account }: { board: Board | null; account: Account | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const you = account?.rank ?? null;
  const youOnBoard = you !== null && !!board?.top.some((r) => r.rank === you);
  const max = Math.max(1, ...(board?.top.map((r) => r.points) ?? []));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Standings</div>
          <h2 className="display mt-3 text-[30px] leading-[1.12] sm:text-[38px]">Leaderboard</h2>
          <p className="mt-2 text-[15px] text-ink-500">See where your points put you among everyone in line.</p>
        </div>
        {board && (
          <p className="flex items-center gap-2.5 rounded-md border border-paper-line bg-paper-sheet px-3 py-2 text-[13.5px] text-ink-500">
            <span className="dot-live" />
            <span>
              <span className="num text-ink">{fmt(board.total)}</span> {board.total === 1 ? "person" : "people"} in line
            </span>
          </p>
        )}
      </div>

      <div ref={ref} data-seen={seen} className="sheet mt-8 overflow-hidden">
        <div className={`table-head border-b-0 px-4 py-3 sm:px-6 ${COLS}`}>
          <span>Rank</span>
          <span>Wallet</span>
          <span className="text-right">Friends</span>
          <span className="text-right">Points</span>
        </div>
        {!board ? (
          <p className="border-t border-paper-line px-6 py-10 text-center text-[14px] text-ink-400">Loading the board…</p>
        ) : board.top.length === 0 ? (
          <p className="border-t border-paper-line px-6 py-10 text-center text-[14px] text-ink-400">
            No one is in line yet. Sign in to be first.
          </p>
        ) : (
          board.top.map((row, i) => (
            <Line key={row.rank} row={row} you={row.rank === you} depth={row.points / max} delay={i * 60} />
          ))
        )}
        {account && you !== null && board && board.top.length > 0 && !youOnBoard && (
          <>
            <div className="border-t border-dashed border-paper-line py-1 text-center text-[12px] leading-none text-ink-300">
              ···
            </div>
            <Line
              row={{
                rank: you,
                wallet: shortWallet(account.address),
                points: account.points,
                referrals: account.referrals.counted,
              }}
              you
              depth={Math.min(account.points / max, 1)}
              delay={board.top.length * 60}
            />
          </>
        )}
      </div>
    </section>
  );
}

function Line({ row, you, depth, delay }: { row: BoardRow; you: boolean; depth: number; delay: number }) {
  return (
    <div
      className={`items-center border-t border-paper-line px-4 py-4 sm:px-6 ${COLS} ${
        you ? "bg-brand-50 shadow-[inset_3px_0_0_rgb(var(--brand))]" : ""
      }`}
    >
      {row.rank === 1 ? (
        <span className="num inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-[13px] font-medium text-brand-on">
          1
        </span>
      ) : row.rank <= 3 ? (
        <span className="num inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand/50 text-[13px] text-brand">
          {row.rank}
        </span>
      ) : (
        <span className="num pl-2.5 text-[13.5px] text-ink-400">{row.rank}</span>
      )}
      <span className="flex min-w-0 items-center gap-3">
        {/* On a phone the column is too narrow for the mark; the row tint still marks you. */}
        <span className="hidden sm:inline-flex">
          <WalletAvatar seed={row.wallet} />
        </span>
        <span className="num truncate text-[13px] text-ink sm:text-[14px]">{row.wallet}</span>
        {you && <span className="label hidden shrink-0 text-brand sm:inline">You</span>}
      </span>
      <span className="num text-right text-[13.5px] text-ink-500 sm:text-[14px]">{fmt(row.referrals)}</span>
      <span className="flex items-center justify-end gap-4">
        <span aria-hidden="true" className="relative hidden h-1 flex-1 overflow-hidden rounded-full bg-paper-line sm:block">
          <span
            className={`depth absolute inset-y-0 left-0 rounded-full ${you ? "bg-brand" : "bg-brand-600"}`}
            style={{ width: `${(depth * 100).toFixed(2)}%`, transitionDelay: `${delay}ms` }}
          />
        </span>
        <span className="num text-right text-[13.5px] text-ink sm:w-[84px] sm:text-[14px]">
          {fmt(row.points)}
          <span className="ml-1 hidden text-[11px] text-ink-400 sm:inline">WP</span>
        </span>
      </span>
    </div>
  );
}
