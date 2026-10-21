import Link from "next/link";

import { BoltIcon, LockIcon, SealIcon, ShieldIcon } from "@/components/Icons";
import { TermSheet } from "@/components/TermSheet";
import { addressUrl } from "@/lib/addresses";
import { deployment } from "@/lib/deployments";

const steps = [
  {
    title: "Pick a price and a date.",
    body: "A price below today's to buy BTC, or above it to sell, and one of the coming Fridays. Every date fixes at 08:00 UTC, the same weekly fixing Deribit uses for BTC options, so makers can hedge and quote tighter.",
  },
  {
    title: "Get paid when you sign.",
    body: "Makers compete through a request for quote. The best signed price wins, and its premium reaches your wallet in the same transaction that locks your collateral.",
  },
  {
    title: "Settle on Pyth's price.",
    body: "At the fixing the contract takes the first Pyth BTC/USD price at or after 08:00 UTC and checks Pyth's signatures itself. Out of the money, your collateral comes back. In the money, you trade at your price.",
  },
];

const guarantees = [
  {
    icon: ShieldIcon,
    title: "Fully collateralized",
    body: "Both sides lock what they may owe before anything happens. You lock cash or BTC; the maker reserves the other side from its own balance. No leverage, no liquidations, no margin calls.",
  },
  {
    icon: SealIcon,
    title: "Prices checked on-chain",
    body: "GIWA's Pyth contract has not been upgraded to Pyth's current signers, so Writ verifies each update itself, against the same five guardians Pyth's own contracts use on Ethereum and Base.",
  },
  {
    icon: LockIcon,
    title: "Limits written into the contract",
    body: "A maker can cap the premium any of its quotes may pay. Only a maker can rotate its own signing key. A new price oracle takes effect only after a one-day public notice.",
  },
  {
    icon: BoltIcon,
    title: "No front-running",
    body: "Quotes are signed, single-use and valid for 20 seconds. GIWA confirms in about 200 milliseconds and has no public mempool, so nobody can see a quote and trade ahead of it.",
  },
];

const risks = [
  {
    title: "Assignment",
    body: "If the price crosses yours, you trade at your price even when the market has moved further. A put can leave you holding BTC worth less than you paid; a covered call can sell BTC below where it ends up.",
  },
  {
    title: "Locked until the date",
    body: "Positions cannot be closed early. Your collateral is committed until the fixing.",
  },
  {
    title: "Smart contracts",
    body: "The contracts are open source and tested, but not audited. This runs on a testnet with test tokens that have no value.",
  },
  {
    title: "Oracle",
    body: "Settlement needs a verifiable Pyth price at the fixing. If there is none, the owner can settle at the published price, but only after a delay of at least one day.",
  },
];

const faq: [string, string][] = [
  [
    "Which price settles my option?",
    "The first Pyth BTC/USD price published at or after 08:00 UTC on your date. The contract also checks that the price before it was published before 08:00, so nobody can pick a different tick, and settling later never changes the result.",
  ],
  [
    "Does BTC actually change hands?",
    "Yes. Settlement is physical. An assigned put buys the BTC with your locked USDC and sends it to your wallet. An assigned covered call sells your locked BTC and sends you the USDC.",
  ],
  [
    "Do I need to do anything at expiry?",
    "No. A keeper settles every fixing shortly after 08:00 UTC and the proceeds go straight to your wallet. You, or anyone, can also settle an expired position from the Portfolio page.",
  ],
  [
    "How is the premium priced?",
    "Each maker prices its own quotes. The in-house maker uses Black-Scholes on Deribit's implied volatility for the same Friday expiries, falls back to its own volatility model when Deribit cannot be reached, and bids a spread below fair value. The board shows indicative rates; the quote for your size is the firm one.",
  ],
  [
    "What if the maker stops quoting?",
    "Open positions are unaffected: collateral sits in the contract and settlement only needs Pyth's price. You cannot open new positions until quoting resumes.",
  ],
  [
    "Why is there a minimum size?",
    "Every position costs gas to settle. The minimum is 10 USDC of notional, and sizes go in steps of 0.0001 BTC.",
  ],
  [
    "Is this live with real money?",
    "No. Writ runs on GIWA Sepolia with test USDC and test BTC. It was selected for Phase 3 of GASOK, GIWA's incubation program, which covers the move to mainnet.",
  ],
];

const contracts = [
  { name: "Options market", note: "Positions, maker balances, settlement", address: deployment.core },
  { name: "Price oracle", note: "Verifies Pyth updates on-chain", address: deployment.oracle },
  { name: "Test USDC", note: "6 decimals, faucet", address: deployment.usdc },
  { name: "Test BTC", note: "8 decimals, faucet", address: deployment.btc },
];

