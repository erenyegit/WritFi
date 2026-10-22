import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

// The faces ship in app/fonts: the latin files Google Fonts serves, under the
// SIL Open Font License. Fetching them at build time failed on the VPS, where
// Google answered with font URLs next/font cannot read.

// IBM Plex: the earlier text and headline faces, kept for ?font=plex and for the
// splash's small print. globals.css maps --font-sans and --font-serif.
const sans = localFont({
  src: "./fonts/ibm-plex-sans-latin.woff2",
  weight: "400 600",
  variable: "--font-plex-sans",
});

const serif = localFont({
  src: [
    { path: "./fonts/ibm-plex-serif-latin-400.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-serif-latin-500.woff2", weight: "500" },
  ],
  variable: "--font-plex-serif",
  preload: false,
});

const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500" },
  ],
  variable: "--font-mono",
});

// The text and headline face: Outfit, a free geometric sans standing in for
// Jeko, which needs a paid licence.
const geo = localFont({
  src: "./fonts/outfit-latin.woff2",
  weight: "100 900",
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
