import type { Metadata } from "next";

import { DeskComingSoon } from "@/components/DeskComingSoon";

export const metadata: Metadata = {
  title: "Earn",
  description: "Pick a price and a Friday, see the rate for every strike, and get paid the moment you sign.",
};

export default function EarnLayout({ children }: { children: React.ReactNode }) {
  // Pre-launch only early access is open; read at build time like the splash.
  if (process.env.COMING_SOON === "true") {
    return (
      <DeskComingSoon
        section="Earn"
        body="Name a BTC price and a date, and get paid the moment you sign. The desk opens to early access members first."
        points={["Fully collateralized", "Paid when you sign", "Settles on Pyth"]}
      />
    );
  }
  return children;
}
