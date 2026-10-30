import { randomInt } from "node:crypto";

import { getAddress } from "viem";

import { coreAbi } from "@/lib/abi";
import { deployment } from "@/lib/deployments";
import { publicClient } from "@/lib/desk/client";
import { X_HANDLE, X_POST_ID } from "@/lib/site";

import { getDb, type Query } from "./db";
import { EarlyError } from "./errors";
import {
  audienceTier,
  CODE_ALPHABET,
  isCode,
  MIN_X_ACCOUNT_DAYS,
  questById,
  REFERRAL_BASE_LIMIT,
  REFERRAL_BASE_WP,
  VERIFIED_BONUS_WP,
  X_STEPS,
  type QuestId,
} from "./quests";
import type { Account, Board, ExportRow, Signal } from "./types";
import { followCheckReady, followsUs } from "./xfollow";
import { likeFromCode, xConnectReady, type LikeRead, type XProfile } from "./xoauth";
import { postCheckReady, postedAt, postFacts, postIdFrom, repostedBy } from "./xpost";

/** The testnet step is listed but stays closed until the desk's maker is funded. */
export const testnetQuestOpen = () => process.env.EARLY_TESTNET_QUEST === "on";

/** X accounts are linked by signing in to them (Sign in with X); referrals qualify that way. */
export const xConnectOpen = () => xConnectReady();

/** The X steps are checked on X against the linked account, so they need both sets of X keys. */
export const followQuestOpen = () => xConnectReady() && followCheckReady();
export const postQuestOpen = () => xConnectReady() && postCheckReady();

/** Why linking an X account was refused, for the message the page shows. */
export class XLinkError extends Error {
  constructor(readonly reason: "taken" | "locked") {
    super(reason);
  }
}

const pointsFor = (id: QuestId) => questById(id)!.points;

function newCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const isUniqueViolation = (err: unknown) => (err as { code?: unknown })?.code === "23505";

/** Credits a step once. Returns false when it was already done. */
async function award(q: Query, address: string, quest: QuestId, detail: string | null) {
  const added = await q(
    `insert into early_quests (address, quest, points, detail) values ($1, $2, $3, $4)
     on conflict do nothing returning quest`,
    [address, quest, pointsFor(quest), detail],
  );
  if (added.length === 0) return false;
  await q(`update early_users set points = points + $2 where address = $1`, [address, pointsFor(quest)]);
  return true;
}

const credited = async (q: Query, address: string, quest: QuestId) =>
  (await q(`select 1 from early_quests where address = $1 and quest = $2`, [address, quest])).length > 0;

async function xStepCredited(q: Query, address: string) {
  for (const quest of X_STEPS) if (await credited(q, address, quest)) return true;
  return false;
}

/**
 * First sign-in creates the account, which is the first step, and records
 * whose invite link brought the person. Later sign-ins change nothing, so the
 * inviter can never be changed.
 */
export async function signIn(wallet: string, ref: string | null) {
  const address = wallet.toLowerCase();
  const code = ref?.trim().toUpperCase() ?? "";
  const db = await getDb();
  await db.tx(async (q) => {
    if ((await q(`select 1 from early_users where address = $1`, [address])).length) return;
    const referrer = isCode(code)
      ? ((await q<{ address: string }>(`select address from early_users where code = $1`, [code]))[0]?.address ?? null)
      : null;
    for (let attempt = 0; ; attempt++) {
      const created = await q(
        `insert into early_users (address, code, referred_by) values ($1, $2, $3)
         on conflict do nothing returning address`,
        [address, newCode(), referrer],
      );
      if (created.length) break;
      // Either a parallel sign-in created the account, or the code was taken.
      if ((await q(`select 1 from early_users where address = $1`, [address])).length) return;
      if (attempt >= 4) throw new Error("could not allocate an invite code");
    }
    await award(q, address, "waitlist", null);
  });
}

type RewardRow = {
  x_username: string | null;
  base_wp: number;
  audience_wp: number;
  verified_wp: number;
  total_wp: number;
  x_followers: number | null;
  created_at: Date | string;
};

