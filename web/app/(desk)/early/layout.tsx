import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Early access",
  description:
    "Complete a few steps, invite friends and climb the board. The first Writ Fi users are picked from this list.",
};

export default function EarlyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
