"use client";

import { MarkGlyph } from "@/components/Logo";
import { CountUp } from "@/components/motion/CountUp";
import type { Account } from "@/lib/early/types";

import { shortWallet } from "./WalletAvatar";

/**
 * The early access pass: the account's points, rank and wallet on a card in
 * the brand blue. Before sign-in it shows an empty pass, so the page says what
 * signing in gets you.
 */
export function PassCard({ account }: { account: Account | null }) {
  const rank = account?.rank ? `#${account.rank.toLocaleString("en-US")}` : "—";

  return (
    <div data-backdrop-anchor className="pass-enter relative mx-auto w-full max-w-[460px]">
      <div className="relative isolate aspect-[1.6] overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(140deg,#3349A8_0%,#1E2C72_36%,#0F1543_100%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_40px_70px_-36px_rgba(0,0,0,0.95)] sm:p-7">
        <MarkGlyph className="pointer-events-none absolute -bottom-14 -right-12 -z-10 w-[320px] select-none text-white opacity-[0.09]" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(115deg,rgba(255,255,255,0)_28%,rgba(255,255,255,0.08)_44%,rgba(255,255,255,0)_58%)]"
        />

        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-white">
              <MarkGlyph className="h-[18px] w-auto" />
              <span className="text-[15px] font-semibold tracking-[-0.01em]">Writ Fi</span>
            </span>
            <span className="label text-brand-300">Early access</span>
          </div>

          <div>
            <div className={`num text-[46px] leading-none sm:text-[56px] ${account ? "text-white" : "text-white/35"}`}>
              <CountUp value={account?.points ?? 0} />
            </div>
            <div className="mt-2 text-[13px] text-white/75">Writ Points</div>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="label text-[10px] text-brand-300/80">Holder</div>
              <div className={`num mt-1 text-[14px] ${account ? "text-white" : "text-white/35"}`}>
                {account ? shortWallet(account.address) : "Sign in to claim"}
              </div>
            </div>
            <div className="text-right">
              <div className="label text-[10px] text-brand-300/80">Rank</div>
              <div className={`num mt-1 text-[14px] ${account ? "text-white" : "text-white/35"}`}>{rank}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