export default function LandingPage() {
  return (
    <div className="space-y-24 pt-12 sm:pt-20">
      {/* ------------------------------------------------------------ hero */}
      <section className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
        <div>
          <div className="eyebrow">BTC options on GIWA</div>
          <h1 className="display mt-4 text-[40px] leading-[1.05] sm:text-[58px]">
            Get paid today for the BTC price you would trade at.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-500">
            Name a price and a date. A maker pays you a premium the moment you sign, in the same transaction that
            locks your collateral. On the date you either keep your collateral or trade at the price you named.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/earn" className="btn-primary h-12 px-6">
              Open the desk
            </Link>
            <Link href="#how" className="btn-quiet h-12 px-6">
              How it works
            </Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2.5 text-[13.5px] text-ink-500">
            {["Fully collateralized", "Settles on Pyth", "GIWA Sepolia testnet", "Selected for GASOK Phase 3"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="dot bg-ink-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <TermSheet />
      </section>

      {/* ------------------------------------------------------------ how */}
      <section id="how" className="scroll-mt-24">
        <SectionHead label="How it works" title="Three steps, one transaction to open." />
        <ol className="mt-10 grid gap-px overflow-hidden rounded-sheet border border-paper-line bg-paper-line md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-paper-sheet p-6 sm:p-7">
              <span className="num text-[13px] text-ink-400">
                0{i + 1}
              </span>
              <h3 className="mt-3 text-[18px] font-medium">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ products */}
      <section>
        <SectionHead label="Two ways to earn" title="Choose the side you would be glad to end up on." />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Product
            name="Buy BTC lower"
            kind="Cash-secured put"
            lock="USDC equal to your price times the size"
            yes="BTC fixes below your price: you buy it there, and the BTC lands in your wallet."
            no="BTC fixes at or above your price: your USDC comes back."
            who="For someone who wants BTC and is happy to wait for a lower price."
            href="/earn?side=put"
          />
          <Product
            name="Sell BTC higher"
            kind="Covered call"
            lock="The BTC itself"
            yes="BTC fixes above your price: you sell it there and receive USDC."
            no="BTC fixes at or below your price: your BTC comes back."
            who="For someone holding BTC with a price in mind to take profit at."
            href="/earn?side=call"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ guarantees */}
      <section>
        <SectionHead label="What holds it together" title="Every promise is backed before it is made." />
        <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {guarantees.map((g) => (
            <div key={g.title} className="flex gap-4">
              <span className="icon-tile">
                <g.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-[17px] font-medium">{g.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">{g.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ risks */}
      <section className="sheet p-6 sm:p-10">
        <SectionHead label="Risks" title="What you are agreeing to, plainly." />
        <dl className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {risks.map((r) => (
            <div key={r.title}>
              <dt className="text-[16px] font-medium text-ink">{r.title}</dt>
              <dd className="mt-1.5 text-[14.5px] leading-relaxed text-ink-500">{r.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------------------ faq */}
      <section className="grid gap-10 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionHead label="Questions" title="Before you sign." />
        <div className="divide-y divide-paper-line border-y border-paper-line">
          {faq.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer items-center justify-between gap-6 text-[16px] text-ink">
                {q}
                <span className="num text-ink-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ contracts */}
      <section>
        <SectionHead label="Contracts" title="Everything is on-chain and readable." />
        <div className="sheet mt-8 divide-y divide-paper-line">
          {contracts.map((c) => (
            <a
              key={c.address}
              href={addressUrl(c.address)}
              target="_blank"
              rel="noreferrer"
              className="grid gap-1 px-5 py-4 transition hover:bg-paper-sunk sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-center sm:gap-6"
            >
              <div>
                <div className="text-[15px] font-medium text-ink">{c.name}</div>
                <div className="text-[13px] text-ink-500">{c.note}</div>
              </div>
              <div className="num truncate text-[13px] text-ink-700">{c.address}</div>
              <span className="hidden text-[13px] text-ink-400 sm:block">Explorer ↗</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <div className="eyebrow">{label}</div>
      <h2 className="display mt-4 text-[30px] leading-[1.12] sm:text-[38px]">{title}</h2>
    </div>
  );
}

function Product({
  name,
  kind,
  lock,
  yes,
  no,
  who,
  href,
}: {
  name: string;
  kind: string;
  lock: string;
  yes: string;
  no: string;
  who: string;
  href: string;
}) {
  return (
    <div className="sheet sheet-hover flex flex-col p-6 sm:p-7">
      <div className="eyebrow">{kind}</div>
      <h3 className="display mt-2 text-[26px]">{name}</h3>
      <dl className="mt-5 space-y-3 text-[14.5px]">
        <div>
          <dt className="text-[13px] text-ink-400">You lock</dt>
          <dd className="text-ink">{lock}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-400">You receive</dt>
          <dd className="text-ink">The premium, when you sign</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-400">At the fixing</dt>
          <dd className="text-ink">{yes}</dd>
          <dd className="mt-1 text-ink">{no}</dd>
        </div>
      </dl>
      <p className="mt-5 text-[13.5px] text-ink-500">{who}</p>
      <div className="mt-auto pt-6">
        <Link href={href} className="btn-quiet btn-sm">
          See the rates →
        </Link>
      </div>
    </div>
  );
}
