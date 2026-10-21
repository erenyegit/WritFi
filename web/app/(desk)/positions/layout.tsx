import type { Metadata } from "next";

import { DeskComingSoon } from "@/components/DeskComingSoon";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Open and settled positions, read straight from the contract, and every expiry waiting to settle.",
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  // Pre-launch only early access is open; read at build time like the splash.
  if (process.env.COMING_SOON === "true") {
    return (
      <DeskComingSoon
        section="Portfolio"
        body="Your positions, premiums and settlements will live here once the desk opens. Early access members get in first."
        points={["Read straight from the contract", "Settles by itself after the fixing", "Nothing to claim by hand"]}
      />
    );
  }
  return children;
}
