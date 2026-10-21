import { deployment } from "./deployments";

export const CORE_ADDRESS = deployment.core;
/** GIWA has no canonical stablecoin, so testnet uses a faucet-backed TestUSDC
 *  with USDC's 6 decimals. */
export const USDC_ADDRESS = deployment.usdc;
/** Faucet-backed underlying with BTC's 8 decimals: covered-call collateral and
 *  what an assigned put delivers. */
export const BTC_ADDRESS = deployment.btc;
export const ORACLE_ADDRESS = deployment.oracle;
export const MAKER_ADDRESS = deployment.maker;

export const EXPLORER_URL = "https://sepolia-explorer.giwa.io";
/** Gas for the testnet (0.01 ETH a day). */
export const GAS_FAUCET_URL = "https://faucet.lambda256.io/giwa-sepolia";

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
