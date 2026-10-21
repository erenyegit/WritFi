// Regenerates lib/abi.generated.ts from the Foundry build.
// Usage: (cd ../contracts && forge build) && node scripts/gen-abi.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "contracts", "out");
const read = (file, name) => JSON.parse(readFileSync(join(out, file, `${name}.json`), "utf8")).abi;

const core = read("WritOptions.sol", "WritOptions").filter((e) =>
  ["function", "event", "error"].includes(e.type),
);
const coreErrors = new Set(core.filter((e) => e.type === "error").map((e) => e.name));
const oracleErrors = read("PythAccumulatorAdapter.sol", "PythAccumulatorAdapter").filter(
  (e) => e.type === "error" && !coreErrors.has(e.name),
);
const faucet = read("TestUSDC.sol", "TestUSDC").filter(
  (e) =>
    (e.type === "function" && ["faucet", "faucetCooldown", "lastClaimed", "FAUCET_AMOUNT"].includes(e.name)) ||
    (e.type === "error" && e.name === "FaucetCooldown"),
);

const dump = (v) => JSON.stringify(v, null, 2);
writeFileSync(
  join(here, "..", "lib", "abi.generated.ts"),
  `/**
 * Generated from the Foundry build (contracts/out). Do not edit by hand:
 * run \`pnpm abi\` in web/ after changing a contract.
 */

export const coreAbi = ${dump(core)} as const;

/** Settlement errors the oracle adapter can bubble up through settle(). */
export const oracleErrorsAbi = ${dump(oracleErrors)} as const;

export const faucetAbi = ${dump(faucet)} as const;
`,
);
console.log(`abi: ${core.length} core items, ${oracleErrors.length} oracle errors, ${faucet.length} faucet items`);
