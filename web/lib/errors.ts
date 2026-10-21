import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

import { fmtDateTime } from "./format";

/** OpenZeppelin ERC20 errors a transferFrom inside the core can bubble up. */
export const erc20ErrorsAbi = [
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
] as const;

/** What each revert means for the person looking at the screen. */
const REASONS: Record<string, string> = {
  QuoteExpired: "The quote expired before the transaction landed. A fresh one is on its way.",
  NonceAlreadyUsed: "That quote has already been used. A fresh one is on its way.",
  InvalidQuoteSignature: "The maker's signature did not check out. Refresh the quote.",
  NotQuoteWriter: "This quote was signed for a different wallet.",
  MakerNotActive: "This maker has stopped quoting for now.",
  InvalidPremium: "The maker quoted a premium the contract refuses.",
  PremiumAboveMakerCap: "The premium is above the maker's own per-BTC cap.",
  PositionTooSmall: "That size is below the minimum position.",
  PositionTooLarge: "That size is above the per-position limit.",
  ProtocolCapReached: "The market is at its open-interest cap.",
  InsufficientMakerLiquidity: "The maker does not hold enough USDC to back this right now. Try a smaller size.",
  InsufficientMakerInventory: "The maker does not hold enough BTC to back this right now. Try a smaller size.",
  ExpiryOutOfRange: "That expiry is too close or too far away.",
  InvalidOptionParams: "That strike or size is not valid.",
  EnforcedPause: "New positions are paused. Open positions still settle normally.",
  PositionNotOpen: "This position is already settled.",
  NotYetExpired: "This position has not expired yet.",
  PriceNotInWindow: "The Pyth update does not contain the first price after this expiry.",
  WrongGuardianSet: "This Pyth update is signed by a guardian set the oracle does not accept.",
  InvalidGuardianSignature: "The Pyth update's signatures did not verify.",
  GuardianIndexesNotAscending: "The Pyth update's signatures did not verify.",
  NoQuorum: "The Pyth update does not carry enough signatures.",
  WrongDataSource: "The Pyth update comes from an unexpected source.",
  InvalidMerkleProof: "The Pyth price did not match its proof.",
  InvalidUpdateData: "The Pyth update is malformed.",
  ConfidenceTooWide: "Pyth's confidence at expiry was too wide to settle on. The fallback will handle it.",
  ERC20InsufficientBalance: "Your wallet does not hold enough of the collateral token.",
  ERC20InsufficientAllowance: "The contract is not approved to move that much of your collateral yet.",
};

/** A short, human reason for anything a wallet, RPC or contract throws. */
export function errorMessage(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You declined the request in your wallet.";
    }
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name === "FaucetCooldown") {
        const at = revert.data?.args?.[0];
        return typeof at === "bigint"
          ? `The faucet gives one claim per 8 hours. Next claim: ${fmtDateTime(at)}.`
          : "The faucet gives one claim per 8 hours.";
      }
      if (name && REASONS[name]) return REASONS[name];
      if (name) return `The contract refused this (${name}).`;
      if (revert.reason) return revert.reason;
    }
    return err.shortMessage || err.message.split("\n")[0];
  }
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}
