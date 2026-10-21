/**
 * One pricing function for everything that shows a rate: the indicative grid,
 * the landing page and the signed quote. They used to compute the same thing in
 * three places, which is how a grid and a ticket end up disagreeing.
 */

import { bsCall, bsPut, probInTheMoney } from "./bs";
import { deskConfig } from "./config";
import { deskSpread, impliedVol } from "./surface";

export const YEAR_SEC = 365 * 86_400;

export interface Pricing {
  iv: number;
  /** Black-Scholes value per 1 BTC, USD. */
  fairPerBtc: number;
  /** Fraction below fair value the maker bids. */
  spread: number;
  /** What the maker pays per 1 BTC, USD. */
  bidPerBtc: number;
  /** Model chance the writer is assigned. */
  probAssigned: number;
  /**
   * Premium as an annual rate on the capital committed. Both products commit
   * about one BTC of value per BTC of size: a put locks the strike in cash, a
   * covered call locks the coin itself (valued at spot), so the rates compare.
   */
  aprPct: number;
}

/** `vol` is the implied vol to price at; without one the model surface is used. */
export function priceOption(isPut: boolean, spot: number, strike: number, tenorYears: number, vol?: number): Pricing {
  const T = Math.max(tenorYears, 1 / YEAR_SEC);
  const r = deskConfig.riskFreeRate;
  const iv = vol ?? impliedVol(spot, strike, T);
  const fairPerBtc = isPut ? bsPut(spot, strike, T, iv, r) : bsCall(spot, strike, T, iv, r);
  const spread = deskSpread(spot, strike, T);
  const bidPerBtc = fairPerBtc * (1 - spread);
  const committed = isPut ? strike : spot;
  return {
    iv,
    fairPerBtc,
    spread,
    bidPerBtc,
    probAssigned: probInTheMoney(isPut, spot, strike, T, iv, r),
    aprPct: (bidPerBtc / committed / T) * 100,
  };
}

/**
 * Strikes for one side, out of the money only, at roughly these distances from
 * spot. An in-the-money strike on an income ticket is not income: the writer
 * would be paid to take a loss that has already happened, and the annualized
 * figure would make it look like the best trade on the board.
 */
const DISTANCES = [0.02, 0.04, 0.06, 0.08, 0.1, 0.13];

export function strikeLadder(isPut: boolean, spot: number): number[] {
  const out: number[] = [];
  for (const d of DISTANCES) {
    const raw = isPut ? spot * (1 - d) : spot * (1 + d);
    // $500 steps near the money, $1,000 further out, like listed BTC strikes.
    const step = d < 0.05 ? 500 : 1000;
    const k = isPut ? Math.floor(raw / step) * step : Math.ceil(raw / step) * step;
    const otm = isPut ? k < spot : k > spot;
    if (otm && k > 0 && !out.includes(k)) out.push(k);
  }
  return isPut ? out.sort((a, b) => b - a) : out.sort((a, b) => a - b);
}
