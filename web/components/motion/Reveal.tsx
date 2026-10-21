"use client";

import { useRef, type ReactNode } from "react";

import { useSeen } from "./useMotion";

/**
 * Fades its content up the first time it scrolls into view. The resting
 * style is the finished state, so reduced motion (see globals.css) and a
 * failed script both leave the content simply there.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  return (
    <div ref={ref} className={`reveal ${className}`} data-seen={seen} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
