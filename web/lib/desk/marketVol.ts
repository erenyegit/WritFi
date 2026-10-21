/**
 * Implied volatility from Deribit, the deepest BTC options market.
 *
 * Writ lists the same Friday 08:00 UTC expiries Deribit does, so for most cells
 * there is a traded option with the same expiry to read a mark vol from. Where
 * the exact expiry is not listed, the vol is interpolated in total variance
 * between the neighbouring expiries, the standard way to fill a term structure.
 *
 * When Deribit cannot be reached, pricing falls back to the model surface in
 * surface.ts and says so, so a stale or missing market is never silent.
 */

import { impliedVol } from "./surface";

const BASE = process.env.DERIBIT_URL || "https://www.deribit.com";
const TTL_MS = 60_000;
const TIMEOUT_MS = 3_000;
const YEAR_SEC = 365 * 86_400;

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

interface Smile {
  expiry: number; // unix seconds, 08:00 UTC
  /** Sorted by strike. */
  points: { strike: number; iv: number }[];
}

export interface VolSurface {
  source: "deribit" | "model";
  /** Annualized implied vol for a strike at an expiry. */
  iv(expiry: number, strike: number, spot: number, now: number): number;
}

let cache: { at: number; smiles: Smile[] } | null = null;
let lastError: string | null = null;

/** "2OCT26" -> Fri 2 Oct 2026 08:00 UTC. */
function parseExpiry(code: string): number | null {
  const m = code.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m || MONTHS[m[2]] === undefined) return null;
  return Date.UTC(2000 + Number(m[3]), MONTHS[m[2]], Number(m[1]), 8) / 1000;
}

async function loadSmiles(): Promise<Smile[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.smiles;
  const res = await fetch(`${BASE}/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`deribit ${res.status}`);
  const body = (await res.json()) as { result?: { instrument_name: string; mark_iv?: number }[] };
  const byExpiry = new Map<number, Map<number, number>>();
  for (const row of body.result ?? []) {
    const [, code, strikeText] = row.instrument_name.split("-");
    const expiry = parseExpiry(code);
    const strike = Number(strikeText);
    const iv = Number(row.mark_iv) / 100;
    if (!expiry || !Number.isFinite(strike) || !(iv > 0.05 && iv < 5)) continue;
    // Put and call at one strike carry the same mark vol; keep one.
    const smile = byExpiry.get(expiry) ?? new Map<number, number>();
    smile.set(strike, iv);
    byExpiry.set(expiry, smile);
  }
  const smiles = [...byExpiry.entries()]
    .filter(([, s]) => s.size >= 3)
    .map(([expiry, s]) => ({
      expiry,
      points: [...s.entries()].sort(([a], [b]) => a - b).map(([strike, iv]) => ({ strike, iv })),
    }))
    .sort((a, b) => a.expiry - b.expiry);
  if (smiles.length === 0) throw new Error("deribit returned no usable options");
  cache = { at: Date.now(), smiles };
  return smiles;
}

/** Vol at a strike on one expiry's smile, linear in log-strike, flat past the ends. */
function smileIv(s: Smile, strike: number): number {
  const p = s.points;
  if (strike <= p[0].strike) return p[0].iv;
  if (strike >= p[p.length - 1].strike) return p[p.length - 1].iv;
  let i = 1;
  while (p[i].strike < strike) i++;
  const a = p[i - 1];
  const b = p[i];
  const t = (Math.log(strike) - Math.log(a.strike)) / (Math.log(b.strike) - Math.log(a.strike));
  return a.iv + t * (b.iv - a.iv);
}

function marketIv(smiles: Smile[], expiry: number, strike: number, now: number): number | null {
  const exact = smiles.find((s) => s.expiry === expiry);
  if (exact) return smileIv(exact, strike);
  const before = [...smiles].reverse().find((s) => s.expiry < expiry && s.expiry > now);
  const after = smiles.find((s) => s.expiry > expiry);
  if (!before || !after) return null;
  // Interpolate total variance, iv^2 * T, linearly in time.
  const t1 = (before.expiry - now) / YEAR_SEC;
  const t2 = (after.expiry - now) / YEAR_SEC;
  const t = (expiry - now) / YEAR_SEC;
  const w1 = smileIv(before, strike) ** 2 * t1;
  const w2 = smileIv(after, strike) ** 2 * t2;
  const w = w1 + ((w2 - w1) * (t - t1)) / (t2 - t1);
  return w > 0 ? Math.sqrt(w / t) : null;
}

const modelSurface: VolSurface = {
  source: "model",
  iv: (expiry, strike, spot, now) => impliedVol(spot, strike, Math.max(expiry - now, 1) / YEAR_SEC),
};

/** Deribit's surface when reachable, the model otherwise. Never throws. */
export async function getVolSurface(): Promise<VolSurface> {
  try {
    const smiles = await loadSmiles();
    lastError = null;
    return {
      source: "deribit",
      iv: (expiry, strike, spot, now) =>
        marketIv(smiles, expiry, strike, now) ?? modelSurface.iv(expiry, strike, spot, now),
    };
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    return modelSurface;
  }
}

/** Why the last attempt fell back to the model, or null. */
export const marketVolError = () => lastError;
