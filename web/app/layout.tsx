import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif, Outfit } from "next/font/google";

import "./globals.css";

// IBM Plex: the earlier text and headline faces, kept for ?font=plex and for the
// splash's small print. globals.css maps --font-sans and --font-serif.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const serif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-serif",
  preload: false,
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

// The text and headline face: Outfit, a free geometric sans (SIL Open Font
// License) standing in for Jeko, which needs a paid licence.
const geo = Outfit({
  subsets: ["latin"],
  variable: "--font-geo",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.writ.fi"),
  title: {
    default: "Writ Fi · Get paid today for the BTC price you'd trade at",
    template: "%s · Writ Fi",
  },
  description:
    "Sell fully collateralized BTC options on GIWA. Name a price and a date, receive the premium when you sign, and at expiry keep your collateral or trade at your price.",
};

export const viewport: Viewport = {
  themeColor: "#F5F6F8",
};

// Header, footer and wallet providers live in app/(desk)/layout.tsx, so the
// coming soon splash renders full screen without loading any of them.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="day"
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${geo.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the day/night choice before the first paint, so the page never flashes.
            ?theme=day or ?theme=night in a link sets it too. ?font=plex shows that one page
            in IBM Plex for comparison; it is not remembered. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=new URLSearchParams(location.search),d=document.documentElement,q=p.get("theme"),f=p.get("font");if(q==="day"||q==="night")localStorage.setItem("writ:theme",q);var t=localStorage.getItem("writ:theme");if(t==="day"||t==="night")d.dataset.theme=t;if(f==="plex")d.dataset.font="plex"}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
