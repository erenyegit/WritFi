/**
 * The on-chain state a quote has to respect: the maker's own book and the
 * market's risk limits. Quoting without it is how the desk used to sign trades
 * the contract then refused, after the writer had already paid gas.
 */

import { coreAbi } from "../abi";
import { publicClient } from "./client";
import { deskConfig } from "./config";

export interface MakerBook {
  signer: `0x${string}`;
  usdcFree: bigint;
  usdcReserved: bigint;
  btcFree: bigint;
  btcReserved: bigint;
  active: boolean;
  /** USDC (1e6) per 1 BTC of size; 0 means uncapped. */
  maxPremiumPerBtc: bigint;
}

export interface MarketLimits {
  minTenor: bigint;
  maxTenor: bigint;
  minPositionNotional: bigint;
  maxPositionNotional: bigint;
  maxTotalNotional: bigint;
  totalOpenNotional: bigint;
  paused: boolean;
}

export interface Book {
  maker: MakerBook;
  limits: MarketLimits;
  /** Unix ms. */
  readAt: number;
}

/** Every open ticket refreshes its quote every few seconds; one read serves them. */
const CACHE_MS = 4_000;
const cache = new Map<string, Book>();

const at = { abi: coreAbi, address: deskConfig.coreAddress } as const;

export async function readBook(maker: `0x${string}` = deskConfig.makerAddress): Promise<Book> {
  const hit = cache.get(maker.toLowerCase());
  if (hit && Date.now() - hit.readAt < CACHE_MS) return hit;

  const [m, minTenor, maxTenor, minPos, maxPos, maxTotal, open, paused] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...at, functionName: "makers", args: [maker] },
      { ...at, functionName: "minTenor" },
      { ...at, functionName: "maxTenor" },
      { ...at, functionName: "minPositionNotional" },
      { ...at, functionName: "maxPositionNotional" },
      { ...at, functionName: "maxTotalNotional" },
      { ...at, functionName: "totalOpenNotional" },
      { ...at, functionName: "paused" },
    ],
  });

  const book: Book = {
    maker: {
      signer: m[0],
      usdcFree: m[1],
      usdcReserved: m[2],
      btcFree: m[3],
      btcReserved: m[4],
      active: m[5],
      maxPremiumPerBtc: m[6],
    },
    limits: {
      minTenor: BigInt(minTenor),
      maxTenor: BigInt(maxTenor),
      minPositionNotional: minPos,
      maxPositionNotional: maxPos,
      maxTotalNotional: maxTotal,
      totalOpenNotional: open,
      paused,
    },
    readAt: Date.now(),
  };
  cache.set(maker.toLowerCase(), book);
  return book;
}
