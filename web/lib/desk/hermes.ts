import { BTC_USD_FEED_ID } from "../deployments";
import { deskConfig, hermesHeaders } from "./config";

// Spot lives in price.ts, which falls back to other sources. What stays here has
// no substitute: the signed update the contract verifies at settlement.

export class SettlementDataError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * The update for the first tick at or after `publishTime`, hex encoded. Goes
 * straight into settle()'s oracleData after abi-encoding as bytes[].
 */
export async function fetchSettlementUpdate(publishTime: number): Promise<`0x${string}`[]> {
  const url =
    `${deskConfig.hermesUrl}/v2/updates/price/${publishTime}` +
    `?ids[]=${BTC_USD_FEED_ID}&encoding=hex`;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: hermesHeaders(),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SettlementDataError("Pyth's data service did not answer in time.", 504);
  }
  if (res.status === 401 || res.status === 403) {
    // Say what actually broke. "Hermes 403" sent us hunting in the wrong place.
    throw new SettlementDataError("Pyth rejected the API key. Renew PYTH_API_KEY.", 502);
  }
  if (res.status === 404) {
    throw new SettlementDataError(
      "Pyth has no update for that time. Hermes keeps about two months of history.",
      410,
    );
  }
  if (!res.ok) throw new SettlementDataError(`Pyth returned ${res.status}.`, 502);
  const body = (await res.json()) as { binary: { data: string[] } };
  return body.binary.data.map((d) => (d.startsWith("0x") ? d : `0x${d}`) as `0x${string}`);
}
