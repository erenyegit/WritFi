import { defineChain } from "viem";

/**
 * GIWA Sepolia, Upbit's OP Stack L2.
 *
 * Reads and writes go through the Flashblocks endpoint, which preconfirms
 * transactions in about 200ms instead of waiting for the full block. That is
 * what lets quotes live only 20 seconds: the shorter a quote lives, the less
 * stale-price risk a maker prices in, and the more premium the writer keeps.
 *
 * NEXT_PUBLIC_RPC_URL overrides the endpoint, for a local fork during testing.
 */
const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rpc-flashblocks.giwa.io";

export const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [rpc] },
    // Standard endpoint, for tooling that does not expect preconfirmations.
    standard: { http: ["https://sepolia-rpc.giwa.io"] },
  },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});
