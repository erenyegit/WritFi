import type { QuoteRequest } from "./quote";
import { QuoteError } from "./quote";

/** ?writer=0x..&isPut=true&strike=82500&qty=0.01&expiry=1790323200 */
export function parseQuoteParams(sp: URLSearchParams): QuoteRequest {
  const writer = sp.get("writer");
  if (!writer || !/^0x[0-9a-fA-F]{40}$/.test(writer)) throw new QuoteError("A valid wallet address is required.");
  const isPut = sp.get("isPut");
  if (isPut !== "true" && isPut !== "false") throw new QuoteError("isPut must be true or false.");
  const strikeUsd = Number(sp.get("strike"));
  const qtyBtc = Number(sp.get("qty"));
  const expiry = Number(sp.get("expiry"));
  if (!Number.isFinite(strikeUsd) || !Number.isFinite(qtyBtc) || !Number.isInteger(expiry)) {
    throw new QuoteError("strike, qty and expiry must be numbers.");
  }
  return { writer: writer as `0x${string}`, isPut: isPut === "true", strikeUsd, qtyBtc, expiry };
}
