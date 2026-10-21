"use client";

import { useCallback, useEffect, useState } from "react";

import { AccountPanel } from "@/components/early/AccountPanel";
import { InvitePanel } from "@/components/early/InvitePanel";
import { Leaderboard } from "@/components/early/Leaderboard";
import { PassCard } from "@/components/early/PassCard";
import { QuestBoard } from "@/components/early/QuestBoard";
import type { XNotice } from "@/components/early/QuestRow";
import { Reveal } from "@/components/motion/Reveal";
import { useEarly, useInviteRef, useSignIn } from "@/lib/early/client";
import type { Account } from "@/lib/early/types";

/** What Sign in with X can come back with (?x=), as the page says it. */
const X_NOTICES: Record<string, XNotice> = {
  young: {
    text: "This X account is too new to qualify for referral rewards. You can still use Writ Early Access.",
    tone: "info",
  },
  denied: { text: "X sign-in was cancelled.", tone: "error" },
  taken: { text: "That X account is already linked to another wallet.", tone: "error" },
  locked: { text: "This wallet's X account is fixed once an X step or a referral has counted.", tone: "error" },
  signin: { text: "Sign in with your wallet first, then connect X.", tone: "error" },
  failed: { text: "We could not connect X. Try again in a minute.", tone: "error" },
  busy: { text: "We could not connect X. Try again in a minute.", tone: "error" },
  off: { text: "Connecting X is not open yet.", tone: "error" },
};

const RULES = [
  "Points measure early participation. They are not a token, have no cash value, and do not promise one.",
  "We pick the first Writ Fi users from this board, and we review the accounts at the top before we do.",
  "One wallet and one X account per person. Duplicate or automated accounts are taken off the board.",
  "A friend counts once they join with your link and connect an X account at least 30 days old. Base referral WP applies to your first 10 qualified referrals; Signal Bonuses have no limit.",
];

export default function EarlyAccessPage() {
  const early = useEarly();
  const ref = useInviteRef();
  const { setAccount, loadBoard } = early;

  const onAccount = useCallback(
    (account: Account | null) => {
      setAccount(account);
      loadBoard();
    },
    [setAccount, loadBoard],
  );
  const auth = useSignIn(onAccount);

  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  // Back from Sign in with X: show how it went once, then drop ?x= from the address.
  const [xNotice, setXNotice] = useState<XNotice | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("x");
    if (!outcome) return;
    setXNotice(X_NOTICES[outcome] ?? null);
    url.searchParams.delete("x");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  const inviteUrl = early.account && origin ? `${origin}/r/${early.account.code}` : null;

  return (
    <div className="pt-10 sm:pt-16">
      <section id="account" className="grid scroll-mt-28 items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div data-backdrop-avoid>
          <div className="eyebrow">Early access</div>
          <h1 className="display mt-4 text-[40px] leading-[1.04] sm:text-[58px]">Earn your place in Writ Fi.</h1>
          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-ink-500">
            Complete quests, invite friends and earn Writ Points. Early access will be prioritized from this board.
          </p>
          {early.error && (
            <p className="mt-6 rounded-lg border border-paper-line bg-paper-sunk px-4 py-3 text-[14px] text-ink-700">
              {early.error}
            </p>
          )}
          <div className="mt-8">
            <AccountPanel
              loading={early.loading}
              account={early.account}
              invited={!!ref && !early.account}
              open={early.open}
              auth={auth}
            />
          </div>
        </div>
        <PassCard account={early.account} />
      </section>

      <Reveal className="mt-20 sm:mt-28">
        <QuestBoard
          loading={early.loading}
          account={early.account}
          open={early.open}
          inviteUrl={inviteUrl}
          xNotice={xNotice}
          onAccount={onAccount}
        />
      </Reveal>

      <Reveal className="mt-20 sm:mt-24">
        <InvitePanel account={early.account} inviteUrl={inviteUrl} />
      </Reveal>

      <Reveal className="mt-20 sm:mt-24">
        <Leaderboard board={early.board} account={early.account} />
      </Reveal>

      <section className="mt-20 grid gap-8 sm:mt-24 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-10">
        <div>
          <div className="eyebrow">The fine print</div>
          <h2 className="display mt-3 text-[26px] leading-[1.15] sm:text-[30px]">How points work.</h2>
        </div>
        <ol className="border-b border-paper-line">
          {RULES.map((rule, i) => (
            <li
              key={i}
              className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-t border-paper-line py-4 text-[14.5px] leading-relaxed text-ink-500"
            >
              <span className="num pt-[3px] text-[12px] text-ink-400">{String(i + 1).padStart(2, "0")}</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
