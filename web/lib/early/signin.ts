import { getAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

import { publicClient } from "@/lib/desk/client";

/** The page asks for ten minutes; anything older or longer-lived is refused. */
const MAX_LIFE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

/**
 * The wallet that signed this Sign-In with Ethereum message, or null when the
 * domain, nonce, timing or signature is off.
 */
export async function verifySignIn(
  message: string,
  signature: Hex,
  expected: { domain: string; nonce: string },
): Promise<Address | null> {
  if (!expected.domain || !expected.nonce || message.length > 2000) return null;
  const fields = parseSiweMessage(message);
  if (!validateSiweMessage({ message: fields, domain: expected.domain, nonce: expected.nonce })) return null;

  const now = Date.now();
  const issued = fields.issuedAt?.getTime();
  const expires = fields.expirationTime?.getTime();
  if (!issued || !expires || Number.isNaN(issued) || Number.isNaN(expires)) return null;
  if (issued > now + CLOCK_SKEW_MS || now - issued > MAX_LIFE_MS) return null;
  if (expires - issued > MAX_LIFE_MS + CLOCK_SKEW_MS) return null;

  const address = getAddress(fields.address!);
  try {
    if ((await recoverMessageAddress({ message, signature })) === address) return address;
  } catch {
    // not a plain wallet signature; try the contract wallet path below
  }
  // Smart contract wallets sign through ERC-1271, which only the chain can check.
  try {
    if (await publicClient.verifyMessage({ address, message, signature })) return address;
  } catch {
    // unreachable chain or a malformed signature: treat as not signed
  }
  return null;
}
