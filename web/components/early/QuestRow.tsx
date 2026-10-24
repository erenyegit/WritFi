"use client";

import Link from "next/link";
import { useState } from "react";

import { CheckIcon, XIcon } from "@/components/Icons";
import { completeQuest } from "@/lib/early/client";
import { postText, type Quest } from "@/lib/early/quests";
import type { Account } from "@/lib/early/types";
import { X_HANDLE } from "@/lib/site";

/** `current` is the first step still to do; it is the one the page points at. */
export type QuestState = "done" | "current" | "open" | "closed";

/** The outcome of Sign in with X as the page tells it: a problem, or just information. */
export interface XNotice {
  text: string;
  tone: "error" | "info";
}

interface Props {
  quest: Quest;
  step: number;
  state: QuestState;
  /** The last stop draws no line onward. */
  last: boolean;
  loading: boolean;
  account: Account | null;
  inviteUrl: string | null;
  /** X accounts are linked with Sign in with X. */
  connect: boolean;
  /** What came back from Sign in with X, worth saying. */
  onAccount: (a: Account) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Starts Sign in with X; the server sends the browser on to X and back. */
const CONNECT_URL = "/api/early/x/connect";

/**
 * One stop on the route: a numbered stop on a line that runs down the steps,
 * solid up to the last step done; the step's title, why it counts and its
 * points; and under them, how to do it. On a phone the controls take the
 * points column's width too.
 */
export function QuestRow({ quest, step, state, last, loading, account, inviteUrl, connect, onAccount }: Props) {
  const done = state === "done";
  const closed = state === "closed";

  return (
    <li className="relative grid grid-cols-[44px_minmax(0,1fr)_auto] gap-x-4 px-5 py-7 sm:gap-x-7 sm:px-8">
      {!last && (
        <span
          aria-hidden="true"
          className={`absolute -bottom-7 left-[41px] top-[72px] border-l-2 sm:left-[53px] ${
            done ? "border-solid border-brand-600" : "border-dotted border-paper-rule"
          }`}
        />
      )}

      <Stop step={step} state={state} />

      <div className="min-w-0 pt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className={`text-[17px] font-medium leading-snug sm:text-[18px] ${done ? "text-ink-700" : "text-ink"}`}>
            {quest.title}
          </h3>
          {done && <Tag tone="good">Done</Tag>}
          {state === "current" && account && <Tag tone="brand">Next</Tag>}
          {/* Steps read as closed until the account loads; say "Soon" only once that is known. */}
          {closed && !loading && <Tag tone="muted">Soon</Tag>}
        </div>
        <p className={`mt-1.5 max-w-lg text-[14.5px] leading-relaxed ${done ? "text-ink-400" : "text-ink-500"}`}>
          {quest.body}
        </p>
      </div>

      <div className="pt-2 text-right">
        <div className={`num text-[20px] leading-none sm:text-[26px] ${done || (closed && !loading) ? "text-ink-400" : "text-ink"}`}>
          +{quest.points}
        </div>
        <div className="label mt-1.5 text-[10px]">
          <span className="sm:hidden">WP</span>
          <span className="hidden sm:inline">Writ Points</span>
        </div>
      </div>

      <div className="col-[2/-1] mt-4 empty:hidden sm:col-[2/3]">
        {loading ? null : done ? (
          <p className="flex items-center gap-2 text-[13.5px] text-ink-500">
            <CheckIcon className="h-4 w-4 text-good" />
            {quest.id === "post_x" && account?.x ? `Post verified from @${account.x}` : "Added to your pass"}
          </p>
        ) : closed ? (
          <p className="text-[13.5px] text-ink-400">
            {quest.id === "testnet" ? "Opens with the next testnet round." : "This step opens soon."}
          </p>
        ) : !account ? (
          state === "current" ? (
            <a href="#account" className="btn-primary btn-sm">
              Sign in to start
            </a>
          ) : null
        ) : quest.id === "follow_x" ? (
          <FollowStep account={account} connect={connect} onAccount={onAccount} />
        ) : quest.id === "post_x" ? (
          <PostStep account={account} connect={connect} inviteUrl={inviteUrl} onAccount={onAccount} />
        ) : quest.id === "testnet" ? (
          <TestnetStep onAccount={onAccount} />
        ) : null}
      </div>
    </li>
  );
}

function Stop({ step, state }: { step: number; state: QuestState }) {
  const base = "num relative flex h-11 w-11 items-center justify-center rounded-full text-[13px]";
  if (state === "done") {
    return (
      <span className={`${base} bg-brand-600 text-brand-on`}>
        <CheckIcon className="h-5 w-5" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className={`${base} border-2 border-brand bg-paper-sheet text-ink shadow-[0_0_0_5px_rgb(var(--brand)/0.14)]`}>
        {pad(step)}
      </span>
    );
  }
  if (state === "closed") {
    return <span className={`${base} border border-dashed border-paper-rule bg-paper-sheet text-ink-400`}>{pad(step)}</span>;
  }
  return <span className={`${base} border border-paper-rule bg-paper-sheet text-ink-700`}>{pad(step)}</span>;
}

function Tag({ tone, children }: { tone: "good" | "brand" | "muted"; children: React.ReactNode }) {
  const look =
    tone === "good"
      ? "bg-good/15 text-good"
      : tone === "brand"
        ? "bg-brand/15 text-brand"
        : "border border-paper-rule text-ink-400";
  return (
    <span className={`inline-flex h-5 items-center rounded px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] ${look}`}>
      {children}
    </span>
  );
}

function useStep(onAccount: (a: Account) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<Account>) => {
    setBusy(true);
    setError(null);
    try {
      onAccount(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/**
 * An X step's account stays switchable until one of them has been credited,
 * or, for an invited account, once linking it has scored the invite (always,
 * on the first link), as the server holds it.
 */
const xLocked = (account: Account) =>
  account.done.includes("follow_x") || account.done.includes("post_x") || (account.invited && !!account.x);

/**
 * Following is checked on X, against the X account linked to the wallet with
 * Sign in with X: a follow cannot be claimed for an account that is not yours.
 */
function FollowStep({
  account,
  connect,
  onAccount,
}: {
  account: Account;
  connect: boolean;
  onAccount: (a: Account) => void;
}) {
  const step = useStep(onAccount);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://x.com/intent/follow?screen_name=${X_HANDLE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary btn-sm"
        >
          <XIcon className="h-3.5 w-3.5" />
          Follow @{X_HANDLE}
        </a>
        {account.x ? (
          <button className="btn-ink btn-sm" disabled={step.busy} onClick={() => step.run(() => completeQuest("follow_x"))}>
            {step.busy ? "Checking on X…" : "Check my follow"}
          </button>
        ) : (
          connect && (
            <a href={CONNECT_URL} className="btn-ink btn-sm">
              Connect X
            </a>
          )
        )}
      </div>
      <p className="mt-2 text-[13px] text-ink-400">
        {account.x ? (
          <>
            We check that @{account.x} follows @{X_HANDLE}.
            {connect && !xLocked(account) && (
              <>
                {" "}
                <a href={CONNECT_URL} className="link text-ink-500">
                  Use another account
                </a>
              </>
            )}
          </>
        ) : (
          "Connect your X account so we can check the follow on it."
        )}
      </p>
      {step.error && <p className="mt-2 text-[13px] leading-snug text-bad">{step.error}</p>}
    </div>
  );
}

function PostStep({
  account,
  connect,
  inviteUrl,
  onAccount,
}: {
  account: Account;
  connect: boolean;
  inviteUrl: string | null;
  onAccount: (a: Account) => void;
}) {
  const [url, setUrl] = useState("");
  const step = useStep(onAccount);
  const intent = inviteUrl ? `https://x.com/intent/tweet?text=${encodeURIComponent(postText(inviteUrl))}` : undefined;
  // The post has to come from the linked X account, so link it first.
  if (!account.x) {
    return (
      <div className="space-y-2">
        <a href={CONNECT_URL} className="btn-ink btn-sm">
          <XIcon className="h-3.5 w-3.5" />
          Connect X
        </a>
        <p className="text-[13px] text-ink-400">Connect your X account first, then post from it.</p>
      </div>
    );
  }
  return (
    <div className="max-w-md space-y-3">
      <a href={intent} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
        <XIcon className="h-3.5 w-3.5" />
        Write the post
      </a>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          step.run(() => completeQuest("post_x", { url: url.trim() }));
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link to your post"
          inputMode="url"
          aria-label="Link to your post on X"
          className="h-9 min-w-0 flex-1 rounded-md border border-paper-rule bg-paper-sunk px-3 text-[14px] text-ink outline-none transition placeholder:text-ink-300 focus:border-ink-400"
        />
        <button type="submit" className="btn-ink btn-sm" disabled={step.busy || !url.trim()}>
          {step.busy ? "Checking…" : "Confirm"}
        </button>
      </form>
      {account.x && <p className="text-[13px] text-ink-400">Post from @{account.x}.</p>}
      {step.error && <p className="text-[13px] leading-snug text-bad">{step.error}</p>}
    </div>
  );
}

function TestnetStep({ onAccount }: { onAccount: (a: Account) => void }) {
  const step = useStep(onAccount);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/earn" className="btn-primary btn-sm">
          Open the desk
        </Link>
        <button className="btn-quiet btn-sm" disabled={step.busy} onClick={() => step.run(() => completeQuest("testnet"))}>
          {step.busy ? "Checking…" : "Check my wallet"}
        </button>
      </div>
      {step.error && <p className="mt-2 text-[13px] text-bad">{step.error}</p>}
    </div>
  );
}
