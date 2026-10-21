"use client";

import { useRef } from "react";

import { CountUp } from "@/components/motion/CountUp";
import { useSeen } from "@/components/motion/useMotion";

import type { QuestState } from "./QuestRow";

export interface DialSegment {
  id: string;
  points: number;
  state: QuestState;
}

const C = 120;
const RING = 92;
/** Degrees left empty between two steps on the ring. */
const GAP = 8;

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Rounded, so the server and the browser print the same coordinates. */
const at = (r: number, deg: number) =>
  [
    +(C + r * Math.cos(rad(deg))).toFixed(2),
    +(C + r * Math.sin(rad(deg))).toFixed(2),
  ] as const;

function arc(r: number, from: number, to: number) {
  const [x0, y0] = at(r, from);
  const [x1, y1] = at(r, to);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** How a step still to do is dotted onto the ring. */
const DOTS: Record<Exclude<QuestState, "done">, string> = {
  current: "text-brand",
  open: "text-ink-300",
  closed: "text-ink-300 opacity-40",
};

/**
 * The steps as an instrument: one arc per step around a ticked bezel, sized
 * by its points. A done step is a solid arc, drawn in the first time the dial
 * is on screen or when the step lands; a step to come is a row of dots, in
 * the accent for the one to do next. The centre counts the points earned out
 * of the steps' total, and `caption` under the dial says what that total
 * covers, since invites can take a pass past it. The bezel turns once every
 * two minutes, a slow sign that the board is live.
 */
export function ProgressDial({
  segments,
  earned,
  total,
  caption,
}: {
  segments: DialSegment[];
  earned: number;
  total: number;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);

  const sum = segments.reduce((n, s) => n + s.points, 0) || 1;
  const sweepable = 360 - GAP * segments.length;
  let cursor = -90;
  const arcs = segments.map((s) => {
    const from = cursor + GAP / 2;
    const to = from + (s.points / sum) * sweepable;
    cursor = to + GAP / 2;
    return { ...s, from, to };
  });

  return (
    <div className="mx-auto w-full max-w-[260px]">
      <div ref={ref} data-seen={seen} className="relative aspect-square w-full">
        <svg
          viewBox="0 0 240 240"
          className="h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <g className="dial-bezel">
            {Array.from({ length: 72 }, (_, i) => {
              const major = i % 6 === 0;
              const [x0, y0] = at(116, i * 5 - 90);
              const [x1, y1] = at(major ? 106 : 111, i * 5 - 90);
              return (
                <line
                  key={i}
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  stroke="currentColor"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className={major ? "text-ink-400" : "text-ink-300"}
                />
              );
            })}
          </g>

          <circle
            cx={C}
            cy={C}
            r={74}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="text-paper-line"
          />

          {arcs.map((s, i) =>
            s.state === "done" ? (
              <path
                key={s.id}
                d={arc(RING, s.from, s.to)}
                pathLength={1}
                fill="none"
                stroke="currentColor"
                strokeWidth={5}
                strokeLinecap="round"
                className="dial-arc text-brand-600"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            ) : (
              <path
                key={s.id}
                d={arc(RING, s.from, s.to)}
                fill="none"
                stroke="currentColor"
                strokeWidth={s.state === "current" ? 3.4 : 2.8}
                strokeLinecap="round"
                strokeDasharray="0.01 7.5"
                className={DOTS[s.state]}
              />
            ),
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CountUp
            value={earned}
            className="num text-[26px] leading-none text-ink sm:text-[32px] lg:text-[46px]"
          />
          <div className="label mt-1 text-[8.5px] sm:mt-1.5 sm:text-[10px] lg:mt-2.5 lg:text-[11px]">
            / {total.toLocaleString("en-US")} WP
          </div>
        </div>
      </div>
      <div className="label mt-2.5 text-center text-[9.5px] text-ink-700 sm:text-[10px] lg:mt-4 lg:text-[11px]">
        {caption}
      </div>
    </div>
  );
}
