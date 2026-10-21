"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion, useSeen } from "./useMotion";

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that counts to its value once on screen, and again whenever the value changes. */
export function CountUp({ value, duration = 1100, className = "" }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useSeen(ref, "0px");
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(a + (value - a) * ease(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("en-US")}
    </span>
  );
}
