import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

import { isGridExpiry } from "../expiry";
import { readBook, type Book } from "./book";
import { deskConfig, resolveQuoterKey } from "./config";
import { getVolSurface } from "./marketVol";
import { priceOption, YEAR_SEC } from "./pricing";

/** A request the maker will not quote, with the reason in plain words. */
export class QuoteError extends Error {
  status = 422;
}

/** Derived on first use, never at module load: a build must not need the secret. */
let cachedAccount: ReturnType<typeof privateKeyToAccount> | undefined;
function quoterAccount() {
  cachedAccount ??= privateKeyToAccount(resolveQuoterKey());
  return cachedAccount;
}

export const quoterAddress = () => quoterAccount().address;

/** Must match WritOptions' EIP712(name, version) and its deployment. */
export const quoteDomain = {
  name: deskConfig.eip712.name,
  version: deskConfig.eip712.version,
  chainId: deskConfig.chainId,
  verifyingContract: deskConfig.coreAddress,
} as const;

/** Must match QUOTE_TYPEHASH in WritOptions.sol field for field. */
export const quoteTypes = {
  Quote: [
    { name: "writer", type: "address" },
    { name: "maker", type: "address" },
    { name: "isPut", type: "bool" },
    { name: "strike", type: "uint64" },
    { name: "qty", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "premium", type: "uint128" },
    { name: "quoteDeadline", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface QuoteRequest {
  writer: `0x${string}`;
  isPut: boolean;
  strikeUsd: number;
  qtyBtc: number;
  /** Unix seconds; must be an 08:00 UTC fixing. */
  expiry: number;
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const usdc = (v: bigint) => (Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const btc = (v: bigint) => (Number(v) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 8 });

/** Mirror of OptionMath.notionalUsdc: strike (1e8) x qty (1e8) -> USDC (1e6), rounded up. */
export const notionalUsdc = (strike: bigint, qty: bigint) => ceilDiv(strike * qty, 10n ** 10n);

/**
 * Validate a request against the market and the maker's own book, price it,
 * and sign it. Everything the contract would reject is rejected here first,
 * with a reason a writer can act on, before they spend gas finding out.
 */
export async function buildSignedQuote(req: QuoteRequest, spot: number, book?: Book) {
  const b = book ?? (await readBook());
  const now = Math.floor(Date.now() / 1000);

  // ---- market state
  if (b.limits.paused) throw new QuoteError("New positions are paused. Open positions still settle.");
  if (!b.maker.active) throw new QuoteError("This maker has stopped quoting for now.");

  // ---- expiry: a listed fixing inside the contract's tenor bounds
  if (!isGridExpiry(req.expiry)) throw new QuoteError("Expiry must be one of the listed 08:00 UTC fixings.");
  // Two minutes of headroom over minTenor, so a quote signed now still lands in range.
  if (req.expiry < now + Number(b.limits.minTenor) + 120) throw new QuoteError("That expiry is too close to quote.");
  if (req.expiry > now + Number(b.limits.maxTenor)) throw new QuoteError("That expiry is too far out to quote.");

  // ---- strike: positive, whole dollars, out of the money
  if (!Number.isFinite(req.strikeUsd) || req.strikeUsd <= 0 || !Number.isInteger(req.strikeUsd)) {
    throw new QuoteError("Strike must be a whole-dollar price.");
  }
  if (req.isPut ? req.strikeUsd >= spot : req.strikeUsd <= spot) {
    throw new QuoteError(
      req.isPut
        ? `A put strike must be below spot ($${Math.round(spot).toLocaleString("en-US")}).`
        : `A covered call strike must be above spot ($${Math.round(spot).toLocaleString("en-US")}).`,
    );
  }

  // ---- size: whole lots
  const qty = BigInt(Math.round(req.qtyBtc * 1e8));
  if (!Number.isFinite(req.qtyBtc) || qty <= 0n) throw new QuoteError("Enter a size.");
  if (qty % deskConfig.lotSats !== 0n) throw new QuoteError("Size must be a multiple of 0.0001 BTC.");

  const strike = BigInt(Math.round(req.strikeUsd * 1e8));
  const notional = notionalUsdc(strike, qty);
  if (notional < b.limits.minPositionNotional) {
    throw new QuoteError(`Minimum position is ${usdc(b.limits.minPositionNotional)} USDC of notional.`);
  }
  if (notional > b.limits.maxPositionNotional) {
    throw new QuoteError(`Maximum position is ${usdc(b.limits.maxPositionNotional)} USDC of notional.`);
  }
  if (b.limits.totalOpenNotional + notional > b.limits.maxTotalNotional) {
    throw new QuoteError("The market is at its open-interest cap.");
  }

  // ---- price
  const T = (req.expiry - now) / YEAR_SEC;
  const surface = await getVolSurface();
  const p = priceOption(req.isPut, spot, req.strikeUsd, T, surface.iv(req.expiry, req.strikeUsd, spot, now));
  let premium = BigInt(Math.floor(p.bidPerBtc * req.qtyBtc * 1e6));
  // The maker's own cap: a signed quote above it would revert on-chain.
  if (b.maker.maxPremiumPerBtc > 0n) {
    const cap = (b.maker.maxPremiumPerBtc * qty) / 100_000_000n;
    if (premium > cap) premium = cap;
  }
  if (premium <= 0n) throw new QuoteError("The premium rounds to zero at this size. Try a larger size.");
  if (premium >= notional) throw new QuoteError("The maker will not quote this strike.");

  // ---- the maker must hold what it may owe, plus the premium it pays now
  if (req.isPut) {
    if (b.maker.btcFree < qty) {
      throw new QuoteError(`The maker can back up to ${btc(b.maker.btcFree)} BTC of puts right now.`);
    }
    if (b.maker.usdcFree < premium) throw new QuoteError("The maker is out of USDC for premiums right now.");
  } else if (b.maker.usdcFree < notional + premium) {
    throw new QuoteError("The maker does not hold enough USDC to back this call right now. Try a smaller size.");
  }

  const quote = {
    writer: req.writer,
    maker: deskConfig.makerAddress,
    isPut: req.isPut,
    strike,
    qty,
    expiry: BigInt(req.expiry),
    premium,
    quoteDeadline: BigInt(now + deskConfig.quoteTtlSec),
    nonce: BigInt("0x" + randomBytes(32).toString("hex")),
  };

  const signature = await quoterAccount().signTypedData({
    domain: quoteDomain,
    types: quoteTypes,
    primaryType: "Quote",
    message: quote,
  });

  const premiumUsd = Number(premium) / 1e6;
  const committedUsd = req.isPut ? Number(notional) / 1e6 : req.qtyBtc * spot;

  return {
    quote: {
      writer: quote.writer,
      maker: quote.maker,
      isPut: quote.isPut,
      strike: quote.strike.toString(),
      qty: quote.qty.toString(),
      expiry: quote.expiry.toString(),
      premium: quote.premium.toString(),
      quoteDeadline: quote.quoteDeadline.toString(),
      nonce: quote.nonce.toString(),
    },
    signature,
    meta: {
      spotUsd: spot,
      ivAnnualized: p.iv,
      ivSource: surface.source,
      spread: p.spread,
      tenorYears: T,
      fairValueUsd: p.fairPerBtc * req.qtyBtc,
      premiumUsdc: premium.toString(),
      notionalUsdc: notional.toString(),
      /** USDC (1e6) for a put, BTC (1e8) for a covered call. */
      collateral: (req.isPut ? notional : qty).toString(),
      collateralAsset: req.isPut ? ("USDC" as const) : ("BTC" as const),
      aprPct: (premiumUsd / committedUsd / T) * 100,
      probAssigned: p.probAssigned,
      maker: deskConfig.makerAddress,
      quoter: quoterAddress(),
    },
  };
}

export type SignedQuote = Awaited<ReturnType<typeof buildSignedQuote>>;
