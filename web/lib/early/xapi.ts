import { oauthHeader, percent, type OAuthKeys } from "./oauth1";

/**
 * Reads from the X API as @Writ_Fi itself: OAuth 1.0a with the account's own
 * access token, from the developer app @Writ_Fi owns. The follow check and the
 * post check both read this way. X bills per resource read.
 */

const API = process.env.X_API_URL || "https://api.x.com";

function ownerKeys(): OAuthKeys | null {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const token = process.env.X_ACCESS_TOKEN;
  const tokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) return null;
  return { consumerKey, consumerSecret, token, tokenSecret };
}

/** The site holds @Writ_Fi's four X keys. */
export const ownerReady = () => ownerKeys() !== null;

export class XApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    // Ids are left out of the message, so logs do not collect them.
    super(`X answered ${status} for ${path.replace(/\d{5,}/g, ":id")}`);
  }
}

export async function ownerGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const keys = ownerKeys();
  if (!keys) throw new Error("X keys are not set");
  const url = `${API}${path}`;
  const query = Object.entries(params)
    .map(([key, value]) => `${percent(key)}=${percent(value)}`)
    .join("&");
  const res = await fetch(query ? `${url}?${query}` : url, {
    headers: { authorization: oauthHeader("GET", url, params, keys) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new XApiError(res.status, path);
  return (await res.json()) as T;
}
