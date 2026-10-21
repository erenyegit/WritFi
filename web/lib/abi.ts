import { coreAbi, faucetAbi, oracleErrorsAbi } from "./abi.generated";

export { coreAbi, faucetAbi, oracleErrorsAbi };

/** The core ABI plus the adapter's errors, so a failed settle() decodes to
 *  the oracle's own reason (a wrong window, a bad signature) instead of hex. */
export const settleAbi = [...coreAbi, ...oracleErrorsAbi] as const;

export enum PositionState {
  None = 0,
  Open = 1,
  Settled = 2,
}

export interface OnchainPosition {
  writer: `0x${string}`;
  maker: `0x${string}`;
  isPut: boolean;
  /** USD, 1e8. */
  strike: bigint;
  /** BTC, 1e8. */
  qty: bigint;
  expiry: bigint;
  /** USDC (1e6) for puts, BTC (1e8) for covered calls. */
  collateral: bigint;
  /** USDC, 1e6. */
  premium: bigint;
  settlementPrice: bigint;
  /** True when the two sides swapped at the strike. */
  assigned: boolean;
  state: PositionState;
}
