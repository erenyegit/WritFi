"use client";

import { useReadContracts } from "wagmi";

import { faucetAbi } from "@/lib/abi";
import { BTC_ADDRESS, GAS_FAUCET_URL, USDC_ADDRESS } from "@/lib/addresses";
import { fmtRelative } from "@/lib/format";
import { txLine, useNow, useTx, useWallet } from "@/lib/hooks";

import { Popover } from "./Popover";

/**
 * Everything a first-time tester needs, in one place: gas from GIWA's faucet,
 * then the two test tokens from their own contracts (one claim per 8 hours).
 */
export function TestFunds({ className = "" }: { className?: string }) {
  return (
    <Popover
      panelClassName="w-80"
      trigger={(open, toggle) => (
        <button className={`btn-quiet btn-sm ${className}`} aria-expanded={open} onClick={toggle}>
          Test funds
        </button>
      )}
    >
      {() => <TestFundsPanel />}
    </Popover>
  );
}

export function TestFundsPanel() {
  const wallet = useWallet();
  const tx = useTx();
  const now = useNow(5_000);

  const { data, refetch } = useReadContracts({
    allowFailure: true,
    contracts: wallet.address
      ? [
          { abi: faucetAbi, address: USDC_ADDRESS, functionName: "faucetCooldown", args: [wallet.address] },
          { abi: faucetAbi, address: BTC_ADDRESS, functionName: "faucetCooldown", args: [wallet.address] },
        ]
      : [],
    query: { enabled: !!wallet.address },
  });
  const cooldown = (i: number) => (data?.[i]?.status === "success" ? Number(data[i].result as bigint) : 0);

  const claim = async (token: "USDC" | "BTC") => {
    const ok = await tx.send(`Claim test ${token}`, {
      abi: faucetAbi,
      address: token === "USDC" ? USDC_ADDRESS : BTC_ADDRESS,
      functionName: "faucet",
    });
    if (ok) {
      refetch();
      wallet.refetch();
    }
  };

  const noGas = wallet.eth !== undefined && wallet.eth === 0n;

  return (
    <div className="space-y-4 text-[14px]">
      <div>
        <div className="label">Testnet funds</div>
        <p className="mt-1 text-ink-500">Nothing here has value. Claims are free apart from gas.</p>
      </div>

      <Step n="1" title="Gas" note={noGas ? "Your wallet has no ETH on GIWA Sepolia yet." : "0.01 ETH a day, enough for hundreds of trades."}>
        <a className="btn-quiet btn-sm" href={GAS_FAUCET_URL} target="_blank" rel="noreferrer">
          Open faucet ↗
        </a>
      </Step>

      <Step n="2" title="2,000 test USDC" note="Collateral for puts.">
        <ClaimButton
          disabled={!wallet.address || tx.busy || noGas}
          wait={cooldown(0)}
          now={now}
          onClick={() => claim("USDC")}
        />
      </Step>

      <Step n="3" title="1 test BTC" note="Collateral for covered calls.">
        <ClaimButton
          disabled={!wallet.address || tx.busy || noGas}
          wait={cooldown(1)}
          now={now}
          onClick={() => claim("BTC")}
        />
      </Step>

      {!wallet.address && <p className="text-ink-500">Connect a wallet to claim.</p>}
      {txLine(tx.state) && <p className="text-ink-500">{txLine(tx.state)}</p>}
      {tx.state.status === "done" && <p className="text-good">{tx.state.label}: done.</p>}
      {tx.state.status === "error" && <p className="text-bad">{tx.state.error}</p>}
    </div>
  );
}

function Step({ n, title, note, children }: { n: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-paper-line pt-3">
      <div className="flex gap-3">
        <span className="num pt-[1px] text-[12px] text-ink-400">{n}</span>
        <div>
          <div className="font-medium text-ink">{title}</div>
          <div className="text-[13px] text-ink-500">{note}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function ClaimButton({
  disabled,
  wait,
  now,
  onClick,
}: {
  disabled: boolean;
  wait: number;
  now: number;
  onClick: () => void;
}) {
  if (wait > 0) {
    return <span className="whitespace-nowrap pt-2 text-[12.5px] text-ink-400">{fmtRelative(now + wait, now)}</span>;
  }
  return (
    <button className="btn-quiet btn-sm" disabled={disabled} onClick={onClick}>
      Claim
    </button>
  );
}
