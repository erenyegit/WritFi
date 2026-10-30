"use client";

import { useEffect, useMemo, useState } from "react";

import { addressUrl } from "@/lib/addresses";
import { exportRows } from "@/lib/early/client";
import type { ExportRow } from "@/lib/early/types";

const TOKEN_KEY = "writ:early-admin";

const STEP_LABELS: Record<string, string> = {
  waitlist: "Waitlist",
  follow_x: "Follow",
  post_x: "Post",
  like_x: "Like",
  repost_x: "Repost",
  testnet: "Testnet",
};

/**
 * The team's view of the whole list: full wallets, X accounts and who invited
 * whom, in board order, with a CSV download to pick early users from.
 */
export default function EarlyAdminPage() {
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<ExportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const load = async (t: string) => {
    setBusy(true);
    setError(null);
    try {
      setRows(await exportRows(t));
      try {
        window.sessionStorage.setItem(TOKEN_KEY, t);
      } catch {
        // stays in the field only
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      saved = null;
    }
    if (saved) {
      setToken(saved);
      void load(saved);
    }
  }, []);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase().replace(/^@/, "");
    if (!rows || !f) return rows;
    return rows.filter(
      (r) =>
        r.address.toLowerCase().includes(f) ||
        (r.x ?? "").toLowerCase().includes(f),
    );
  }, [rows, filter]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const live = rows.filter((r) => !r.hidden);
    return {
      people: live.length,
      withX: live.filter((r) => r.x).length,
      friends: live.reduce((n, r) => n + r.referrals, 0),
      testnet: live.filter((r) => r.quests.includes("testnet")).length,
    };
  }, [rows]);

  return (
    <div className="pt-10 sm:pt-14">
      <header className="max-w-2xl">
        <div className="eyebrow">Team only</div>
        <h1 className="display mt-3 text-[34px] leading-[1.1] sm:text-[40px]">
          Early access list
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          Everyone who signed in, in board order. Download the list to pick the
          first users.
        </p>
      </header>

      <form
        className="mt-8 flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) void load(token.trim());
        }}
      >
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Admin token"
          aria-label="Admin token"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded border border-paper-rule bg-paper-sheet px-3.5 font-mono text-[14px] text-ink outline-none transition placeholder:text-ink-300 focus:border-ink-400"
        />
        <button className="btn-ink h-11" disabled={busy || !token.trim()}>
          {busy ? "Loading…" : rows ? "Reload" : "Load"}
        </button>
      </form>
      {error && <p className="mt-3 text-[13.5px] text-bad">{error}</p>}

      {rows && stats && (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded border border-paper-line bg-paper-line md:grid-cols-4">
            <Stat label="In line" value={stats.people} />
            <Stat label="X linked" value={stats.withX} />
            <Stat label="Friends counted" value={stats.friends} />
            <Stat label="Wrote an option" value={stats.testnet} />
          </dl>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by wallet or X handle"
              aria-label="Filter"
              className="h-9 w-full max-w-xs rounded border border-paper-rule bg-paper-sheet px-3 text-[14px] text-ink outline-none transition placeholder:text-ink-300 focus:border-ink-400"
            />
            <button className="btn-quiet btn-sm" onClick={() => download(rows)}>
              Download CSV
            </button>
          </div>

          <div className="sheet mt-4 overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-[13.5px]">
              <thead>
                <tr className="table-head">
                  {[
                    "#",
                    "Wallet",
                    "X",
                    "X profile",
                    "Points",
                    "Friends",
                    "Referral WP",
                    "Steps",
                    "Joined",
                    "Invited by",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown?.map((r) => (
                  <tr
                    key={r.address}
                    className={`border-t border-paper-line ${r.hidden ? "text-ink-300" : ""}`}
                  >
                    <td className="num px-4 py-3 text-ink-400">
                      {r.rank ?? "held"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={addressUrl(r.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="num text-[12.5px] text-ink underline-offset-4 hover:underline"
                      >
                        {r.address}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {r.x ? (
                        <a
                          href={r.xPost ?? `https://x.com/${r.x}`}
                          target="_blank"
                          rel="noreferrer"
                          className="link"
                        >
                          @{r.x}
                        </a>
                      ) : (
                        <span className="text-ink-300">none</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-ink-500">
                      {r.xFollowers !== null ? (
                        <>
                          <span className="num text-ink">
                            {r.xFollowers.toLocaleString("en-US")}
                          </span>{" "}
                          followers
                          {r.xVerified ? " · verified" : ""}
                          {r.xCreatedAt
                            ? ` · since ${r.xCreatedAt.slice(0, 7)}`
                            : ""}
                          {r.referralStatus &&
                            r.referralStatus !== "qualified" && (
                              <span className="text-bad">
                                {" "}
                                · {r.referralStatus.replace(/_/g, " ")}
                              </span>
                            )}
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="num px-4 py-3 text-ink">
                      {r.points.toLocaleString("en-US")}
                    </td>
                    <td className="num px-4 py-3">
                      {r.referrals}
                      <span className="text-ink-400"> / {r.invited}</span>
                    </td>
                    <td className="num px-4 py-3 text-ink-500">
                      {r.referralWp ? r.referralWp.toLocaleString("en-US") : ""}
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {r.quests
                        .split(" ")
                        .filter(Boolean)
                        .map((q) => STEP_LABELS[q] ?? q)
                        .join(", ")}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-ink-500">
                      {r.joinedAt.slice(0, 10)}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-[12.5px] text-ink-500">
                      {r.invitedBy
                        ? `${r.invitedBy.slice(0, 6)}…${r.invitedBy.slice(-4)}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown?.length === 0 && (
              <p className="px-4 py-8 text-center text-[14px] text-ink-400">
                Nobody matches.
              </p>
            )}
          </div>
          <p className="mt-3 text-[12.5px] text-ink-400">
            Friends shows qualified / joined. X profile is the snapshot taken
            when the account linked X, which its referral was scored from. Held
            accounts are off the public board and listed last.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper-sheet px-4 py-4">
      <dt className="label">{label}</dt>
      <dd className="num mt-2 text-[24px] leading-none text-ink">
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

function download(rows: ExportRow[]) {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "rank",
    "wallet",
    "x_handle",
    "x_post",
    "x_followers",
    "x_verified",
    "x_created_at",
    "referral_status",
    "points",
    "friends_qualified",
    "friends_joined",
    "referral_wp",
    "invited_by",
    "steps",
    "joined_at",
    "held",
  ];
  const lines = rows.map((r) =>
    [
      r.rank,
      r.address,
      r.x,
      r.xPost,
      r.xFollowers,
      r.xVerified === null ? "" : r.xVerified ? "yes" : "no",
      r.xCreatedAt,
      r.referralStatus,
      r.points,
      r.referrals,
      r.invited,
      r.referralWp,
      r.invitedBy,
      r.quests,
      r.joinedAt,
      r.hidden ? "yes" : "",
    ]
      .map(cell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `writ-early-access-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
