"use client";

import { useRef, useState } from "react";

import { CountUp } from "@/components/motion/CountUp";
import { useSeen } from "@/components/motion/useMotion";
import {
  AUDIENCE_TIERS,
  MAX_SIGNAL_WP,
  MIN_X_ACCOUNT_DAYS,
  REFERRAL_BASE_LIMIT,
  REFERRAL_BASE_WP,
} from "@/lib/early/quests";
import type { Account, Signal } from "@/lib/early/types";

import { SignalModal } from "./SignalModal";

const fmt = (n: number) => n.toLocaleString("en-US");

/** How a friend turns into points, in the order it happens. */
const HOW = [
  ["Share your link", "Send it to friends or post it."],
  ["They connect X", `A wallet, then an X account at least ${MIN_X_ACCOUNT_DAYS} days old.`],
  ["You earn", `${REFERRAL_BASE_WP} WP each for your first ${REFERRAL_BASE_LIMIT}, plus Signal Bonuses.`],
] as const;

/** From this audience tier up, a referral is called out as a strong signal. */
const STRONG_FROM = AUDIENCE_TIERS.find((t) => t.label === "25K+")!.wp;

/** The link as people will read it: no scheme, no www. */
export const displayLink = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "");

/**
 * Bring the Signal, as a ticket: the referral link to hand out and the latest
 * referrals with what each paid on the left, and a stub in the feature blue
 * with your circle of friends, torn along a line of punched holes.
 */
export function InvitePanel({ account, inviteUrl }: { account: Account | null; inviteUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const [explained, setExplained] = useState(false);

  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked; the link is on screen to copy by hand
    }
  };

  return (
    <section className="relative isolate grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-sheet lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col bg-paper-sheet p-6 sm:p-10">
        <div className="eyebrow">Referrals</div>
        <h2 className="display mt-4 text-[30px] leading-[1.1] sm:text-[38px]">Bring the Signal</h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-500">
          Invite real people into Writ. Qualified referrals earn {REFERRAL_BASE_WP} WP, with additional bonuses for
          established X accounts.
        </p>

        <ol className="mt-8 grid max-w-2xl gap-x-6 sm:grid-cols-3">
          {HOW.map(([title, body], i) => (
            <li
              key={title}
              className="grid grid-cols-[32px_minmax(0,1fr)] border-t border-paper-line py-3 sm:block sm:pb-0 sm:pt-3.5"
            >
              <div className="num pt-[3px] text-[12px] text-brand">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <div className="text-[14.5px] font-medium text-ink sm:mt-1.5">{title}</div>
                <div className="mt-0.5 text-[13.5px] leading-snug text-ink-500">{body}</div>
              </div>
            </li>
          ))}
        </ol>

        {account && account.referrals.recent.length > 0 && <Signals list={account.referrals.recent} />}

        <div className="mt-auto pt-9">
          {account && inviteUrl ? (
            <>
              <div className="label text-[10px]">Your referral link</div>
              <div className="mt-2 flex max-w-lg gap-2">
                <div className="num flex h-11 min-w-0 flex-1 items-center rounded-md border border-paper-rule bg-paper-sunk px-3.5 text-[14px] text-ink">
                  <span className="truncate">{displayLink(inviteUrl)}</span>
                </div>
                <button onClick={copy} className="btn-primary min-w-[150px] px-4">
                  {copied ? "Copied" : "Copy referral link"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <a href="#account" className="btn-primary">
                Sign in for your link
              </a>
              <span className="text-[14px] text-ink-400">Your link is ready as soon as you sign in.</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExplained(true)}
            className="mt-4 text-[14px] font-medium text-brand underline-offset-[3px] hover:underline"
          >
            How Signal Bonuses work →
          </button>
        </div>
      </div>

      <div className="relative flex flex-col bg-feature p-6 text-feature-on sm:p-8">
        <span aria-hidden="true" className="ticket-perf" />
        <span aria-hidden="true" className="ticket-notch -left-3 -top-3" />
        <span aria-hidden="true" className="ticket-notch -right-3 -top-3 lg:-bottom-3 lg:-left-3 lg:right-auto lg:top-auto" />

        <div className="flex items-baseline justify-between gap-4">
          <span className="label text-feature-muted">Bring the signal</span>
          <span className="num text-[13px] tracking-[0.12em] text-feature-muted">
            №&nbsp;<span className={account ? "text-feature-on" : ""}>{account ? account.code : "······"}</span>
          </span>
        </div>

        <Circle counted={account?.referrals.counted ?? 0} joined={account?.referrals.joined ?? 0} />

        <div className="mt-auto flex items-end justify-between gap-4">
          <div>
            <div className="label text-[10px] text-feature-muted">Up to</div>
            <div className="num mt-1.5 text-[44px] leading-none">
              +<CountUp value={MAX_SIGNAL_WP} duration={1300} />
            </div>
            <div className="mt-2 text-[13.5px] text-feature-muted">WP in Signal Bonuses</div>
          </div>
          {account && (
            <div className="text-right text-[13px] leading-relaxed text-feature-muted">
              <div>
                <span className="num text-feature-on">{account.referrals.counted}</span> qualified
              </div>
              <div>
                <span className="num text-feature-on">{account.referrals.joined}</span> joined
              </div>
            </div>
          )}
        </div>
      </div>

      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] rounded-sheet border border-paper-line" />
      <SignalModal open={explained} onClose={() => setExplained(false)} />
    </section>
  );
}

