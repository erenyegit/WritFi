import { getAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

import { publicClient } from "@/lib/desk/client";

/** The page asks for ten minutes; anything older or longer-lived is refused. */
const MAX_LIFE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

/**
 * Why a sign-in was refused, when the reason helps the person: "timing" means
 * the message's times are off (a device clock far from real time), "contract"
 * a smart-contract wallet whose signature only its own chain can check.
 */
export type SignInRefusal = "timing" | "contract" | "invalid";

/**
 * The wallet that signed this Sign-In with Ethereum message, or why it was
 * refused when the domain, nonce, timing or signature is off.
 */
export async function verifySignIn(
  message: string,
  signature: Hex,
  expected: { domain: string; nonce: string },
): Promise<{ address: Address } | { refused: SignInRefusal }> {
  const invalid = { refused: "invalid" as const };
  if (!expected.domain || !expected.nonce || message.length > 2000) return invalid;
  const fields = parseSiweMessage(message);
  // Times are checked here, with their own reason; the rest is viem's check.
  const issued = fields.issuedAt?.getTime();
  const expires = fields.expirationTime?.getTime();
  if (!issued || !expires || Number.isNaN(issued) || Number.isNaN(expires)) return invalid;
  const now = Date.now();
  if (issued > now + CLOCK_SKEW_MS || now - issued > MAX_LIFE_MS || expires <= now) return { refused: "timing" };
  if (expires - issued > MAX_LIFE_MS + CLOCK_SKEW_MS) return invalid;
  if (!validateSiweMessage({ message: fields, domain: expected.domain, nonce: expected.nonce })) return invalid;

  const address = getAddress(fields.address!);
  try {
    if ((await recoverMessageAddress({ message, signature })) === address) return { address };
  } catch {
    // not a plain wallet signature; try the contract wallet path below
  }
  // Smart contract wallets sign through ERC-1271, which only the chain can check.
  try {
    if (await publicClient.verifyMessage({ address, message, signature })) return { address };
  } catch {
    // unreachable chain or a malformed signature: treat as not signed
  }
  // A plain wallet signature is 65 bytes; anything else came from a contract
  // wallet, checked above on GIWA only, where its contract usually is not.
  return signature.length !== 132 ? { refused: "contract" } : invalid;
}
