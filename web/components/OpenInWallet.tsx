"use client";

import { useEffect, useRef, useState } from "react";

import { inviteCodeHere } from "@/lib/early/client";

/**
 * Wallet apps that open a link in their own browser, where signing works. Most
 * visitors come from X on a phone and land in X's built-in browser, which has
 * no wallet; these send them on with one tap. Binance publishes no such link,
 * so its users copy the link instead.
 */
const WALLETS: { name: string; open: (url: string) => string }[] = [
  { name: "MetaMask", open: (url) => `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}` },
  { name: "Trust Wallet", open: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  {
    name: "OKX Wallet",
    open: (url) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  },
  { name: "Bitget Wallet", open: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}` },
  { name: "Coinbase Wallet", open: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
];

/**
 * What a browser without a wallet shows instead of a wallet list. The link it
 * hands on carries the visitor's invite: the cookie and storage holding it stay
 * behind in this browser, so without it the friend who invited them gets nothing.
 */
export function OpenInWallet() {
  const [url, setUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [invited, setInvited] = useState(false);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const code = inviteCodeHere();
    setInvited(!!code);
    setUrl(code ? `${location.origin}/r/${code}` : `${location.origin}${location.pathname}`);
    const ua = navigator.userAgent;
    // iPads report a desktop Mac user agent; touch points give them away.
    setPhone(/Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Some in-app browsers block the clipboard API; the older command still works there.
      field.current?.select();
      if (!document.execCommand("copy")) return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!url) return null;
  return (
    <div className="space-y-3 text-[14px]">
      <div className="space-y-1">
        <p className="font-medium text-ink">{phone ? "Open Writ Fi in your wallet app" : "No wallet found in this browser."}</p>
        <p className="text-ink-500">
          {phone
            ? "Signing in needs a wallet, and this browser has none. Pick yours to open this page inside it"
            : "Install a browser wallet such as MetaMask or Rabby, then reload. Or open this link in your phone's wallet app"}
          {invited ? ", with your invite." : "."}
        </p>
      </div>
      {phone && (
        <div className="space-y-1">
          {WALLETS.map((w) => (
            <a
              key={w.name}
              href={w.open(url)}
              className="flex w-full items-center justify-between rounded px-2 py-2 text-[14px] text-ink hover:bg-paper-sunk"
            >
              {w.name}
              <span className="text-ink-400">→</span>
            </a>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {phone && <p className="text-[13px] text-ink-500">Another wallet, such as Binance? Copy the link and open it in that wallet&apos;s browser.</p>}
        <input
          ref={field}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link to this page"
          className="num w-full rounded border border-paper-line bg-paper-sunk px-2 py-1.5 text-[12.5px] text-ink-700"
        />
        <button className="btn-quiet btn-sm w-full" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
