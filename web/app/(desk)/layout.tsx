import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Backdrop } from "@/components/motion/Backdrop";
import { PhaseBand } from "@/components/PhaseBand";

import { Providers } from "./providers";

/** While the public site shows the splash, keep the working desk out of search. */
const comingSoon = process.env.COMING_SOON === "true";

export const metadata: Metadata = comingSoon ? { robots: { index: false, follow: false } } : {};

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {/* isolate: the backdrop's negative z-index stays inside this layer, above the body. */}
      <div className="relative isolate flex min-h-screen flex-col">
        <Backdrop />
        <Header homeHref={comingSoon ? "/early" : "/"} soon={comingSoon} />
        <PhaseBand />
        <main className="mx-auto w-full max-w-page flex-1 px-5 pb-24 sm:px-8">{children}</main>
        <Footer homeHref={comingSoon ? "/early" : "/"} soon={comingSoon} />
      </div>
    </Providers>
  );
}
