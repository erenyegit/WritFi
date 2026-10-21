"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi, type Abi } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { coreAbi, oracleErrorsAbi } from "./abi";
import { BTC_ADDRESS, CORE_ADDRESS, USDC_ADDRESS } from "./addresses";
import { getMarket, type Market } from "./api";
import { giwaSepolia } from "./chain";
import { erc20ErrorsAbi, errorMessage } from "./errors";

/** Unix seconds, ticking. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Market snapshot, refreshed every 15s. Keeps the last good one on failure. */
export function useMarket(intervalMs = 15_000) {
  const [market, setMarket] = useState<Market | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(() => {
    getMarket()
      .then((m) => {
        if (!alive.current) return;
        setMarket(m);
        setError(null);
      })
      .catch((e: Error) => alive.current && setError(e.message));
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, intervalMs]);

  return { market, error, refresh: load };
}

/** Wallet balances and allowances for both collateral tokens, plus gas. */
export function useWallet() {
  const { address, isConnected, chainId } = useAccount();
  const enabled = !!address;
  const { data, refetch } = useReadContracts({
    allowFailure: true,
    contracts: address
      ? [
          { abi: erc20Abi, address: USDC_ADDRESS, functionName: "balanceOf", args: [address] },
          { abi: erc20Abi, address: BTC_ADDRESS, functionName: "balanceOf", args: [address] },
          { abi: erc20Abi, address: USDC_ADDRESS, functionName: "allowance", args: [address, CORE_ADDRESS] },
          { abi: erc20Abi, address: BTC_ADDRESS, functionName: "allowance", args: [address, CORE_ADDRESS] },
        ]
      : [],
    query: { enabled, refetchInterval: 12_000 },
  });
  const { data: eth, refetch: refetchEth } = useBalance({
    address,
    chainId: giwaSepolia.id,
    query: { enabled, refetchInterval: 20_000 },
  });

  const pick = (i: number) => (data?.[i]?.status === "success" ? (data[i].result as bigint) : undefined);
  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== giwaSepolia.id,
    usdc: pick(0),
    btc: pick(1),
    usdcAllowance: pick(2),
    btcAllowance: pick(3),
    eth: eth?.value,
    refetch: () => {
      refetch();
      refetchEth();
    },
  };
}

/** Every revert a write can produce, so failures decode to a named reason. */
const writeErrors = [...coreAbi, ...oracleErrorsAbi, ...erc20ErrorsAbi].filter((i) => i.type === "error");

export type TxStatus = "idle" | "switching" | "checking" | "wallet" | "pending" | "done" | "error";

export interface TxState {
  status: TxStatus;
  label?: string;
  hash?: `0x${string}`;
  error?: string;
}

/**
 * One path for every transaction: switch to GIWA if needed, simulate so a
 * revert is explained before the wallet opens, send, and wait for the receipt,
 * treating a mined-but-reverted transaction as the failure it is.
 */
export function useTx() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: giwaSepolia.id });
  const [state, setState] = useState<TxState>({ status: "idle" });

  const send = useCallback(
    async (
      label: string,
      params: { abi: Abi; address: `0x${string}`; functionName: string; args?: readonly unknown[]; value?: bigint },
    ) => {
      if (!address || !client) {
        setState({ status: "error", label, error: "Connect a wallet first." });
        return null;
      }
      try {
        if (chainId !== giwaSepolia.id) {
          setState({ status: "switching", label });
          await switchChainAsync({ chainId: giwaSepolia.id });
        }
        setState({ status: "checking", label });
        const abi = [...(params.abi as Abi), ...(writeErrors as unknown as Abi)];
        await client.simulateContract({ ...params, abi, account: address });

        setState({ status: "wallet", label });
        const hash = await writeContractAsync({ ...params, abi, chainId: giwaSepolia.id });

        setState({ status: "pending", label, hash });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction was mined but reverted.");

        setState({ status: "done", label, hash });
        return receipt;
      } catch (err) {
        setState((s) => ({ status: "error", label, hash: s.hash, error: errorMessage(err) }));
        return null;
      }
    },
    [address, chainId, client, switchChainAsync, writeContractAsync],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  const busy = ["switching", "checking", "wallet", "pending"].includes(state.status);
  return { state, send, reset, busy };
}

/** Human line for a transaction in flight. */
export function txLine(s: TxState) {
  switch (s.status) {
    case "switching":
      return "Switching your wallet to GIWA Sepolia…";
    case "checking":
      return "Checking the transaction…";
    case "wallet":
      return "Confirm in your wallet…";
    case "pending":
      return "Waiting for GIWA to confirm…";
    default:
      return null;
  }
}
