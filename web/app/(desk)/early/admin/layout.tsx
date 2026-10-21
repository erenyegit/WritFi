import type { Metadata } from "next";

export const metadata: Metadata = {
  // A plain title in the parent layout stops the root template, so spell it out.
  title: { absolute: "Early access list · Writ Fi" },
  robots: { index: false, follow: false },
};

export default function EarlyAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
