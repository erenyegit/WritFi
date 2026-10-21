/**
 * Black-Scholes for European options. S and K in USD, T in years, sigma
 * annualized, r continuously compounded (defaults to 0).
 */

/** Abramowitz & Stegun 7.1.26, |error| < 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function d1d2(S: number, K: number, T: number, sigma: number, r: number) {
  const sq = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / sq;
  return { d1, d2: d1 - sq };
}

export function bsCall(S: number, K: number, T: number, sigma: number, r = 0): number {
  if (T <= 0) return Math.max(S - K, 0);
  const { d1, d2 } = d1d2(S, K, T, sigma, r);
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

export function bsPut(S: number, K: number, T: number, sigma: number, r = 0): number {
  if (T <= 0) return Math.max(K - S, 0);
  const { d1, d2 } = d1d2(S, K, T, sigma, r);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/**
 * Risk-neutral probability that the option finishes in the money, which for a
 * writer is the chance of being assigned: N(d2) for a call, N(-d2) for a put.
 * A model estimate, not a forecast.
 */
export function probInTheMoney(isPut: boolean, S: number, K: number, T: number, sigma: number, r = 0) {
  if (T <= 0) return isPut ? (S < K ? 1 : 0) : S > K ? 1 : 0;
  const { d2 } = d1d2(S, K, T, sigma, r);
  return isPut ? normCdf(-d2) : normCdf(d2);
}
