import { getDb } from "./db";
import { isCode } from "./quests";
import { ownerGet, ownerReady, XApiError } from "./xapi";

/**
 * Checks a post through the X API: who wrote it (by X user id, which does not
 * change with the username) and which invite codes it carries. Each post is
 * read from X once; what was found is kept, so the same post is never looked
 * up twice. X bills a post read at about $0.005.
 */

/** The post step opens once the site can read posts on X. */
export const postCheckReady = () => ownerReady();

/** The numeric id from any form of post link people paste: x.com, twitter.com, mobile, /i/web. */
export function postIdFrom(input: string): string | null {
  const m = input
    .trim()
    .match(
      /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[A-Za-z0-9_]{1,15}|i(?:\/web)?)\/status(?:es)?\/(\d{1,25})(?:[/?#].*)?$/i,
    );
  return m ? m[1] : null;
}

export interface PostFacts {
  authorId: string;
  /** Invite codes in the post's links (as X expanded them) or text. */
  codes: string[];
}

type XUrls = { urls?: { expanded_url?: string; unwound_url?: string }[] };

interface XPost {
  data?: {
    id: string;
    text?: string;
    author_id?: string;
    entities?: XUrls;
    /** A post over 280 characters: `text` stops at 280, and the rest, links included, is only here. */
    note_tweet?: { text?: string; entities?: XUrls };
  };
}

/** When a post was written, from its id: X ids carry their own timestamp. */
export function postedAt(id: string): number {
  return Number((BigInt(id) >> 22n) + 1288834974657n);
}

/**
 * What a post shows, or null when X has no public post with that id.
 * `beforeRead` runs only when the post has to be read from X, the paid case.
 */
export async function postFacts(id: string, beforeRead?: () => Promise<void>): Promise<PostFacts | null> {
  const db = await getDb();
  const [kept] = await db.query<{ author_id: string; codes: string }>(
    `select author_id, codes from early_x_posts where post_id = $1`,
    [id],
  );
  if (kept) return { authorId: kept.author_id, codes: kept.codes ? kept.codes.split(",") : [] };

  await beforeRead?.();
  let body: XPost;
  try {
    body = await ownerGet<XPost>(`/2/tweets/${id}`, { "tweet.fields": "author_id,entities,note_tweet" });
  } catch (err) {
    // Only a 404 is about the post. A 403 is X refusing the app itself (plan,
    // credit, permissions): that must reach the logs, not read as a bad link.
    if (err instanceof XApiError && err.status === 404) return null;
    throw err;
  }
  // A deleted or protected post comes back as 200 with an errors list and no data.
  if (!body.data?.author_id) return null;

  const note = body.data.note_tweet;
  const codes = codesIn(`${body.data.text ?? ""}\n${note?.text ?? ""}`, [
    ...(body.data.entities?.urls ?? []),
    ...(note?.entities?.urls ?? []),
  ]);
  await db.query(
    `insert into early_x_posts (post_id, author_id, codes) values ($1, $2, $3) on conflict (post_id) do nothing`,
    [id, body.data.author_id, codes.join(",")],
  );
  return { authorId: body.data.author_id, codes };
}

interface XSearch {
  data?: { author_id?: string; referenced_tweets?: { type?: string; id?: string }[] }[];
}

/**
 * Whether an account has reposted a post, from X's recent search, which reaches
 * back seven days. Search bills only the posts it returns, so one check costs
 * about $0.005, or nothing when no repost is found. The username finds the
 * account and the X user id confirms it: a username can pass to someone else.
 */
export async function repostedBy(username: string, xId: string, postId: string) {
  const body = await ownerGet<XSearch>("/2/tweets/search/recent", {
    query: `from:${username} retweets_of_tweet_id:${postId}`,
    max_results: "10",
    "tweet.fields": "author_id,referenced_tweets",
  });
  return (body.data ?? []).some(
    (post) =>
      post.author_id === xId && post.referenced_tweets?.some((ref) => ref.type === "retweeted" && ref.id === postId),
  );
}

/** Codes from /r/<code> links and ?ref=<code>, in the expanded links first, then in the text. */
function codesIn(text: string, urls: { expanded_url?: string; unwound_url?: string }[]) {
  const found = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(/(?:\/r\/|[?&]ref=)([A-Za-z0-9]{6})(?![A-Za-z0-9])/g)) {
      const code = m[1].toUpperCase();
      if (isCode(code)) found.add(code);
    }
  };
  for (const u of urls) {
    scan(u.expanded_url ?? "");
    scan(u.unwound_url ?? "");
  }
  scan(text);
  return [...found];
}
