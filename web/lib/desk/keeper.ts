/**
 * The keeper: settles every position whose expiry has passed.
 *
 * Settlement is permissionless and only ever uses the price Pyth published at
 * expiry, so it does not matter who runs this or when. It matters that someone
 * does, and soon: Hermes keeps about two months of history, and an update stops
 * verifying once the guardian set that signed it is rotated out. The first
 * deployment's only position sat unsettled long enough to lose its proof.
 *
 * Positions sharing an expiry settle in one settleMany call against one update.
 */

import { createWalletClient, encodeAbiParameters, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { coreAbi, PositionState } from "../abi";
import { giwaSepolia } from "../chain";
import { publicClient } from "./client";
import { deskConfig, resolveKeeperKey } from "./config";
import { fetchSettlementUpdate } from "./hermes";

/** Pyth publishes the expiry tick within a second or two; allow a little more. */
const GRACE_SEC = 60;
const PAGE = 200n;
/** Keeps a single settleMany comfortably inside a block. */
const BATCH = 40;

export interface DueGroup {
  expiry: number;
  ids: bigint[];
}

export interface KeeperReport {
  now: number;
  keeper: `0x${string}` | null;
  dryRun: boolean;
  scanned: number;
  due: { expiry: number; ids: string[] }[];
  settled: { expiry: number; ids: string[]; tx: `0x${string}` }[];
  failed: { expiry: number; ids: string[]; error: string }[];
}

/** Every open position whose expiry is at least GRACE_SEC in the past, by expiry. */
export async function findDue(now = Math.floor(Date.now() / 1000)): Promise<{ scanned: number; groups: DueGroup[] }> {
  const next = await publicClient.readContract({
    abi: coreAbi,
    address: deskConfig.coreAddress,
    functionName: "nextPositionId",
  });

  const byExpiry = new Map<number, bigint[]>();
  let scanned = 0;
  for (let from = 1n; from < next; from += PAGE) {
    const page = await publicClient.readContract({
      abi: coreAbi,
      address: deskConfig.coreAddress,
      functionName: "getPositions",
      args: [from, PAGE],
    });
    page.forEach((p, i) => {
      scanned += 1;
      const expiry = Number(p.expiry);
      if (p.state === PositionState.Open && expiry + GRACE_SEC <= now) {
        const ids = byExpiry.get(expiry) ?? [];
        ids.push(from + BigInt(i));
        byExpiry.set(expiry, ids);
      }
    });
  }

  const groups = [...byExpiry.entries()]
    .sort(([a], [b]) => a - b)
    .map(([expiry, ids]) => ({ expiry, ids }));
  return { scanned, groups };
}

export async function runKeeper({ dryRun = false } = {}): Promise<KeeperReport> {
  const now = Math.floor(Date.now() / 1000);
  const key = resolveKeeperKey();
  const account = key ? privateKeyToAccount(key) : null;
  const { scanned, groups } = await findDue(now);

  const report: KeeperReport = {
    now,
    keeper: account?.address ?? null,
    dryRun: dryRun || !account,
    scanned,
    due: groups.map((g) => ({ expiry: g.expiry, ids: g.ids.map(String) })),
    settled: [],
    failed: [],
  };
  if (report.dryRun || !account) return report;

  const wallet = createWalletClient({
    account,
    chain: giwaSepolia,
    transport: http(deskConfig.rpcUrl, { timeout: 15_000 }),
  });

  for (const group of groups) {
    let oracleData: `0x${string}`;
    try {
      const updates = await fetchSettlementUpdate(group.expiry);
      oracleData = encodeAbiParameters([{ type: "bytes[]" }], [updates]);
    } catch (err) {
      report.failed.push({
        expiry: group.expiry,
        ids: group.ids.map(String),
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (let i = 0; i < group.ids.length; i += BATCH) {
      const ids = group.ids.slice(i, i + BATCH);
      try {
        // Simulate first: a revert here costs nothing and says why.
        const { request } = await publicClient.simulateContract({
          account,
          abi: coreAbi,
          address: deskConfig.coreAddress,
          functionName: "settleMany",
          args: [ids, oracleData],
        });
        const tx = await wallet.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 30_000 });
        if (receipt.status !== "success") throw new Error(`settleMany reverted in ${tx}`);
        report.settled.push({ expiry: group.expiry, ids: ids.map(String), tx });
      } catch (err) {
        report.failed.push({
          expiry: group.expiry,
          ids: ids.map(String),
          error: err instanceof Error ? err.message.split("\n")[0] : String(err),
        });
      }
    }
  }
  return report;
}
