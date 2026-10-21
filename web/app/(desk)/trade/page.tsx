import { redirect } from "next/navigation";

/** The ticket moved to /earn; old links keep working. */
export default function TradePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const q = new URLSearchParams();
  if (searchParams.side === "put" || searchParams.side === "call") q.set("side", searchParams.side);
  if (searchParams.strike) q.set("strike", searchParams.strike);
  redirect(q.size ? `/earn?${q}` : "/earn");
}