const toSignal = (r: RewardRow): Signal => ({
  username: r.x_username ?? "",
  base: r.base_wp,
  audience: r.audience_wp,
  verified: r.verified_wp,
  total: r.total_wp,
  tier: r.audience_wp > 0 ? (audienceTier(r.x_followers ?? 0)?.label ?? null) : null,
  at: new Date(r.created_at).toISOString(),
});

export async function getAccount(wallet: string): Promise<Account | null> {
  const address = wallet.toLowerCase();
  const db = await getDb();
  const [user] = await db.query<{
    code: string;
    points: number;
    referrals: number;
    x_handle: string | null;
    x_id: string | null;
    referred_by: string | null;
    hidden: boolean;
  }>(`select code, points, referrals, x_handle, x_id, referred_by, hidden from early_users where address = $1`, [
    address,
  ]);
  if (!user) return null;

  const [quests, [standing], [invites], [earned], recent] = await Promise.all([
    db.query<{ quest: QuestId }>(`select quest from early_quests where address = $1 order by done_at`, [address]),
    db.query<{ rank: number; total: number }>(
      `select
         (select count(*)::int from early_users o
           where not o.hidden
             and (o.points > me.points or (o.points = me.points and o.joined_at < me.joined_at))) + 1 as rank,
         (select count(*)::int from early_users where not hidden) as total
       from early_users me where me.address = $1`,
      [address],
    ),
    db.query<{ joined: number }>(`select count(*)::int as joined from early_users where referred_by = $1`, [address]),
    db.query<{ points: number }>(
      `select coalesce(sum(total_wp), 0)::int as points from early_referral_rewards
        where referrer = $1 and status = 'qualified'`,
      [address],
    ),
    db.query<RewardRow>(
      `select x_username, base_wp, audience_wp, verified_wp, total_wp, x_followers, created_at
         from early_referral_rewards where referrer = $1 and status = 'qualified'
        order by created_at desc limit 5`,
      [address],
    ),
  ]);

  return {
    address: getAddress(address),
    code: user.code,
    points: user.points,
    rank: user.hidden ? null : standing.rank,
    total: standing.total,
    referrals: { counted: user.referrals, joined: invites.joined, points: earned.points, recent: recent.map(toSignal) },
    x: user.x_id ? user.x_handle : null,
    done: quests.map((r) => r.quest),
    invited: user.referred_by !== null,
  };
}

export async function completeQuest(wallet: string, quest: string, input: { url?: unknown }) {
  const address = wallet.toLowerCase();
  const db = await getDb();
  if (!(await db.query(`select 1 from early_users where address = $1`, [address])).length) {
    throw new EarlyError("Sign in first.", 401);
  }
  switch (quest) {
    case "follow_x":
      return confirmFollow(address);
    case "post_x":
      return confirmPost(address, typeof input.url === "string" ? input.url : "");
    case "repost_x":
      return confirmRepost(address);
    case "testnet":
      return confirmTestnet(address);
    default:
      throw new EarlyError("There is no such step.", 404);
  }
}

/**
 * The post is looked up on X: its author must be the linked X account (by X
 * user id) and it must carry this account's invite link. A post counts for
 * one wallet only, and each post is read from X once.
 */
