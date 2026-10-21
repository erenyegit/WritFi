import { X_HANDLE } from "@/lib/site";

import { getDb, type Db } from "./db";
import { ownerGet, ownerReady } from "./xapi";

/**
 * Checks that an X account follows @Writ_Fi, against X's own follower list.
 *
 * The X API is paid per resource read. Reading your own followers is an
 * "owned read", a tenth of the usual price, when the request is signed as the
 * account that owns the developer app. So the site reads as @Writ_Fi itself
 * (OAuth 1.0a, with that account's access token) and keeps a copy of the
 * follower list in the database: the first sync reads it in full once; after
 * that only the newest followers are read, at most once a minute across every
 * server, and within a daily cap. A check is a database lookup, plus one
 * small read when the account is not on file yet.
 *
 * There is no single "does A follow B" read in the X API without keeping the
 * person's own token, which the site does not keep; this is the cheap way
 * that still asks X. Without the X keys the follow step stays closed rather
 * than taking anyone's word for it.
 */

/** First page of an incremental sync: X lists the newest followers first. */
const FIRST_PAGE = 25;
const PAGE = 100;
const MAX_PAGES = 10;
/**
 * The one full read, in X's largest pages, kept under X's 15 follower reads
 * per 15 minutes. Past 12,000 followers the oldest are left out.
 */
const BACKFILL_PAGE = 1000;
const MAX_BACKFILL_PAGES = 12;

const syncGapSeconds = () => Math.min(3600, Math.max(1, Number(process.env.X_SYNC_GAP_SECONDS) || 60));
/** Followers read per UTC day by incremental syncs; at owned-read prices 5,000 is $5. */
const dailyReadLimit = () => Math.max(0, Number(process.env.X_DAILY_READ_LIMIT) || 5000);

/** The follow step opens once the site can read @Writ_Fi's followers. */
export const followCheckReady = () => ownerReady();

export type FollowCheck = "yes" | "no" | "busy";

/** `xId`, when known from Sign in with X, still matches after a username change. */
export async function followsUs(handle: string, xId?: string | null): Promise<FollowCheck> {
  const db = await getDb();
  if (await onFile(db, handle, xId)) return "yes";
  let synced: "done" | "recent" | "capped";
  try {
    synced = await sync(db);
  } catch (err) {
    console.error("[early] X follower sync failed:", err instanceof Error ? err.message : err);
    return "busy";
  }
  if (await onFile(db, handle, xId)) return "yes";
  return synced === "capped" ? "busy" : "no";
}

async function onFile(db: Db, handle: string, xId?: string | null) {
  const rows = await db.query(`select 1 from early_x_followers where x_id = $2 or lower(username) = lower($1)`, [
    handle,
    xId ?? "",
  ]);
  return rows.length > 0;
}

type SyncState = {
  account_id: string | null;
  backfilled: boolean;
  day: string | null;
  used: number;
};

/** Reads the newest followers into the database, unless another check did a moment ago. */
async function sync(db: Db): Promise<"done" | "recent" | "capped"> {
  // Claim the next sync: one at a time across every instance, one per gap.
  const [state] = await db.query<SyncState>(
    `update early_x_sync set last_sync = now()
     where id = 1 and (last_sync is null or last_sync < now() - interval '${syncGapSeconds()} seconds')
     returning account_id, backfilled, day, used`,
  );
  if (!state) return "recent";

  const today = new Date().toISOString().slice(0, 10);
  const usedToday = state.day === today ? state.used : 0;
  const account = state.account_id ?? (await ownAccountId());
  let read = 0;
  let capped = false;

  if (!state.backfilled) {
    let token: string | undefined;
    for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
      const res = await followers(account, BACKFILL_PAGE, token);
      read += res.users.length;
      await store(db, res.users);
      token = res.next;
      if (!token) break;
    }
  } else {
    let token: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const size = page === 0 ? FIRST_PAGE : PAGE;
      if (usedToday + read + size > dailyReadLimit()) {
        capped = true;
        break;
      }
      const res = await followers(account, size, token);
      read += res.users.length;
      // Newest first: once a page holds someone already on file, the rest are on file too.
      if ((await store(db, res.users)) > 0 || !res.next) break;
      token = res.next;
    }
  }

  await db.query(`update early_x_sync set account_id = $1, backfilled = true, day = $2, used = $3 where id = 1`, [
    account,
    today,
    usedToday + read,
  ]);
  return capped ? "capped" : "done";
}

interface XUser {
  id: string;
  username: string;
}

/** Saves a page of followers. Returns how many of them were already on file. */
async function store(db: Db, users: XUser[]) {
  if (users.length === 0) return 0;
  const marks = users.map((_, i) => `$${i + 1}`).join(", ");
  const known = await db.query<{ x_id: string }>(
    `select x_id from early_x_followers where x_id in (${marks})`,
    users.map((u) => u.id),
  );
  const fresh = users.filter((u) => !known.some((k) => k.x_id === u.id));
  if (fresh.length) {
    const rows = fresh.map((_, i) => `($${2 * i + 1}, $${2 * i + 2})`).join(", ");
    await db.query(
      `insert into early_x_followers (x_id, username) values ${rows}
       on conflict (x_id) do update set username = excluded.username`,
      fresh.flatMap((u) => [u.id, u.username]),
    );
  }
  return known.length;
}

async function ownAccountId() {
  const body = await ownerGet<{ data?: XUser }>("/2/users/me", {});
  if (!body.data?.id) throw new Error("X did not return the signed-in account");
  // The keys must belong to @Writ_Fi, or the check would ask the wrong account.
  if (body.data.username.toLowerCase() !== X_HANDLE.toLowerCase()) {
    throw new Error(`the X keys belong to @${body.data.username}, not @${X_HANDLE}`);
  }
  return body.data.id;
}

async function followers(account: string, max: number, token?: string) {
  const params: Record<string, string> = { max_results: String(max) };
  if (token) params.pagination_token = token;
  const body = await ownerGet<{ data?: XUser[]; meta?: { next_token?: string } }>(
    `/2/users/${account}/followers`,
    params,
  );
  return {
    users: (body.data ?? []).map(({ id, username }) => ({ id, username })),
    next: body.meta?.next_token,
  };
}

