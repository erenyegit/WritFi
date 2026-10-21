"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MarkGlyph } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

import { TestFunds, TestFundsPanel } from "./TestFunds";
import { WalletButton } from "./WalletButton";

/**
 * The name in the middle, the sections on the left, the wallet on the right,
 * and nothing else. A section that is not open yet is set in grey; its page
 * says "Coming soon". Below lg the sections fold into a menu.
 *
 * `soon`: pre-launch, when only early access is open and the desk pages say "Coming soon".
 */
export function Header({ homeHref, soon = false }: { homeHref: string; soon?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  const desk = [
    { href: "/earn", label: "Earn", soon },
    { href: "/positions", label: "Portfolio", soon },
  ];
  const early = { href: "/early", label: "Early access", soon: false };
  const nav = [
    // Pre-launch, the one open part of the site leads.
    ...(soon ? [early, ...desk] : [...desk, early]),
    // While the splash holds "/", the explainer is not reachable; skip the link.
    ...(homeHref === "/" ? [{ href: "/#how", label: "How it works", soon: false }] : []),
  ];
  const active = (href: string) =>
    href.startsWith("/#") ? false : pathname === href || pathname.startsWith(`${href}/`);
  const tone = (n: (typeof nav)[number]) =>
    active(n.href) ? "text-ink" : n.soon ? "text-ink-300 hover:text-ink-500" : "text-ink-500 hover:text-ink";

  return (
    <header className="sticky top-0 z-30 border-b border-paper-line bg-paper">
      <div className="mx-auto grid h-16 max-w-page grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-8">
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Sections">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              title={n.soon ? "Coming soon" : undefined}
              className={`whitespace-nowrap text-[14.5px] transition-colors ${tone(n)}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <Link
          href={homeHref}
          className="flex items-center gap-2 justify-self-start text-ink lg:justify-self-center"
          aria-label="Writ Fi home"
        >
          <MarkGlyph className="h-[15px] w-auto text-brand" />
          <span className="font-serif text-[21px] font-medium leading-none tracking-[-0.01em]">Writ Fi</span>
        </Link>

        <div className="flex items-center justify-end gap-2">
          <ThemeToggle />
          {!soon && <TestFunds className="hidden sm:inline-flex" />}
          {/* Pre-launch, connecting is only for early access sign-in, which works on any chain. */}
          <WalletButton
            requireGiwa={!soon}
            connectClassName="btn btn-sm border border-ink/80 bg-transparent text-ink hover:bg-ink hover:text-paper"
          />
          <button
            className="btn-quiet btn-sm w-10 px-0 lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-paper-line bg-paper-sheet lg:hidden">
          <nav className="mx-auto max-w-page px-5 py-2 sm:px-8" aria-label="Sections">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`flex items-center justify-between border-b border-paper-line py-3.5 text-[16px] last:border-b-0 ${tone(n)}`}
              >
                {n.label}
                {n.soon && <span className="text-[13px] text-ink-300">Coming soon</span>}
              </Link>
            ))}
          </nav>
          {!soon && (
            <div className="mx-auto max-w-page border-t border-paper-line px-5 py-4 sm:hidden">
              <TestFundsPanel />
            </div>
          )}
        </div>
      )}
    </header>
  );
}
