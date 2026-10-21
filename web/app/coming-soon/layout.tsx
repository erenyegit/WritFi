import type { Viewport } from "next";
import { Space_Grotesk } from "next/font/google";

// The splash keeps its own face; the desk uses IBM Plex.
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-grotesk",
});

// The splash is dark whatever the desk's theme, so the browser chrome matches it.
export const viewport: Viewport = {
  themeColor: "#05081a",
};

export default function ComingSoonLayout({ children }: { children: React.ReactNode }) {
  return <div className={grotesk.variable}>{children}</div>;
}
