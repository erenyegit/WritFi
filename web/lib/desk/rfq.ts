/**
 * Request for quote.
 *
 * One maker quoting one price is a house, not a market: the writer takes what
 * they are given. An RFQ asks every registered maker the same question at the
 * same moment, waits a short window, and shows the writer the best answer. With
 * one maker the flow is identical and the writer sees one bid.
 *
 * An external maker is an HTTP endpoint that speaks the same shape as this
 * app's /api/quote. Its answer is never trusted as sent: the signature must
 * recover to that maker's on-chain signer, every field must match the request,
 * and the maker's book must be able to back it, or the bid is dropped.
 */

import { recoverTypedDataAddress } from "viem";

import { readBook } from "./book";
import { buildSignedQuote, notionalUsdc, QuoteError, quoteDomain, quoteTypes, type QuoteRequest, type SignedQuote } from "./quote";

/** Long enough to cross the network, short enough that the winning quote is
 *  still fresh when the writer signs. */
const WINDOW_MS = Number(process.env.RFQ_WINDOW_MS ?? 2_000);

const externalMakers = (process.env.MAKER_ENDPOINTS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export interface RfqResult extends SignedQuote {
  /** Valid bids received inside the window, the winner included. */
  competingBids: number;
  /** Makers asked, so a silent one is visible rather than invisible. */
  makersAsked: number;
}

async function askExternal(url: string, req: QuoteRequest): Promise<SignedQuote> {
  const q = new URLSearchParams({
    writer: req.writer,
    isPut: String(req.isPut),
    strike: String(req.strikeUsd),
    qty: String(req.qtyBtc),
    expiry: String(req.expiry),
  });
  const res = await fetch(`${url}?${q}`, { signal: AbortSignal.timeout(WINDOW_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  const body = (await res.json()) as SignedQuote;
  await checkExternal(body, req);
  return body;
}

/** Reject any external bid that the contract would refuse or that answers a
 *  different question than the one asked. */
async function checkExternal(bid: SignedQuote, req: QuoteRequest) {
  const q = bid.quote;
  const qty = BigInt(Math.round(req.qtyBtc * 1e8));
  const strike = BigInt(Math.round(req.strikeUsd * 1e8));
  if (
    q.writer.toLowerCase() !== req.writer.toLowerCase() ||
    q.isPut !== req.isPut ||
    BigInt(q.strike) !== strike ||
    BigInt(q.qty) !== qty ||
    Number(q.expiry) !== req.expiry
  ) {
    throw new Error("bid does not match the request");
  }
  if (Number(q.quoteDeadline) < Math.floor(Date.now() / 1000) + 5) throw new Error("bid expires too soon");

  const premium = BigInt(q.premium);
  const notional = notionalUsdc(strike, qty);
  if (premium <= 0n || premium >= notional) throw new Error("bid premium out of range");

  const book = await readBook(q.maker);
  if (!book.maker.active) throw new Error("maker not active");
  const signer = await recoverTypedDataAddress({
    domain: quoteDomain,
    types: quoteTypes,
    primaryType: "Quote",
    message: {
      writer: q.writer,
      maker: q.maker,
      isPut: q.isPut,
      strike,
      qty,
      expiry: BigInt(q.expiry),
      premium,
      quoteDeadline: BigInt(q.quoteDeadline),
      nonce: BigInt(q.nonce),
    },
    signature: bid.signature,
  });
  if (signer.toLowerCase() !== book.maker.signer.toLowerCase()) throw new Error("signature is not the maker's");
  if (book.maker.maxPremiumPerBtc > 0n && premium * 100_000_000n > book.maker.maxPremiumPerBtc * qty) {
    throw new Error("bid above the maker's premium cap");
  }
  const canBack = req.isPut
    ? book.maker.btcFree >= qty && book.maker.usdcFree >= premium
    : book.maker.usdcFree >= notional + premium;
  if (!canBack) throw new Error("maker cannot back the bid");
}

/**
 * Run the auction and return the best valid bid.
 *
 * "Best" is the highest premium: the writer is selling, so more is better. A
 * maker that errors, misses the window or fails a check is skipped. When no
 * bid survives, the in-house maker's reason is surfaced, because it is the one
 * that explains what the writer can change (size, strike, expiry).
 */
export async function requestForQuote(req: QuoteRequest, spot: number): Promise<RfqResult> {
  const results = await Promise.allSettled([
    buildSignedQuote(req, spot),
    ...externalMakers.map((url) => askExternal(url, req)),
  ]);

  const bids = results
    .filter((r): r is PromiseFulfilledResult<SignedQuote> => r.status === "fulfilled")
    .map((r) => r.value);

  if (bids.length === 0) {
    const own = results[0];
    if (own.status === "rejected") {
      if (own.reason instanceof QuoteError) throw own.reason;
      throw new Error(own.reason instanceof Error ? own.reason.message : "no maker quoted this");
    }
    throw new Error("no maker quoted this");
  }

  const best = bids.reduce((a, b) => (BigInt(b.quote.premium) > BigInt(a.quote.premium) ? b : a));
  return { ...best, competingBids: bids.length, makersAsked: 1 + externalMakers.length };
}
