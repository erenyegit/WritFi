/** Browser-side client for this app's own /api routes. */

export interface Cell {
  aprPct: number;
  premiumPerBtc: number;
  probAssigned: number;
  iv: number;
}

export interface SideBoard {
  /** Out of the money only; puts descend from spot, calls ascend. */
  strikes: number[];
  /** cells[expiryIndex][strikeIndex]. */
  cells: Cell[][];
}

export interface Market {
  spot: { usd: number; source: "pyth" | "coinbase" | "kraken"; at: number };
  expiries: number[];
  /** Where the implied vols behind every rate came from. */
  ivSource: "deribit" | "model";
  put: SideBoard;
  call: SideBoard;
  maker: {
    active: boolean;
    putCapacityBtc: number;
    callCapacityUsdc: number;
    maxPremiumPerBtc: number;
  } | null;
  limits: {
    paused: boolean;
    minNotionalUsdc: number;
    maxNotionalUsdc: number;
    openNotionalUsdc: number;
    maxTotalNotionalUsdc: number;
    lotBtc: number;
  } | null;
}

export interface SignedQuote {
  quote: {
    writer: `0x${string}`;
    maker: `0x${string}`;
    isPut: boolean;
    strike: string;
    qty: string;
    expiry: string;
    premium: string;
    quoteDeadline: string;
    nonce: string;
  };
  signature: `0x${string}`;
  competingBids?: number;
  makersAsked?: number;
  meta: {
    spotUsd: number;
    ivAnnualized: number;
    ivSource: "deribit" | "model";
    spread: number;
    tenorYears: number;
    fairValueUsd: number;
    premiumUsdc: string;
    notionalUsdc: string;
    collateral: string;
    collateralAsset: "USDC" | "BTC";
    aprPct: number;
    probAssigned: number;
    maker: `0x${string}`;
    quoter: `0x${string}`;
  };
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}

export const getMarket = () => fetch("/api/market", { cache: "no-store" }).then((r) => json<Market>(r));

export function getQuote(p: { writer: `0x${string}`; isPut: boolean; strike: number; qty: number; expiry: number }) {
  const q = new URLSearchParams({
    writer: p.writer,
    isPut: String(p.isPut),
    strike: String(p.strike),
    qty: String(p.qty),
    expiry: String(p.expiry),
  });
  return fetch(`/api/rfq?${q}`, { cache: "no-store" }).then((r) => json<SignedQuote>(r));
}

/** The signed Pyth update for a past fixing, ready for settle()'s oracleData. */
export const getSettlementUpdate = (expiry: number) =>
  fetch(`/api/settlement?expiry=${expiry}`).then((r) => json<{ updates: `0x${string}`[] }>(r)).then((b) => b.updates);
