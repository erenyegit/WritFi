import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { EarlyUnavailable } from "./errors";

/**
 * Who is signed in, kept in one HMAC-signed, httpOnly cookie. Nothing about
 * the session is stored server side: the wallet signs once, and the cookie
 * proves it for 30 days.
 */

const SESSION_COOKIE = "writ_early";
const NONCE_COOKIE = "writ_early_nonce";
/** Set by /r/<code>, read once when the account is created. */
const REF_COOKIE = "writ_ref";
/** A Sign in with X in progress: its state, PKCE verifier and the wallet that started it. */
const X_AUTH_COOKIE = "writ_early_x";

const SESSION_SEC = 30 * 86_400;
const NONCE_SEC = 10 * 60;
const X_AUTH_SEC = 10 * 60;

const cookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new EarlyUnavailable("Early access is not configured on this deployment (SESSION_SECRET).");
  }
  return "writ-local-development-only-session-secret";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function equal(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function startSession(res: NextResponse, address: string) {
  const body = { a: address.toLowerCase(), e: Math.floor(Date.now() / 1000) + SESSION_SEC };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  res.cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, { ...cookie, maxAge: SESSION_SEC });
}

export function endSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...cookie, maxAge: 0 });
}

/** The signed-in wallet, lowercase, or null. */
export function sessionAddress(req: NextRequest): string | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const [payload, mac] = raw?.split(".") ?? [];
  if (!payload || !mac || !equal(mac, sign(payload))) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof a !== "string" || typeof e !== "number" || e * 1000 < Date.now()) return null;
    return a;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(16).toString("hex");

/** The sign-in message must carry this nonce; it lives ten minutes and is used once. */
export function rememberNonce(res: NextResponse, nonce: string) {
  res.cookies.set(NONCE_COOKIE, nonce, { ...cookie, maxAge: NONCE_SEC });
}

export const readNonce = (req: NextRequest) => req.cookies.get(NONCE_COOKIE)?.value ?? null;

export function clearNonce(res: NextResponse) {
  res.cookies.set(NONCE_COOKIE, "", { ...cookie, maxAge: 0 });
  return res;
}

/** Remembers whose invite link brought this visitor, until they sign in. */
export function rememberRef(res: NextResponse, code: string) {
  res.cookies.set(REF_COOKIE, code, { ...cookie, maxAge: 30 * 86_400 });
}

export const readRef = (req: NextRequest) => req.cookies.get(REF_COOKIE)?.value ?? null;

export interface XAuth {
  state: string;
  verifier: string;
  address: string;
  /** Set when this sign-in checks the like step instead of linking an account. */
  check?: "like";
}

/** Holds a Sign in with X for ten minutes, signed like the session so it cannot be forged. */
export function rememberXAuth(res: NextResponse, auth: XAuth) {
  const payload = Buffer.from(JSON.stringify({ ...auth, e: Math.floor(Date.now() / 1000) + X_AUTH_SEC })).toString(
    "base64url",
  );
  res.cookies.set(X_AUTH_COOKIE, `${payload}.${sign(payload)}`, { ...cookie, maxAge: X_AUTH_SEC });
}

export function readXAuth(req: NextRequest): XAuth | null {
  const raw = req.cookies.get(X_AUTH_COOKIE)?.value;
  const [payload, mac] = raw?.split(".") ?? [];
  if (!payload || !mac || !equal(mac, sign(payload))) return null;
  try {
    const { state, verifier, address, check, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof e !== "number" || e * 1000 < Date.now()) return null;
    if (typeof state !== "string" || typeof verifier !== "string" || typeof address !== "string") return null;
    return { state, verifier, address, check: check === "like" ? "like" : undefined };
  } catch {
    return null;
  }
}

export function clearXAuth(res: NextResponse) {
  res.cookies.set(X_AUTH_COOKIE, "", { ...cookie, maxAge: 0 });
}

export function clearRef(res: NextResponse) {
  res.cookies.set(REF_COOKIE, "", { ...cookie, maxAge: 0 });
}

/**
 * Browsers already keep SameSite cookies off cross-site posts; this refuses
 * them outright as well. Requests without an Origin are not from a browser.
 */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * The origin the visitor is on, for building redirects. Behind the server's
 * proxy, req.url carries the address Next listens on (http://0.0.0.0:3000),
 * so the origin comes from the Host the proxy passes through.
 */
export function publicOrigin(req: NextRequest) {
  const host = req.headers.get("host");
  if (!host) return req.nextUrl.origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.slice(0, -1);
  return `${proto}://${host}`;
}

/** Bearer token for the full export. */
export function isAdmin(req: NextRequest) {
  const token = process.env.EARLY_ADMIN_TOKEN;
  if (!token || token.length < 16) {
    throw new EarlyUnavailable("The export is not configured on this deployment (EARLY_ADMIN_TOKEN).");
  }
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return equal(given, token);
}
