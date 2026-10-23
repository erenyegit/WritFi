"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { addressUrl } from "@/lib/addresses";
import { giwaSepolia } from "@/lib/chain";
import { fmtBtc8, fmtUsdcAmount, shortAddr } from "@/lib/format";
import { useWallet } from "@/lib/hooks";

import { OpenInWallet } from "./OpenInWallet";
import { Popover } from "./Popover";

/**
 * `connectClassName` and `align` style the connect state, for pages that place
 * it outside the header. `requireGiwa: false` connects on whatever chain the
 * wallet is on and never asks to switch: signing in needs no network.
 */
export function WalletButton({
  connectClassName = "btn-ink btn-sm",
  align = "right",
  requireGiwa = true,
}: { connectClassName?: string; align?: "left" | "right" | "center"; requireGiwa?: boolean } = {}) {
  const chainId = requireGiwa ? giwaSepolia.id : undefined;
  const { connector } = useAccount();
  const { connect, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wallet = useWallet();

  // wagmi always registers a generic injected connector; when EIP-6963 has
  // found named wallets, list those instead of the anonymous one.
  const named = connectors.filter((c) => c.type !== "injected" || c.id !== "injected");
  const choices = named.length > 0 ? named : connectors;
  const [injectedProvider, setInjectedProvider] = useState(true);
  useEffect(() => {
    setInjectedProvider(typeof window !== "undefined" && "ethereum" in window);
  }, []);
  // A wallet may announce itself over EIP-6963 without setting window.ethereum.
  const hasProvider = injectedProvider || named.length > 0;

  if (!wallet.isConnected) {
    return (
      <Popover
        align={align}
        // The header's button sits ~70px from the screen's right edge; keep the
        // panel on small phones, and let the tall no-wallet panel scroll.
        panelClassName="w-72 max-w-[calc(100vw-88px)] max-h-[calc(100dvh-5rem)] overflow-y-auto"
        trigger={(open, toggle) => (
          <button
            className={connectClassName}
            aria-expanded={open}
            onClick={() => {
              reset();
              if (choices.length === 1 && hasProvider) connect({ connector: choices[0], chainId });
              else toggle();
            }}
            disabled={isPending}
          >
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      >
        {(close) =>
          !hasProvider ? (
            <OpenInWallet />
          ) : (
            <div className="space-y-1">
              <div className="label mb-2">Choose a wallet</div>
              {choices.map((c) => (
                <button
                  key={c.uid}
                  className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-[14px] text-ink hover:bg-paper-sunk"
                  onClick={() => {
                    close();
                    connect({ connector: c, chainId });
                  }}
                >
                  {c.name}
                  <span className="text-ink-400">→</span>
                </button>
              ))}
              {error && <p className="pt-2 text-[13px] text-bad">{error.message.split("\n")[0]}</p>}
            </div>
          )
        }
      </Popover>
    );
  }

  if (wallet.wrongChain && requireGiwa) {
    return (
      <button
        className="btn-primary btn-sm"
        disabled={switching}
        onClick={() => switchChain({ chainId: giwaSepolia.id })}
      >
        {switching ? "Switching…" : "Switch to GIWA"}
      </button>
    );
  }

  return (
    <Popover
      panelClassName="w-72"
      trigger={(open, toggle) => (
        <button className="btn-quiet btn-sm font-mono text-[13.5px]" aria-expanded={open} onClick={toggle}>
          <span className="dot bg-good" />
          {shortAddr(wallet.address!)}
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-3 text-[14px]">
          <div className="flex items-baseline justify-between">
            <span className="label">Wallet</span>
            <span className="text-[12.5px] text-ink-400">{connector?.name}</span>
          </div>
          <div className="num break-all text-[13px] text-ink">{wallet.address}</div>
          <div className="inset divide-y divide-paper-line text-[13.5px]">
            <Row label="USDC" value={wallet.usdc === undefined ? "…" : fmtUsdcAmount(wallet.usdc)} />
            <Row label="BTC" value={wallet.btc === undefined ? "…" : fmtBtc8(wallet.btc)} />
            <Row
              label="ETH (gas)"
              value={wallet.eth === undefined ? "…" : (Number(wallet.eth) / 1e18).toFixed(5)}
            />
          </div>
          <div className="flex gap-2">
            <a className="btn-quiet btn-sm flex-1" href={addressUrl(wallet.address!)} target="_blank" rel="noreferrer">
              Explorer
            </a>
            <button
              className="btn-quiet btn-sm flex-1"
              onClick={() => {
                close();
                disconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-2">
      <span className="text-ink-500">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}
