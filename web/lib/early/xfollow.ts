import { X_HANDLE } from "@/lib/site";

import { getDb, type Db } from "./db";
import { ownerGet, ownerReady, XApiError } from "./xapi";

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
 * A page meets the copy on file when its last few followers are all on file.
 * One is not enough: someone stored earlier who unfollowed and followed again
 * is listed among the new followers, and could end a read above people still
 * unread.
 */
const SETTLED_TAIL = 3;
/** The full read, in X's largest pages, a dozen per sync; a longer list resumes on the next. */
const BACKFILL_PAGE = 1000;
const MAX_BACKFILL_PAGES = 12;
/** X allows 15 follower reads per 15 minutes; after a burst of them, the next sync waits a window. */
const RATE_WINDOW_SECONDS = 15 * 60;

const syncGapSeconds = () => Math.min(3600, Math.max(1, Number(process.env.X_SYNC_GAP_SECONDS) || 60));
/** Followers read per UTC day; at owned-read prices 5,000 is $5. */
const dailyReadLimit = () => Math.max(0, Number(process.env.X_DAILY_READ_LIMIT) || 5000);

/** The follow step opens once the site can read @Writ_Fi's followers. */
export const followCheckReady = () => ownerReady();

/** "paused": today's read limit is spent; reads resume at 00:00 UTC. "busy": X can't be read right now. */
export type FollowCheck = "yes" | "no" | "busy" | "paused";

/** `xId`, when known from Sign in with X, still matches after a username change. */
export async function followsUs(handle: string, xId?: string | null): Promise<FollowCheck> {
  const db = await getDb();
  if (await onFile(db, handle, xId)) return "yes";
  let synced: SyncOutcome;
  try {
    synced = await sync(db);
  } catch (err) {
    console.error("[early] X follower sync failed:", err instanceof Error ? err.message : err);
    return "busy";
  }
  if (await onFile(db, handle, xId)) return "yes";
  return synced === "capped" ? "paused" : synced === "held" ? "busy" : "no";
}

/** By X user id when known: a username can pass to someone else after a rename. */
async function onFile(db: Db, handle: string, xId?: string | null) {
  const rows = xId
    ? await db.query(`select 1 from early_x_followers where x_id = $1`, [xId])
    : await db.query(`select 1 from early_x_followers where lower(username) = lower($1)`, [handle]);
  return rows.length > 0;
}

type SyncState = {
  account_id: string | null;
  backfilled: boolean;
  day: string | null;
  used: number;
  full_token: string | null;
};

/**
 * "recent": another check read a moment ago. "held": waiting out X's rate
 * window. "capped": today's read limit is spent.
 */
type SyncOutcome = "done" | "recent" | "held" | "capped";

