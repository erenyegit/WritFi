import { createHmac, randomBytes } from "node:crypto";

/**
 * OAuth 1.0a request signing (HMAC-SHA1), the scheme X uses when a request is
 * made as a specific account with that account's own access token.
 */

export interface OAuthKeys {
  /** The app's API key and secret. */
  consumerKey: string;
  consumerSecret: string;
  /** The account's access token and secret. */
  token: string;
  tokenSecret: string;
}

/** RFC 3986 percent-encoding, which OAuth 1.0a requires (encodeURIComponent leaves !'()* alone). */
export const percent = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * The Authorization header for one request. `url` is the address without its
 * query; `params` are the query (or form) parameters, which are signed too.
 */
export function oauthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  keys: OAuthKeys,
  nonce = randomBytes(16).toString("hex"),
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: keys.token,
    oauth_version: "1.0",
  };
  const pairs = Object.entries({ ...params, ...oauth })
    .map(([k, v]) => [percent(k), percent(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1));
  const base = [method.toUpperCase(), percent(url), percent(pairs.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  const signature = createHmac("sha1", `${percent(keys.consumerSecret)}&${percent(keys.tokenSecret)}`)
    .update(base)
    .digest("base64");
  return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature })
    .map(([k, v]) => `${percent(k)}="${percent(v)}"`)
    .join(", ")}`;
}
