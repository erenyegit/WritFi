import { MarkGlyph } from "@/components/Logo";

const TEXT = "Selected to advance to Phase 3";
/** Enough copies that one run is wider than any screen, so the loop never shows a gap. */
const COPIES = 12;

/**
 * A thin band under the header with the GASOK Phase 3 news, running slowly to
 * the left. The run is drawn twice and moved by half its width, so it loops
 * without a seam. With reduced motion it stands still.
 */
export function PhaseBand() {
  return (
    <div className="relative overflow-hidden bg-feature text-feature-on">
      <p className="sr-only">{TEXT}</p>
      <div aria-hidden="true" className="phase-band flex w-max">
        {[0, 1].map((run) => (
          <div key={run} className="flex shrink-0 items-center">
            {Array.from({ length: COPIES }, (_, i) => (
              <span key={i} className="flex h-[30px] items-center gap-7 pr-7 text-[12.5px] font-medium tracking-[0.02em]">
                {TEXT}
                <MarkGlyph className="h-[8px] w-auto opacity-60" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
