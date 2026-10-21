import Link from "next/link";

import { MailIcon, XIcon } from "@/components/Icons";
import { LogoMark } from "@/components/Logo";
import { SoonTag } from "@/components/SoonTag";
import { addressUrl } from "@/lib/addresses";
import { deployment } from "@/lib/deployments";
import { CONTACT_EMAIL, X_HANDLE, X_URL } from "@/lib/site";

const linkClass = "text-[14px] text-ink-500 transition hover:text-ink";

export function Footer({ homeHref, soon = false }: { homeHref: string; soon?: boolean }) {
  const product = [
    { href: "/earn", label: "Earn", soon },
    { href: "/positions", label: "Portfolio", soon },
    { href: "/early", label: "Early access", soon: false },
    ...(homeHref === "/" ? [{ href: "/#how", label: "How it works", soon: false }] : []),
  ];

  return (
    <footer className="border-t border-paper-line bg-paper-sheet">
      <div className="mx-auto w-full max-w-page px-5 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <Link href={homeHref} className="inline-flex items-center gap-2.5" aria-label="Writ Fi home">
              <LogoMark size={28} />
              <span className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Writ Fi</span>
            </Link>
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-ink-500">
              Fully collateralized on-chain options on GIWA. Premiums upfront. Settlement via Pyth.
            </p>
          </div>

          <nav aria-label="Product">
            <div className="label mb-4">Product</div>
            <ul className="space-y-3">
              {product.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className={linkClass}>
                    {p.label}
                    {p.soon && <SoonTag />}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <div className="label mb-4">Contracts</div>
            <ul className="space-y-3">
              <li>
                <a href={addressUrl(deployment.core)} target="_blank" rel="noreferrer" className={linkClass}>
                  Options market ↗
                </a>
              </li>
              <li>
                <a href={addressUrl(deployment.oracle)} target="_blank" rel="noreferrer" className={linkClass}>
                  Price oracle ↗
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="label mb-4">Contact</div>
            <ul className="space-y-3">
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className={`group inline-flex items-center gap-2.5 ${linkClass}`}>
                  <MailIcon className="h-4 w-4 text-ink-400 transition group-hover:text-ink" />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group inline-flex items-center gap-2.5 ${linkClass}`}
                >
                  <XIcon className="h-3.5 w-4 text-ink-400 transition group-hover:text-ink" />@{X_HANDLE}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-paper-line py-5 text-[13px] text-ink-400">
          <span>© {new Date().getFullYear()} Writ Fi</span>
          <span>GIWA Sepolia testnet · Unaudited · Not investment advice</span>
        </div>
      </div>
    </footer>
  );
}
