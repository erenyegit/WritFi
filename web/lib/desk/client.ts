import { createPublicClient, http } from "viem";

import { giwaSepolia } from "../chain";
import { deskConfig } from "./config";

/** One read client per server instance. */
export const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(deskConfig.rpcUrl, { timeout: 8_000 }),
});
