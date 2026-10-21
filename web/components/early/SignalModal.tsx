"use client";

import { useEffect, useRef } from "react";

import {
  AUDIENCE_TIERS,
  MIN_X_ACCOUNT_DAYS,
  REFERRAL_BASE_LIMIT,
  REFERRAL_BASE_WP,
  VERIFIED_BONUS_WP,
} from "@/lib/early/quests";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Every line a referral can pay, in the order the tiers climb. */
const ROWS: [string, number][] = [
  ["Qualified referral*", REFERRAL_BASE_WP],
  ...[...AUDIENCE_TIERS].reverse().map((t): [string, number] => [`${t.label} followers`, t.wp]),
  ["Verified X account", VERIFIED_BONUS_WP],
];

/** "How Signal Bonuses work": what a referral pays, tier by tier, as a native modal dialog. */
export function SignalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself; close then.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="signal-title"
      className="w-[min(560px,calc(100vw-32px))] rounded-sheet border border-paper-line bg-paper-sheet p-0 text-ink shadow-[0_30px_80px_-30px_rgba(12,16,40,0.45)] backdrop:bg-ink/40"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="eyebrow">Bring the Signal</div>
            <h3 id="signal-title" className="display mt-3 text-[26px] leading-[1.15]">
              How Signal Bonuses work
            </h3>
            <p className="mt-2 text-[15px] text-ink-500">Better-established X accounts carry more signal.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-paper-tint hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <table className="mt-6 w-full text-[14.5px]">
          <thead>
            <tr className="label text-[10px]">
              <th className="pb-2 text-left font-medium">Signal</th>
              <th className="pb-2 text-right font-medium">Bonus</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, wp]) => (
              <tr key={label} className="border-t border-paper-line">
                <td className="py-2.5 text-ink-700">{label}</td>
                <td className="num py-2.5 text-right text-ink">+{fmt(wp)} WP</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-5 text-[13.5px] leading-relaxed text-ink-500">
          * Base referral WP applies to your first {REFERRAL_BASE_LIMIT} qualified referrals. Signal Bonuses have no
          referral limit.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
          Signal Bonuses are calculated from the X profile snapshot captured when the referral qualifies and may be
          subject to authenticity checks. X accounts less than {MIN_X_ACCOUNT_DAYS} days old do not qualify for referral
          rewards.
        </p>
      </div>
    </dialog>
  );
}