/** The latest qualified referrals, each with what it paid and why. */
function Signals({ list }: { list: Signal[] }) {
  return (
    <div className="mt-8 max-w-2xl">
      <div className="label text-[10px]">Your signals</div>
      <ul className="mt-2 border-b border-paper-line">
        {list.map((s) => (
          <li key={`${s.at}-${s.username}`} className="border-t border-paper-line py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 text-[14.5px] text-ink">
                <span className="font-medium">@{s.username}</span>
                <span className="text-ink-500"> joined through your link</span>
                {s.audience >= STRONG_FROM && (
                  <span className="ml-2 inline-flex h-5 -translate-y-px items-center rounded bg-brand/15 px-1.5 align-middle font-mono text-[10px] uppercase tracking-[0.08em] text-brand">
                    Strong signal
                  </span>
                )}
              </span>
              <span className="num shrink-0 text-[14px] text-ink">+{fmt(s.total)} WP</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-ink-500">
              {s.base > 0 && <span>Qualified referral +{fmt(s.base)}</span>}
              {s.audience > 0 && (
                <span>
                  Audience · {s.tier} +{fmt(s.audience)}
                </span>
              )}
              {s.verified > 0 && <span>Verified X +{fmt(s.verified)}</span>}
              {s.total === 0 && <span>Past your first {REFERRAL_BASE_LIMIT} referrals, with no Signal Bonus</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SLOTS = 8;
const ORBIT = 70;

/** A point on a ring round the centre, rounded so server and browser agree. */
const seat = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [+(100 + r * Math.cos(a)).toFixed(2), +(100 + r * Math.sin(a)).toFixed(2)] as const;
};

/**
 * You at the centre, eight seats around you. A friend who counts is a solid
 * dot tied to you; one who joined but has not confirmed X is an open ring on a
 * fainter tie; an empty seat is a faint point. Past eight, the rest is a count.
 */
function Circle({ counted, joined }: { counted: number; joined: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const solid = Math.min(counted, SLOTS);
  const open = Math.min(Math.max(joined - counted, 0), SLOTS - solid);
  const more = Math.max(joined - SLOTS, 0);

  return (
    <div ref={ref} data-seen={seen} className="relative mx-auto my-6 w-full max-w-[188px]">
      <svg viewBox="0 0 200 200" className="h-auto w-full overflow-visible" aria-hidden="true">
        <circle cx="100" cy="100" r={ORBIT} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="0.01 5.5" />
        <circle cx="100" cy="100" r="38" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />

        {Array.from({ length: SLOTS }, (_, i) => {
          const deg = (i * 360) / SLOTS - 90;
          const [x, y] = seat(ORBIT, deg);
          const kind = i < solid ? "solid" : i < solid + open ? "open" : "empty";
          if (kind === "empty") return <circle key={i} cx={x} cy={y} r="2.2" fill="currentColor" fillOpacity="0.35" />;
          // the tie starts clear of your mark and stops short of the friend's
          const [x0, y0] = seat(18, deg);
          const [x1, y1] = seat(ORBIT - 9, deg);
          return (
            <g key={i}>
              <path
                d={`M ${x0} ${y0} L ${x1} ${y1}`}
                pathLength={1}
                stroke="currentColor"
                strokeOpacity={kind === "solid" ? 0.6 : 0.4}
                strokeWidth="1.2"
                className="dial-arc"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              />
              {kind === "solid" ? (
                <circle cx={x} cy={y} r="6" fill="currentColor" />
              ) : (
                <circle cx={x} cy={y} r="5.5" className="fill-feature" stroke="currentColor" strokeWidth="1.5" />
              )}
            </g>
          );
        })}

        <circle cx="100" cy="100" r="13" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
        <circle cx="100" cy="100" r="6.5" fill="currentColor" />
      </svg>
      <span className="label absolute left-1/2 top-1/2 mt-5 -translate-x-1/2 text-[9px] text-feature-muted">You</span>
      {more > 0 && (
        <span className="num absolute bottom-1 right-0 text-[12px] text-feature-on">+{more.toLocaleString("en-US")}</span>
      )}
    </div>
  );
}