async function confirmPost(address: string, url: string) {
  if (!postQuestOpen()) throw new EarlyError("This step opens soon.", 409);
  const id = postIdFrom(url.slice(0, 300));
  if (!id) throw new EarlyError("Paste the link to your post. It looks like x.com/you/status/1234…");

  const db = await getDb();
  if (await credited(db.query, address, "post_x")) return;
  const [me] = await db.query<{ code: string; x_id: string | null; joined_at: Date | string }>(
    `select code, x_id, joined_at from early_users where address = $1`,
    [address],
  );
  if (!me.x_id) throw new EarlyError("Connect your X account first, then post from it.", 409);
  if ((await db.query(`select 1 from early_users where x_post_id = $1 and address <> $2`, [id, address])).length) {
    throw new EarlyError("That post is already linked to another wallet.", 409);
  }
  // The invite link is made at sign-in, so a post written before it cannot
  // carry it; no need to ask X. Ten minutes allow for clocks that disagree.
  if (postedAt(id) < new Date(me.joined_at).getTime() - 10 * 60_000) {
    throw new EarlyError(
      "That post is older than your sign-in here. Post the text from the button above, then paste the new link.",
      422,
    );
  }

  let facts;
  let spent = false;
  try {
    facts = await postFacts(id, async () => {
      await spendXCheck(db.query, address);
      spent = true;
    });
  } catch (err) {
    if (err instanceof EarlyError) throw err;
    console.error("[early] post lookup failed:", err instanceof Error ? err.message : err);
    if (spent) await refundXCheck(db.query, address);
    throw new EarlyError("X did not answer. Try again in a minute.", 503);
  }
  if (!facts) throw new EarlyError("We could not open that post. Check the link, and that your account is public.", 422);
  if (facts.authorId !== me.x_id) throw new EarlyError("We couldn't verify this post from your connected X account.", 422);
  if (!facts.codes.includes(me.code)) {
    throw new EarlyError(
      "We found your post, but not your invite link in it. Post the text from the button above, then paste the new link.",
      422,
    );
  }

  try {
    await db.tx(async (q) => {
      await q(`update early_users set x_post_id = $2 where address = $1`, [address, id]);
      await award(q, address, "post_x", `https://x.com/i/status/${id}`);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new EarlyError("That post is already linked to another wallet.", 409);
    throw err;
  }
}

/**
 * Credits the follow step to everyone whose linked X account now shows up in
 * the follower copy. Someone who checked while X could not be read (busy, or
 * reads paused for the day) is settled as soon as a later read, anyone's,
 * finds the follow, without having to press check again.
 */
async function creditFoundFollowers() {
  if (!followQuestOpen()) return;
  try {
    const db = await getDb();
    const due = await db.query<{ address: string; x_handle: string | null }>(
      `select u.address, u.x_handle from early_users u
         join early_x_followers f on f.x_id = u.x_id
        where not exists (select 1 from early_quests q where q.address = u.address and q.quest = 'follow_x')
        limit 200`,
    );
    for (const u of due) await db.tx((q) => award(q, u.address, "follow_x", `@${u.x_handle ?? ""}`));
  } catch (err) {
    console.error("[early] crediting found followers failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * The repost is looked for on X, among the linked account's posts of the last
 * seven days, so a repost cannot be claimed for an account that is not yours.
 */
async function confirmRepost(address: string) {
  if (!postQuestOpen()) throw new EarlyError("This step opens soon.", 409);
  const db = await getDb();
  if (await credited(db.query, address, "repost_x")) return;
  const [me] = await db.query<{ x_handle: string | null; x_id: string | null }>(
    `select x_handle, x_id from early_users where address = $1`,
    [address],
  );
  if (!me.x_id || !me.x_handle) {
    throw new EarlyError("Connect your X account first, so we know which account to check.", 409);
  }

  await spendXCheck(db.query, address);
  let found;
  try {
    found = await repostedBy(me.x_handle, me.x_id, X_POST_ID);
  } catch (err) {
    console.error("[early] repost check failed:", err instanceof Error ? err.message : err);
    await refundXCheck(db.query, address);
    throw new EarlyError("X did not answer. Try again in a minute.", 503);
  }
  if (!found) {
    throw new EarlyError(
      `We do not see a repost from @${me.x_handle} in the last 7 days. Repost, then check again in a minute.`,
      422,
    );
  }
  await db.tx((q) => award(q, address, "repost_x", `@${me.x_handle}`));
}

/** How a like check came out; the page shows it from ?x=. */
export type LikeOutcome = "liked" | "notliked" | "likeother" | "likenox" | "likelimit" | "likefailed";

const LIKE_OUTCOMES: Record<Exclude<LikeRead, "yes">, LikeOutcome> = { no: "notliked", other: "likeother" };

/**
 * X keeps likes private and its list of who liked a post stops at 100 people,
 * so the like is read from the person's own side: one more Sign in with X, on
 * the account linked to the wallet, allowed to read that account's likes.
 */
export async function confirmLike(
  wallet: string,
  code: string,
  verifier: string,
  redirect: string,
): Promise<LikeOutcome> {
  const address = wallet.toLowerCase();
  const db = await getDb();
  if (await credited(db.query, address, "like_x")) return "liked";
  const [me] = await db.query<{ x_handle: string | null; x_id: string | null }>(
    `select x_handle, x_id from early_users where address = $1`,
    [address],
  );
  if (!me?.x_id) return "likenox";

  try {
    await spendXCheck(db.query, address);
  } catch (err) {
    if (err instanceof EarlyError) return "likelimit";
    throw err;
  }
  let read: LikeRead;
  try {
    read = await likeFromCode(code, verifier, redirect, me.x_id, X_POST_ID);
  } catch (err) {
    console.error("[early] like check failed:", err instanceof Error ? err.message : err);
    await refundXCheck(db.query, address);
    return "likefailed";
  }
  if (read !== "yes") return LIKE_OUTCOMES[read];
  await db.tx((q) => award(q, address, "like_x", `@${me.x_handle ?? ""}`));
  return "liked";
}

/**
 * Every check that reads X costs the app's credit, and anyone signed in could
 * press one again and again. A real step needs one check, or a few when a post
 * has just been made or a link is pasted wrong; this many a day per wallet,
 * across the post, like and repost steps, leaves room for that. Posts already
 * read before are free and not counted.
 */
const X_CHECKS_PER_DAY = 20;

async function spendXCheck(query: Query, address: string) {
  const rows = await query(
    `update early_users
        set post_checks = case when post_checks_day = current_date then post_checks + 1 else 1 end,
            post_checks_day = current_date
      where address = $1 and (post_checks_day is distinct from current_date or post_checks < $2)
      returning post_checks`,
    [address, X_CHECKS_PER_DAY],
  );
  if (rows.length === 0) {
    throw new EarlyError(`That is ${X_CHECKS_PER_DAY} checks on X today, the daily limit. Try again tomorrow.`, 429);
  }
}

/** X answered nothing, so the try does not count against the day's checks. */
const refundXCheck = (query: Query, address: string) =>
  query(
    `update early_users set post_checks = greatest(post_checks - 1, 0)
      where address = $1 and post_checks_day = current_date`,
    [address],
  ).catch(() => {});

/**
 * The follow is checked on X for the linked X account, so nobody can claim a
 * follow for an account that is not theirs. Linking checks it once already;
 * this is the button for checking again.
 */
async function confirmFollow(address: string) {
  if (!followQuestOpen()) throw new EarlyError("This step opens soon.", 409);
  const db = await getDb();
  const [me] = await db.query<{ x_handle: string | null; x_id: string | null }>(
    `select x_handle, x_id from early_users where address = $1`,
    [address],
  );
  if (!me.x_id) throw new EarlyError("Connect your X account first, so we know which account to check.", 409);
  const handle = me.x_handle ?? "";
  const found = await followsUs(handle, me.x_id);
  await creditFoundFollowers();
  if (found === "busy") throw new EarlyError("We could not check X just now. Try again in a few minutes.", 503);
  if (found === "paused") {
    throw new EarlyError(
      "Follow checks are paused until 00:00 UTC, when X's daily limit resets. Your follow is safe: check again after that.",
      503,
    );
  }
  if (found === "soon") {
    throw new EarlyError("We read new followers once a minute. If you just followed, check again in a minute.", 422);
  }
  if (found === "no") {
    throw new EarlyError(
      `We do not see @${handle} among @${X_HANDLE}'s followers yet. Follow, then check again in a minute.`,
      422,
    );
  }
  await db.tx((q) => award(q, address, "follow_x", `@${handle}`));
}

/**
 * Links the X account that Sign in with X proved to the signed-in wallet, with
 * the profile snapshot read at sign-in: one X account per wallet and one wallet
 * per X account, by X user id. Until an X step is credited or the account's own
 * referral is decided, the wallet can switch to another X account; after that
 * the link is fixed. Linking decides the referral (Bring the Signal) and checks
 * the follow at once. Returns how the referral went, for the page.
 */
export async function linkX(wallet: string, x: XProfile): Promise<"qualified" | "too_new" | null> {
  const address = wallet.toLowerCase();
  const db = await getDb();
  try {
    await db.tx(async (q) => {
      const [me] = await q<{ x_id: string | null; locked: boolean }>(
        `select x_id, referral_locked_at is not null as locked from early_users where address = $1 for update`,
        [address],
      );
      if (!me) throw new EarlyError("Sign in first.", 401);
      if (me.x_id === x.id) {
        // The same account again: keep its current username, and a fresh snapshot until the referral is decided.
        await q(
          me.locked
            ? `update early_users set x_handle = $2 where address = $1`
            : `update early_users set x_handle = $2, x_followers = $3, x_verified = $4, x_created_at = $5,
                      x_snapshot_at = now() where address = $1`,
          me.locked ? [address, x.username] : [address, x.username, x.followers, x.verified, x.createdAt],
        );
        return;
      }
      if (me.x_id && (me.locked || (await xStepCredited(q, address)))) throw new XLinkError("locked");
      if ((await q(`select 1 from early_users where address <> $1 and x_id = $2`, [address, x.id])).length) {
        throw new XLinkError("taken");
      }
      await q(
        `update early_users set x_id = $2, x_handle = $3, x_followers = $4, x_verified = $5, x_created_at = $6,
                x_snapshot_at = now() where address = $1`,
        [address, x.id, x.username, x.followers, x.verified, x.createdAt],
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new XLinkError("taken");
    throw err;
  }

  const referral = await qualifyReferral(address);

  if (followQuestOpen()) {
    try {
      if ((await followsUs(x.username, x.id)) === "yes") {
        await db.tx((q) => award(q, address, "follow_x", `@${x.username}`));
      }
      await creditFoundFollowers();
    } catch (err) {
      console.error("[early] follow check after X sign-in:", err instanceof Error ? err.message : err);
    }
  }
  return referral;
}

/**
 * Bring the Signal. A friend who came through an invite link qualifies once
 * they have a wallet and a linked X account at least 30 days old. The inviter
 * then gets 120 WP on each of their first ten qualified referrals, plus the
 * Signal Bonuses on every one: the audience tier reached by the friend's
 * followers and 75 WP for a verified account, all from the snapshot taken when
 * the friend linked X. The outcome is written once (the friend's row is the
 * key), together with what it was scored from, and the friend's inviter and X
 * account are fixed from then on. A young account or a self-referral is
 * written as such and pays nothing.
 */
async function qualifyReferral(address: string): Promise<"qualified" | "too_new" | null> {
  const db = await getDb();
  return db.tx(async (q) => {
    const [me] = await q<{
      referred_by: string | null;
      x_id: string | null;
      x_handle: string | null;
      x_followers: number | null;
      x_verified: boolean | null;
      x_created_at: Date | string | null;
    }>(
      `select referred_by, x_id, x_handle, x_followers, x_verified, x_created_at
         from early_users where address = $1 for update`,
      [address],
    );
    if (!me?.referred_by || !me.x_id) return null;
    if ((await q(`select 1 from early_referral_rewards where referred = $1`, [address])).length) return null;
    const [inviter] = await q<{ address: string; x_id: string | null; referrals: number }>(
      `select address, x_id, referrals from early_users where address = $1 for update`,
      [me.referred_by],
    );
    if (!inviter) return null;

    const write = (status: string, base: number, audience: number, verified: number) =>
      q(
        `insert into early_referral_rewards
           (referred, referrer, status, base_wp, audience_wp, verified_wp, total_wp,
            x_id, x_username, x_followers, x_verified, x_created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (referred) do nothing returning referred`,
        [
          address,
          inviter.address,
          status,
          base,
          audience,
          verified,
          base + audience + verified,
          me.x_id,
          me.x_handle,
          me.x_followers,
          me.x_verified,
          me.x_created_at,
        ],
      );
    const lock = () => q(`update early_users set referral_locked_at = now() where address = $1`, [address]);

    if (inviter.address === address || (inviter.x_id !== null && inviter.x_id === me.x_id)) {
      if ((await write("self_referral", 0, 0, 0)).length) await lock();
      return null;
    }
    const createdAt = me.x_created_at ? new Date(me.x_created_at).getTime() : NaN;
    if (!Number.isFinite(createdAt) || Date.now() - createdAt < MIN_X_ACCOUNT_DAYS * 86_400_000) {
      if ((await write("account_too_new", 0, 0, 0)).length) await lock();
      return "too_new";
    }

    const base = inviter.referrals < REFERRAL_BASE_LIMIT ? REFERRAL_BASE_WP : 0;
    const audience = audienceTier(me.x_followers ?? 0)?.wp ?? 0;
    const verified = me.x_verified ? VERIFIED_BONUS_WP : 0;
    if (!(await write("qualified", base, audience, verified)).length) return null;
    await q(`update early_users set points = points + $2, referrals = referrals + 1 where address = $1`, [
      inviter.address,
      base + audience + verified,
    ]);
    await lock();
    return "qualified";
  });
}

async function confirmTestnet(address: string) {
  if (!testnetQuestOpen()) throw new EarlyError("This step opens with the next testnet round.", 409);
  let ids: readonly bigint[];
  try {
    ids = await publicClient.readContract({
      abi: coreAbi,
      address: deployment.core,
      functionName: "getWriterPositionIds",
      args: [getAddress(address)],
    });
  } catch {
    throw new EarlyError("GIWA did not answer. Try again in a minute.", 503);
  }
  if (ids.length === 0) {
    throw new EarlyError("No position from this wallet yet. Open one on the desk, then check again.", 422);
  }
  const db = await getDb();
  await db.tx((q) => award(q, address, "testnet", `position #${ids[0]}`));
}

const short = (address: string) => {
  const a = getAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
};

export async function leaderboard(limit = 10): Promise<Board> {
  const db = await getDb();
  const [rows, [count]] = await Promise.all([
    db.query<{ address: string; points: number; referrals: number }>(
      `select address, points, referrals from early_users
       where not hidden order by points desc, joined_at asc limit $1`,
      [limit],
    ),
    db.query<{ total: number }>(`select count(*)::int as total from early_users where not hidden`),
  ]);
  return {
    total: count.total,
    top: rows.map((r, i) => ({ rank: i + 1, wallet: short(r.address), points: r.points, referrals: r.referrals })),
  };
}

/** Everyone, in board order, for the team's review. Held-back accounts come last. */
export async function exportAll(): Promise<ExportRow[]> {
  const db = await getDb();
  const rows = await db.query<{
    address: string;
    x_handle: string | null;
    x_post_id: string | null;
    x_followers: number | null;
    x_verified: boolean | null;
    x_created_at: Date | string | null;
    points: number;
    referrals: number;
    hidden: boolean;
    joined_at: Date | string;
    invited_by: string | null;
    invited: number;
    quests: string;
    referral_status: string | null;
    referral_wp: number;
  }>(
    `select u.address, u.x_handle, u.x_post_id, u.x_followers, u.x_verified, u.x_created_at,
            u.points, u.referrals, u.hidden, u.joined_at,
            u.referred_by as invited_by,
            (select count(*)::int from early_users r where r.referred_by = u.address) as invited,
            coalesce((select string_agg(q.quest, ' ' order by q.done_at) from early_quests q
                      where q.address = u.address), '') as quests,
            (select status from early_referral_rewards rr where rr.referred = u.address) as referral_status,
            (select coalesce(sum(total_wp), 0)::int from early_referral_rewards rr
              where rr.referrer = u.address and rr.status = 'qualified') as referral_wp
       from early_users u
      order by u.hidden, u.points desc, u.joined_at`,
  );
  let rank = 0;
  return rows.map((r) => ({
    rank: r.hidden ? null : ++rank,
    address: getAddress(r.address),
    x: r.x_handle,
    xPost: r.x_post_id ? `https://x.com/i/status/${r.x_post_id}` : null,
    points: r.points,
    referrals: r.referrals,
    invited: r.invited,
    invitedBy: r.invited_by ? getAddress(r.invited_by) : null,
    quests: r.quests,
    joinedAt: new Date(r.joined_at).toISOString(),
    hidden: r.hidden,
    xFollowers: r.x_followers,
    xVerified: r.x_verified,
    xCreatedAt: r.x_created_at ? new Date(r.x_created_at).toISOString() : null,
    referralStatus: r.referral_status,
    referralWp: r.referral_wp,
  }));
}
