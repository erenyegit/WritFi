"use client";

import { isStepOpen, QUESTS, type OpenSteps } from "@/lib/early/quests";
import type { Account } from "@/lib/early/types";

import { ProgressDial } from "./ProgressDial";
import { QuestRow, type QuestState, type XNotice } from "./QuestRow";

interface Props {
  loading: boolean;
  account: Account | null;
  open: OpenSteps;
  inviteUrl: string | null;
  /** What came back from Sign in with X, worth saying. */
  xNotice: XNotice | null;
  onAccount: (a: Account) => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The steps as one board. On the left, the section's title over a dial of
 * what this pass has earned; on the right, the route, one stop per step. A
 * step that is not open yet still shows, so the pass shows what is coming.
 */
export function QuestBoard({ loading, account, open, inviteUrl, xNotice, onAccount }: Props) {
  const isDone = (q: (typeof QUESTS)[number]) => !!account?.done.includes(q.id);
  const isOpen = (q: (typeof QUESTS)[number]) => isStepOpen(q.id, open);
  const next = QUESTS.find((q) => !isDone(q) && isOpen(q));
  const states: QuestState[] = QUESTS.map((q) =>
    isDone(q) ? "done" : !isOpen(q) ? "closed" : q === next ? "current" : "open",
  );

  // The dial counts the steps alone; invites come on top, so the pass can pass 500.
  const total = QUESTS.reduce((n, q) => n + q.points, 0);
  const earned = QUESTS.reduce((n, q, i) => n + (states[i] === "done" ? q.points : 0), 0);
  const steps = states.filter((s) => s === "done").length;
  const fromFriends = account?.referrals.points ?? 0;

  return (
    <div
      id="steps"
      className="grid scroll-mt-24 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-sheet border border-paper-line bg-paper-sheet lg:grid-cols-[360px_minmax(0,1fr)]"
    >
      <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-x-6 gap-y-7 border-b border-paper-line bg-paper-sunk p-6 sm:grid-cols-[148px_minmax(0,1fr)] sm:p-8 lg:flex lg:flex-col lg:items-stretch lg:gap-0 lg:border-b-0 lg:border-r">
        <div className="col-span-2">
          <div className="eyebrow">Steps</div>
          <h2 className="display mt-3 text-[30px] leading-[1.1] sm:text-[36px]">Earn Writ Points</h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-500">
            Each step adds to your pass. Most take under a minute.
          </p>
        </div>

        <div className="lg:mt-10">
          <ProgressDial
            segments={QUESTS.map((q, i) => ({ id: q.id, points: q.points, state: states[i] }))}
            earned={earned}
            total={total}
            caption="Base quests"
          />
        </div>

        <div className="space-y-2.5 text-[14px] lg:mt-10">
          <div className="dotted-row">
            <span className="text-ink-500">Steps done</span>
            <span className="leader" />
            <span className="num text-ink">
              {steps} / {QUESTS.length}
            </span>
          </div>
          <div className="dotted-row">
            <span className="text-ink-500">From friends</span>
            <span className="leader" />
            <span className="num text-ink">{fmt(fromFriends)} WP</span>
          </div>
          <div className="dotted-row">
            <span className="font-medium text-ink">Total points</span>
            <span className="leader" />
            <span className="num font-medium text-ink">{fmt(account?.points ?? 0)} WP</span>
          </div>
        </div>
      </div>

      <ol className="py-2 sm:py-3">
        {QUESTS.map((q, i) => (
          <QuestRow
            key={q.id}
            quest={q}
            step={i + 1}
            state={states[i]}
            last={i === QUESTS.length - 1}
            loading={loading}
            account={account}
            inviteUrl={inviteUrl}
            connect={open.connect}
            notice={xNotice}
            onAccount={onAccount}
          />
        ))}
      </ol>
    </div>
  );
}
