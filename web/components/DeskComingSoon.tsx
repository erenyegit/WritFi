import Link from "next/link";

import { XIcon } from "@/components/Icons";
import { MarkGlyph } from "@/components/Logo";
import { X_HANDLE, X_URL } from "@/lib/site";

/**
 * Stands in for a desk page while the site is pre-launch (COMING_SOON=true).
 * Header, footer and early access stay live; the way forward is early access.
 */
export function DeskComingSoon({ section, body, points }: { section: string; body: string; points: string[] }) {
  return (
    <div className="flex min-h-[64vh] items-center py-12 sm:py-16">
      <section
        data-backdrop-anchor
        className="sheet relative isolate mx-auto w-full max-w-3xl overflow-hidden px-6 py-14 text-center sm:px-14 sm:py-20"
      >
        <MarkGlyph className="mx-auto h-9 w-auto text-ink" />

        <div className="mt-8 flex justify-center">
          <span className="eyebrow">{section}</span>
        </div>
        <h1 className="display mt-4 text-[44px] leading-[1.02] sm:text-[64px]">Coming soon</h1>
        <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-ink-500">{body}</p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/early" className="btn-primary h-12 px-6">
            Join early access
          </Link>
          <a href={X_URL} target="_blank" rel="noopener noreferrer" className="btn-quiet h-12 px-6">
            <XIcon className="h-3.5 w-3.5" />
            Follow @{X_HANDLE}
          </a>
        </div>

        <ul className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2.5 border-t border-paper-line pt-8 text-[13.5px] text-ink-500">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span className="dot bg-ink-400" />
              {p}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
