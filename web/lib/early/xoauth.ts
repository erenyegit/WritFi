import { createHash, randomBytes } from "node:crypto";

/**
 * Sign in with X (OAuth 2.0, authorization code with PKCE), used once to prove
 * which X account a wallet holder controls. The site asks only to read the
 * profile, reads it once (id, username, followers, account age, verified) as
 * the snapshot referrals are scored from, and hands the token straight back to
 * X. One profile read, about $0.01 at X's rates.
 *
 * Needs the developer app's OAuth 2.0 client (X_CLIENT_ID, X_CLIENT_SECRET),
 * with this site's /api/early/x/callback registered as a callback URL.
 */

const API = process.env.X_API_URL || "https://api.x.com";
const AUTHORIZE = process.env.X_AUTHORIZE_URL || "https://x.com/i/oauth2/authorize";
/** X requires tweet.read alongside users.read to read the signed-in account. */
const SCOPES = "users.read tweet.read";

function client() {
  const id = process.env.X_CLIENT_ID;
  const secret = process.env.X_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export const xConnectReady = () => client() !== null;

/** The X profile as read at sign-in: the snapshot Signal Bonuses are scored from. */
export interface XProfile {
  id: string;
  username: string;
  followers: number;
  /** When the X account was created, ISO; null if X did not say. */
  createdAt: string | null;
  verified: boolean;
}

/** Where X sends the person back; it must match a callback URL registered on the app. */
export const redirectUri = (origin: string) =>
  process.env.X_REDIRECT_URI || new URL("/api/early/x/callback", origin).toString();

export const newState = () => randomBytes(16).toString("base64url");
export const newVerifier = () => randomBytes(32).toString("base64url");
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function authorizeUrl(state: string, verifier: string, redirect: string) {
  const c = client();
  if (!c) throw new Error("X OAuth is not configured");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: c.id,
    redirect_uri: redirect,
    scope: SCOPES,
    state,
    code_challenge: challengeOf(verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE}?${query}`;
}

/** Trades the code for a token, reads who signed in, then revokes the token. */
export async function profileFromCode(code: string, verifier: string, redirect: string): Promise<XProfile> {
  const c = client();
  if (!c) throw new Error("X OAuth is not configured");
  const basic = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`;

  const tokenRes = await fetch(`${API}/2/oauth2/token`, {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
      client_id: c.id,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`X token exchange answered ${tokenRes.status}`);
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) throw new Error("X sent no access token");

  try {
    const meRes = await fetch(`${API}/2/users/me?user.fields=created_at,public_metrics,verified`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!meRes.ok) throw new Error(`X users/me answered ${meRes.status}`);
    const data = (
      (await meRes.json()) as {
        data?: {
          id?: string;
          username?: string;
          created_at?: string;
          verified?: boolean;
          public_metrics?: { followers_count?: number };
        };
      }
    ).data;
    if (!data?.id || !data.username) throw new Error("X did not return the account");
    return {
      id: data.id,
      username: data.username,
      followers: Math.max(0, Math.floor(Number(data.public_metrics?.followers_count) || 0)),
      createdAt: data.created_at && !Number.isNaN(Date.parse(data.created_at)) ? data.created_at : null,
      verified: data.verified === true,
    };
  } finally {
    // The token is not kept anywhere; revoking it means it cannot be used again.
    await fetch(`${API}/2/oauth2/revoke`, {
      method: "POST",
      headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, token_type_hint: "access_token", client_id: c.id }),
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    }).catch(() => undefined);
  }
}
