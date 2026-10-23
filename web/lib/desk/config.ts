/** Server-side desk configuration (route handlers only, never import client-side). */

import { deployment } from "../deployments";

const DEV_KEY =
  // Well-known anvil dev key #0. NEVER use outside local development.
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

type Hex = `0x${string}`;

/** Accept a key however it survived a dashboard env field: stray whitespace,
 *  wrapping quotes, or a missing 0x prefix. Returns null when unusable. */
function parseKey(raw: string | undefined): Hex | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "");
  const hex = cleaned.startsWith("0x") ? cleaned.slice(2) : cleaned;
  return /^[0-9a-fA-F]{64}$/.test(hex) ? (`0x${hex}` as Hex) : null;
}

/**
 * The quote signer. In production a missing or malformed key is a hard failure:
 * falling back to a published dev key would let anyone forge this maker's
 * quotes. Read at call time, so a build never needs the secret.
 */
export function resolveQuoterKey(): Hex {
  const isProd = process.env.NODE_ENV === "production";
  const key = parseKey(process.env.QUOTER_PRIVATE_KEY);
  if (key) return key;
  if (isProd) {
    throw new Error(
      process.env.QUOTER_PRIVATE_KEY
        ? "QUOTER_PRIVATE_KEY is not 32 bytes of hex"
        : "QUOTER_PRIVATE_KEY is required in production",
    );
  }
  console.warn("[desk] QUOTER_PRIVATE_KEY unset, signing with the local dev key");
  return DEV_KEY;
}

export const usingDevKey = () => resolveQuoterKey() === DEV_KEY;

/**
 * The key the keeper pays settlement gas with. Settlement is permissionless, so
 * this key has no power over anyone's funds; it only needs a little ETH. Falls
 * back to the quoter key so one funded hot key can run both jobs on testnet.
 * Null when neither is set: the keeper then reports what it would settle.
 */
export function resolveKeeperKey(): Hex | null {
  return parseKey(process.env.KEEPER_PRIVATE_KEY) ?? parseKey(process.env.QUOTER_PRIVATE_KEY);
}

export const deskConfig = {
  chainId: deployment.chainId,
  coreAddress: deployment.core,
  makerAddress: deployment.maker,
  eip712: deployment.eip712,
  rpcUrl:
    process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rpc-flashblocks.giwa.io",
  /**
   * Hermes has required an API key since 26 August 2026; the old public host
   * answers 401. Server-side only: a key the browser can read is public.
   */
  hermesUrl: process.env.HERMES_URL || "https://pyth.dourolabs.app/hermes",
  pythApiKey: process.env.PYTH_API_KEY ?? "",
  riskFreeRate: Number(process.env.RISK_FREE ?? 0),
  /** GIWA preconfirms in ~200ms, so a quote only needs to live 20 seconds. */
  quoteTtlSec: Number(process.env.QUOTE_TTL_SEC ?? 20),
  /** Sizes are whole lots of 0.0001 BTC (10,000 sats). */
  lotSats: 10_000n,
  /** Warn when the maker's free balances drop below these. */
  lowUsdc: BigInt(process.env.LOW_LIQUIDITY_USDC ?? 200_000_000), // 200 USDC
  lowBtc: BigInt(process.env.LOW_LIQUIDITY_BTC ?? 2_000_000), // 0.02 BTC
  /** Below this the keeper may not cover a settlement run's gas. */
  lowKeeperWei: BigInt(process.env.LOW_KEEPER_WEI ?? 1_000_000_000_000_000), // 0.001 ETH
};

export function hermesHeaders(): Record<string, string> {
  const key = deskConfig.pythApiKey;
  return key ? { Authorization: `Bearer ${key}` } : {};
}