/** Reads the newest followers into the database, unless another check did a moment ago. */
async function sync(db: Db): Promise<SyncOutcome> {
  const gap = syncGapSeconds();
  const today = new Date().toISOString().slice(0, 10);
  // Claim the next sync: one at a time across every instance, one per gap.
  const [state] = await db.query<SyncState>(
    `update early_x_sync set last_sync = now()
     where id = 1 and (last_sync is null or last_sync < now() - interval '${gap} seconds')
     returning account_id, backfilled, day, used, full_token`,
  );
  if (!state) {
    // Not this check's turn. Say why when it matters to the person waiting.
    const [s] = await db.query<{ day: string | null; used: number; held: boolean }>(
      `select day, used, last_sync > now() as held from early_x_sync where id = 1`,
    );
    if (s?.held) return "held";
    if (s && s.day === today && s.used + FIRST_PAGE > dailyReadLimit()) return "capped";
    return "recent";
  }

  const usedToday = state.day === today ? state.used : 0;
  const account = state.account_id ?? (await ownAccountId());
  const full = !state.backfilled;
  let read = 0;
  let requests = 0;
  let capped = false;
  // Whether the copy on file runs unbroken from the newest follower down. Only
  // then may an incremental read stop where it meets the copy.
  let whole = state.backfilled;
  // Where an unfinished full read picks up again.
  let resumeAt: string | null = state.full_token;
  let holdSeconds = 0;
  let failure: unknown = null;

  if (full) {
    // A full read takes many requests: keep other checks from starting one alongside it.
    await db.query(`update early_x_sync set last_sync = now() + make_interval(secs => $1::double precision) where id = 1`, [
      RATE_WINDOW_SECONDS - gap,
    ]);
  }

  try {
    if (full) {
      // Pages are stored as they come; until the read reaches the end, the
      // copy is not treated as whole, so nothing relies on it being complete.
      let token = state.full_token ?? undefined;
      let finished = false;
      for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
        if (usedToday + read + BACKFILL_PAGE > dailyReadLimit()) {
          capped = true;
          break;
        }
        requests++;
        const res = await followers(account, BACKFILL_PAGE, token);
        read += res.users.length;
        await store(db, res.users);
        token = res.next;
        resumeAt = token ?? null;
        if (!token) {
          finished = true;
          break;
        }
      }
      whole = finished;
    } else {
      // Newest first. Pages are held back until the read meets the copy on
      // file: stored any earlier, a read cut short by an error or the daily
      // limit would leave a hole that the next read, stopping where it meets
      // stored followers, never fills. Cut short, nothing is stored and the
      // next read starts over from the newest follower.
      let token: string | undefined;
      const walked: XUser[] = [];
      let met = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const size = page === 0 ? FIRST_PAGE : PAGE;
        if (usedToday + read + size > dailyReadLimit()) {
          capped = true;
          break;
        }
        requests++;
        const res = await followers(account, size, token);
        read += res.users.length;
        walked.push(...res.users);
        const tail = res.users.slice(-SETTLED_TAIL);
        if (!res.next || (tail.length > 0 && (await knownIds(db, tail)).size === tail.length)) {
          met = true;
          break;
        }
        token = res.next;
      }
      if (met) {
        await store(db, walked);
      } else if (!capped) {
        // More new followers than one read covers: keep them, and read the
        // whole list next to fill whatever lies between.
        await store(db, walked);
        whole = false;
        resumeAt = null;
        // That took most of X's window; the full read that follows needs a fresh one.
        holdSeconds = RATE_WINDOW_SECONDS;
      }
    }
  } catch (err) {
    failure = err;
    if (err instanceof XApiError && err.status === 429) holdSeconds = RATE_WINDOW_SECONDS;
    // X no longer takes the saved place in the list: start the full read over.
    if (full && err instanceof XApiError && err.status === 400) resumeAt = null;
  }
  // A full read spends most of X's window; let it refill before the next read.
  if (full && requests > 1) holdSeconds = RATE_WINDOW_SECONDS;

  // Additive and one-way, so two syncs that overlap cannot undo each other:
  // only a finished full read marks the copy whole, and usage adds up.
  await db.query(
    `update early_x_sync set
       account_id = $1,
       backfilled = case when $2::boolean then $3::boolean else backfilled and $3::boolean end,
       full_token = $4,
       used = case when day = $5 then used + $6::integer else $6::integer end,
       day = $5,
       last_sync = now() + make_interval(secs => $7::double precision)
     where id = 1`,
    [account, full, whole, resumeAt, today, read, holdSeconds > 0 ? holdSeconds - gap : 0],
  );
  if (failure) throw failure;
  if (capped) console.warn(`[early] X follower reads paused until 00:00 UTC: ${usedToday + read} of ${dailyReadLimit()} used`);
  return capped ? "capped" : "done";
}

interface XUser {
  id: string;
  username: string;
}

async function knownIds(db: Db, users: XUser[]) {
  if (users.length === 0) return new Set<string>();
  const marks = users.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.query<{ x_id: string }>(
    `select x_id from early_x_followers where x_id in (${marks})`,
    users.map((u) => u.id),
  );
  return new Set(rows.map((r) => r.x_id));
}

/** Saves followers; one already on file keeps its row, with the username brought up to date. */
async function store(db: Db, users: XUser[]) {
  // Someone can show up on two pages when the list shifts between reads, and
  // one insert may not touch a row twice. The first sighting is the newest.
  const unique = [...new Map([...users].reverse().map((u) => [u.id, u])).values()];
  // One statement per thousand rows keeps well under Postgres's parameter limit.
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const rows = chunk.map((_, j) => `($${2 * j + 1}, $${2 * j + 2})`).join(", ");
    await db.query(
      `insert into early_x_followers (x_id, username) values ${rows}
       on conflict (x_id) do update set username = excluded.username`,
      chunk.flatMap((u) => [u.id, u.username]),
    );
  }
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

