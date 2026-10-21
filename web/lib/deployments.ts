/**
 * Where the market lives on chain.
 *
 * Contract addresses are public facts about a deployment, so they live in code
 * next to the ABI that talks to them instead of in dashboard env vars. A new
 * deployment is one commit, and the browser and the server can never disagree
 * about which contract they are using.
 */

type Address = `0x${string}`;

export interface Deployment {
  chainId: number;
  core: Address;
  /** Settlement price source (PythAccumulatorAdapter). */
  oracle: Address;
  usdc: Address;
  btc: Address;
  /** The maker this app quotes for; its signer is QUOTER_PRIVATE_KEY. */
  maker: Address;
  /** First block of the core contract, for event scans. */
  deployBlock: bigint;
  eip712: { name: string; version: string };
}

/** GIWA Sepolia, second deployment (2026-09-24). */
export const giwaSepoliaDeployment: Deployment = {
  chainId: 91342,
  core: "0xca0470B69c5fb9f28C64d65228f3e4879b85b4F2",
  oracle: "0x3B47e405e8195F5528958f568a48c6C723a9E5BD",
  usdc: "0x0b76264Bb1eD80e5FB219828464d0C809567e309",
  btc: "0xD23c5fA0f4029874be6338fdaDC66e81709DAbFf",
  maker: "0xD8654bB768b3D37bCf0f4211743a8149481E1eEa",
  deployBlock: 36895802n,
  eip712: { name: "WritOptions", version: "2" },
};

/**
 * The first deployment. Retired: its Pyth adapter cannot verify updates signed
 * by Pyth's current guardian set. Kept for links to its history.
 */
export const giwaSepoliaV1 = {
  core: "0xd2f64c2fd06AA6B8c295d7C37CE6459D89B4f7B0" as Address,
};

export const deployment = giwaSepoliaDeployment;

/** Pyth's BTC/USD price feed. */
export const BTC_USD_FEED_ID =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" as const;
