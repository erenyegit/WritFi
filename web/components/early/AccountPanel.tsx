"use client";

import { useAccount } from "wagmi";

import { WalletButton } from "@/components/WalletButton";
import { isStepOpen, QUESTS, type OpenSteps } from "@/lib/early/quests";
import type { Account } from "@/lib/early/types";

import { shortWallet } from "./WalletAvatar";

interface Props {
  loading: boolean;
  account: Account | null;
  invited: boolean;
  open: OpenSteps;
  auth: { signIn: () => void; signOut: () => void; busy: boolean; error: string | null };
}

/** The hero's working half: sign in when signed out, where you stand when signed in. */
export function AccountPanel({ loading, account, invited, open, auth }: Props) {
  if (loading) return <p className="h-12 text-[14px] leading-[3rem] text-ink-400">Loading your account…</p>;
  return account ? <SignedIn account={account} open={open} auth={auth} /> : <SignedOut invited={invited} auth={auth} />;
}

function SignedOut({ invited, auth }: { invited: boolean; auth: Props["auth"] }) {
  const { address, isConnected } = useAccount();
  return (
    <div>
      {invited && (
        <p className="mb-5 inline-flex items-center gap-2 rounded-md border border-paper-rule px-3 py-1.5 text-[13.5px] text-ink-700">
          <span className="dot bg-brand" />
          You were invited by a friend. Sign in to accept.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {isConnected && address ? (
          <button className="btn-primary h-12 px-6" onClick={auth.signIn} disabled={auth.busy}>
            {auth.busy ? "Check your wallet…" : `Sign in as ${shortWallet(address)}`}
          </button>
        ) : (
          <WalletButton connectClassName="btn-primary h-12 px-6" align="left" requireGiwa={false} />
        )}
        <span className="text-[13.5px] text-ink-400">Free. One signature, no transaction.</span>
      </div>
      {auth.error && <p className="mt-3 max-w-md text-[13px] text-bad">{auth.error}</p>}
    </div>
  );
}

function SignedIn({ account, open, auth }: { account: Account; open: OpenSteps; auth: Props["auth"] }) {
  const { address } = useAccount();
  const switched = !!address && address.toLowerCase() !== account.address.toLowerCase();
  const steps = QUESTS.filter((q) => isStepOpen(q.id, open) || account.done.includes(q.id));
  const done = steps.filter((q) => account.done.includes(q.id)).length;

  return (
    <div>
      <dl className="grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-paper-line bg-paper-line sm:grid-cols-3">
        <Stat label="Friends" value={String(account.referrals.counted)} sub={`of ${account.referrals.joined} joined`} />
        <Stat label="Steps done" value={`${done} / ${steps.length}`} sub={done === steps.length ? "All done" : "Keep going"} />
        <Stat
          label="X account"
          value={account.x ? `@${account.x}` : "Not linked"}
          sub={account.x ? "Connected" : open.connect ? "Connect it in step 2" : "Opens soon"}
          small
          wide
        />
      </dl>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-500">
        <span className="dot-live" />
        Signed in as <span className="num text-ink">{shortWallet(account.address)}</span>
        <span className="text-ink-300">·</span>
        <button onClick={auth.signOut} className="underline decoration-paper-rule underline-offset-4 hover:text-ink">
          Sign out
        </button>
      </p>
      {switched && (
        <p className="mt-3 text-[13.5px] text-ink-500">
          Your wallet is now on {shortWallet(address!)}.{" "}
          <button onClick={auth.signIn} disabled={auth.busy} className="link">
            {auth.busy ? "Check your wallet…" : "Sign in with this wallet"}
          </button>
        </p>
      )}
      {auth.error && <p className="mt-3 text-[13px] text-bad">{auth.error}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  small,
  wide,
}: {
  label: string;
  value: string;
  sub: string;
  small?: boolean;
  /** Takes the full row on a phone, where three columns are too narrow for a handle. */
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 bg-paper-sheet px-4 py-4 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <dt className="label">{label}</dt>
      <dd className={`num mt-2.5 truncate leading-none text-ink ${small ? "pt-[9px] text-[15px]" : "text-[24px]"}`}>{value}</dd>
      <dd className="mt-2 truncate text-[12px] text-ink-400">{sub}</dd>
    </div>
  );
}
